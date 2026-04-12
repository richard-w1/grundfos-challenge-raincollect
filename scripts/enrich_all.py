#!/usr/bin/env python3
"""
enrich_all.py -- Enriches all 10 payload cities into *_enriched.geojson.

For cities that already have a *_large.geojson, reuses those footprints
and just re-scores with the updated formula. For new cities, fetches
building footprints from the Overpass API.

Updated score formulas vs enrich.py:
  cost score  : normalized on total cost (intake + sewer), $4-$26/kgal
  regulatory  : stormwater fee proportional to rate (max $0.20/sqft/yr = 40pts)
                + tax credit (40pts) + rebate (up to 20pts)

Run from the project root:
    python enrich_all.py [--city "Dallas, TX"] [--skip-existing]
"""

import json, math, os, sys, time, argparse
import requests

# ── City configuration ───────────────────────────────────────────────────────

CITIES = {
    "Tyler, TX":        {"slug": "tyler",        "lat": 32.3513,  "lon": -95.3011,  "delta": 0.15},
    "Dallas, TX":       {"slug": "dallas",       "lat": 32.7767,  "lon": -96.7970,  "delta": 0.20},
    "Austin, TX":       {"slug": "austin",       "lat": 30.2672,  "lon": -97.7431,  "delta": 0.20},
    "Philadelphia, PA": {"slug": "philadelphia", "lat": 39.9526,  "lon": -75.1652,  "delta": 0.20},
    "Los Angeles, CA":  {"slug": "los_angeles",  "lat": 34.0522,  "lon": -118.2437, "delta": 0.20},
    "Phoenix, AZ":      {"slug": "phoenix",      "lat": 33.4484,  "lon": -112.0740, "delta": 0.20},
    "Miami, FL":        {"slug": "miami",        "lat": 25.7617,  "lon": -80.1918,  "delta": 0.20},
    "Denver, CO":       {"slug": "denver",       "lat": 39.7392,  "lon": -104.9903, "delta": 0.15},
    "Atlanta, GA":      {"slug": "atlanta",      "lat": 33.7490,  "lon": -84.3880,  "delta": 0.15},
    "Seattle, WA":      {"slug": "seattle",      "lat": 47.6062,  "lon": -122.3321, "delta": 0.15},
}

MIN_ROOF_SQFT = 100_000
TOP_N = 500

# ── Load reference data ──────────────────────────────────────────────────────

with open("payload.json") as f:
    PAYLOAD = json.load(f)

with open("rainuse-nexus/public/data/us_reference.json") as f:
    US_REF = json.load(f)["states"]

# ── Building type normalization ──────────────────────────────────────────────

BUILDING_TYPE_MAP = {
    "hospital": "hospital", "clinic": "hospital", "healthcare": "hospital",
    "hotel": "hotel", "hostel": "hotel", "motel": "hotel",
    "school": "education", "university": "education", "college": "education",
    "kindergarten": "education", "educational": "education",
    "government": "government", "public": "government", "civic": "government",
    "office": "office", "offices": "office",
    "retail": "retail", "supermarket": "retail", "mall": "retail",
    "commercial": "commercial",
    "industrial": "industrial", "factory": "industrial", "manufacture": "industrial",
    "warehouse": "warehouse", "storage": "warehouse", "distribution_center": "warehouse",
}

ESG_MAP = {
    "hospital": 85, "hotel": 75, "education": 90, "government": 70,
    "office": 80, "commercial": 60, "retail": 50, "industrial": 40, "warehouse": 35,
}


def normalize_building_type(tags):
    b = tags.get("building", "").lower()
    amenity = tags.get("amenity", "").lower()
    if BUILDING_TYPE_MAP.get(amenity):
        return BUILDING_TYPE_MAP[amenity]
    if BUILDING_TYPE_MAP.get(b):
        return BUILDING_TYPE_MAP[b]
    if tags.get("office"):
        return "office"
    if tags.get("shop"):
        return "retail"
    if tags.get("industrial"):
        return "industrial"
    return None


# ── Geometry ─────────────────────────────────────────────────────────────────

def polygon_area_sqft(geom):
    """Shoelace formula. geom: list of {lat, lon} dicts from Overpass out geom."""
    if not geom or len(geom) < 3:
        return 0
    avg_lat = sum(p["lat"] for p in geom) / len(geom)
    scale_x = math.cos(avg_lat * math.pi / 180) * 111320
    scale_y = 111320
    pts = [(p["lon"] * scale_x, p["lat"] * scale_y) for p in geom]
    area = 0
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        area += pts[i][0] * pts[j][1]
        area -= pts[j][0] * pts[i][1]
    return abs(area) / 2 * 10.764  # m² -> sqft


