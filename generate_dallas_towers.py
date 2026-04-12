#!/usr/bin/env python3
"""
generate_dallas_towers.py
-------------------------
Reads dallas_enriched.geojson, sends each building centroid to the running
tower_server.py, and writes the detected towers into cooling_towers.json
under the "dallas" key.

Prerequisites:
  1. tower_server.py must be running:
       python tower_server.py --yolo-weights yolov5_best.pt \
           --en-weights b5_unweighted_best.pt --api-key YOUR_KEY
  2. A Google Maps Static API key (passed to tower_server or set in env).

Usage:
    python generate_dallas_towers.py [--server http://localhost:5001]
                                     [--batch-size 50]
                                     [--api-key YOUR_KEY]
"""

import argparse
import json
from pathlib import Path

import requests

GEOJSON_PATH = Path('rainuse-nexus/public/data/dallas_enriched.geojson')
TOWERS_PATH  = Path('rainuse-nexus/public/data/cooling_towers.json')


def feature_centroid(feature):
    geom = feature.get('geometry', {})
    geom_type = geom.get('type', '')
    coords = geom.get('coordinates', [])
    if geom_type == 'Polygon':
        ring = coords[0] if coords else []
    elif geom_type == 'MultiPolygon':
        # Use the outer ring of the first (largest) polygon
        ring = coords[0][0] if coords and coords[0] else []
    else:
        return None
    if not ring:
        return None
    lats = [c[1] for c in ring]
    lons = [c[0] for c in ring]
    return sum(lats) / len(lats), sum(lons) / len(lons)


def main():
    parser = argparse.ArgumentParser(description='Generate Dallas tower detections')
    parser.add_argument('--server', default='http://localhost:5001')
    parser.add_argument('--batch-size', type=int, default=50,
                        help='Buildings per request (reduce if timeouts occur)')
    parser.add_argument('--api-key', default='',
                        help='Google Maps API key (if not already configured in tower_server)')
    args = parser.parse_args()

    print(f'Reading {GEOJSON_PATH}...')
    geojson = json.loads(GEOJSON_PATH.read_text(encoding='utf-8'))
    features = geojson.get('features', [])
    print(f'  {len(features)} buildings')

    buildings = []
    for f in features:
        c = feature_centroid(f)
        if c:
            buildings.append({
                'id': f['properties'].get('id', ''),
                'lat': round(c[0], 7),
                'lon': round(c[1], 7),
            })

    print(f'  {len(buildings)} with valid centroids')
    print(f'  Sending in batches of {args.batch_size} to {args.server}/detect')
    print()

    all_towers = []
    total_scanned = 0
    total_errors = 0

    for i in range(0, len(buildings), args.batch_size):
        batch = buildings[i:i + args.batch_size]
        batch_num = i // args.batch_size + 1
        total_batches = (len(buildings) + args.batch_size - 1) // args.batch_size
        print(f'  Batch {batch_num}/{total_batches} ({len(batch)} buildings)...', end=' ', flush=True)

        try:
            resp = requests.post(
                f'{args.server}/detect',
                json={'buildings': batch, 'api_key': args.api_key},
                timeout=600,
            )
            resp.raise_for_status()
            data = resp.json()

            batch_towers = data.get('towers', [])
            total_scanned += data.get('scanned', 0)
            total_errors += data.get('errors', 0)
            all_towers.extend(batch_towers)
            print(f'{len(batch_towers)} towers detected')

        except requests.RequestException as e:
            print(f'FAILED: {e}')
            total_errors += len(batch)

    print()
    print(f'Done: scanned {total_scanned}, found {len(all_towers)} towers, {total_errors} errors')

    # Renumber tower IDs sequentially
    for idx, t in enumerate(all_towers, 1):
        t['id'] = f'ct-{idx:04d}'

    # Write into cooling_towers.json
    print(f'Writing to {TOWERS_PATH}...')
    tower_data = json.loads(TOWERS_PATH.read_text(encoding='utf-8'))
    tower_data['dallas'] = all_towers
    TOWERS_PATH.write_text(json.dumps(tower_data, indent=2), encoding='utf-8')
    print(f'  Saved {len(all_towers)} towers under "dallas" key')


if __name__ == '__main__':
    main()
