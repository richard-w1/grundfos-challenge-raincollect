/**
 * Client-side audit engine.
 * Mirrors the logic of fetch_cities.py, fetch_precip.py, and enrich.py
 * using browser-accessible APIs:
 *   - Nominatim (OpenStreetMap) for geocoding + reverse geocoding
 *   - Overpass API (OSM) for building footprints + address/contact tags
 *   - Open-Meteo archive API for historical precipitation
 *   - /data/us_reference.json for water costs, incentives, water stress
 */

// ---------------------------------------------------------------------------
// BUILDING OWNERSHIP RESEARCH — brainstorm / TODO
// ---------------------------------------------------------------------------
//
// Problem: The visible occupant of a commercial building often does NOT own it.
// Grundfos needs the decision-maker for capital expenditures — typically the
// property owner or property manager, not the tenant renting the space.
// In net-lease arrangements the tenant pays utilities and DOES make system
// decisions, but in gross leases the landlord controls building systems.
//
// Current MVP: Google Maps link + reverse-geocoded address for manual lookup.
//
// Leads to investigate for automated ownership resolution:
//
// 1. Regrid API (regrid.com/api)
//    - Aggregates county tax assessor data across the US (~95% parcel coverage)
//    - Query by lat/lon → returns parcel, owner name, owner mailing address,
//      year built, assessed value, lot area
//    - Free tier available; paid for bulk/production
//    - This is the most promising single-API solution for owner lookup
//
// 2. County Assessor Websites (per-jurisdiction)
//    - Every US county maintains public property tax records
//    - Many are searchable by address or parcel number
//    - No unified API — would require city-specific scrapers
//    - Example: Dallas DCAD (dcad.org), Austin TCAD, NYC ACRIS
//
// 3. OpenCorporates (opencorporates.com)
//    - Once owner name is retrieved (e.g. "123 Commerce Dr LLC"), use
//      OpenCorporates to find LLC registered agent, directors, officers
//    - Helps pierce the common "holding LLC" veil to real decision-makers
//    - Has a free API tier
//
// 4. LoopNet / CoStar (paid)
//    - Commercial real estate listings often include owner, broker, and
//      management company contact information
//    - CoStar API available to paying subscribers
//
// 5. AI agent pipeline (future)
//    Given building name + centroid coordinates:
//    a. Reverse geocode to get address (Nominatim — already in use)
//    b. Query Regrid API for owner name + mailing address
//    c. If owner is an LLC, query OpenCorporates for principals
//    d. Search LinkedIn for "Facilities Manager [owner company]"
//    e. Use Hunter.io / Clearbit to find verified contact email
//    Could be exposed as a "Enrich Contact" step per building.
//
// 6. OSM tags (already fetched, partial coverage)
//    - operator=* — who operates the facility (often the tenant, not owner)
//    - contact:phone, phone, website — direct contact sometimes available
//    - addr:* — street address
//    Coverage is patchy for commercial buildings but costs nothing.
//
// Note on lease structures:
//    Net lease  → tenant pays utilities → TENANT is the right contact
//    Gross lease → landlord pays utilities → OWNER/PM is the right contact
//    Need to understand lease type before targeting. For large commercial
//    buildings (hospitals, universities, government) the occupant almost
//    always controls their own building systems regardless of ownership.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// OSM building type normalization
// ---------------------------------------------------------------------------

const BUILDING_TYPE_MAP = {
  hospital: 'hospital', clinic: 'hospital', healthcare: 'hospital',
  hotel: 'hotel', hostel: 'hotel', motel: 'hotel',
  school: 'education', university: 'education', college: 'education',
  kindergarten: 'education', educational: 'education',
  government: 'government', public: 'government', civic: 'government',
  office: 'office', offices: 'office',
  retail: 'retail', supermarket: 'retail', mall: 'retail',
  commercial: 'commercial',
  industrial: 'industrial', factory: 'industrial', manufacture: 'industrial',
  warehouse: 'warehouse', storage: 'warehouse', distribution_center: 'warehouse',
}

export function normalizeBuildingType(tags) {
  const b = (tags.building || '').toLowerCase()
  const amenity = (tags.amenity || '').toLowerCase()

  if (BUILDING_TYPE_MAP[amenity]) return BUILDING_TYPE_MAP[amenity]
  if (BUILDING_TYPE_MAP[b]) return BUILDING_TYPE_MAP[b]
  if (tags.office) return 'office'
  if (tags.shop) return 'retail'
  if (tags.industrial) return 'industrial'
  return null
}