# ── Score functions ───────────────────────────────────────────────────────────

def score_roof(area_sqft):
    return min(100, max(0,
        (math.log10(max(area_sqft, 1)) - math.log10(100_000)) /
        (math.log10(1_000_000) - math.log10(100_000)) * 100
    ))


def score_precip(avg_inches):
    return min(100, max(0, (avg_inches - 8) / (62 - 8) * 100))


def score_cost(total_cost_per_kgal):
    """Intake + sewer combined. Normalized $4-$26/kgal."""
    return min(100, max(0, (total_cost_per_kgal - 4) / (26 - 4) * 100))


def score_esg(building_type):
    return ESG_MAP.get(building_type, 45)


def score_regulatory(incentives):
    """
    tax_credit      -> 40 pts (boolean or non-empty notes string)
    stormwater_fee  -> 0-40 pts proportional to $/sqft/yr rate (max at $0.20)
    rebate_usd      -> 0-20 pts (max at $10k)
    """
    has_tax_credit = bool(incentives.get("tax_credit")) or bool(incentives.get("tax_credit_notes"))

    sw_rate = incentives.get("stormwater_fee_per_sqft_yr")
    if sw_rate is not None:
        sw_score = min(40, (sw_rate / 0.20) * 40)
    elif incentives.get("stormwater_fee"):
        sw_score = 40
    else:
        sw_score = 0

    rebate = incentives.get("rebate_usd") or 0
    return (40 if has_tax_credit else 0) + sw_score + min(20, rebate / 500)


def compute_viability(area_sqft, avg_precip, total_cost, btype, incentives):
    breakdown = {
        "roof":       round(score_roof(area_sqft), 1),
        "precip":     round(score_precip(avg_precip), 1),
        "cost":       round(score_cost(total_cost), 1),
        "esg":        round(score_esg(btype), 1),
        "regulatory": round(score_regulatory(incentives), 1),
    }
    total = (
        breakdown["roof"]       * 0.30 +
        breakdown["precip"]     * 0.25 +
        breakdown["cost"]       * 0.20 +
        breakdown["esg"]        * 0.15 +
        breakdown["regulatory"] * 0.10
    )
    breakdown["total"] = round(total, 1)
    return breakdown


# ── Incentive builder ─────────────────────────────────────────────────────────

def build_incentives(city_name):
    """Merge payload city incentives with state-level fallback."""
    city_data = PAYLOAD.get(city_name, {})
    state_code = city_data.get("state", "DEFAULT")
    city_inv = city_data.get("incentives", {})
    state_ref = US_REF.get(state_code, US_REF.get("DEFAULT", {}))
    state_inv = state_ref.get("incentives", {})

    sw_rate = city_data.get("stormwater_fee_per_sqft_yr", 0)

    return {
        # Score inputs
        "tax_credit":                state_inv.get("tax_credit", False),
        "stormwater_fee":            sw_rate > 0 or state_inv.get("stormwater_fee", False),
        "stormwater_fee_per_sqft_yr": sw_rate,
        "rebate_usd":                city_inv.get("rebate_usd") or state_inv.get("rebate_usd", 0),
        # Rich display fields
        "tax_credit_notes":         city_inv.get("tax_credit_notes") or None,
        "stormwater_notes":         city_inv.get("stormwater_notes") or None,
        "rebate_notes":             city_inv.get("rebate_notes") or None,
        "legal_link":               city_inv.get("legal_link") or None,
    }


# ── API fetchers ──────────────────────────────────────────────────────────────

def fetch_buildings_overpass(lat, lon, delta):
    south, north = lat - delta, lat + delta
    west,  east  = lon - delta, lon + delta
    query = (
        f"[out:json][timeout:120];"
        f"(way[\"building\"]({south},{west},{north},{east}););"
        f"out geom qt;"
    )
    print(f"  Querying Overpass ({south:.3f},{west:.3f},{north:.3f},{east:.3f}) ...")
    r = requests.post(
        "https://overpass-api.de/api/interpreter",
        data={"data": query},
        timeout=180,
    )
    r.raise_for_status()
    elements = r.json().get("elements", [])
    print(f"  -> {len(elements)} raw OSM elements returned")
    return elements


