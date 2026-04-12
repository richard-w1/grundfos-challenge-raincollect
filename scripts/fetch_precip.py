import json, urllib.request, time

TOKEN = "QbjdxTcnOehELyUQIyvazJXBdwWFuMtK"

cities = {
    "dallas":       "ZIP:75201",
    "phoenix":      "ZIP:85001",
    "miami":        "ZIP:33101",
    "philadelphia": "ZIP:19101",
    "austin":       "ZIP:73301",
}

def fetch_precip(location_id):
    # Pull 5 years of annual precipitation
    results = []
    for year in ["2019", "2020", "2021", "2022", "2023"]:
        url = (
            f"https://www.ncei.noaa.gov/cdo-web/api/v2/data"
            f"?datasetid=GSOY"
            f"&locationid={location_id}"
            f"&datatypeid=PRCP"
            f"&startdate={year}-01-01"
            f"&enddate={year}-12-31"
            f"&units=standard"
            f"&limit=10"
        )
        req = urllib.request.Request(url, headers={"token": TOKEN})
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read())
                if data.get("results"):
                    # PRCP in GSOY is in inches * 100
                    inches = data["results"][0]["value"] / 100
                    results.append(inches)
                    print(f"  {year}: {inches:.1f} inches")
        except Exception as e:
            print(f"  {year}: failed ({e})")
        time.sleep(0.5)  # be polite to the API
    
    if results:
        return round(sum(results) / len(results), 1)
    return None

# Water cost per 1000 gallons ($/kgal) by city - pre-researched
water_costs = {
    "dallas":       4.10,
    "phoenix":      3.20,
    "miami":        5.80,
    "philadelphia": 8.90,
    "austin":       5.50,
}

output = {}
for city, location_id in cities.items():
    print(f"\nFetching {city}...")
    avg = fetch_precip(location_id)
    if avg:
        print(f"  5-year avg: {avg} inches/year")
    else:
        # Fallback to known climate averages if API fails
        fallbacks = {
            "dallas": 37.0,
            "phoenix": 8.0,
            "miami": 62.0,
            "philadelphia": 46.0,
            "austin": 34.0,
        }
        avg = fallbacks[city]
        print(f"  Using fallback: {avg} inches/year")
    
    output[city] = {
        "avg_precip_inches": avg,
        "water_cost_per_kgal": water_costs[city],
        # gallons per sqft per year = inches * 0.623
        "gallons_per_sqft_per_year": round(avg * 0.623, 3)
    }

with open("precipitation.json", "w") as f:
    json.dump(output, f, indent=2)

print("\nSaved to precipitation.json")
print(json.dumps(output, indent=2))