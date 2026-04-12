import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Group, Text, Button, Breadcrumbs, Anchor, ThemeIcon, Loader, Modal, ActionIcon, Tooltip, Divider } from '@mantine/core'
import { IconDroplet, IconArrowLeft, IconDatabase, IconAdjustments } from '@tabler/icons-react'
import { useStore } from '../store'
import MapView from '../components/Map'
import Sidebar, { AuditDetails } from '../components/Sidebar'
import TopNav from '../components/TopNav'
import ScoreSliders from '../components/ScoreSliders'

async function fetchPermits(audit) {
  if (!audit?.socrata_endpoint) return []
  try {
    const url = `${audit.socrata_endpoint}?${audit.socrata_filter}&$limit=200`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return data
      .filter((d) => d.latitude && d.longitude)
      .map((d) => ({
        longitude: parseFloat(d.longitude),
        latitude: parseFloat(d.latitude),
        description: d.permit_type_desc || d.permit_type || 'Commercial Permit',
        address: d.address || d.location_description || '',
        sqft: d.square_feet || d.total_square_footage || null,
      }))
  } catch (err) {
    console.warn('Socrata permit fetch failed:', err)
    return []
  }
}

export default function AuditDetail() {
  const { regionId } = useParams()
  const navigate = useNavigate()

  const getAuditById = useStore((s) => s.getAuditById)
  const setBuildings = useStore((s) => s.setBuildings)
  const setBuildingsLoading = useStore((s) => s.setBuildingsLoading)
  const buildingsLoading = useStore((s) => s.buildingsLoading)
  const setPermits = useStore((s) => s.setPermits)
  const setPermitsLoading = useStore((s) => s.setPermitsLoading)
  const setSelectedBuilding = useStore((s) => s.setSelectedBuilding)
  const setActiveAuditId = useStore((s) => s.setActiveAuditId)
  const resetWeights = useStore((s) => s.resetWeights)
  const weights = useStore((s) => s.scoreWeights)

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [weightsOpen, setWeightsOpen] = useState(false)

  // Re-subscribe so component re-renders when audits change
  const audits = useStore((s) => s.audits)
  const customAudits = useStore((s) => s.customAudits)
  const audit = getAuditById(regionId)

  const isCustom = regionId?.startsWith('custom-')

  // Load buildings — from store for custom, from GeoJSON for pre-loaded
  useEffect(() => {
    if (!regionId) return
    setActiveAuditId(regionId)
    setSelectedBuilding(null)
    resetWeights()

    if (isCustom) {
      // Custom audit: features already in the store (loaded by runAudit)
      const customAudit = customAudits.find((a) => a.id === regionId)
      if (customAudit?.features) {
        setBuildings(customAudit.features)
      }
    } else {
      setBuildingsLoading(true)
      fetch(`/data/${regionId}_enriched.geojson`)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then((data) => setBuildings(data.features))
        .catch((err) => {
          console.error('Failed to load buildings:', err)
          setBuildingsLoading(false)
        })
    }
  }, [regionId, isCustom])

  // Fetch live Socrata permits (pre-loaded cities only)
  useEffect(() => {
    if (!audit || isCustom) return
    setPermitsLoading(true)
    fetchPermits(audit).then(setPermits)
  }, [audit?.id])

  const defaultCenter = { longitude: -96.797, latitude: 32.7767, zoom: 11 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, height: 60, borderBottom: '1px solid var(--mantine-color-dark-4)', background: 'var(--mantine-color-dark-8)' }}>
        <TopNav>
          {audit && (
            <>
              <Breadcrumbs mr="md">
                <Text size="sm" fw={500}>{audit?.label ?? regionId}</Text>
              </Breadcrumbs>
              <Divider orientation="vertical" mx="sm" />
              <Group gap="xs">
                <Tooltip label="Audit Details & Sources">
                  <ActionIcon variant="light" onClick={() => setDetailsOpen(true)}>
                    <IconDatabase size={18} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Score Weights">
                  <ActionIcon variant="light" onClick={() => setWeightsOpen(true)}>
                    <IconAdjustments size={18} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </>
          )}
          {buildingsLoading && <Loader size="xs" />}
        </TopNav>
      </div>

      {/* Map + Sidebar */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <MapView viewState={audit?.center ?? defaultCenter} />
        <Sidebar cityMeta={audit} />
      </div>

      <Modal opened={detailsOpen} onClose={() => setDetailsOpen(false)} title="Audit Details & Sources" size="lg">
        <AuditDetails cityMeta={audit} weights={weights} />
      </Modal>

      <Modal opened={weightsOpen} onClose={() => setWeightsOpen(false)} title="Score Weights">
        <ScoreSliders />
      </Modal>
    </div>
  )
}
