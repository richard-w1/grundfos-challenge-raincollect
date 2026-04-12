#!/usr/bin/env python3
"""
towerscout_export.py
────────────────────
Runs TowerScout EfficientNet cooling tower classification on satellite tiles
for each pre-loaded city's buildings and writes the result to:

    rainuse-nexus/public/data/cooling_towers.json

This is the OFFLINE / PRE-EVENT version. Run once before the hackathon.
For live custom audit detection, use tower_server.py instead.

Usage:
    pip install torch torchvision requests Pillow
    python towerscout_export.py --api-key YOUR_GOOGLE_MAPS_KEY --weights path/to/efficientnet_weights.pth

See the TODO block in tower_server.py for notes on model variant, input size,
and output format — the same assumptions apply here.

Optional: run a single city to test first:
    python towerscout_export.py --api-key KEY --weights weights.pth --cities dallas
"""

import argparse
import io
import json
import math
import os
import time
from pathlib import Path

import requests
from PIL import Image
import torch

# Load .env from the project root (no-op if python-dotenv isn't installed)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass
import torch.nn as nn
from torchvision import models, transforms

# ── Config (mirrors tower_server.py) ─────────────────────────────────────────
MODEL_VARIANT  = 'efficientnet_b5'   # confirmed: b5_unweighted_best.pt
INPUT_SIZE     = 456                 # EfficientNet-B5 standard input size
OUTPUT_FORMAT  = 'softmax2'   # 'softmax2' or 'sigmoid1'
CONF_THRESHOLD = 0.40
ZOOM           = 19
IMG_DOWNLOAD   = 640
RATE_LIMIT_S   = 0.06
# ─────────────────────────────────────────────────────────────────────────────

DATA_DIR    = Path('rainuse-nexus/public/data')
OUTPUT_PATH = DATA_DIR / 'cooling_towers.json'
TMP_DIR     = Path('tmp_tower_tiles')
CITIES      = ['dallas', 'phoenix', 'miami', 'philadelphia', 'austin',
               'tyler', 'denver', 'atlanta', 'seattle', 'los_angeles']


# ── Model ─────────────────────────────────────────────────────────────────────

def build_model(variant: str) -> nn.Module:
    constructor = getattr(models, variant)
    model = constructor(weights=None)
    in_features = model.classifier[-1].in_features
    model.classifier[-1] = nn.Linear(in_features, 2)
    return model


def load_model(weights_path: str) -> nn.Module:
    model = build_model(MODEL_VARIANT)
    state = torch.load(weights_path, map_location='cpu')
    for key in ('model_state_dict', 'state_dict', 'model', None):
        try:
            payload = state[key] if key else state
            model.load_state_dict(payload, strict=True)
            print(f'  Weights loaded (key={key!r})')
            break
        except (KeyError, TypeError, RuntimeError):
            continue
    else:
        model.load_state_dict(state, strict=False)
    model.eval()
    return model


