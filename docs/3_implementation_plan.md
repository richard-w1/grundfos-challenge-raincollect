RainUSE Nexus
Implementation Plan  •  25-Hour Sprint  •  v1.0


Organized by critical path. Each phase has a clear owner (Human or AI-assisted), a hard deliverable, and a time box. Code freezes at Hour 22 — final 3 hours are demo rehearsal only.


Pre-Hackathon Checklist (Before Clock Starts)


These tasks must be done before the 25-hour clock starts. Failure to do these will cost 4+ hours inside the sprint.

Task
Owner
Status
Run Overture Maps CLI for all 5 cities, filter to >9290 m², save as GeoJSON
Human
TODO
Pull NOAA 5-year avg precipitation per city, save as static JSON
Human
TODO
Acquire NOAA CDO API token (email registration, instant)
Human
TODO
Run TowerScout on satellite tiles for each city, save confidence JSON
Human
TODO
Order/confirm YF-S201 sensor + jumper wires in hand
Human
TODO
Set up Firebase Realtime Database, get config JSON
Human
TODO
Create React + Vite + Tailwind project scaffold
AI-assisted
TODO
Confirm Shovels.ai free tier access or test Socrata endpoints
Human
TODO



Phase 1 — Foundation  (Hours 0–4)


Hr
Task
Owner
Deliverable
0–1
Load pre-computed GeoJSON into React state. Verify all 5 city datasets.
Human + AI
Data loads without errors
1–2
Scaffold Deck.gl + MapLibre map component. Render building footprints as GeoJsonLayer.
AI-assisted
Map shows buildings
2–3
Implement Viability Score formula. Wire to buildings. Color footprints by tier.
AI-assisted
Buildings color-coded
3–4
City selector UI + fly-to animation. Switching cities updates map and data.
Human + AI
City switching works


✓ Phase 1 exit criteria: Map loads, buildings visible, color-coded by score, city switching functional.


Phase 2 — Core Features  (Hours 4–12)


Hr
Task
Owner
Deliverable
4–6
Prospect Detail Panel — click building → sidebar shows score breakdown, ROI calc, catchment estimate.
AI-assisted
Panel opens on click
6–8
3D extruded view — toggle between flat footprints and extruded-by-area 3D buildings.
AI-assisted
3D toggle works
8–10
Score weight sliders — UI panel to adjust component weights in real time, score updates live.
AI-assisted
Sliders update scores
10–12
Permit pipeline layer — pull Shovels.ai/Socrata data, render as dashed amber overlay on map.
Human + AI
Permit layer visible


✓ Phase 2 exit criteria: Full prospect panel, 3D view, live score tuning, permit layer on map.


Phase 3 — Differentiators  (Hours 12–18)


Hr
Task
Owner
Deliverable
12–14
Cooling tower overlay — render TowerScout results as pulsing dots. Show confidence score in panel.
AI-assisted
Tower dots on map
14–16
Phase 2 sensor dashboard tab — Firebase listener or simulated JSON stream. Real vs. estimated chart.
Human + AI
Live data tab works
16–18
Raspberry Pi sensor script — GPIO interrupt → L/min → Firebase push. Test with running water.
Human
Live data flows to app


✓ Phase 3 exit criteria: Towers visible, sensor dashboard live (real or simulated), Pi connected.


Phase 4 — Polish & Demo Prep  (Hours 18–25)


Hr
Task
Owner
Deliverable
18–20
UI polish pass — typography, spacing, color consistency, loading states, empty states.
AI-assisted
Presentation-grade UI
20–21
Ranked building list sidebar — top 10 prospects per city, sortable by score.
AI-assisted
Ranked list works
21–22
CODE FREEZE. Deploy to Vercel. Smoke test all 5 city pre-loads. Confirm Pi still connected.
Human
Live URL works
22–25
Demo rehearsal only. 5 min script. No new code. Prepare physical Pi + sensor as table prop.
Human
Team can pitch it cold



File Structure


rainuse-nexus/├── public/│   └── data/│       ├── dallas.geojson          # Pre-computed buildings│       ├── phoenix.geojson│       ├── miami.geojson│       ├── philadelphia.geojson│       ├── austin.geojson│       ├── precipitation.json      # NOAA 5-yr avg per city│       ├── water_costs.json        # State utility rates│       ├── tower_detections.json   # TowerScout results│       └── incentives.json         # State rebate flags├── src/│   ├── components/│   │   ├── Map.jsx                 # Deck.gl + MapLibre│   │   ├── ProspectPanel.jsx       # Building detail sidebar│   │   ├── ScoreSliders.jsx        # Weight tuning UI│   │   ├── SensorDashboard.jsx     # Phase 2 live tab│   │   └── BuildingList.jsx        # Ranked list sidebar│   ├── utils/│   │   ├── viabilityScore.js       # Score formula│   │   ├── roiCalc.js              # Gallons + $ savings│   │   └── firebase.js             # Sensor data stream│   └── App.jsx├── pi/│   └── flow_sensor.py              # Raspberry Pi script└── package.json


Risk Register


Risk
Severity
Mitigation
Owner
TowerScout takes too long to run
HIGH
Run pre-event. If still slow, skip Dallas and use 2 cities only.
Human (pre-event)
Shovels.ai no free tier
MED
Fall back to Socrata per-city API. Austin + Dallas are tested.
Human (Hr 0)
Pi sensor won't connect in venue WiFi
MED
Use Pi as hotspot. Or switch to simulated mode — same story, lower risk.
Human (Hr 16)
Map performance slow with 2000+ buildings
MED
Pre-filter to top 500 buildings per city by score. Deck.gl handles 10k+ easily.
AI-assisted (Hr 1)
Overture CLI slow / network issues
LOW
Run pre-event. Cache results. No live dependency during demo.
Human (pre-event)



Demo Script Outline (5 Minutes)


(0:00–0:45) Problem — Show a sales rep's screen: Google Maps, manual measurements, spreadsheet. 'This is how it's done today. 3 days per prospect.'
(0:45–1:30) Phase 1 reveal — Switch to the app. Select Dallas. Map flies in. 'In seconds, we've identified 847 candidate buildings. Color = Viability Score.'
(1:30–2:15) Drill down — Click the highest-scored building. Panel opens. Show score breakdown, 180,000 gallons/year, $14,000 in savings, cooling tower detected.
(2:15–2:45) Score tuning — Move the water cost slider up. 'Philadelphia has 3× the water cost — watch what happens.' Scores reprioritize live.
(2:45–3:15) Permit layer — Toggle on. 'These amber outlines don't exist yet. We're in the room when they're designing the mechanical room.'
(3:15–4:15) Phase 2 — Switch to sensor tab. Pi is running. Live chart shows real L/min vs. estimate. 'The estimate said 12.3 GPM. The sensor says 11.8. A 4% delta. Every deployment makes our model smarter.'
(4:15–5:00) Close — 'Satellite finds the prospect. Sensor proves the ROI. That's the number a CFO will sign off on. This is RainUSE Nexus.'
