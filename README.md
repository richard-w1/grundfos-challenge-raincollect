# RainCollect

A commercial building prospecting engine for Grundfos water reuse systems. The app identifies high-value buildings across US cities by combining satellite imagery analysis, financial data, and regulatory signals into a single Viability Score surfaced through an interactive map.

Built for the Grundfos Challenge.

---

## What it does

- Loads pre-enriched building data for 10 US cities
- Scores each building on roof area, local water cost, precipitation, stormwater fees, ESG commitments, tax incentives, and flood risk
- Detects cooling towers in satellite imagery using a two-stage computer vision pipeline (YOLOv5 + EfficientNet-B5), rendered as precise map markers
- Lets you run a live audit on any city and filter/explore results in an interactive map

---

## Project structure

```
rainuse-nexus/        RainCollect web app (Vite)
tower_server.py       TowerScout CV microservice (Flask)
generate_dallas_towers.py   Runs the CV pipeline against Dallas buildings
towerscout_train.py   YOLOv5 training script (Colab)
scripts/              Data enrichment and fetch utilities
docs/                 Planning docs, tech stack notes, TowerScout paper
```

---

## Tech stack

**Frontend**
- React + Vite
- MapLibre GL — base map rendering
- Deck.gl — building footprint and cooling tower layers
- Zustand — state management
- Mantine — UI components

**CV microservice**
- YOLOv5 — detects cooling tower bounding boxes in satellite tiles
- EfficientNet-B5 — confirms detections at intermediate confidence
- PyTorch, Flask

**Data**
- Microsoft Overture Maps — building footprints and attributes
- Google Maps Static API — satellite tiles for CV inference
- World Population Review — water cost by state/city
- NOAA / Open-Meteo — precipitation data
- Science Based Targets initiative (SBTi) — ESG commitment lookup
- FEMA / local municipal sources — flood risk, stormwater fees

---

## Running the app

```bash
cd rainuse-nexus
npm install
npm run dev
```

The app runs on `http://localhost:5173`. Pre-baked data for all 10 cities loads automatically — no server needed for basic use.

---

## Running the CV microservice

Required for live cooling tower detection during custom audits.

```bash
pip install -r requirements_towerscout.txt
python tower_server.py --yolo-weights yolov5_best.pt --en-weights b5_unweighted_best.pt
```

Model weights are not included in the repo (too large). Place them in the project root before starting.

---

## Environment variables

Create a `.env` file in the project root:

```
GOOGLE_MAPS_API_KEY=your_key_here
```

Required for satellite tile fetching during live audits and data generation.
