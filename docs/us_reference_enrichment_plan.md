# `us_reference.json` Enrichment Plan

## What the Challenge Actually Asks For

The challenge brief is explicit about three buckets of data beyond the physical (roof/CV) layer:

| Bucket | Variables Named | Current State |
|--------|----------------|---------------|
| **Financial & Regulatory** | Utility costs, tax incentives, stormwater fees | ✅ water cost, ⚠️ incentives are hardcoded booleans with no source |
| **Corporate / ESG** | ESG commitments, LEED status, climate risk profiles, SEC 10-K risk disclosures | ❌ completely missing |
| **Environmental** | Water stress, flood risk, regulatory pressure | ⚠️ water_stress is a string label that goes nowhere |

The judges will be looking for **data fusion** — the narrative that multiple real signals are being combined. Right now `us_reference.json` is doing the job of one file for the entire country at state granularity. That's fine structurally, but the _content_ is thin.

---

## What's Weak (Specifically)

### 1. Incentives — currently hardcoded booleans
```json
"incentives": { "tax_credit": true, "stormwater_fee": true, "rebate_usd": 5000 }
```
- `tax_credit: true` for TX — but what kind? At what rate? Is it for commercial?
- `stormwater_fee` — a boolean that says "yes this state charges one" but not what **rate** it is, which is the actual economic lever
- `rebate_usd` — completely made-up round numbers, no source
- No mention of **sewer/wastewater discharge fees** — which the challenge PDF explicitly calls out as a separate cost stream

### 2. Water stress — display-only string
```json
"water_stress": "Extremely High"
```
- Not factored into the score at all
- No quantitative value (WRI Aqueduct gives actual 0–5 scores)
- No distinction between **physical scarcity** vs **regulatory scarcity** vs **economic stress**

### 3. ESG — completely missing at state/city level
- The challenge specifically cites **SEC EDGAR** and **Science Based Targets (SBTi)**
- We have a building-type ESG lookup (hospital=85) but zero corporate or jurisdictional ESG signal
- No **LEED building density** metric
- No indicator of whether large employers in a city have **public net-zero pledges**

### 4. Sewage/wastewater discharge cost — not tracked at all
- The challenge PDF calls this out explicitly as a separate cost stream
- Harvested rainwater displaces both **intake** AND **discharge/sewer** costs
- In Philadelphia the sewer charge alone is ~$14/kgal — nearly 1.5× the water intake cost
- This materially changes ROI calculations

### 5. Climate risk — absent
- No flood zone data
- No drought year frequency
- No extreme heat days (relevant for cooling tower buildings)

---

## Data Collection Strategies

### Strategy 1: Static Research (Best for Hackathon)

Pre-research and bake into `us_reference.json`. The most reliable for demo stability.

