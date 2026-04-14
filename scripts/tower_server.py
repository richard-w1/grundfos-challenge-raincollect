#!/usr/bin/env python3
"""
tower_server.py
---------------
Two-stage TowerScout microservice: YOLOv5 object detection followed by
EfficientNet-B5 classification, faithfully reproducing the pipeline from
the CDC TowerScout paper (Wong et al., 2024).

Usage:
    python tower_server.py \
        --yolo-weights yolov5_best.pt \
        --en-weights   b5_unweighted_best.pt \
        --api-key YOUR_GOOGLE_KEY

The server runs on http://localhost:5001.
CORS is open to localhost:5173/5174 (Vite dev server).
"""

import argparse
import io
import math
import os
import sys
import time
from pathlib import Path

import requests as http_requests
from PIL import Image

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ── Config ────────────────────────────────────────────────────────────────────
EN_INPUT_SIZE  = 456
CONF_THRESHOLD = 0.35               # final confidence threshold for returned towers
YOLO_MIN_CONF  = 0.25               # below this YOLO conf -> discard
YOLO_MAX_CONF  = 0.65               # above this -> accept without EfficientNet
ZOOM           = 19                  # satellite tile zoom (~0.3 m/px)
IMG_SIZE       = 640                 # Google Maps Static API tile size
CROP_RATIO     = 0.96                # strip bottom 4% copyright bar before YOLO
RATE_LIMIT_S   = 0.06                # ~16 req/sec to avoid API throttling
# ──────────────────────────────────────────────────────────────────────────────

import torch
import torch.nn as nn
from torchvision import transforms
from efficientnet_pytorch import EfficientNet
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins=[
    'http://localhost:5173', 'http://127.0.0.1:5173',
    'http://localhost:5174', 'http://127.0.0.1:5174',
])

_yolo_model = None
_en_model   = None
_en_transform = None
_api_key    = None


# ── Ground resolution at zoom 19 ─────────────────────────────────────────────

def meters_per_pixel(lat: float, zoom: int = ZOOM) -> float:
    return 156543.03392 * math.cos(math.radians(lat)) / (2 ** zoom)


def tile_degrees(lat: float, zoom: int = ZOOM, tile_px: int = IMG_SIZE):
    """Return (deg_lat, deg_lon) covered by one tile at the given location."""
    mpp = meters_per_pixel(lat, zoom)
    meters = mpp * tile_px
    deg_lat = meters / 111320.0
    deg_lon = meters / (111320.0 * math.cos(math.radians(lat)))
    return deg_lat, deg_lon


# ── Model loading ────────────────────────────────────────────────────────────

def load_yolo(weights_path: str):
    import pathlib
    # On Windows, YOLOv5 weights trained on Linux contain PosixPath references
    # that fail to unpickle. Temporarily remap PosixPath -> WindowsPath.
    _posix = pathlib.PosixPath
    pathlib.PosixPath = pathlib.WindowsPath
    try:
        model = torch.hub.load(
            'ultralytics/yolov5', 'custom',
            path=weights_path, force_reload=False,
        )
    finally:
        pathlib.PosixPath = _posix
    model.conf = YOLO_MIN_CONF
    model.eval()
    print(f'  YOLOv5 loaded from {weights_path}')
    return model


def load_efficientnet(weights_path: str) -> nn.Module:
    model = EfficientNet.from_pretrained('efficientnet-b5', include_top=True)
    model._fc = nn.Sequential(
        nn.Linear(2048, 512),
        nn.Linear(512, 1),
    )
    state = torch.load(weights_path, map_location='cpu')
    for key in ('model_state_dict', 'state_dict', 'model', None):
        try:
            payload = state[key] if key else state
            model.load_state_dict(payload, strict=True)
            print(f'  EfficientNet loaded (key={key!r})')
            break
        except (KeyError, TypeError, RuntimeError):
            continue
    else:
        model.load_state_dict(state, strict=False)
        print('  EfficientNet loaded (strict=False fallback)')
    model.eval()
    return model


