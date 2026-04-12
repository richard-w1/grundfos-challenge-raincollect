RainCollect
Product Requirements Document  •  Hackathon Edition  •  v1.0


Event
25-Hour Hackathon — Grundfos Challenge
Team
TBD
Version
1.0 — Tentative, subject to pivot
Status
IN PLANNING



1. Problem Statement


Commercial and industrial buildings represent an enormous untapped opportunity for rainwater and stormwater reuse. Grundfos has the technology to capture, treat, and recirculate water at scale — but identifying the right buildings at the right time is the core sales challenge.

The status quo:
Sales reps manually estimate roof area using Google Maps
Precipitation data requires manual lookup per city
No unified signal for ESG readiness, water cost, or regulatory exposure
Zero visibility into buildings under construction (permits)
No way to validate estimated catchment against real measured flow

Result: High cost per qualified lead, long sales cycles, deals that stall at the ROI question.


2. Solution Overview — RainCollect


A two-phase web-based prospecting engine that moves from satellite estimate to field-validated ROI proof.

Phase
Description
Phase 1
Discovery Engine — Satellite + data fusion identifies and ranks candidate buildings by Viability Score across US cities. Pre-loaded city datasets for demo.
Phase 2
Proof Layer — Raspberry Pi + YF-S201 flow sensor deployed at a real downspout produces measured L/min data. Real data replaces the satellite estimate, upgrading the building's score to 'Field Validated.'



3. Core Differentiators (vs. Prompt Baseline)


The prompt describes a static scoring dashboard. We are building a living pipeline:

What prompt asks for
What we deliver
Why it matters
Viability Score from satellite + data
Score + real sensor validation layer
Defensible number for CFO conversations
Static prospecting engine
Living pipeline that improves with data
Compounding moat over time
Find existing buildings
Find existing + permit pipeline buildings
Get in the room during design phase
CV confidence score
CV score that self-corrects via sensor ground truth
Accuracy improves with every deployment



4. Functional Requirements


FR-01 — City Selection & Pre-loaded Datasets
User can select from 5 pre-loaded cities: Dallas TX, Phoenix AZ, Miami FL, Philadelphia PA, Austin TX
Each city has pre-computed building data (footprints, roof areas, precipitation, water costs)
User can also enter custom bounding box coordinates for any US location

FR-02 — Building Discovery Map
Interactive map rendered with Deck.gl + MapLibre GL JS
Building footprints color-coded by Viability Score tier (green / amber / red)
3D extruded view: buildings extruded by roof area (bigger roof = taller block)
Click any building to open the Prospect Detail Panel

FR-03 — Viability Score Engine
Score computed client-side, 0–100, from weighted formula:
Roof Area Score (30%) — polygon area from Overture Maps footprints
Precipitation Score (25%) — NOAA CDO 5-year average annual inches
Water Cost Score (20%) — pre-loaded state/city utility rates
ESG Score (15%) — building type heuristic + permit history signal
Regulatory Score (10%) — pre-loaded state incentive flags
Score tier: Tier 1 = 75+, Tier 2 = 50–74, Tier 3 = <50
Score weights adjustable via UI sliders (demo 'what-if' scenarios live)

FR-04 — Prospect Detail Panel
Displays: building address, estimated roof area (sq ft), estimated annual catchment (gallons)
Displays: Viability Score breakdown by component with visual bar
Displays: estimated annual water cost savings ($ value)
Displays: applicable tax incentives and stormwater fee credits
'Field Validate' button — links to Phase 2 sensor data if available

FR-05 — Cooling Tower Detection
Uses TowerScout pre-trained YOLOv5 weights (CDC-validated model)
Applied to satellite tile imagery for pre-loaded city buildings
Output: Confidence Score (0–1) stored per building
Presence multiplies base score by 1.0–1.3x
For hackathon: run offline before event, results baked into dataset

FR-06 — Permit Pipeline Feed
Pulls commercial building permits from Shovels.ai API (or Socrata fallback)
Filters: commercial permit type, square footage > 50,000 sq ft
Displays as distinct 'Future Pipeline' layer on map (dashed outline, amber)
Permit buildings show projected Viability Score based on permit sq footage + location

FR-07 — Phase 2 Sensor Dashboard
Live tab showing YF-S201 flow sensor data streamed from Raspberry Pi
Displays: real-time L/min, cumulative gallons captured, event timeline
Comparison chart: measured vs. satellite-estimated flow rate
Delta % between estimate and reality — the 'accuracy improvement' story
Fallback: pre-recorded JSON simulation labeled 'SIMULATED MODE'


5. Non-Functional Requirements


Performance: Initial map load < 3 seconds on broadband
Offline resilience: pre-loaded city data works without live API calls
Demo stability: no live API dependencies during the 5-minute pitch
Visual polish: presentation-grade UI — not a prototype aesthetic
Browser support: latest Chrome and Edge (demo machine only)


6. Out of Scope (Hackathon Edition)


User authentication or multi-user accounts
Real-time satellite imagery processing (pre-computed only)
Actual Grundfos hardware integration
Production deployment, scaling, or security hardening
CRM integration or lead export features
