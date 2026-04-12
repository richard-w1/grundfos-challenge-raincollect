import json, math, os, subprocess, sys

cities = [
    ("phoenix",      "-112.3,33.3,-111.9,33.6"),
    ("miami",        "-80.4,25.6,-80.1,25.9"),
    ("philadelphia", "-75.3,39.8,-74.9,40.1"),
    ("austin",       "-97.9,30.1,-97.5,30.5"),
]

def polygon_area_m2(coords):
    if len(coords) < 3:
        return 0
    lat = sum(c[1] for c in coords) / len(coords)
    scale_x = math.cos(math.radians(lat)) * 111320
    scale_y = 111320
    points = [(c[0] * scale_x, c[1] * scale_y) for c in coords]
    n = len(points)
    area = 0
    for i in range(n):
        j = (i + 1) % n
        area += points[i][0] * points[j][1]
        area -= points[j][0] * points[i][1]
    return abs(area) / 2

for city, bbox in cities:
    raw = f"{city}_raw.geojson"
    out = f"{city}_large.geojson"

    print(f"\n{'='*40}")
    print(f"Downloading {city}...")
    env = os.environ.copy()
    env["PYTHONUTF8"] = "1"
    subprocess.run(
        ["overturemaps", "download",
         "--bbox", bbox, "-f", "geojson", "--type", "building", "-o", raw],
        env=env, check=True
    )

    print(f"Filtering {city}...")
    with open(raw, "r", encoding="utf-8") as f:
        data = json.load(f)

    filtered = []
    for feat in data["features"]:
        geom = feat["geometry"]
        if geom["type"] == "Polygon":
            coords = geom["coordinates"][0]
        elif geom["type"] == "MultiPolygon":
            coords = geom["coordinates"][0][0]
        else:
            continue
        area = polygon_area_m2(coords)
        if area > 9290:
            feat["properties"]["area_m2"] = round(area)
            feat["properties"]["area_sqft"] = round(area * 10.764)
            filtered.append(feat)

    out_data = {"type": "FeatureCollection", "features": filtered}
    with open(out, "w", encoding="utf-8") as f:
        json.dump(out_data, f)

    print(f"  {city}: {len(filtered)} large buildings → {out}")

    os.remove(raw)
    if os.path.exists(raw + ".state"):
        os.remove(raw + ".state")

print("\nAll cities done!")