// ---------------------------------------------------------------------------
// Geometry — Shoelace formula, matches test2.py / fetch_cities.py exactly
// ---------------------------------------------------------------------------

export function polygonAreaSqft(coords) {
  // coords: [{lat, lon}, ...] from Overpass `out geom`
  if (!coords || coords.length < 3) return 0
  const avgLat = coords.reduce((s, c) => s + c.lat, 0) / coords.length
  const scaleX = Math.cos((avgLat * Math.PI) / 180) * 111320
  const scaleY = 111320
  const pts = coords.map((c) => [c.lon * scaleX, c.lat * scaleY])
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    area += pts[i][0] * pts[j][1]
    area -= pts[j][0] * pts[i][1]
  }
  return Math.round((Math.abs(area) / 2) * 10.764)
}

// ---------------------------------------------------------------------------
// Viability score — mirrors enrich.py exactly
// ---------------------------------------------------------------------------

const ESG_MAP = {
  office: 80, commercial: 60, retail: 50, industrial: 40,
  warehouse: 35, hotel: 75, hospital: 85, education: 90, government: 70,
}

function scoreRoof(areaSqft) {
  return Math.min(100, Math.max(0,
    (Math.log10(Math.max(areaSqft, 1)) - Math.log10(100000)) /
    (Math.log10(1000000) - Math.log10(100000)) * 100,
  ))
}

function scorePrecip(avgInches) {
  return Math.min(100, Math.max(0, (avgInches - 8) / (62 - 8) * 100))
}

/**
 * Cost sub-score uses total water cost (intake + sewer).
 * Normalized $4–$26/kgal — matches enrich_all.py.
 */
function scoreCost(totalCostPerKgal) {
  return Math.min(100, Math.max(0, (totalCostPerKgal - 4) / (26 - 4) * 100))
}

function scoreEsg(buildingType) {
  return ESG_MAP[buildingType] ?? 45
}

/**
 * Regulatory sub-score:
 *   tax credit       → 40 pts (boolean or non-empty notes string)
 *   stormwater fee   → 0–40 pts proportional to $/sqft/yr rate (max $0.20)
 *   rebate           → 0–20 pts (max at $10k)
 */
function scoreRegulatory(incentives) {
  const hasTaxCredit = !!(incentives.tax_credit || incentives.tax_credit_notes)
  const swRate = incentives.stormwater_fee_per_sqft_yr
  const swScore = swRate != null
    ? Math.min(40, (swRate / 0.20) * 40)
    : (incentives.stormwater_fee ? 40 : 0)
  return (hasTaxCredit ? 40 : 0) + swScore + Math.min(20, (incentives.rebate_usd || 0) / 500)
}

/** totalWaterCost = intake + sewer combined — matches enrich_all.py formula */
export function computeViability(areaSqft, avgPrecip, totalWaterCost, buildingType, incentives) {
  const breakdown = {
    roof:       Math.round(scoreRoof(areaSqft) * 10) / 10,
    precip:     Math.round(scorePrecip(avgPrecip) * 10) / 10,
    cost:       Math.round(scoreCost(totalWaterCost) * 10) / 10,
    esg:        Math.round(scoreEsg(buildingType) * 10) / 10,
    regulatory: Math.round(scoreRegulatory(incentives) * 10) / 10,
  }
  const total =
    breakdown.roof       * 0.30 +
    breakdown.precip     * 0.25 +
    breakdown.cost       * 0.20 +
    breakdown.esg        * 0.15 +
    breakdown.regulatory * 0.10
  return { ...breakdown, total: Math.round(total * 10) / 10 }
}

// ---------------------------------------------------------------------------
// Nominatim geocoding
// ---------------------------------------------------------------------------

export async function geocodeLocation(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us&addressdetails=1`
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'en', 'User-Agent': 'RainUSE-Nexus/1.0' },
  })
  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`)
  const data = await res.json()
  if (!data.length) throw new Error(`Location not found: "${query}"`)

  const r = data[0]
  const lat = parseFloat(r.lat)
  const lon = parseFloat(r.lon)

  // state code from address details
  const stateCode = r.address?.['ISO3166-2-lvl4']?.replace('US-', '')
    || r.address?.state_code?.toUpperCase()
    || null

  const displayName = [r.address?.city || r.address?.town || r.address?.county, r.address?.state]
    .filter(Boolean).join(', ') || r.display_name

  // ±0.2° bbox (~22km each side) — consistent with Python script bbox sizes
  const delta = 0.2
  return {
    lat, lon, stateCode, displayName,
    bbox: { south: lat - delta, north: lat + delta, west: lon - delta, east: lon + delta },
  }
}

