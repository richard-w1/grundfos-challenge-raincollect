# RainCollect

A commercial building prospecting engine for Grundfos water reuse systems. The app identifies high-value buildings across US cities by combining satellite imagery analysis, financial data, and regulatory signals into a single Viability Score surfaced through an interactive map.

Built for the Grundfos Challenge.

---

## What it does

- Scores each building on roof area, local water cost, precipitation, stormwater fees, ESG commitments, tax incentives, and flood risk
- Detects cooling towers in satellite imagery using a two-stage computer vision pipeline (YOLOv5 + EfficientNet-B5), rendered as precise map markers
- Lets you run a live audit on any city and filter/explore results in an interactive map

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

```bash
pip install -r requirements_towerscout.txt
python tower_server.py --yolo-weights yolov5_best.pt --en-weights b5_unweighted_best.pt
```
