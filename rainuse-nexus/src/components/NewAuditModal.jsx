import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Modal, Stack, Text, Group, Button, Divider, Slider, NumberInput,
  MultiSelect, TextInput, Stepper, Alert, Progress, Badge, Tooltip,
  ThemeIcon, SimpleGrid, Paper, Accordion, Switch,
} from '@mantine/core'
import {
  IconMapPin, IconBuilding, IconAlertCircle, IconCheck,
  IconInfoCircle, IconDroplet, IconLeaf, IconFlame, IconAdjustments,
  IconSnowflake,
} from '@tabler/icons-react'
import { useStore } from '../store'
import { runAudit, checkTowerServer } from '../utils/audit'
import WeightSliders, { DEFAULT_WEIGHTS, normalizeWeights } from './WeightSliders'

const BUILDING_TYPE_OPTIONS = [
  { value: 'hospital',   label: 'Hospital / Clinic' },
  { value: 'hotel',      label: 'Hotel / Hospitality' },
  { value: 'education',  label: 'Education' },
  { value: 'office',     label: 'Office' },
  { value: 'commercial', label: 'Commercial / Mixed' },
  { value: 'government', label: 'Government / Civic' },
  { value: 'retail',     label: 'Retail' },
  { value: 'industrial', label: 'Industrial / Factory' },
  { value: 'warehouse',  label: 'Warehouse / Logistics' },
]

const GRUNDFOS_CRITERIA = [
  {
    icon: IconFlame, color: 'red',
    title: 'Water Demand Intensity',
    body: 'Hospitals and hotels use 6–40× more water per m² than warehouses. Higher demand = larger Grundfos system, better ROI.',
  },
  {
    icon: IconDroplet, color: 'blue',
    title: 'Local Water Stress',
    body: 'Buildings in water-scarce regions (AZ, NV, NM, UT) face supply risk and higher future costs.',
  },
  {
    icon: IconLeaf, color: 'green',
    title: 'ESG & Regulatory Pressure',
    body: 'States with stormwater fees directly reduce the payback period on any Grundfos system.',
  },
  {
    icon: IconBuilding, color: 'violet',
    title: 'Cooling Tower Presence',
    body: 'Buildings with cooling towers are a direct Grundfos product target and score 1.3× higher.',
  },
]

function CriteriaCard({ icon: Icon, color, title, body }) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Group gap="xs" mb={6} wrap="nowrap">
        <ThemeIcon size="sm" color={color} variant="light" style={{ flexShrink: 0 }}>
          <Icon size={12} />
        </ThemeIcon>
        <Text size="xs" fw={600}>{title}</Text>
      </Group>
      <Text size="xs" c="dimmed" lh={1.5}>{body}</Text>
    </Paper>
  )
}

function ProgressView({ progress, error }) {
  if (error) {
    return (
      <Alert icon={<IconAlertCircle size={16} />} color="red" title="Audit failed">
        {error}
      </Alert>
    )
  }
  if (!progress) return null
  const pct = Math.round((progress.step / progress.total) * 100)
  const withTower = progress.towerServerAvailable
  return (
    <Stack gap="md">
      <Progress value={pct} animated size="lg" radius="xl" />
      <Group justify="space-between">
        <Text size="sm" c="dimmed">{progress.message}</Text>
        <Text size="sm" fw={600} c="blue">Step {progress.step}/{progress.total}</Text>
      </Group>
      <Stepper active={progress.step - 1} size="xs" orientation="vertical">
        <Stepper.Step label="Geocode location" />
        <Stepper.Step label="Fetch precipitation (Open-Meteo)" />
        <Stepper.Step label="Download buildings (OpenStreetMap)" />
        <Stepper.Step label="Process & score buildings" />
        {withTower
          ? <Stepper.Step label="Cooling tower detection (TowerScout)" icon={<IconSnowflake size={14} />} />
          : <Stepper.Step label="Complete" />
        }
        {withTower && <Stepper.Step label="Complete" />}
      </Stepper>
    </Stack>
  )
}