def build_en_transform() -> transforms.Compose:
    return transforms.Compose([
        transforms.Resize((EN_INPUT_SIZE, EN_INPUT_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.5553, 0.5080, 0.4960],
            std=[0.1844, 0.1982, 0.2017],
        ),
    ])


# ── Image utilities (from TowerScout ts_imgutil.py) ──────────────────────────

def crop_copyright(img: Image.Image) -> Image.Image:
    """Strip bottom 4% of the tile (copyright/logo bar)."""
    w, h = img.size
    return img.crop((0, 0, w, int(h * CROP_RATIO)))


def cut_square_detection(img: Image.Image, x1, y1, x2, y2) -> Image.Image:
    """Crop a square region around a YOLO detection.
    x1..y2 are fractional (0-1) coordinates from xyxyn."""
    w, h = img.size
    x1 *= w; x2 *= w
    y1 *= h; y2 *= h
    wc = x2 - x1
    hc = y2 - y1
    size = int(max(wc, hc) * 1.5 + (25 * 640 / w))
    cy = (y1 + y2) / 2.0
    y1 = cy - size / 2.0
    y2 = cy + size / 2.0
    cx = (x1 + x2) / 2.0
    x1 = cx - size / 2.0
    x2 = cx + size / 2.0
    x1 = max(0, x1); x2 = min(w, x2)
    y1 = max(0, y1); y2 = min(h, y2)
    return img.crop((x1, y1, x2, y2))


# ── Satellite tile download ──────────────────────────────────────────────────

def download_tile(lat: float, lon: float, api_key: str) -> bytes:
    url = (
        f'https://maps.googleapis.com/maps/api/staticmap'
        f'?center={lat},{lon}&zoom={ZOOM}'
        f'&size={IMG_SIZE}x{IMG_SIZE}'
        f'&maptype=satellite&key={api_key}'
    )
    r = http_requests.get(url, timeout=15)
    r.raise_for_status()
    return r.content


# ── Two-stage inference ──────────────────────────────────────────────────────

def detect_tile(img_bytes: bytes, tile_lat: float, tile_lon: float):
    """Run YOLOv5 + EfficientNet on a single satellite tile.
    Returns a list of dicts, one per detected tower, with precise lat/lon."""
    raw_img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
    cropped = crop_copyright(raw_img)

    # Stage 1: YOLOv5
    results = _yolo_model(cropped)
    detections = results.xyxyn[0].cpu().numpy().tolist()

    if not detections:
        return []

    deg_lat, deg_lon = tile_degrees(tile_lat)
    cropped_h_ratio = CROP_RATIO
    towers = []

    for det in detections:
        x1, y1, x2, y2, yolo_conf = det[0:5]

        # Stage 2: confidence gating (matches ts_en.py logic)
        if yolo_conf < YOLO_MIN_CONF:
            continue
        elif yolo_conf <= YOLO_MAX_CONF:
            det_img = cut_square_detection(cropped, x1, y1, x2, y2)
            tensor = _en_transform(det_img).unsqueeze(0)
            with torch.no_grad():
                logit = _en_model(tensor)
                secondary = 1.0 - torch.sigmoid(logit.cpu()).item()
            confidence = secondary
        else:
            secondary = 1.0
            confidence = yolo_conf

        if confidence < CONF_THRESHOLD:
            continue

        # Map normalized bbox center to geographic coordinates.
        # The tile is centered at (tile_lat, tile_lon). Normalized coords
        # are relative to the cropped image (after 4% bottom strip).
        cx_norm = (x1 + x2) / 2.0
        cy_norm = (y1 + y2) / 2.0
        tower_lon = tile_lon + (cx_norm - 0.5) * deg_lon
        tower_lat = tile_lat - (cy_norm - 0.5) * deg_lat * cropped_h_ratio

        towers.append({
            'lat': round(tower_lat, 7),
            'lon': round(tower_lon, 7),
            'confidence': round(confidence, 3),
            'yolo_confidence': round(yolo_conf, 3),
            'secondary_confidence': round(secondary, 3),
            'bbox': {
                'x1': round(x1, 4), 'y1': round(y1, 4),
                'x2': round(x2, 4), 'y2': round(y2, 4),
            },
        })

    return towers


