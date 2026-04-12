import json, math

with open("precipitation.json") as f:
    precip_data = json.load(f)

# State incentive flags (pre-researched)
incentives = {
    "dallas":       {"tax_credit": True,  "stormwater_fee": True,  "rebate_usd": 5000},
    "phoenix":      {"tax_credit": False, "stormwater_fee": False, "rebate_usd": 0},
    "miami":        {"tax_credit": False, "stormwater_fee": True,  "rebate_usd": 1500},
    "philadelphia": {"tax_credit": True,  "stormwater_fee": True,  "rebate_usd": 10000},
    "austin":       {"tax_credit": True,  "stormwater_fee": False, "rebate_usd": 2500},
}

# Building class → ESG score heuristic
esg_map = {
    "office":       80,
    "commercial":   60,
    "retail":       50,
    "industrial":   40,
    "warehouse":    35,
    "hotel":        75,
    "hospital":     85,
    "education":    90,
    "government":   70,
    None:           45,
}

def viability_score(area_sqft, city, bclass):
    p = precip_data[city]

    # Roof area score (30%) — log scale
    roof_score = min(100, max(0,
        (math.log10(max(area_sqft, 1)) - math.log10(100000)) /
        (math.log10(1000000) - math.log10(100000)) * 100
    ))

    # Precipitation score (25%) — normalized 8–62 inch range
    precip_score = min(100, max(0,
        (p["avg_precip_inches"] - 8) / (62 - 8) * 100
    ))

    # Water cost score (20%) — normalized $3–$9/kgal range
    cost_score = min(100, max(0,
        (p["water_cost_per_kgal"] - 3) / (9 - 3) * 100
    ))

    # ESG score (15%)
    esg_score = esg_map.get(bclass, esg_map[None])

    # Regulatory score (10%)
    inv = incentives[city]
    reg_score = (
        (40 if inv["tax_credit"] else 0) +
        (40 if inv["stormwater_fee"] else 0) +
        min(20, inv["rebate_usd"] / 500)
    )

    total = (
        roof_score  * 0.30 +
        precip_score * 0.25 +
        cost_score  * 0.20 +
        esg_score   * 0.15 +
        reg_score   * 0.10
    )

    return {
        "total": round(total, 1),
        "roof": round(roof_score, 1),
        "precip": round(precip_score, 1),
        "cost": round(cost_score, 1),
        "esg": round(esg_score, 1),
        "regulatory": round(reg_score, 1),
    }

def annual_gallons(area_sqft, city):
    return round(area_sqft * precip_data[city]["gallons_per_sqft_per_year"])

def annual_savings_usd(gallons, city):
    cost_per_gallon = precip_data[city]["water_cost_per_kgal"] / 1000
    return round(gallons * cost_per_gallon)

cities = ["dallas", "phoenix", "miami", "philadelphia", "austin"]

for city in cities:
    print(f"Enriching {city}...")
    with open(f"{city}_large.geojson", encoding="utf-8") as f:
        data = json.load(f)

    for feat in data["features"]:
        props = feat["properties"]
        area_sqft = props.get("area_sqft", 0)
        bclass = props.get("class")

        score = viability_score(area_sqft, city, bclass)
        gallons = annual_gallons(area_sqft, city)
        savings = annual_savings_usd(gallons, city)

        props["city"] = city
        props["viability_score"] = score["total"]
        props["score_breakdown"] = score
        props["annual_gallons"] = gallons
        props["annual_savings_usd"] = savings
        props["incentives"] = incentives[city]

    # Sort by score descending, keep top 500 per city
    data["features"].sort(
        key=lambda f: f["properties"]["viability_score"],
        reverse=True
    )
    data["features"] = data["features"][:500]

    with open(f"{city}_enriched.geojson", "w", encoding="utf-8") as f:
        json.dump(data, f)

    top = data["features"][0]["properties"]
    print(f"  Top building: score={top['viability_score']} "
          f"area={top['area_sqft']:,} sqft "
          f"savings=${top['annual_savings_usd']:,}/yr")

print("\nAll done! Files ready for frontend.")