// ---------------------------------------------------------------------------
// Overpass API — building footprints
// ---------------------------------------------------------------------------

export async function fetchBuildingsFromOSM(bbox) {
  const { south, west, north, east } = bbox
  // Note: Overpass bbox order is south,west,north,east (opposite of Overture west,south,east,north)
  const query = `[out:json][timeout:90];(way["building"](${south},${west},${north},${east}););out geom qt;`

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  })
  if (!res.ok) throw new Error(`Overpass API error: ${res.status}`)
  const data = await res.json()
  return data.elements || []
}

// ---------------------------------------------------------------------------
// Open-Meteo archive — 5-year avg annual precipitation
// ---------------------------------------------------------------------------

export async function fetchPrecipitation(lat, lon) {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=2019-01-01&end_date=2023-12-31&daily=precipitation_sum&timezone=UTC`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`)
  const data = await res.json()

  const times = data.daily?.time || []
  const precip = data.daily?.precipitation_sum || []

  // Sum rainfall by year, average, convert mm → inches
  const byYear = {}
  times.forEach((t, i) => {
    const year = t.slice(0, 4)
    byYear[year] = (byYear[year] || 0) + (precip[i] || 0)
  })
  const avgMm = Object.values(byYear).reduce((a, b) => a + b, 0) / Object.keys(byYear).length
  return Math.round((avgMm / 25.4) * 10) / 10 // mm → inches, 1 decimal
}

// ---------------------------------------------------------------------------
// Main audit runner
// ---------------------------------------------------------------------------

const TOWER_SERVER = 'http://localhost:5001'

/** Ping the TowerScout server. Returns true if reachable (2s timeout). */
export async function checkTowerServer() {
  try {
    const res = await fetch(`${TOWER_SERVER}/health`, {
      signal: AbortSignal.timeout(2000),
    })
    const up = res.ok
    console.log(`[TowerScout] server health check → ${up ? 'UP' : 'DOWN'} (${TOWER_SERVER})`)
    if (up) {
      const body = await res.json().catch(() => ({}))
      console.log('[TowerScout] server info:', body)
    }
    return up
  } catch (e) {
    console.log(`[TowerScout] server not reachable at ${TOWER_SERVER} — tower detection will be skipped`)
    return false
  }
}

/**
 * Send building centroids to the local TowerScout server.
 * Returns [] on any failure — the audit continues without tower data.
 */
async function detectCoolingTowers(features, googleMapsKey) {
  const buildings = features.map((f) => {
    const ring = f.geometry?.coordinates?.[0] || []
    const lat  = ring.reduce((s, c) => s + c[1], 0) / (ring.length || 1)
    const lon  = ring.reduce((s, c) => s + c[0], 0) / (ring.length || 1)
    return { id: f.properties.id, lat, lon }
  })

  console.group(`[TowerScout] detectCoolingTowers — sending ${buildings.length} buildings to server`)
  console.log('Endpoint:', `${TOWER_SERVER}/detect`)
  console.log('API key provided:', !!googleMapsKey)

  const res = await fetch(`${TOWER_SERVER}/detect`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ buildings, api_key: googleMapsKey || '' }),
    signal:  AbortSignal.timeout(300_000),
  })

  if (!res.ok) {
    console.error('[TowerScout] /detect returned', res.status)
    console.groupEnd()
    throw new Error(`Tower server returned ${res.status}`)
  }

  const data = await res.json()
  const towers = data.towers || []

  console.log('Server response:', {
    scanned: data.scanned,
    detected: towers.length,
    errors: data.errors,
    pipeline: data.pipeline,
    conf_threshold: data.conf_threshold,
  })

  if (towers.length) {
    const confs = towers.map((t) => t.confidence)
    console.log(`Confidence range: ${Math.min(...confs).toFixed(3)} – ${Math.max(...confs).toFixed(3)}`)
    console.table(towers.slice(0, 10).map((t) => ({
      id: t.id,
      lat: t.lat,
      lon: t.lon,
      confidence: t.confidence,
      source_building_id: t.source_building_id,
    })))
    if (towers.length > 10) console.log(`  … and ${towers.length - 10} more`)
  } else {
    console.log('No cooling towers detected above server threshold')
  }

  console.groupEnd()
  return towers
}

