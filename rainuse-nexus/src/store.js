import { create } from 'zustand'
import { calcFinalScore } from './utils/viabilityScore'
import { featureCentroid, findNearestTower } from './utils/cooling'
import { DEFAULT_WEIGHTS } from './components/WeightSliders'

export const useStore = create((set, get) => ({
  // Loaded from audit_manifest.json (pre-audited cities)
  audits: [],
  manifestLoaded: false,

  // Custom audits run this session
  customAudits: [],

  // Per-audit weight overrides: { [auditId]: { roof, precip, cost, esg, regulatory } }
  auditWeights: {},

  // Which audit is currently open in the detail view
  activeAuditId: null,

  // Audit in progress
  auditProgress: null,

  // Active audit detail state
  buildings: [],
  buildingsLoading: false,
  permits: [],
  permitsLoading: false,
  showPermits: false,

  // TowerScout detection data — loaded once on app startup
  // Shape: { [cityId]: Array<{ id, lat, lon, confidence, note? }> }
  coolingTowersData: {},
  showCoolingTowers: true,
  // Controls whether the audit pipeline calls tower_server.py
  detectCoolingTowers: true,
  // Only buildings whose nearest tower confidence >= this threshold are tagged
  towerConfidenceThreshold: 0.55,

  // Selected building on map
  selectedBuilding: null,
  mapFocus: null,

  // Currently active score weights (reflects the active audit's weights)
  scoreWeights: DEFAULT_WEIGHTS,

  // -------------------------------------------------------------------------
  // Saved Items
  // -------------------------------------------------------------------------
  savedBuildings: [],
  savedPermits: [],

  // -------------------------------------------------------------------------
  // Manifest + custom audits
  // -------------------------------------------------------------------------
  setAudits: (audits) => set({ audits, manifestLoaded: true }),

  addCustomAudit: (audit) =>
    set((s) => {
      // If the audit includes tower detections from tower_server.py, merge them
      // into coolingTowersData so the map layer can render them immediately.
      const towerUpdate = (audit.tower_detections?.length)
        ? { coolingTowersData: { ...s.coolingTowersData, [audit.id]: audit.tower_detections } }
        : {}
      return { customAudits: [audit, ...s.customAudits], ...towerUpdate }
    }),

  setAuditProgress: (progress) => set({ auditProgress: progress }),
  clearAuditProgress: () => set({ auditProgress: null }),

  getAuditById: (id) => {
    const s = get()
    return s.customAudits.find((a) => a.id === id) || s.audits.find((a) => a.id === id) || null
  },

  // -------------------------------------------------------------------------
  // Cooling towers
  // -------------------------------------------------------------------------
  setCoolingTowersData: (data) => set({ coolingTowersData: data }),
  toggleCoolingTowers: () => set((s) => ({ showCoolingTowers: !s.showCoolingTowers })),
  setDetectCoolingTowers: (v) => set({ detectCoolingTowers: v }),
  setTowerConfidenceThreshold: (v) => {
    console.log(`[TowerScout] confidence threshold changed → ${v.toFixed(2)}`)
    set({ towerConfidenceThreshold: v })
  },

  /** Returns the cooling tower array for the currently active audit. */
  getActiveCoolingTowers: () => {
    const s = get()
    return s.coolingTowersData[s.activeAuditId] || []
  },

  // -------------------------------------------------------------------------
  // Per-audit weight management
  // -------------------------------------------------------------------------

  getAuditWeights: (id) => {
    const s = get()
    return s.auditWeights[id] || s.customAudits.find((a) => a.id === id)?.initialWeights || DEFAULT_WEIGHTS
  },

  setAuditWeights: (id, weights) => {
    set((s) => ({ auditWeights: { ...s.auditWeights, [id]: weights } }))
    if (get().activeAuditId === id) get().loadAuditWeights(id)
  },

  loadAuditWeights: (id) => {
    const s = get()
    const weights = s.auditWeights[id]
      || s.customAudits.find((a) => a.id === id)?.initialWeights
      || DEFAULT_WEIGHTS
    const recomputed = applyWeightsAndCooling(s.buildings, weights, s.coolingTowersData[id] || [])
    recomputed.sort((a, b) => b.properties.viability_score - a.properties.viability_score)
    set({ scoreWeights: weights, buildings: recomputed })
  },

  // -------------------------------------------------------------------------
  // Building data (active audit)
  // -------------------------------------------------------------------------
  setActiveAuditId: (id) => set({ activeAuditId: id }),

  setBuildings: (rawFeatures) => {
    const s = get()
    const weights = s.auditWeights[s.activeAuditId]
      || s.customAudits.find((a) => a.id === s.activeAuditId)?.initialWeights
      || DEFAULT_WEIGHTS

    const towers = s.coolingTowersData[s.activeAuditId] || []

    console.group(`[TowerScout] setBuildings — audit: "${s.activeAuditId}"`)
    console.log('Raw buildings:', rawFeatures.length)
    console.log('Tower entries for this audit:', towers.length)
    if (towers.length) {
      const confValues = towers.map((t) => t.confidence)
      console.log(`Confidence range: ${Math.min(...confValues).toFixed(3)} – ${Math.max(...confValues).toFixed(3)}`)
      console.log(`Passing threshold (≥${s.towerConfidenceThreshold}): ${towers.filter((t) => t.confidence >= s.towerConfidenceThreshold).length}`)
    }

    const withCooling = assignCoolingTowers(rawFeatures, towers, s.towerConfidenceThreshold)

    const detected = withCooling.filter((f) => f.properties.cooling_tower_detected)
    console.log('Buildings tagged as detected after spatial join:', detected.length)
    if (detected.length) {
      console.table(detected.slice(0, 10).map((f) => ({
        id: f.properties.id,
        name: f.properties.names?.primary ?? '—',
        confidence: f.properties.cooling_tower_confidence,
        tower_id: f.properties.cooling_tower_id,
      })))
      if (detected.length > 10) console.log(`  … and ${detected.length - 10} more`)
    }
    console.groupEnd()

    const features = applyWeightsAndCooling(withCooling, weights, towers)
    features.sort((a, b) => b.properties.viability_score - a.properties.viability_score)
    set({ buildings: features, buildingsLoading: false, scoreWeights: weights })
  },

  setBuildingsLoading: (v) => set({ buildingsLoading: v }),

  setPermits: (permits) => set({ permits, permitsLoading: false }),
  setPermitsLoading: (v) => set({ permitsLoading: v }),
  togglePermits: () => set((s) => ({ showPermits: !s.showPermits })),

  setSelectedBuilding: (building) => set({ selectedBuilding: building }),
  setMapFocus: (focus) => set({ mapFocus: focus }),

  toggleSavedBuilding: (b) => set((s) => {
    const isSaved = s.savedBuildings.some((sb) => sb.properties.id === b.properties.id)
    if (isSaved) {
      return { savedBuildings: s.savedBuildings.filter((sb) => sb.properties.id !== b.properties.id) }
    } else {
      return { savedBuildings: [...s.savedBuildings, b] }
    }
  }),
  toggleSavedPermit: (p) => set((s) => {
    const isSaved = s.savedPermits.some((sp) => sp.id === p.id)
    if (isSaved) {
      return { savedPermits: s.savedPermits.filter((sp) => sp.id !== p.id) }
    } else {
      return { savedPermits: [...s.savedPermits, p] }
    }
  }),

  // -------------------------------------------------------------------------
  // Live score weight updates (sidebar sliders)
  // -------------------------------------------------------------------------
  updateWeights: (newWeights) => {
    const s = get()
    const towers = s.coolingTowersData[s.activeAuditId] || []
    const recomputed = applyWeightsAndCooling(s.buildings, newWeights, towers)
    recomputed.sort((a, b) => b.properties.viability_score - a.properties.viability_score)
    const updated = s.activeAuditId
      ? { auditWeights: { ...s.auditWeights, [s.activeAuditId]: newWeights } }
      : {}
    set({ scoreWeights: newWeights, buildings: recomputed, ...updated })
  },

  resetWeights: () => {
    const s = get()
    const weights = s.activeAuditId
      ? (s.auditWeights[s.activeAuditId] || DEFAULT_WEIGHTS)
      : DEFAULT_WEIGHTS
    const towers = s.coolingTowersData[s.activeAuditId] || []
    const recomputed = applyWeightsAndCooling(s.buildings, weights, towers)
    recomputed.sort((a, b) => b.properties.viability_score - a.properties.viability_score)
    set({ scoreWeights: weights, buildings: recomputed })
  },
}))

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Tag each feature with the nearest cooling tower confidence.
 *  Only towers with confidence >= threshold count as "detected".
 *
 *  Custom audit buildings may already have cooling_tower_confidence set by
 *  runAudit (tower_server.py). We still apply the threshold: if the inline
 *  value is below the threshold, clear the detection rather than preserving it.
 *
 *  Pre-loaded GeoJSON buildings have no cooling tower fields — they go through
 *  the full spatial join against the cooling_towers.json detections.
 */