def fetch_precipitation(lat, lon):
    url = (
        f"https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={lat}&longitude={lon}"
        f"&start_date=2019-01-01&end_date=2023-12-31"
        f"&daily=precipitation_sum&timezone=UTC"
    )
    print(f"  Fetching precipitation from Open-Meteo ...")
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    data = r.json()
    times  = data["daily"]["time"]
    precip = data["daily"]["precipitation_sum"]
    by_year = {}
    for t, p in zip(times, precip):
        y = t[:4]
        by_year[y] = by_year.get(y, 0) + (p or 0)
    avg_mm = sum(by_year.values()) / len(by_year)
    return round(avg_mm / 25.4, 1)   # mm -> inches, 1 decimal


# ── Feature builder (from Overpass element) ───────────────────────────────────

def build_feature_from_element(el, city_name, avg_precip, total_cost, gallons_per_sqft, incentives, water_stress_score):
    geom = el.get("geometry", [])
    if not geom or len(geom) < 3:
        return None
    area_sqft = polygon_area_sqft(geom)
    if area_sqft < MIN_ROOF_SQFT:
        return None

    tags = el.get("tags", {})
    btype = normalize_building_type(tags)
    breakdown = compute_viability(area_sqft, avg_precip, total_cost, btype, incentives)

    annual_gallons = round(area_sqft * gallons_per_sqft)
    annual_savings = round(annual_gallons * total_cost / 1000)

    ring = [[p["lon"], p["lat"]] for p in geom]
    if ring and ring[0] != ring[-1]:
        ring.append(ring[0][:])

    addr = {
        "housenumber": tags.get("addr:housenumber"),
        "street":      tags.get("addr:street"),
        "city":        tags.get("addr:city"),
        "postcode":    tags.get("addr:postcode"),
    }
    has_addr = bool(addr["housenumber"] or addr["street"])

    floors_raw = tags.get("building:levels")
    height_raw = tags.get("height")

    return {
        "type": "Feature",
        "geometry": {"type": "Polygon", "coordinates": [ring]},
        "properties": {
            "id":               f"osm-{el['id']}",
            "osm_id":           el["id"],
            "names":            {"primary": tags.get("name") or tags.get("operator") or None},
            "operator":         tags.get("operator") or None,
            "class":            btype,
            "height":           float(height_raw) if height_raw else None,
            "num_floors":       int(floors_raw) if floors_raw else None,
            "area_sqft":        round(area_sqft),
            "area_m2":          round(area_sqft / 10.764),
            "addr":             addr if has_addr else None,
            "phone":            tags.get("phone") or tags.get("contact:phone") or None,
            "website":          tags.get("website") or tags.get("contact:website") or None,
            "city":             city_name,
            "viability_score":  breakdown["total"],
            "score_breakdown":  breakdown,
            "annual_gallons":   annual_gallons,
            "annual_savings_usd": annual_savings,
            "incentives":       incentives,
            "water_stress":     water_stress_score,
            "source":           "osm",
        },
    }


# ── Main enrichment ───────────────────────────────────────────────────────────