/**
 * @param {object} params
 * @param {string}   params.query          - City name or ZIP
 * @param {number}   params.minRoofSqft    - e.g. 100000
 * @param {string[]} params.buildingTypes  - [] = all types
 * @param {number|null} params.minFloors   - null = no filter
 * @param {object}   params.weights        - score component weights
 * @param {boolean}  [params.detectCoolingTowersEnabled=true] - whether to run tower detection
 * @param {string}   [params.googleMapsKey] - forwarded to tower_server.py
 * @param {function} params.onProgress     - ({ step, total, message, towerServerAvailable? }) => void
 */
export async function runAudit({ query, minRoofSqft, buildingTypes, minFloors, weights, detectCoolingTowersEnabled = true, googleMapsKey, onProgress }) {
  // Check tower server availability before starting (non-blocking, fast timeout)
  const towerServerAvailable = detectCoolingTowersEnabled && await checkTowerServer()
  const STEPS = towerServerAvailable ? 6 : 5
  const progress = (step, message, extra = {}) => onProgress({ step, total: STEPS, message, towerServerAvailable, ...extra })

  // 1. Geocode
  progress(1, `Geocoding "${query}"...`)
  const location = await geocodeLocation(query)

  // 2. Precipitation from Open-Meteo
  progress(2, 'Fetching 5-year precipitation data (Open-Meteo)...')
  const avgPrecip = await fetchPrecipitation(location.lat, location.lon)

  // 3. Reference data — city-level first, state-level fallback
  const [reference, cityReference] = await Promise.all([
    fetch('/data/us_reference.json').then((r) => r.json()),
    fetch('/data/city_reference.json').then((r) => r.json()).catch(() => ({})),
  ])
  const stateRef = reference.states[location.stateCode] || reference.states['DEFAULT']

  // City lookup: match payload key ("Dallas, TX") against geocoded display name + stateCode
  const cityKey = Object.keys(cityReference).find((k) => {
    const [kCity, kState] = k.split(', ')
    return kState === location.stateCode &&
      location.displayName.toLowerCase().includes(kCity.toLowerCase())
  })
  const cityData = cityKey ? cityReference[cityKey] : null

  const waterCost  = cityData?.water_cost_per_kgal  ?? stateRef.water_cost_per_kgal
  const sewerCost  = cityData?.sewer_cost_per_kgal  ?? 0
  const totalWaterCost = waterCost + sewerCost
  const stormwaterFeePerSqftYr = cityData?.stormwater_fee_per_sqft_yr ?? 0
  const waterStressScore = cityData?.esg_climate?.water_stress_score ?? null

  // Derive human-readable stress label from numeric score (WRI Aqueduct bands)
  const waterStress = waterStressScore != null
    ? (waterStressScore >= 4 ? 'Extremely High' : waterStressScore >= 3 ? 'High'
      : waterStressScore >= 2 ? 'Medium-High' : waterStressScore >= 1 ? 'Low-Medium' : 'Low')
    : stateRef.water_stress

  // Merge city + state incentive data into a unified object understood by scoreRegulatory
  const cityInv = cityData?.incentives || {}
  const stateInv = stateRef.incentives || {}
  const incentives = {
    tax_credit:                  stateInv.tax_credit || false,
    tax_credit_notes:            cityInv.tax_credit_notes || null,
    stormwater_fee:              stormwaterFeePerSqftYr > 0 || stateInv.stormwater_fee || false,
    stormwater_fee_per_sqft_yr: stormwaterFeePerSqftYr,
    stormwater_notes:            cityInv.stormwater_notes || null,
    rebate_usd:                  cityInv.rebate_usd ?? stateInv.rebate_usd ?? 0,
    rebate_notes:                cityInv.rebate_notes || null,
    legal_link:                  cityInv.legal_link || null,
  }

  const gallonsPerSqftPerYear = Math.round(avgPrecip * 0.623 * 1000) / 1000

  // 4. OSM building footprints
  progress(3, 'Downloading building footprints from OpenStreetMap...')
  const elements = await fetchBuildingsFromOSM(location.bbox)
  progress(4, `Processing ${elements.length.toLocaleString()} raw buildings...`)

  // 5. Enrich + filter
  const features = []
  for (const el of elements) {
    if (!el.geometry || el.geometry.length < 3) continue
    const areaSqft = polygonAreaSqft(el.geometry)
    if (areaSqft < minRoofSqft) continue

    const tags = el.tags || {}
    const buildingType = normalizeBuildingType(tags)

    // Building type filter — skip if user selected specific types and this one doesn't match
    if (buildingTypes.length > 0 && buildingType && !buildingTypes.includes(buildingType)) continue

    // Floor filter
    const floors = tags['building:levels'] ? parseInt(tags['building:levels']) : null
    if (minFloors && floors && floors < minFloors) continue

    const breakdown = computeViability(areaSqft, avgPrecip, totalWaterCost, buildingType, incentives)
    const annualGallons = Math.round(areaSqft * gallonsPerSqftPerYear)
    const annualSavings = Math.round(annualGallons * totalWaterCost / 1000)

    // Close the ring for GeoJSON
    const ring = el.geometry.map((p) => [p.lon, p.lat])
    if (ring.length > 0) {
      const first = ring[0]; const last = ring[ring.length - 1]
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first])
    }

    // Collect any address / contact info OSM has for this building
    const addr = {
      housenumber: tags['addr:housenumber'] || null,
      street:      tags['addr:street']      || null,
      city:        tags['addr:city']        || null,
      postcode:    tags['addr:postcode']    || null,
    }
    const hasAddr = addr.housenumber || addr.street

    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: {
        id:         `osm-${el.id}`,
        osm_id:     el.id,
        names:      { primary: tags.name || tags.operator || null },
        operator:   tags.operator || null,
        class:      buildingType,
        height:     tags.height          ? parseFloat(tags.height) : null,
        num_floors: floors,
        area_sqft:  areaSqft,
        area_m2:    Math.round(areaSqft / 10.764),
        addr:       hasAddr ? addr : null,
        phone:      tags.phone || tags['contact:phone'] || null,
        website:    tags.website || tags['contact:website'] || null,
        city:       location.displayName,
        viability_score:   breakdown.total,
        score_breakdown:   breakdown,
        annual_gallons:    annualGallons,
        annual_savings_usd: annualSavings,
        incentives,
        water_stress: waterStress,
        source: 'osm',
      },
    })
  }

  // Sort by score descending, keep top 500 (mirrors enrich.py)
  features.sort((a, b) => b.properties.viability_score - a.properties.viability_score)
  const top = features.slice(0, 500)

  // 6. TowerScout cooling tower detection (optional — requires tower_server.py running locally)
  let towerDetections = []
  if (towerServerAvailable) {
    progress(5, `Running TowerScout on ${top.length} buildings — this may take a few minutes...`)
    console.group(`[TowerScout] runAudit step 6 — live detection for "${query}"`)
    try {
      towerDetections = await detectCoolingTowers(top, googleMapsKey)
      const towerById = new Map(towerDetections.map((t) => [t.source_building_id, t]))
      let tagged = 0
      for (const f of top) {
        const match = towerById.get(f.properties.id)
        if (match) {
          f.properties.cooling_tower_detected   = true
          f.properties.cooling_tower_confidence = match.confidence
          tagged++
        }
      }
      console.log(`Tagged ${tagged} buildings with cooling tower confidence`)
      console.groupEnd()
      progress(6, `TowerScout complete — ${towerDetections.length} cooling towers detected.`)
    } catch (err) {
      console.error('[TowerScout] detection failed:', err)
      console.groupEnd()
      progress(6, 'Cooling tower detection unavailable — continuing without tower data.')
    }
  } else {
    progress(5, `Audit complete — ${top.length} qualifying buildings found.`)
  }

  return {
    features: top,
    towers:   towerDetections,
    meta: {
      location,
      avgPrecip,
      waterCost,
      sewerCost,
      totalWaterCost,
      gallonsPerSqftPerYear,
      stormwaterFeePerSqftYr,
      incentives,
      waterStress,
      waterStressScore,
      esgClimate:  cityData?.esg_climate  || null,
      dataSources: cityData?.data_sources || null,
      buildingCount: top.length,
      towerServerUsed: towerServerAvailable,
    },
  }
}
