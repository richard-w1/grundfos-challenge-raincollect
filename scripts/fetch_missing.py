"""Fetch Seattle and LA buildings via the overpass.kumi.systems mirror."""
import requests, json, math, os, sys

def fetch(city_name, slug, lat, lon, delta):
    south, north = lat - delta, lat + delta
    west,  east  = lon - delta, lon + delta
    query = (
        "[out:json][timeout:120];"
        f"(way[\"building\"]({south},{west},{north},{east}););"
        "out geom qt;"
    )
    print(f"Fetching {city_name} via kumi mirror ...")
    for mirror in [
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass-api.de/api/interpreter",
    ]:
        try:
            r = requests.post(mirror, data={"data": query}, timeout=180)
            r.raise_for_status()
            elements = r.json().get("elements", [])
            print(f"  -> {len(elements)} elements ({mirror.split('/')[2]})")
            return elements
        except Exception as e:
            print(f"  -> {mirror.split('/')[2]} failed: {e}")
    return None

CITIES = [
    ("Seattle, WA",      "seattle",     47.6062, -122.3321, 0.12),
    ("Los Angeles, CA",  "los_angeles", 34.0522, -118.2437, 0.15),
]

for city_name, slug, lat, lon, delta in CITIES:
    raw_path = f"{slug}_raw.json"
    if os.path.exists(raw_path):
        print(f"Skipping {city_name} (raw cache exists)")
        continue
    elements = fetch(city_name, slug, lat, lon, delta)
    if elements is not None:
        with open(raw_path, "w") as f:
            json.dump(elements, f)
        print(f"  -> Saved {raw_path}")
    else:
        print(f"  -> All mirrors failed for {city_name}")