def enrich_city(city_name, cfg, skip_existing=False):
    slug = cfg["slug"]
    lat, lon, delta = cfg["lat"], cfg["lon"], cfg["delta"]

    city_data   = PAYLOAD.get(city_name, {})
    state_code  = city_data.get("state", "DEFAULT")
    state_ref   = US_REF.get(state_code, US_REF.get("DEFAULT"))

    water_cost  = city_data.get("water_cost_per_kgal", state_ref["water_cost_per_kgal"])
    sewer_cost  = city_data.get("sewer_cost_per_kgal", 0)
    total_cost  = water_cost + sewer_cost
    sw_fee      = city_data.get("stormwater_fee_per_sqft_yr", 0)
    water_stress_score = city_data.get("esg_climate", {}).get("water_stress_score", 2.5)

    incentives = build_incentives(city_name)

    # Precipitation
    avg_precip = fetch_precipitation(lat, lon)
    print(f"  -> {avg_precip}\" avg annual precip (Open-Meteo 2019-2023)")

    gallons_per_sqft = round(avg_precip * 0.623, 3)

    print(f"  -> ${water_cost} intake + ${sewer_cost} sewer = ${total_cost:.2f}/kgal total")

    # Buildings -- reuse large GeoJSON if present, otherwise fetch from Overpass
    large_path = f"{slug}_large.geojson"
    features = []

    if os.path.exists(large_path) and not skip_existing:
        print(f"  Reusing existing {large_path} (re-scoring only)")
        with open(large_path, encoding="utf-8") as f:
            large = json.load(f)

        for feat in large.get("features", []):
            props = feat.get("properties", {})
            area_sqft = props.get("area_sqft", 0)
            if area_sqft < MIN_ROOF_SQFT:
                continue
            btype = props.get("class")
            breakdown = compute_viability(area_sqft, avg_precip, total_cost, btype, incentives)
            annual_gallons = round(area_sqft * gallons_per_sqft)
            annual_savings = round(annual_gallons * total_cost / 1000)

            new_props = dict(props)
            new_props.update({
                "city":              city_name,
                "viability_score":   breakdown["total"],
                "score_breakdown":   breakdown,
                "annual_gallons":    annual_gallons,
                "annual_savings_usd": annual_savings,
                "incentives":        incentives,
                "water_stress":      water_stress_score,
            })
            features.append({"type": "Feature", "geometry": feat["geometry"], "properties": new_props})

    else:
        # Check for pre-cached raw JSON (from fetch_missing.py)
        raw_cache = f"{slug}_raw.json"
        if os.path.exists(raw_cache):
            print(f"  Loading from cache: {raw_cache}")
            with open(raw_cache) as f:
                elements = json.load(f)
            print(f"  -> {len(elements)} elements from cache")
        else:
            elements = fetch_buildings_overpass(lat, lon, delta)
            import time as _time; _time.sleep(2)

        for el in elements:
            feat = build_feature_from_element(
                el, city_name, avg_precip, total_cost, gallons_per_sqft, incentives, water_stress_score
            )
            if feat:
                features.append(feat)

    # Sort descending, keep top N
    features.sort(key=lambda f: f["properties"]["viability_score"], reverse=True)
    features = features[:TOP_N]

    print(f"  -> {len(features)} qualifying buildings (>={MIN_ROOF_SQFT:,} sqft, top {TOP_N})")
    if features:
        top = features[0]["properties"]
        print(f"  -> Top building: score={top['viability_score']}  area={top['area_sqft']:,} sqft  savings=${top['annual_savings_usd']:,}/yr")

    # Write enriched GeoJSON
    out_path = f"{slug}_enriched.geojson"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f)
    print(f"  Saved -> {out_path}")

    return {
        "avg_precip":         avg_precip,
        "water_cost":         water_cost,
        "sewer_cost":         sewer_cost,
        "total_cost":         round(total_cost, 2),
        "gallons_per_sqft":   gallons_per_sqft,
        "sw_fee":             sw_fee,
        "water_stress_score": water_stress_score,
        "building_count":     len(features),
        "bbox":               [round(lon - delta, 4), round(lat - delta, 4),
                               round(lon + delta, 4), round(lat + delta, 4)],
        "center":             {"longitude": lon, "latitude": lat, "zoom": 12},
    }


# ── CLI ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Enrich city building GeoJSON files.")
    parser.add_argument("--city", help='Only process this city, e.g. "Dallas, TX"')
    parser.add_argument("--skip-existing", action="store_true",
                        help="Skip cities whose enriched GeoJSON already exists in public/data")
    args = parser.parse_args()

    target = {args.city: CITIES[args.city]} if args.city else CITIES

    results = {}
    for city_name, cfg in target.items():
        slug = cfg["slug"]
        out_exists = os.path.exists(f"rainuse-nexus/public/data/{slug}_enriched.geojson")
        if args.skip_existing and out_exists:
            print(f"\nSkipping {city_name} (enriched file already in public/data)")
            continue

        print(f"\n{'='*62}")
        print(f"  {city_name}  (slug={slug})")
        print(f"{'='*62}")
        try:
            results[city_name] = enrich_city(city_name, cfg)
        except Exception as e:
            print(f"  ERROR: {e}", file=sys.stderr)
            results[city_name] = None

    # Summary
    print(f"\n{'='*62}")
    print("SUMMARY -- copy outputs to rainuse-nexus/public/data/")
    print(f"{'='*62}")
    for city_name, res in results.items():
        slug = CITIES[city_name]["slug"]
        if res:
            print(
                f"  {city_name:<22} {res['building_count']:>4} bldgs  "
                f"${res['water_cost']}+${res['sewer_cost']}=${res['total_cost']:.2f}/kgal  "
                f"{res['avg_precip']}\"/yr"
            )
        else:
            print(f"  {city_name:<22} FAILED")

    print("\nManifest values (paste into audit_manifest.json):")
    for city_name, res in results.items():
        if not res:
            continue
        slug = CITIES[city_name]["slug"]
        print(f"\n  -- {city_name} --")
        print(f"     avg_precip_inches:        {res['avg_precip']}")
        print(f"     gallons_per_sqft_per_year: {res['gallons_per_sqft']}")
        print(f"     building_count:            {res['building_count']}")
        print(f"     bbox (W,S,E,N):            {res['bbox']}")
