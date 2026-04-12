import { useState, useEffect } from 'react'
import { ActionIcon, Group, Tooltip, Badge } from '@mantine/core'
import {
  IconBuildingSkyscraper, IconMap2, IconStack2, IconSnowflake,
} from '@tabler/icons-react'
import DeckGL from '@deck.gl/react'
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers'
import Map2 from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useStore } from '../store'
import { scoreColor } from '../utils/viabilityScore'

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

export default function MapView({ viewState: initialView }) {
  const buildings           = useStore((s) => s.buildings)
  const selectedBuilding    = useStore((s) => s.selectedBuilding)
  const setSelectedBuilding = useStore((s) => s.setSelectedBuilding)
  const permits             = useStore((s) => s.permits)
  const showPermits         = useStore((s) => s.showPermits)
  const togglePermits       = useStore((s) => s.togglePermits)
  const showCoolingTowers        = useStore((s) => s.showCoolingTowers)
  const toggleCoolingTowers      = useStore((s) => s.toggleCoolingTowers)
  const coolingTowersData        = useStore((s) => s.coolingTowersData)
  const activeAuditId            = useStore((s) => s.activeAuditId)
  const towerConfidenceThreshold = useStore((s) => s.towerConfidenceThreshold)
  const mapFocus                 = useStore((s) => s.mapFocus)

  const [view, setView] = useState(initialView)
  const [is3D, setIs3D] = useState(false)

  useEffect(() => {
    if (mapFocus) {
      setView((v) => ({
        ...v,
        longitude: mapFocus.longitude,
        latitude: mapFocus.latitude,
        zoom: mapFocus.zoom !== undefined ? mapFocus.zoom : v.zoom,
        transitionDuration: 1000
      }))
    }
  }, [mapFocus])

  useEffect(() => {
    setView({ ...initialView, transitionDuration: 1000 })
  }, [initialView])

  const activeTowers = (coolingTowersData[activeAuditId] || []).filter(
    (t) => t.confidence >= towerConfidenceThreshold
  )

  // ── Deck.gl layers ─────────────────────────────────────────────────────────

  const buildingLayer = new GeoJsonLayer({
    id: 'buildings',
    data: { type: 'FeatureCollection', features: buildings },
    pickable: true,
    stroked: true,
    filled: true,
    extruded: is3D,
    getElevation: (f) => is3D ? (f.properties.area_sqft / 10) : 0,
    getFillColor: (f) => {
      const base = scoreColor(f.properties.viability_score)
      if (selectedBuilding && f.properties.id === selectedBuilding.properties.id) {
        return [
          Math.min(255, Math.round(base[0] + (255 - base[0]) * 0.5)),
          Math.min(255, Math.round(base[1] + (255 - base[1]) * 0.5)),
          Math.min(255, Math.round(base[2] + (255 - base[2]) * 0.5)),
          255
        ]
      }
      return base
    },
    getLineColor: [255, 255, 255, 40],
    getLineWidth: 1,
    lineWidthMinPixels: 1,
    onClick: ({ object }) => object && setSelectedBuilding(object),
    updateTriggers: {
      getFillColor: [selectedBuilding?.properties?.id],
      getElevation: [is3D],
      extruded: [is3D],
    },
  })

  const coolingTowerLayer = showCoolingTowers && activeTowers.length > 0
    ? new ScatterplotLayer({
        id: 'cooling-towers',
        data: activeTowers,
        pickable: true,
        getPosition: (d) => [d.lon, d.lat],
        getFillColor: [168, 85, 247, 200],
        getRadius: 20,
        radiusMinPixels: 4,
        radiusMaxPixels: 8,
      })
    : null

  const permitLayer = showPermits && permits.length > 0 ? new ScatterplotLayer({
    id: 'permits',
    data: permits,
    pickable: true,
    getPosition: (d) => [d.longitude, d.latitude],
    getRadius: 40,
    getFillColor: [251, 146, 60, 180],
    getLineColor: [251, 146, 60, 255],
    stroked: true,
    lineWidthMinPixels: 2,
    radiusMinPixels: 6,
    radiusMaxPixels: 20,
  }) : null

  // Layer order: buildings → cooling tower dots → permits
  const layers = [buildingLayer, coolingTowerLayer, permitLayer].filter(Boolean)

  // ── Tooltip ─────────────────────────────────────────────────────────────────

  const getTooltip = ({ object, layer }) => {
    if (!object) return null

    if (layer?.id === 'permits') {
      return {
        html: `<div style="background:#1a1b1e;padding:8px 11px;border-radius:6px;font-size:13px;border:1px solid #fb923c;font-family:'Space Grotesk',sans-serif">
          <div style="color:#fb923c;font-weight:600">Permit Pipeline</div>
          <div style="color:#aaa">${object.description || 'Commercial Permit'}</div>
        </div>`,
        style: { background: 'none', border: 'none' },
      }
    }

    if (layer?.id === 'cooling-towers') {
      return {
        html: `<div style="background:#1a1b1e;padding:8px 11px;border-radius:6px;font-size:13px;border:1px solid #a855f7;font-family:'Space Grotesk',sans-serif">
          <div style="color:#c084fc;font-weight:600">Cooling Tower</div>
          <div style="color:#aaa">Confidence: ${object.confidence?.toFixed(2)}</div>
          ${object.yolo_confidence != null ? `<div style="color:#888;font-size:11px">YOLO: ${object.yolo_confidence.toFixed(2)} · EN: ${object.secondary_confidence.toFixed(2)}</div>` : ''}
          ${object.source_building_id ? `<div style="color:#666;font-size:11px;margin-top:2px">Building: ${object.source_building_id}</div>` : ''}
        </div>`,
        style: { background: 'none', border: 'none' },
      }
    }

    return {
      html: `<div style="background:#1a1b1e;padding:8px 11px;border-radius:6px;font-size:13px;border:1px solid #2a3245;font-family:'Space Grotesk',sans-serif">
        <div style="color:#4fa3e0;font-weight:600">Score: ${object.properties.viability_score}</div>
        ${object.properties.names?.primary ? `<div style="color:#dde;font-size:12px">${object.properties.names.primary}</div>` : ''}
        <div style="color:#aaa">${object.properties.area_sqft?.toLocaleString()} sqft</div>
        <div style="color:#4caf80">$${object.properties.annual_savings_usd?.toLocaleString()}/yr savings</div>
      </div>`,
      style: { background: 'none', border: 'none' },
    }
  }

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <DeckGL
        viewState={view}
        onViewStateChange={({ viewState }) => setView(viewState)}
        controller={true}
        layers={layers}
        getTooltip={getTooltip}
      >
        <Map2 reuseMaps mapStyle={MAP_STYLE} attributionControl={false} />
      </DeckGL>

      {/* Map controls */}
      <div style={{ position: 'absolute', bottom: 24, left: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Tooltip label={is3D ? 'Switch to 2D' : 'Switch to 3D'} position="right">
          <ActionIcon
            size="lg"
            variant={is3D ? 'filled' : 'default'}
            onClick={() => setIs3D((v) => !v)}
          >
            {is3D ? <IconMap2 size={18} /> : <IconBuildingSkyscraper size={18} />}
          </ActionIcon>
        </Tooltip>

        <Tooltip label={showPermits ? 'Hide permit pipeline' : 'Show permit pipeline'} position="right">
          <ActionIcon
            size="lg"
            variant={showPermits ? 'filled' : 'default'}
            color={showPermits ? 'orange' : undefined}
            onClick={togglePermits}
          >
            <IconStack2 size={18} />
          </ActionIcon>
        </Tooltip>

        <Tooltip
          label={showCoolingTowers
            ? `Hide cooling towers (${activeTowers.length})`
            : `Show cooling towers (${activeTowers.length})`}
          position="right"
        >
          <ActionIcon
            size="lg"
            variant={showCoolingTowers && activeTowers.length > 0 ? 'filled' : 'default'}
            color={showCoolingTowers && activeTowers.length > 0 ? 'grape' : undefined}
            onClick={toggleCoolingTowers}
            disabled={activeTowers.length === 0}
          >
            <IconSnowflake size={18} />
          </ActionIcon>
        </Tooltip>
      </div>

      {/* Active layer badge — permits only */}
      {showPermits && permits.length > 0 && (
        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)' }}>
          <Badge color="orange" variant="filled" size="sm">
            {permits.length} active permits
          </Badge>
        </div>
      )}
    </div>
  )
}
