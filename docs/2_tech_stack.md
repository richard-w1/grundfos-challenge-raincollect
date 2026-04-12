RainCollect
Tech Stack Reference  •  Hackathon Edition  •  v1.0


Every tool choice is optimized for three constraints: (1) free or free-tier, (2) minimal setup time, (3) no single point of failure during the demo.


Layer 1 — Building Footprints


Overture Maps Python CLI
Source: overturemaps.org — open data backed by Microsoft, Meta, Esri
2.5B global building footprints including polygon geometry + height estimates
Query by bounding box — downloads only the buildings you need
Each footprint includes area_in_meters — immediate 100k sq ft filter

Pre-compute command:
overturemaps download --bbox=-96.9,32.6,-96.5,33.0 -f geojson --type=building -o dallas.geojson
Filter: area_in_meters > 9290 (= 100,000 sq ft). Output: ~500–2000 large commercial buildings per city.


Layer 2 — Cooling Tower Detection


TowerScout — Pre-trained YOLOv5 (GitHub: RJbalikian/TowerScout)
Built for CDC Legionella investigations — pre-trained on US satellite imagery
Input: satellite tile image (from NAIP or Google Maps Static API)
Output: bounding boxes + confidence score for each detected cooling tower
Pitch angle: 'We use the same detection model the CDC uses for public health surveillance'

Hackathon strategy:
Run TowerScout offline on tiles for pre-loaded cities before the event
Store results as JSON: { building_id, has_cooling_tower, confidence }
Bake into pre-computed dataset — zero runtime dependency


Layer 3 — Precipitation Data


NOAA Climate Data Online API (CDO)
Free with email token: ncdc.noaa.gov/cdo-web/token
Dataset: GSOY (Global Summary of the Year) — annual precip by ZIP
Pull 5-year average for each pre-loaded city, store as static JSON

Endpoint pattern:
GET https://www.ncei.noaa.gov/cdo-web/api/v2/data?datasetid=GSOY&locationid=ZIP:75201&datatypeid=PRCP
ROI formula:
gallons_per_year = roof_sqft × annual_inches × 0.623


Layer 4 — Map Rendering


Deck.gl + MapLibre GL JS
Deck.gl: WebGL-powered data viz — handles 100k+ polygons at 60fps
MapLibre: fully open source Mapbox fork — no API key, no rate limits
Free base tiles: Stadia Maps free tier or protomaps.com open tiles

Key layers:
Layer
Deck.gl Type
Used for
Building footprints
GeoJsonLayer
All large commercial buildings, color = score tier
3D view
PolygonLayer (extruded)
Buildings extruded by roof area — hero visual
Permit pipeline
GeoJsonLayer (dashed)
Future buildings from permit feed
Cooling towers
ScatterplotLayer
Pulsing dot overlay where towers detected



Layer 5 — Permit Intelligence


Shovels.ai API (primary) / Socrata Open Data (fallback)
Shovels.ai: unified commercial permit API across US jurisdictions
Filter: commercial type, sq footage > 50,000, issued last 24 months
Fallback: Socrata endpoint per city (Austin, Dallas, Chicago, NYC each have open permit APIs)

Socrata fallback example (Austin):
GET https://data.austintexas.gov/resource/3syk-w9eu.json?$where=square_feet>50000 AND permit_type_desc like '%COMMERCIAL%'


Layer 6 — Viability Score Engine


Client-side JavaScript — no backend required
All computation runs in the browser against pre-loaded static JSON
Score weights exposed as UI sliders — live 'what-if' tuning during demo
Score formula is transparent and auditable — judges can interrogate it

Component
Weight
Data source
Notes
Roof area
30%
Overture
Log scale: 100k sq ft = 50pts, 500k = 90pts
Precipitation
25%
NOAA CDO
Normalized 0–100 across US annual avg range
Water cost
20%
Static JSON
Pre-loaded state/city utility rate tiers
ESG signal
15%
Heuristic
Building type + Fortune 500 HQ flag
Regulatory
10%
Static JSON
State-level incentive / stormwater fee flags
Cooling tower multiplier
×1.0–1.3
TowerScout
Applied after base score — not a component



Layer 7 — IoT Sensor Layer


Raspberry Pi 4 + YF-S201 Hall Effect Flow Sensor
Sensor: YF-S201 — ~$8, measures 1–30 L/min, Hall effect impeller
Wiring: GND → Pin 6, VCC → 3.3V Pin 1, Signal → GPIO 13
Python script: RPi.GPIO interrupt counting → L/min calculation → JSON push
Data endpoint: Firebase Realtime Database (free tier) — web app subscribes

Mode
Description
LIVE
Pi connected, sensor reading real water flow. Firebase stream active. Dashboard shows pulsing green indicator.
SIMULATED
Pre-recorded JSON timeseries replays a rain event. Labeled clearly. Tells the same story — estimate vs. measured delta.



Layer 8 — Frontend Framework


React + Vite + Tailwind CSS
Vite: instant dev server, hot reload, fast build — critical for 25-hour cycle
Tailwind: utility-first CSS — no stylesheet to maintain, design-grade UI fast
React: component model maps cleanly to the panel/map/sidebar layout
No backend server required — all data is static JSON + client API calls
Deploy: Vercel (one command: vercel deploy) or Netlify drag-and-drop
