/**
 * Cooling tower utilities.
 *
 * TowerScout (github.com/RJbalikian/TowerScout) runs YOLOv5 on satellite
 * tiles and outputs cooling tower centroids with confidence scores 0-1.
 * Results are stored in /public/data/cooling_towers.json.
 *
 * Score multiplier (per FR-05 / tech stack Layer 2):
 *   final_score = base_score × (1.0 + confidence × 0.3)
 *   Ranges from ×1.0 (no tower) to ×1.3 (confidence = 1.0)
 */

/** Haversine distance in meters between two lat/lon points. */
export function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6_371_000
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Find the nearest TowerScout detection within `thresholdM` metres.
 * Returns the tower object, or null if none within range.
 */
export function findNearestTower(lat, lon, towers, thresholdM = 200) {
  let best = null
  let bestDist = Infinity
  for (const t of towers) {
    const d = haversineM(lat, lon, t.lat, t.lon)
    if (d < thresholdM && d < bestDist) {
      best = t
      bestDist = d
    }
  }
  return best
}

/**
 * Compute a simple polygon centroid from a GeoJSON Feature.
 * Handles both Polygon and MultiPolygon geometries.
 * Uses mean of outer ring vertices — fast, accurate enough for 200m proximity checks.
 */
export function featureCentroid(feature) {
  const geom = feature?.geometry
  if (!geom) return null
  let ring
  if (geom.type === 'Polygon') {
    ring = geom.coordinates?.[0]
  } else if (geom.type === 'MultiPolygon') {
    ring = geom.coordinates?.[0]?.[0]
  }
  if (!ring?.length) return null
  const lon = ring.reduce((s, c) => s + c[0], 0) / ring.length
  const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length
  return { lat, lon }
}

/**
 * Apply the TowerScout score multiplier.
 *   confidence = 0   → multiplier 1.00 (no change)
 *   confidence = 0.5 → multiplier 1.15
 *   confidence = 1.0 → multiplier 1.30
 *
 * Cap at 100 — score cannot exceed the scale maximum.
 */
export function applyCoolingMultiplier(baseScore, confidence) {
  if (!confidence || confidence <= 0) return baseScore
  return Math.min(100, Math.round(baseScore * (1 + confidence * 0.3) * 10) / 10)
}

/**
 * For a given base score and confidence, return the absolute point boost.
 * Useful for display ("Cooling tower adds +X pts").
 */
export function coolingBoostPts(baseScore, confidence) {
  if (!confidence || confidence <= 0) return 0
  return Math.round((applyCoolingMultiplier(baseScore, confidence) - baseScore) * 10) / 10
}