# ── API endpoints ─────────────────────────────────────────────────────────────

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'pipeline': 'yolov5+efficientnet',
        'zoom': ZOOM,
        'conf_threshold': CONF_THRESHOLD,
    })


@app.route('/detect', methods=['POST'])
def detect():
    """
    Accepts: { buildings: [{ id, lat, lon }], api_key?: str }
    Returns: {
        towers: [{ id, lat, lon, confidence, yolo_confidence,
                   secondary_confidence, source_building_id, bbox }],
        scanned: int,
        errors: int,
    }
    Each tower has a precise lat/lon derived from the YOLOv5 bounding box
    position within the satellite tile, not the building centroid.
    """
    body = request.get_json(force=True)
    buildings = body.get('buildings', [])
    api_key   = body.get('api_key') or _api_key

    if not api_key:
        return jsonify({'error': 'Google Maps API key required'}), 400
    if not buildings:
        return jsonify({'towers': [], 'scanned': 0})

    towers = []
    errors = 0
    tower_counter = 0

    for i, bld in enumerate(buildings):
        lat = bld['lat']
        lon = bld['lon']
        bld_id = bld.get('id', str(i))

        try:
            img_bytes = download_tile(lat, lon, api_key)
            time.sleep(RATE_LIMIT_S)
            tile_towers = detect_tile(img_bytes, lat, lon)

            for t in tile_towers:
                tower_counter += 1
                towers.append({
                    'id': f'ct-{tower_counter:04d}',
                    'lat': t['lat'],
                    'lon': t['lon'],
                    'confidence': t['confidence'],
                    'yolo_confidence': t['yolo_confidence'],
                    'secondary_confidence': t['secondary_confidence'],
                    'source_building_id': bld_id,
                    'bbox': t['bbox'],
                })

        except http_requests.HTTPError as e:
            errors += 1
            if errors <= 3:
                print(f'  [warn] tile {i} HTTP {e.response.status_code}')
        except Exception as e:
            errors += 1
            if errors <= 3:
                print(f'  [warn] tile {i}: {e}')

    return jsonify({
        'towers': towers,
        'scanned': len(buildings),
        'errors': errors,
        'pipeline': 'yolov5+efficientnet',
        'conf_threshold': CONF_THRESHOLD,
    })


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    global _yolo_model, _en_model, _en_transform, _api_key, CONF_THRESHOLD

    parser = argparse.ArgumentParser(description='TowerScout two-stage microservice')
    parser.add_argument('--yolo-weights', required=True,
                        help='Path to YOLOv5 .pt weights')
    parser.add_argument('--en-weights', required=True,
                        help='Path to EfficientNet b5_unweighted_best.pt')
    parser.add_argument('--api-key', default=os.environ.get('GOOGLE_MAPS_KEY', ''),
                        help='Google Maps Static API key (or set GOOGLE_MAPS_KEY env var)')
    parser.add_argument('--port', type=int, default=5001)
    parser.add_argument('--conf', type=float, default=CONF_THRESHOLD,
                        help=f'Final confidence threshold (default: {CONF_THRESHOLD})')
    args = parser.parse_args()

    CONF_THRESHOLD = args.conf
    _api_key = args.api_key

    print('Loading YOLOv5...')
    _yolo_model = load_yolo(args.yolo_weights)
    print('Loading EfficientNet-B5...')
    _en_model = load_efficientnet(args.en_weights)
    _en_transform = build_en_transform()
    print(f'Pipeline ready. Confidence threshold: {CONF_THRESHOLD}')
    print(f'Starting server on http://localhost:{args.port}')

    app.run(host='0.0.0.0', port=args.port, debug=False)


if __name__ == '__main__':
    main()