| Data Point | Source | Notes |
|-----------|--------|-------|
| **Sewer/wastewater rate** | [EFC UNC Rate Dashboard](https://efc.sog.unc.edu/resource/us-rates/) | State averages queryable; downloadable CSV |
| **Stormwater fee rate ($/impervious sqft/yr)** | EPA MS4 Stormwater database + city utility websites | 15–20 states have meaningful commercial rates |
| **Rainwater harvesting legality / incentive tier** | ARCSA state-by-state guide | Some states mandate it, some ban it (Colorado only recently legalized) |
| **WRI Aqueduct water stress score (0–5)** | [WRI Aqueduct API](https://www.wri.org/applications/aqueduct/water-risk-atlas) | Replace string labels with actual numeric score |
| **LEED building density** | USGBC public project database — downloadable | # of certified buildings per state |
| **SBTi-committed companies by state** | [SBTi target dashboard](https://sciencebasedtargets.org/companies-taking-action) | Downloadable CSV; proxy for ESG corporate climate |

**Time cost: ~3–4 hours of research, zero runtime dependencies**

---

### Strategy 2: Live Public APIs (for New Audit / custom cities)

Call these at audit time alongside Open-Meteo. Results cached in the audit object.

| API | Data | Endpoint |
|-----|------|----------|
| **WRI Aqueduct API** | Water risk score at lat/lon | `aqueduct.wri.org/api/` (REST, free tier) |
| **EPA ECHO / SDWIS** | Safe drinking water violations by state — regulatory pressure signal | `echo.epa.gov/tools/web-services` |
| **FEMA National Flood Hazard Layer** | Flood zone at lat/lon | `msc.fema.gov/arcgis/rest/services/` |
| **NOAA Storm Events Database** | Historical flood events by county | `www.ncdc.noaa.gov/stormevents/` |
| **Socrata (city open data portals)** | Building permits, utility rate filings | Per-city; Austin already partially wired |

---

### Strategy 3: Scraped / Derived Data

Scrape once, bake into the reference file. Good for data that doesn't change often.

| Source | What to extract | Method |
|--------|----------------|--------|
| **[worldpopulationreview.com/state-rankings/water-prices-by-state](https://worldpopulationreview.com/state-rankings/water-prices-by-state)** | Already cited in challenge.md — average water cost per state | Simple fetch + parse |
| **USGBC LEED project database** | LEED-certified building count per state | CSV download |
| **SBTi companies CSV** | Companies with SBTi targets by HQ state | CSV download, group by state |
| **EFC Rates Dashboard** | Wastewater/sewer rates by state | Their embedded data table |
| **State utility commission rate filings** | Commercial tier water rates (more accurate than residential avg) | Per-state, ~10 key states |

---

### Strategy 4: Derived / Calculated Fields

Compute from existing data — zero new sources needed.

| Field | Formula | Why |
|-------|---------|-----|
| `total_water_cost_per_kgal` | `water_cost + sewer_cost_per_kgal` | True economic cost of water — this is what harvesting displaces |
| `roi_multiplier` | Derived from stormwater fee rate × typical 100k sqft impervious area | Converts "stormwater fee" from boolean to dollar figure |
| `regulatory_pressure_score` (0–5) | Weighted sum of: water stress + violations + LEED density + stormwater fee presence | Richer than current binary incentives |
| `annual_gallons_per_sqft` | `precip_inches × 0.623` (already computed) | Currently exists; surface it more |

---

## Proposed New Schema for `us_reference.json`

```json
{
  "TX": {
    "water_cost_per_kgal": 4.5,
    "sewer_cost_per_kgal": 3.2,
    "total_water_cost_per_kgal": 7.7,
    "water_stress_score": 3.4,
    "water_stress_label": "High",
    "drought_frequency": "High",

    "incentives": {
      "tax_credit": true,
      "tax_credit_rate_pct": 15,
      "tax_credit_notes": "Texas Property Code §11.31 — rainwater harvesting systems exempt from property tax",
      "stormwater_fee": true,
      "stormwater_fee_per_sqft_yr": 0.18,
      "rebate_usd": 5000,
      "rebate_source": "Austin Water Rainwater Harvesting Rebate Program",
      "harvesting_legal": true,
      "harvesting_mandate": false,
      "harvesting_notes": "Collection legal statewide; potable use requires treatment permit"
    },

    "regulatory_pressure": {
      "score": 3.8,
      "epa_water_violations_5yr": 12,
      "ms4_permit": true,
      "leed_buildings_count": 847,
      "sbti_companies_count": 34
    },

    "climate_risk": {
      "flood_risk_label": "Medium",
      "extreme_heat_days_avg": 42,
      "drought_years_last_10": 4
    }
  }
}
```

---

## Display Strategy — How to Surface This to the User

### In the Building Detail Sidebar

Currently the sidebar shows a score breakdown bar. Additions:

1. **"True Water Cost" callout** — show `water_cost + sewer_cost` with a note: *"Each gallon harvested avoids $X.XX in intake + discharge fees."*
2. **Incentive stack** — replace boolean chips with a dollar-framed breakdown:
   - *Tax credit saves ~$X on install*
   - *Stormwater fee: $Y/sqft/yr avoided on 100k sqft = $Z/yr*
   - *Rebate: up to $X available*
3. **Climate Risk badge** — small inline chip: `Flood Risk: Medium | Drought: High`
4. **ESG Signal** — *"34 SBTi-committed companies in TX — ESG pressure in this market is rising"*

### On the Audit Summary / Dashboard

- **State scorecard panel** — when you open an audit, show a "Market Context" card with:
  - Water stress gauge (0–5 dial)
  - Regulatory pressure score
  - # LEED-certified buildings (density signal — shows whether this market cares about sustainability)
  - Total effective water cost (intake + sewer) vs national avg

### New Score Component: "Market Receptivity"

Consider replacing or augmenting the current `regulatory` sub-score (which is just about incentives) with a richer **"Market Receptivity"** component that factors:
- Regulatory pressure (violations, MS4 permit)
- ESG density (SBTi + LEED activity)
- Incentive dollar value (not just boolean)

This directly addresses the challenge's "Corporate ESG goals and climate risk profiles" requirement, which is currently a blind spot.

---

## Priority Order for Hackathon

Given time constraints, do these in order:

| Priority | What | Time Est. | Impact |
|----------|------|-----------|--------|
| **P0** | Add `sewer_cost_per_kgal` + `total_water_cost_per_kgal` for all 50 states | 1h research | High — changes ROI math |
| **P0** | Replace incentive booleans with dollar values + legal status | 2h research | High — judge credibility |
| **P1** | Replace `water_stress` string with WRI numeric score (0–5) + factor into score | 1h | Medium |
| **P1** | Add `leed_buildings_count` + `sbti_companies_count` per state | 1h CSV work | Medium — ESG story |
| **P2** | `stormwater_fee_per_sqft_yr` rate for key states | 1h | Medium — changes regulatory score |
| **P2** | Display "true water cost" and incentive stack in sidebar | 2h UI | High — pitch optics |
| **P3** | WRI Aqueduct live API call during new audit | 2h engineering | Low for demo |
| **P3** | Climate risk fields | 2h research | Low — nice to have |