def build_transform() -> transforms.Compose:
    return transforms.Compose([
        transforms.Resize((INPUT_SIZE, INPUT_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])


# ── Satellite tile ─────────────────────────────────────────────────────────────

def download_tile(lat: float, lon: float, api_key: str, out_path: Path):
    url = (
        f'https://maps.googleapis.com/maps/api/staticmap'
        f'?center={lat},{lon}&zoom={ZOOM}'
        f'&size={IMG_DOWNLOAD}x{IMG_DOWNLOAD}'
        f'&maptype=satellite&key={api_key}'
    )
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    out_path.write_bytes(r.content)


# ── Inference ──────────────────────────────────────────────────────────────────

def classify_tile(model: nn.Module, transform, img_path: Path) -> float:
    img = Image.open(img_path).convert('RGB')
    tensor = transform(img).unsqueeze(0)
    with torch.no_grad():
        logits = model(tensor)
        if OUTPUT_FORMAT == 'softmax2':
            probs = torch.softmax(logits, dim=1)
            return probs[0][1].item()
        else:
            return torch.sigmoid(logits[0][0]).item()


# ── Per-building centroid ──────────────────────────────────────────────────────

def centroid(feature: dict) -> tuple[float, float]:
    if feature['geometry']['type'] == 'MultiPolygon':
        coords = feature['geometry']['coordinates'][0][0]
    else:
        coords = feature['geometry']['coordinates'][0]
    lat = sum(c[1] for c in coords) / len(coords)
    lon = sum(c[0] for c in coords) / len(coords)
    return lat, lon


# ── Per-city pipeline ──────────────────────────────────────────────────────────

def process_city(
    city_id: str,
    model: nn.Module,
    transform,
    api_key: str,
    tmp_dir: Path,
) -> list[dict]:
    geojson_path = DATA_DIR / f'{city_id}_enriched.geojson'
    if not geojson_path.exists():
        print(f'  [skip] {geojson_path} not found')
        return []

    with open(geojson_path) as f:
        data = json.load(f)

    features = data['features']
    towers: list[dict] = []
    tower_idx = 1

    print(f'\n[{city_id}] Scanning {len(features)} buildings...')

    for i, feature in enumerate(features):
        lat, lon = centroid(feature)
        img_path = tmp_dir / f'{city_id}_{i:04d}.jpg'

        try:
            download_tile(lat, lon, api_key, img_path)
            time.sleep(RATE_LIMIT_S)

            confidence = classify_tile(model, transform, img_path)
            img_path.unlink(missing_ok=True)

            if confidence >= CONF_THRESHOLD:
                props = feature['properties']
                name  = (props.get('names') or {}).get('primary') or None
                towers.append({
                    'id': f'{city_id[:3]}-{tower_idx:03d}',
                    'lat': round(lat, 7),
                    'lon': round(lon, 7),
                    'confidence': round(confidence, 3),
                    'source_building_id': props.get('id', str(i)),
                    **({'note': name} if name else {}),
                })
                tower_idx += 1

        except requests.HTTPError as e:
            print(f'  [warn] tile {i} HTTP error: {e}')
            img_path.unlink(missing_ok=True)
        except Exception as e:
            print(f'  [warn] tile {i}: {e}')
            img_path.unlink(missing_ok=True)

        if (i + 1) % 100 == 0 or (i + 1) == len(features):
            print(f'  {i+1}/{len(features)} scanned | {len(towers)} towers detected')

    # Patch GeoJSON properties in-place and save updated enriched file
    tower_by_building = {t['source_building_id']: t['confidence'] for t in towers}
    patched = 0
    for feature in features:
        bld_id = feature['properties'].get('id', '')
        if bld_id in tower_by_building:
            feature['properties']['cooling_tower_detected'] = True
            feature['properties']['cooling_tower_confidence'] = tower_by_building[bld_id]
            patched += 1
        else:
            # Ensure fields are present (False means scanned, not detected)
            feature['properties'].setdefault('cooling_tower_detected', False)
            feature['properties'].setdefault('cooling_tower_confidence', 0.0)

    if patched > 0:
        with open(geojson_path, 'w') as f:
            json.dump(data, f)
        # Also copy to rainuse-nexus/public/data/ if scanning from project root
        src_enriched = Path(f'{city_id}_enriched.geojson')
        if src_enriched.exists():
            import shutil
            shutil.copy(str(geojson_path), str(src_enriched))
        print(f'  [{city_id}] patched {patched} buildings in {geojson_path.name}')

    print(f'  [{city_id}] complete -- {len(towers)} cooling towers')
    return towers


# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    global MODEL_VARIANT, INPUT_SIZE, OUTPUT_FORMAT, CONF_THRESHOLD

    parser = argparse.ArgumentParser(description='Export TowerScout detections (EfficientNet)')
    parser.add_argument('--api-key',     default=os.environ.get('GOOGLE_MAPS_KEY', ''), help='Google Maps Static API key')
    parser.add_argument('--weights',     required=True)
    parser.add_argument('--cities',      nargs='+', default=CITIES)
    parser.add_argument('--skip-cities', nargs='+', default=[], help='Skip these city slugs')
    parser.add_argument('--conf',        type=float, default=CONF_THRESHOLD)
    parser.add_argument('--variant',     default=MODEL_VARIANT)
    parser.add_argument('--size',        type=int, default=INPUT_SIZE)
    parser.add_argument('--output',      default=OUTPUT_FORMAT, choices=['softmax2', 'sigmoid1'])
    parser.add_argument('--resume',      action='store_true',
                        help='Load existing cooling_towers.json and skip already-scanned cities')
    args = parser.parse_args()

    if not args.api_key:
        parser.error('--api-key is required (or set GOOGLE_MAPS_KEY env var)')

    MODEL_VARIANT  = args.variant
    INPUT_SIZE     = args.size
    OUTPUT_FORMAT  = args.output
    CONF_THRESHOLD = args.conf

    print(f'Loading {MODEL_VARIANT} weights from {args.weights}...')
    model     = load_model(args.weights)
    transform = build_transform()
    print(f'Model ready. Input: {INPUT_SIZE}px | Output: {OUTPUT_FORMAT} | Conf threshold: {CONF_THRESHOLD}')

    TMP_DIR.mkdir(exist_ok=True)

    # Load existing results if resuming
    result = {}
    if args.resume and OUTPUT_PATH.exists():
        with open(OUTPUT_PATH) as f:
            result = json.load(f)
        already_done = [k for k in result if not k.startswith('_')]
        print(f'Resuming: {already_done} already scanned, skipping.')
    else:
        already_done = []

    result['_meta'] = {
        'source':             'TowerScout EfficientNet (CDC-validated) -- github.com/RJbalikian/TowerScout',
        'model':              MODEL_VARIANT,
        'model_weights':      Path(args.weights).name,
        'zoom':               ZOOM,
        'imagery':            'Google Maps Static API (satellite)',
        'conf_threshold':     CONF_THRESHOLD,
        'output_format':      OUTPUT_FORMAT,
        'run_date':           time.strftime('%Y-%m-%d'),
        'detection_method':   'per-building tile classification -- tower position = building centroid',
        'multiplier_formula': 'final_score = base_score x (1.0 + confidence x 0.3)',
    }

    cities_to_run = [c for c in args.cities
                     if c not in already_done and c not in args.skip_cities]
    print(f'Cities to scan: {cities_to_run}')

    try:
        for city_id in cities_to_run:
            result[city_id] = process_city(city_id, model, transform, args.api_key, TMP_DIR)
            # Save after each city so progress is preserved on crash
            with open(OUTPUT_PATH, 'w') as f:
                json.dump(result, f, indent=2)
            print(f'  Checkpoint saved -> {OUTPUT_PATH}')
    finally:
        with open(OUTPUT_PATH, 'w') as f:
            json.dump(result, f, indent=2)
        print(f'\nFinal output written to {OUTPUT_PATH}')
        try:
            TMP_DIR.rmdir()
        except OSError:
            print(f'Note: tmp tiles remain in {TMP_DIR}/ -- safe to delete')


if __name__ == '__main__':
    main()

