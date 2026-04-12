import { applyCoolingMultiplier } from './cooling'

/**
 * Recalculates viability score from stored score_breakdown components
 * and a new set of weights. Mirrors the formula in enrich.py but
 * works entirely client-side with the pre-computed sub-scores.
 *
 * weights: { roof, precip, cost, esg, regulatory } — values 0-100, should sum to 100
 * breakdown: { roof, precip, cost, esg, regulatory } — pre-computed sub-scores (0-100)
 *
 * cost sub-score is computed on total water cost (intake + sewer), normalized $4–$26/kgal.
 * regulatory sub-score uses proportional stormwater fee rate (max $0.20/sqft/yr = 40pts)
 *   + tax credit (40pts) + rebate capped at 20pts.
 */
export function recalcScore(breakdown, weights) {
  const total = weights.roof  / 100 * breakdown.roof
    + weights.precip / 100 * breakdown.precip
    + weights.cost   / 100 * breakdown.cost
    + weights.esg    / 100 * breakdown.esg
    + weights.regulatory / 100 * breakdown.regulatory

  return Math.round(total * 10) / 10
}

/**
 * Smooth gradient: red (#ef4444) → orange (#f97316) → green (#22c55e)
 * Returns an rgb() string suitable for inline CSS and SVG fills.
 */
export function scoreHex(score) {
  const s = Math.max(0, Math.min(100, score))
  let r, g, b
  if (s <= 50) {
    const t = s / 50
    r = Math.round(239 + (249 - 239) * t)
    g = Math.round(68  + (115 - 68)  * t)
    b = Math.round(68  + (22  - 68)  * t)
  } else {
    const t = (s - 50) / 50
    r = Math.round(249 + (34  - 249) * t)
    g = Math.round(115 + (197 - 115) * t)
    b = Math.round(22  + (94  - 22)  * t)
  }
  return `rgb(${r},${g},${b})`
}

/**
 * Full score pipeline: weighted base → cooling tower multiplier.
 * This is the single source of truth for the final displayed score.
 *
 * coolingConfidence: 0-1 from TowerScout, or 0/undefined if no tower detected.
 */
export function calcFinalScore(breakdown, weights, coolingConfidence = 0) {
  const base = recalcScore(breakdown, weights)
  return applyCoolingMultiplier(base, coolingConfidence)
}

/**
 * Same gradient as scoreHex but returns [r, g, b, alpha] for Deck.gl layer colors.
 */
export function scoreColor(score) {
  const s = Math.max(0, Math.min(100, score))
  let r, g, b
  if (s <= 50) {
    const t = s / 50
    r = Math.round(239 + (249 - 239) * t)
    g = Math.round(68  + (115 - 68)  * t)
    b = Math.round(68  + (22  - 68)  * t)
  } else {
    const t = (s - 50) / 50
    r = Math.round(249 + (34  - 249) * t)
    g = Math.round(115 + (197 - 115) * t)
    b = Math.round(22  + (94  - 22)  * t)
  }
  return [r, g, b, 200]
}

/**
 * Recalculates annual_savings_usd using city water cost from manifest.
 * gallons_per_sqft_per_year comes from precipitation.json (embedded in manifest).
 */
export function calcAnnualGallons(area_sqft, gallons_per_sqft_per_year) {
  return Math.round(area_sqft * gallons_per_sqft_per_year)
}

export function calcAnnualSavings(annual_gallons, water_cost_per_kgal) {
  return Math.round(annual_gallons * (water_cost_per_kgal / 1000))
}

/**
 * Simple ROI estimate: system cost ~$0.08/sqft catchment area (Grundfos sizing heuristic).
 * Returns payback_years, npv_10yr, break_even_year.
 */
export function calcROI(area_sqft, annual_savings_usd, incentives) {
  const systemCost = Math.round(area_sqft * 0.08)
  const totalIncentives = (incentives?.rebate_usd ?? 0)
  const netCost = Math.max(0, systemCost - totalIncentives)
  const paybackYears = annual_savings_usd > 0 ? netCost / annual_savings_usd : null

  let npv = -netCost
  for (let y = 1; y <= 10; y++) {
    npv += annual_savings_usd / Math.pow(1.05, y)
  }

  const breakEvenYear = paybackYears ? Math.ceil(paybackYears) : null

  return {
    systemCost,
    totalIncentives,
    netCost,
    paybackYears: paybackYears ? Math.round(paybackYears * 10) / 10 : null,
    npv10yr: Math.round(npv),
    breakEvenYear,
  }
}