export default function NewAuditModal({ opened, onClose }) {
  const navigate = useNavigate()
  const addCustomAudit              = useStore((s) => s.addCustomAudit)
  const setAuditWeights             = useStore((s) => s.setAuditWeights)
  const auditProgress               = useStore((s) => s.auditProgress)
  const setAuditProgress            = useStore((s) => s.setAuditProgress)
  const clearAuditProgress          = useStore((s) => s.clearAuditProgress)
  const towerConfidenceThreshold    = useStore((s) => s.towerConfidenceThreshold)
  const setTowerConfidenceThreshold = useStore((s) => s.setTowerConfidenceThreshold)
  const detectCoolingTowers         = useStore((s) => s.detectCoolingTowers)
  const setDetectCoolingTowers      = useStore((s) => s.setDetectCoolingTowers)

  const [query, setQuery] = useState('')
  const [minRoofK, setMinRoofK] = useState(100)
  const [buildingTypes, setBuildingTypes] = useState([])
  const [minFloors, setMinFloors] = useState(null)
  const [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS })
  const [googleMapsKey, setGoogleMapsKey] = useState('')
  const [towerServerUp, setTowerServerUp] = useState(null) // null = checking
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const [resultId, setResultId] = useState(null)

  const weightTotal = Object.values(weights).reduce((a, b) => a + b, 0)

  // Non-blocking server probe on mount and whenever the modal opens
  useEffect(() => {
    if (!opened) return
    setTowerServerUp(null)
    checkTowerServer().then(setTowerServerUp)
  }, [opened])

  const handleClose = () => {
    if (running) return
    clearAuditProgress()
    setError(null)
    setDone(false)
    setResultId(null)
    onClose()
  }

  const handleStart = async () => {
    if (!query.trim()) return
    const finalWeights = weightTotal !== 100 ? normalizeWeights(weights) : weights
    setRunning(true)
    setError(null)
    setDone(false)

    try {
      const result = await runAudit({
        query: query.trim(),
        minRoofSqft: minRoofK * 1000,
        buildingTypes,
        minFloors: minFloors || null,
        weights: finalWeights,
        detectCoolingTowersEnabled: detectCoolingTowers,
        googleMapsKey: googleMapsKey.trim() || undefined,
        onProgress: (p) => setAuditProgress(p),
      })

      const id = `custom-${Date.now()}`
      const { meta } = result

      const audit = {
        id,
        label: meta.location.displayName,
        state: meta.location.stateCode || '—',
        center: { longitude: meta.location.lon, latitude: meta.location.lat, zoom: 12 },
        auditedAt: new Date().toISOString(),
        minRoofSqft: minRoofK * 1000,
        building_count: result.features.length,
        avg_precip_inches: meta.avgPrecip,
        water_cost_per_kgal: meta.waterCost,
        sewer_cost_per_kgal: meta.sewerCost,
        total_water_cost_per_kgal: meta.totalWaterCost,
        gallons_per_sqft_per_year: meta.gallonsPerSqftPerYear,
        stormwater_fee_per_sqft_yr: meta.stormwaterFeePerSqftYr,
        incentives: meta.incentives,
        water_stress: meta.waterStress,
        water_stress_score: meta.waterStressScore,
        esg_climate: meta.esgClimate,
        data_sources: meta.dataSources,
        bbox: meta.location.bbox,
        source: 'custom',
        features: result.features,
        initialWeights: finalWeights,
        tower_detections: result.towers || [],
        tower_server_used: meta.towerServerUsed,
      }

      addCustomAudit(audit)
      setAuditWeights(id, finalWeights)
      setResultId(id)
      setDone(true)
    } catch (err) {
      setError(err.message || 'Audit failed. Check the city name and try again.')
    } finally {
      setRunning(false)
    }
  }

  const handleView = () => {
    handleClose()
    navigate(`/audit/${resultId}`)
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={<Text fw={600} size="lg">New Audit</Text>}
      size="lg"
      centered
      closeOnClickOutside={!running}
      closeOnEscape={!running}
    >
      <Stack gap="md">


        {(running || error) && !done && (
          <ProgressView progress={auditProgress} error={error} />
        )}

        {!running && !done && (
          <>
            {/* TowerScout server status */}
            {towerServerUp === null && (
              <Alert color="gray" icon={<IconSnowflake size={14} />}>
                <Text size="xs">Checking for TowerScout server...</Text>
              </Alert>
            )}
            {towerServerUp === false && (
              <Alert color="orange" icon={<IconSnowflake size={14} />} title="TowerScout offline">
                <Stack gap={4}>
                  <Text size="xs">
                    Start the local server to enable cooling tower detection:
                  </Text>
                  <Text size="xs" ff="monospace" c="orange.9">
                    python tower_server.py --yolo-weights yolov5_best.pt --en-weights b5_unweighted_best.pt --api-key YOUR_KEY
                  </Text>
                  <Text size="xs" c="dimmed">
                    The audit will run normally without it — you can add tower data later by re-running the export script.
                  </Text>
                </Stack>
              </Alert>
            )}

            <TextInput
              label="City or Region"
              placeholder="e.g. Houston, TX  or  Chicago, IL  or  Denver, CO"
              leftSection={<IconMapPin size={14} />}
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              description="Any US city, town, or neighborhood — geocoded via OpenStreetMap"
            />

            <div>
              <Group justify="space-between" mb={4}>
                <Text size="sm" fw={500}>Minimum Roof Area</Text>
              </Group>
              <Slider
                min={10} max={500} step={10}
                value={minRoofK}
                onChange={setMinRoofK}
                marks={[
                  { value: 50, label: '50k' },
                  { value: 100, label: '100k' },
                  { value: 250, label: '250k' },
                  { value: 500, label: '500k' },
                ]}
                mb="sm"
              />
              <Text size="xs" c="dimmed">
                Grundfos systems are typically cost-effective at 100k+ sqft.
              </Text>
            </div>

            <MultiSelect
              label={
                <Group gap={4}>
                  <Text size="sm" fw={500}>Building Types</Text>
                  <Tooltip label="Filter to specific types. Leave empty to include all." withArrow>
                    <IconInfoCircle size={14} style={{ color: 'var(--mantine-color-dimmed)', cursor: 'help' }} />
                  </Tooltip>
                </Group>
              }
              placeholder="All types (recommended for broad discovery)"
              data={BUILDING_TYPE_OPTIONS}
              value={buildingTypes}
              onChange={setBuildingTypes}
              clearable
              searchable
            />

            <NumberInput
              label={
                <Group gap={4}>
                  <Text size="sm" fw={500}>Minimum Floors</Text>
                  <Tooltip label="Multi-story buildings have higher occupant water demand." withArrow>
                    <IconInfoCircle size={14} style={{ color: 'var(--mantine-color-dimmed)', cursor: 'help' }} />
                  </Tooltip>
                </Group>
              }
              placeholder="No minimum (include all)"
              min={1} max={100}
              value={minFloors ?? ''}
              onChange={(v) => setMinFloors(v || null)}
              description="Filter to buildings with OSM floor count data ≥ this value"
            />

            <Accordion variant="separated">
              <Accordion.Item value="advanced">
                <Accordion.Control icon={<IconAdjustments size={16} />}>
                  <Group gap="xs">
                    <Text size="sm" fw={500}>Advanced — Score Heuristics</Text>
                    {weightTotal !== 100 && (
                      <Badge size="xs" color="yellow" variant="light">
                        {weightTotal}% — will auto-normalize on run
                      </Badge>
                    )}
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="sm">
                    <Switch
                      label="Detect cooling towers during audit"
                      description="Requires tower_server.py running locally with YOLOv5 + EfficientNet weights and a Google Maps API key"
                      checked={detectCoolingTowers}
                      onChange={(e) => setDetectCoolingTowers(e.currentTarget.checked)}
                      color="grape"
                    />
                    <div>
                      <Group justify="space-between" mb={4}>
                        <Group gap={4}>
                          <Text size="sm" fw={500} c={detectCoolingTowers ? undefined : 'dimmed'}>
                            Cooling Tower Confidence Threshold
                          </Text>
                          <Tooltip label="Only buildings where TowerScout confidence meets this threshold are counted as having a cooling tower and receive the score boost." withArrow>
                            <IconInfoCircle size={13} style={{ color: 'var(--mantine-color-dimmed)', cursor: 'help' }} />
                          </Tooltip>
                        </Group>
                        <Badge size="xs" color="grape" variant="light">
                          {towerConfidenceThreshold.toFixed(2)}
                        </Badge>
                      </Group>
                      <Slider
                        min={0.4} max={0.99} step={0.01}
                        value={towerConfidenceThreshold}
                        onChange={setTowerConfidenceThreshold}
                        color="grape"
                        disabled={!detectCoolingTowers}
                        marks={[
                          { value: 0.55, label: '0.55' },
                          { value: 0.7, label: '0.70' },
                          { value: 0.8, label: '0.80' },
                          { value: 0.9, label: '0.90' },
                        ]}
                        mb="xs"
                      />
                    </div>
                    <WeightSliders weights={weights} onChange={setWeights} />
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="criteria">
                <Accordion.Control icon={<IconInfoCircle size={16} />}>
                  <Text size="sm" fw={500}>Why these criteria matter to Grundfos</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <SimpleGrid cols={2} spacing="xs">
                    {GRUNDFOS_CRITERIA.map((c) => (
                      <CriteriaCard key={c.title} {...c} />
                    ))}
                  </SimpleGrid>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </>
        )}

        <Divider />

        <Group justify="flex-end">
          <Button variant="subtle" onClick={handleClose} disabled={running}>
            {done ? 'Close' : 'Cancel'}
          </Button>
          {!done && (
            <Button
              leftSection={<IconBuilding size={14} />}
              onClick={handleStart}
              loading={running}
              disabled={!query.trim()}
            >
              {running ? 'Auditing...' : 'Run Audit'}
            </Button>
          )}
          {done && (
            <Button leftSection={<IconCheck size={14} />} color="green" onClick={handleView}>
              Open Audit
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  )
}