function assignCoolingTowers(features, towers, threshold = 0.55) {
  if (!towers.length) {
    console.log('[TowerScout] assignCoolingTowers: no tower data — skipping spatial join')
    return features
  }

  const passing = towers.filter((t) => t.confidence >= threshold)
  console.log(
    `[TowerScout] assignCoolingTowers: ${towers.length} total towers, ` +
    `${passing.length} pass threshold (≥${threshold}), ` +
    `${features.length} buildings to join`
  )

  let alreadyTagged = 0, clearedBelowThreshold = 0, spatialMatched = 0, spatialMissed = 0

  const result = features.map((f) => {
    const existingConf = f.properties.cooling_tower_confidence

    // Building was tagged inline by runAudit — apply threshold now
    if (existingConf !== undefined) {
      if (existingConf >= threshold) {
        alreadyTagged++
        return f
      }
      clearedBelowThreshold++
      return {
        ...f,
        properties: {
          ...f.properties,
          cooling_tower_confidence: existingConf !== undefined && existingConf !== null ? existingConf : 0,
          cooling_tower_detected: false,
          cooling_tower_id: null,
        },
      }
    }

    // Pre-loaded building: spatial join against all towers
    const c = featureCentroid(f)
    if (!c) return f
    const nearest = findNearestTower(c.lat, c.lon, towers, 200)
    if (nearest && nearest.confidence >= threshold) spatialMatched++
    else spatialMissed++
    return {
      ...f,
      properties: {
        ...f.properties,
        cooling_tower_confidence: nearest?.confidence ?? 0,
        cooling_tower_detected: (nearest?.confidence ?? 0) >= threshold,
        cooling_tower_id: nearest?.id || null,
      },
    }
  })

  console.log(
    `[TowerScout] join results — ` +
    `already-tagged (kept): ${alreadyTagged}, ` +
    `already-tagged (cleared, below threshold): ${clearedBelowThreshold}, ` +
    `spatial match: ${spatialMatched}, ` +
    `spatial miss: ${spatialMissed}`
  )
  return result
}

/** Recalculate viability_score for each feature using weights + cooling multiplier. */
function applyWeightsAndCooling(features, weights, _towers) {
  return features.map((f) => {
    const breakdown = f.properties.score_breakdown
    if (!breakdown) return f
    const conf = f.properties.cooling_tower_confidence || 0
    const newScore = calcFinalScore(breakdown, weights, conf)
    return { ...f, properties: { ...f.properties, viability_score: newScore } }
  })
}
