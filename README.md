# RainCollect

A commercial building prospecting engine for Grundfos water reuse systems. The app identifies high-value buildings across US cities by combining satellite imagery analysis, financial data, and regulatory signals into a single Viability Score surfaced through an interactive map.

Built for the Grundfos sponsor track at HackSMU VII. [Devpost](https://devpost.com/software/rain-pr9y7j)

<img width="790" height="573" alt="image" src="https://github.com/user-attachments/assets/5ae2fbaf-2d43-4b7e-88e7-615853ddfbdf" />
<img width="806" height="386" alt="image" src="https://github.com/user-attachments/assets/2e9667d1-f0da-4dbc-8a2c-ee11537fc629" />

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

## Running

```bash
npm install
npm run dev
```

```bash
pip install -r requirements_towerscout.txt
python tower_server.py --yolo-weights yolov5_best.pt --en-weights b5_unweighted_best.pt
```

## References

Based on “Automated cooling tower detection through deep learning for Legionnaires’ disease outbreak investigations” (Wong et al., 2024, The Lancet Digital Health).

- Methodology adapted from the [TowerScout](https://github.com/TowerScout/TowerScout) project (UC Berkeley / CDC).
- [YOLOv5 model](https://github.com/richard-w1/grundfos-challenge-raincollect/releases/tag/v1.0.0) retrained using reconstructed pipeline and partial dataset.
- [EfficientNet](https://drive.google.com/file/d/1Cs3nXQddNf-Y0HYO8a5Yvm6mNB-Rx8HP/view) pretrained weights used.


Original work licensed under CC BY-NC-SA 4.0.
