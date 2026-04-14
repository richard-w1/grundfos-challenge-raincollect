# RainCollect

A commercial building prospecting engine for Grundfos water reuse systems. The app identifies high-value buildings across US cities by combining satellite imagery analysis, financial data, and regulatory signals into a single Viability Score surfaced through an interactive map.

Built for the Grundfos sponsor track at HackSMU VII. [Devpost](https://devpost.com/software/rain-pr9y7j)

<img width="1932" height="818" alt="image" src="https://github.com/user-attachments/assets/ef376a33-504c-499e-af55-5ae6af1d5036" />
<em>Interactive map with marked buildings of interest and water cooling towers. Area information data sources and heuristics.</em>
<br>
<br>
<img src="https://github.com/user-attachments/assets/3157c671-34f2-4059-aff7-06f7c52d9876">
<br>
<em>Water cooling tower detection on satellite imagery via Google Maps Static.</em>

---

## What it does

- Lets you run a live audit on any city and filter/explore/save results in an interactive map
- Scores each building on roof area, local water cost, precipitation, stormwater fees, ESG commitments, tax incentives, and flood risk
- Detects cooling towers in satellite imagery using a two-stage computer vision pipeline rendered as precise map markers

---

## Built with

**Frontend**

React (Vite), MapLibre GL, Deck.gl, Zustand, Mantine

**ML / CV microservice**

YOLOv5, EfficientNet-B5, PyTorch, Flask

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
