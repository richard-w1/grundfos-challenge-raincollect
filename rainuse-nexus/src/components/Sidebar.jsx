import { useState, useEffect } from 'react'
import {
  Stack, Text, Group, Badge, Paper, Progress, RingProgress,
  Divider, Accordion, ScrollArea, ThemeIcon, ActionIcon,
  Tooltip, Skeleton, Center, Anchor, List, Button, Alert,
} from '@mantine/core'
import {
  IconX, IconBuilding, IconDroplet, IconCoin,
  IconLeaf, IconChevronRight, IconStar, IconStarFilled, IconInfoCircle,
  IconMapPin, IconDatabase, IconAdjustments, IconMap2,
  IconCamera, IconBrandLinkedin, IconSearch, IconAlertCircle,
  IconExternalLink, IconPhone, IconWorld, IconSnowflake,
} from '@tabler/icons-react'
import { useStore } from '../store'
import { scoreHex, calcROI } from '../utils/viabilityScore'

// ── Shared helpers ────────────────────────────────────────────────────────────

function InfoTip({ label, width = 260 }) {
  return (
    <Tooltip label={label} withArrow multiline w={width} position="right">
      <IconInfoCircle
        size={13}
        style={{ color: 'var(--mantine-color-dimmed)', cursor: 'help', flexShrink: 0 }}
      />
    </Tooltip>
  )
}

// ── Score gauge (gradient ring, no tier label) ────────────────────────────────

function ScoreGauge({ score }) {
  const color = scoreHex(score)
  return (
    <Center>
      <RingProgress
        size={96}
        thickness={8}
        sections={[{ value: score, color }]}
        label={
          <Center>
            <Text fw={800} size="xl" style={{ color }}>{Math.round(score)}</Text>
          </Center>
        }
      />
    </Center>
  )
}

// ── Key metric cards with source tooltips ────────────────────────────────────

function MetricCard({ label, value, tip }) {
  return (
    <Paper withBorder p="xs" radius="md">
      <Group gap={4} mb={2} wrap="nowrap">
        <Text size="xs" c="dimmed" tt="uppercase" lts={0.5} fw={500}>{label}</Text>
        {tip && <InfoTip label={tip} />}
      </Group>
      <Text size="sm" fw={600}>{value}</Text>
    </Paper>
  )
}

// ── Score breakdown row with source tooltip ──────────────────────────────────

function BreakdownRow({ label, value, weight, color = 'blue', tip }) {
  return (
    <div>
      <Group justify="space-between" mb={3} wrap="nowrap">
        <Group gap={4} wrap="nowrap">
          <Text size="xs" c="dimmed">{label}</Text>
          <Text size="xs" c="dimmed">({weight}%)</Text>
          {tip && <InfoTip label={tip} width={240} />}
        </Group>
        <Text size="xs" fw={600} style={{ color, flexShrink: 0 }}>{value.toFixed(0)}</Text>
      </Group>
      <Progress value={value} color={color} size="sm" radius="xl" />
    </div>
  )
}

// ── Incentive line with full program description ──────────────────────────────

function IncentiveLine({ icon: Icon, color, title, description, sourceLabel, sourceUrl }) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Group gap="xs" mb={4} wrap="nowrap">
        <ThemeIcon size="sm" color={color} variant="light" style={{ flexShrink: 0 }}>
          <Icon size={11} />
        </ThemeIcon>
        <Text size="xs" fw={600}>{title}</Text>
      </Group>
      <Text size="xs" c="dimmed" lh={1.5} mb={4}>{description}</Text>
      <Text size="xs" c="dimmed">
        Source:{' '}
        <Anchor href={sourceUrl} target="_blank" rel="noopener noreferrer" size="xs">
          {sourceLabel}
        </Anchor>
      </Text>
    </Paper>
  )
}

// ── Centroid from GeoJSON polygon ─────────────────────────────────────────────

function computeCentroid(feature) {
  const coords = feature?.geometry?.coordinates?.[0]
  if (!coords?.length) return null
  const lon = coords.reduce((s, c) => s + c[0], 0) / coords.length
  const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length
  return { lat, lon }
}

// ── Full building detail panel ────────────────────────────────────────────────

function BuildingDetail({ building, cityMeta }) {
  const setSelected = useStore((s) => s.setSelectedBuilding)
  const savedBuildings = useStore((s) => s.savedBuildings)
  const toggleSavedBuilding = useStore((s) => s.toggleSavedBuilding)
  const weights = useStore((s) => s.scoreWeights)
  const s = building.properties
  const isSaved = savedBuildings.some((b) => b.properties.id === s.id)
  const roi = calcROI(s.area_sqft, s.annual_savings_usd, s.incentives)
  const name = s.names?.primary || null
  const center = computeCentroid(building)

  const precip = cityMeta?.avg_precip_inches ?? '—'
  const waterRate = cityMeta?.water_cost_per_kgal ?? '—'
  const state = cityMeta?.state ?? ''

  // Reverse geocode on building change for street address
  const [revGeo, setRevGeo] = useState(null)
  const [revGeoLoading, setRevGeoLoading] = useState(false)

  useEffect(() => {
    if (!center) return
    const ctrl = new AbortController()
    setRevGeo(null)
    setRevGeoLoading(true)
    fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${center.lat}&lon=${center.lon}&format=json`,
      { signal: ctrl.signal, headers: { 'User-Agent': 'RainCollect/1.0', 'Accept-Language': 'en' } },
    )
      .then((r) => r.json())
      .then((data) => {
        const a = data.address || {}
        setRevGeo({
          housenumber: a.house_number || null,
          road:        a.road || a.footway || a.pedestrian || null,
          city:        a.city || a.town || a.village || a.suburb || null,
          state:       a.state || null,
          postcode:    a.postcode || null,
        })
      })
      .catch(() => {})
      .finally(() => setRevGeoLoading(false))
    return () => ctrl.abort()
  }, [building])

  // Prefer stored OSM addr over reverse-geocode for custom audit buildings
  const addr = s.addr || revGeo
  const addrLine1 = [addr?.housenumber, addr?.road ?? addr?.street].filter(Boolean).join(' ')
  const addrLine2 = [addr?.city, addr?.state, addr?.postcode ?? addr?.postcode].filter(Boolean).join(', ')

  const mapsUrl = center
    ? `https://www.google.com/maps?q=${center.lat},${center.lon}`
    : null
  const streetViewUrl = center
    ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${center.lat},${center.lon}`
    : null
  const osmUrl = s.osm_id
    ? `https://www.openstreetmap.org/way/${s.osm_id}`
    : null

  const linkedInSearchUrl = name
    ? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`facility manager "${name}"`)}`
    : `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`facility manager ${addr?.city || cityMeta?.label || ''}`)}`

  const countySearchQuery = [name, addrLine1, addr?.city || cityMeta?.label, 'property owner assessor']
    .filter(Boolean).join(' ')

  const breakdownColor = { roof: 'blue', precip: 'cyan', cost: 'teal', esg: 'green', regulatory: 'violet' }

  return (
    <Stack gap="md">
      {/* Header */}
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Text size="xs" c="dimmed" tt="uppercase" lts={0.5} fw={500}>Building Detail</Text>
          {name
            ? <Text size="sm" fw={700} mt={2}>{name}</Text>
            : <Text size="sm" c="dimmed" mt={2}>Unnamed building</Text>
          }
          {s.operator && s.operator !== name && (
            <Text size="xs" c="dimmed">Operated by: {s.operator}</Text>
          )}
        </div>
        <Group gap="xs" style={{ flexShrink: 0 }}>
          <ActionIcon 
            variant="light" 
            color="yellow" 
            onClick={() => toggleSavedBuilding(building)}
            title="Save building"
          >
            {isSaved ? <IconStarFilled size={16} /> : <IconStar size={16} />}
          </ActionIcon>
          <ActionIcon variant="subtle" color="gray" onClick={() => setSelected(null)}>
            <IconX size={16} />
          </ActionIcon>
        </Group>
      </Group>

      <ScoreGauge score={s.viability_score} />

      {/* Location */}
      <Paper withBorder p="sm" radius="md">
        <Group gap={4} mb={6}>
          <IconMapPin size={13} style={{ color: 'var(--mantine-color-dimmed)' }} />
          <Text size="xs" c="dimmed" tt="uppercase" lts={0.5} fw={500}>Location</Text>
        </Group>

        {revGeoLoading && !addr && (
          <Stack gap={4}>
            <Skeleton height={11} width="70%" />
            <Skeleton height={11} width="50%" />
          </Stack>
        )}

        {addrLine1 && <Text size="xs" fw={600}>{addrLine1}</Text>}
        {addrLine2 && <Text size="xs" c="dimmed">{addrLine2}</Text>}

        {center && (
          <Text size="xs" c="dimmed" mt={addrLine1 ? 4 : 0}>
            {center.lat.toFixed(5)}, {center.lon.toFixed(5)}
          </Text>
        )}

        {s.phone && (
          <Group gap={4} mt={4}>
            <IconPhone size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
            <Anchor href={`tel:${s.phone}`} size="xs">{s.phone}</Anchor>
          </Group>
        )}
        {s.website && (
          <Group gap={4} mt={2}>
            <IconWorld size={11} style={{ color: 'var(--mantine-color-dimmed)' }} />
            <Anchor href={s.website.startsWith('http') ? s.website : `https://${s.website}`} target="_blank" rel="noopener noreferrer" size="xs" truncate>
              {s.website.replace(/^https?:\/\/(www\.)?/, '')}
            </Anchor>
          </Group>
        )}

        {/* Map action buttons */}
        {center && (
          <Group gap="xs" mt={8}>
            <Button
              component="a"
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              size="xs"
              leftSection={<IconMap2 size={13} />}
              variant="light"
              style={{ flex: 1 }}
            >
              Google Maps
            </Button>
            <Tooltip label="Street View" withArrow>
              <Button
                component="a"
                href={streetViewUrl}
                target="_blank"
                rel="noopener noreferrer"
                size="xs"
                variant="subtle"
                px={8}
              >
                <IconCamera size={14} />
              </Button>
            </Tooltip>
            {osmUrl && (
              <Tooltip label="OpenStreetMap" withArrow>
                <Button
                  component="a"
                  href={osmUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="xs"
                  variant="subtle"
                  px={8}
                >
                  <IconExternalLink size={14} />
                </Button>
              </Tooltip>
            )}
          </Group>
        )}
      </Paper>

      {/* Physical attributes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <MetricCard
          label="Roof Area"
          value={`${(s.area_sqft / 1000).toFixed(0)}k sqft`}
          tip="Footprint polygon area from OpenStreetMap (Overpass API) or Overture Maps. Calculated using the Shoelace formula with geodetic latitude correction."
        />
        <MetricCard
          label="Annual Yield"
          value={`${(s.annual_gallons / 1000).toFixed(0)}k gal`}
          tip={`Harvestable rainwater. Formula: Roof Area × ${precip}" avg rainfall/yr × 0.623 gal/sqft/inch (≈90% collection efficiency). Rainfall: Open-Meteo 5-year historical archive.`}
        />
        <MetricCard
          label="Annual Savings"
          value={`$${s.annual_savings_usd?.toLocaleString()}`}
          tip={`Potential utility savings. Annual Yield (kgal) × $${waterRate}/kgal local water rate. Rate source: EPA WaterSense utility survey for ${state || 'this state'}.`}
        />
        <MetricCard
          label="Building Type"
          value={s.class || 'Unknown'}
          tip="Derived from OpenStreetMap tags (building=*, amenity=*, landuse=*). Used to estimate occupant water demand intensity per ASHRAE 189.1."
        />
        {s.num_floors && (
          <MetricCard
            label="Floors"
            value={`${s.num_floors} fl`}
            tip="Number of above-ground floors from OpenStreetMap building:levels tag."
          />
        )}
        {s.height && (
          <MetricCard
            label="Height"
            value={`${Math.round(s.height)}m`}
            tip="Building height in meters from OpenStreetMap height tag."
          />
        )}
      </div>

      {/* Score breakdown */}
      <div>
        <Group gap={4} mb="sm">
          <Text size="xs" c="dimmed" tt="uppercase" lts={0.5} fw={500}>Score Breakdown</Text>
          <InfoTip
            label="Each component is normalized 0–100 then multiplied by its weight. Adjust weights in the Score Weights panel."
            width={240}
          />
        </Group>
        <Stack gap="xs">
          {s.score_breakdown && [
            {
              key: 'roof', label: 'Roof Area', color: breakdownColor.roof,
              tip: `Log-normalized footprint. ~50 pts at 100k sqft, 100 pts at 1M+ sqft. Source: OSM/Overpass API.`,
            },
            {
              key: 'precip', label: 'Precipitation', color: breakdownColor.precip,
              tip: `Normalized across US range (8–62 in/yr). ${precip}" recorded here. Source: Open-Meteo 5-year historical archive.`,
            },
            {
              key: 'cost', label: 'Water Cost', color: breakdownColor.cost,
              tip: `Normalized $3–$9/kgal. $${waterRate}/kgal here. Source: EPA WaterSense utility data.`,
            },
            {
              key: 'esg', label: 'Water Demand', color: breakdownColor.esg,
              tip: 'Building-type water intensity index (hospital=85, hotel=75, office=55, warehouse=35). Based on ASHRAE 189.1 benchmarks.',
            },
            {
              key: 'regulatory', label: 'Incentives', color: breakdownColor.regulatory,
              tip: 'Presence of state tax credits, stormwater fee reduction programs, and direct installation rebates. Source: DSIRE / EPA WaterSense.',
            },
          ].map(({ key, label, color, tip }) => (
            <BreakdownRow
              key={key}
              label={label}
              value={s.score_breakdown[key]}
              weight={weights[key]}
              color={color}
              tip={tip}
            />
          ))}
        </Stack>
      </div>

      {/* ROI */}
      <Paper withBorder p="sm" radius="md">
        <Group gap={4} mb="sm">
          <Text size="xs" c="dimmed" tt="uppercase" lts={0.5} fw={500}>ROI Estimate</Text>
          <InfoTip
            label="System cost: ~$0.08/sqft catchment area (Grundfos mid-tier system: tank, pump, filtration, controls). NPV discounted at 5%/yr."
            width={260}
          />
        </Group>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            ['System Cost', `$${(roi.systemCost / 1000).toFixed(0)}k`],
            ['Rebates', `-$${(roi.totalIncentives / 1000).toFixed(0)}k`],
            ['Net Cost', `$${(roi.netCost / 1000).toFixed(0)}k`],
            ['Payback', roi.paybackYears ? `${roi.paybackYears} yrs` : '—'],
            ['10yr NPV', `$${(roi.npv10yr / 1000).toFixed(0)}k`],
            ['Break-even', roi.breakEvenYear ? `Yr ${roi.breakEvenYear}` : '—'],
          ].map(([label, value]) => (
            <Group key={label} justify="space-between">
              <Text size="xs" c="dimmed">{label}</Text>
              <Text size="xs" fw={600}>{value}</Text>
            </Group>
          ))}
        </div>
      </Paper>

      {/* Incentives */}
      {s.incentives && (s.incentives.tax_credit || s.incentives.tax_credit_notes || s.incentives.stormwater_fee || s.incentives.rebate_usd > 0) && (
        <Stack gap="xs">
          <Text size="xs" c="dimmed" tt="uppercase" lts={0.5} fw={500}>Applicable Incentives</Text>
          {(s.incentives.tax_credit || s.incentives.tax_credit_notes) && (
            <IncentiveLine
              icon={IconLeaf}
              color="green"
              title={`${state} Tax Incentive`}
              description={s.incentives.tax_credit_notes || 'State tax credit or deduction for qualifying rainwater harvesting system installation.'}
              sourceLabel={s.incentives.legal_link ? 'View statute ↗' : 'DSIRE — dsireusa.org'}
              sourceUrl={s.incentives.legal_link || 'https://www.dsireusa.org'}
            />
          )}
          {s.incentives.stormwater_fee && (
            <IncentiveLine
              icon={IconDroplet}
              color="blue"
              title={s.incentives.stormwater_fee_per_sqft_yr > 0
                ? `Stormwater Fee Reduction — $${s.incentives.stormwater_fee_per_sqft_yr}/sqft/yr`
                : 'Stormwater Utility Fee Reduction'}
              description={s.incentives.stormwater_notes || 'On-site retention qualifies for municipal stormwater fee credits on billable impervious area. Annual recurring savings.'}
              sourceLabel={s.incentives.legal_link ? 'Program details ↗' : 'EPA Green Infrastructure'}
              sourceUrl={s.incentives.legal_link || 'https://www.epa.gov/green-infrastructure'}
            />
          )}
          {s.incentives.rebate_usd > 0 && (
            <IncentiveLine
              icon={IconCoin}
              color="yellow"
              title={`$${s.incentives.rebate_usd.toLocaleString()} Installation Rebate`}
              description={s.incentives.rebate_notes || 'Direct rebate from state or local water authority for installing a qualifying rainwater harvesting system.'}
              sourceLabel={s.incentives.legal_link ? 'Apply ↗' : 'WaterSense Rebate Finder'}
              sourceUrl={s.incentives.legal_link || 'https://www.epa.gov/watersense/watersense-rebate-finder'}
            />
          )}
        </Stack>
      )}

      {/* Research & Outreach */}
      <Accordion variant="separated">
        <Accordion.Item value="research">
          <Accordion.Control icon={<IconSearch size={14} />}>
            <Text size="sm" fw={500}>Research & Outreach</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Text size="xs" c="dimmed">Find the decision-maker for this property.</Text>

              <Button
                component="a"
                href={linkedInSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                size="xs"
                leftSection={<IconBrandLinkedin size={14} />}
                variant="light"
                color="blue"
                fullWidth
              >
                Search LinkedIn — Facility Manager
              </Button>

              <Button
                component="a"
                href={`https://www.google.com/search?q=${encodeURIComponent(countySearchQuery)}`}
                target="_blank"
                rel="noopener noreferrer"
                size="xs"
                leftSection={<IconSearch size={14} />}
                variant="subtle"
                fullWidth
              >
                Search County Assessor Records
              </Button>

              <Button
                component="a"
                href={`https://app.regrid.com/us?lat=${center?.lat}&lon=${center?.lon}&zoom=18`}
                target="_blank"
                rel="noopener noreferrer"
                size="xs"
                leftSection={<IconExternalLink size={14} />}
                variant="subtle"
                fullWidth
              >
                Regrid Property Lookup
              </Button>

              <Alert
                color="yellow"
                variant="light"
                icon={<IconAlertCircle size={14} />}
                title="Owner vs. Occupant"
              >
                <Text size="xs" lh={1.5}>
                  The visible occupant may not own this building. Commercial
                  properties are frequently held by REITs, private equity, or
                  LLCs. Use county assessor records (or{' '}
                  <Anchor href="https://regrid.com" target="_blank" size="xs">Regrid</Anchor>
                  ) to find the property owner, then{' '}
                  <Anchor href="https://opencorporates.com" target="_blank" size="xs">OpenCorporates</Anchor>
                  {' '}to trace any holding company. Target the <strong>property
                  manager</strong> or <strong>facilities director</strong> as
                  the practical decision-maker.
                </Text>
              </Alert>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  )
}

// ── Prospect list (gradient, no tier label) ──────────────────────────────────

function ProspectList({ buildings }) {
  const setSelected = useStore((s) => s.setSelectedBuilding)
  const setMapFocus = useStore((s) => s.setMapFocus)
  const top = [...buildings]
    .sort((a, b) => b.properties.viability_score - a.properties.viability_score)

  if (!buildings.length) {
    return (
      <Stack gap="xs">
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={60} radius="md" />)}
      </Stack>
    )
  }

  return (
    <Stack gap="xs">
      {top.map((b, i) => {
        const bp = b.properties
        const color = scoreHex(bp.viability_score)
        const name = bp.names?.primary
        return (
          <Paper
            key={bp.id || i}
            withBorder
            p="xs"
            radius="md"
            style={{ cursor: 'pointer' }}
            onClick={() => {
              setSelected(b)
              const center = computeCentroid(b)
              if (center) {
                setMapFocus({ longitude: center.lon, latitude: center.lat, timestamp: Date.now() })
              }
            }}
          >
            <Group justify="space-between" wrap="nowrap">
              <div style={{ minWidth: 0 }}>
                <Group gap={6} mb={2}>
                  <Text size="xs" c="dimmed" fw={500}>#{i + 1}</Text>
                  {name
                    ? <Text size="xs" fw={600} truncate="end">{name}</Text>
                    : <Text size="xs" fw={600} c="dimmed">{(bp.area_sqft / 1000).toFixed(0)}k sqft</Text>
                  }
                </Group>
                <Text size="xs" c="dimmed">
                  {(bp.area_sqft / 1000).toFixed(0)}k sqft
                  {bp.annual_savings_usd > 0 && ` · $${bp.annual_savings_usd.toLocaleString()}/yr est.`}
                </Text>
              </div>
              <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
                <Text size="lg" fw={800} style={{ color }}>{Math.round(bp.viability_score)}</Text>
                <ActionIcon variant="subtle" color="gray" size="xs">
                  <IconChevronRight size={12} />
                </ActionIcon>
              </Group>
            </Group>
          </Paper>
        )
      })}
    </Stack>
  )
}

// ── Audit details section ────────────────────────────────────────────────────

export function AuditDetails({ cityMeta, weights }) {
  if (!cityMeta) return null

  const auditDate = new Date(cityMeta.auditedAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  const weightLabels = {
    roof: 'Roof Area', precip: 'Precipitation', cost: 'Water Cost',
    esg: 'Water Demand', regulatory: 'Incentives',
  }

  return (
    <Stack gap="md">
      {/* Audit parameters */}
      <div>
        <Text size="xs" c="dimmed" tt="uppercase" lts={0.5} fw={600} mb="xs">Filter Criteria</Text>
        <List size="xs" spacing={4}>
          <List.Item>
            <Text span c="dimmed">Audited: </Text>
            <Text span fw={500}>{auditDate}</Text>
          </List.Item>
          <List.Item>
            <Text span c="dimmed">Min roof area: </Text>
            <Text span fw={500}>{((cityMeta.minRoofSqft ?? 100000) / 1000).toFixed(0)}k sqft</Text>
          </List.Item>
          <List.Item>
            <Text span c="dimmed">Building types: </Text>
            <Text span fw={500}>{cityMeta.buildingTypes?.join(', ') || 'All'}</Text>
          </List.Item>
          <List.Item>
            <Text span c="dimmed">Min floors: </Text>
            <Text span fw={500}>{cityMeta.minFloors ?? 'Any'}</Text>
          </List.Item>
        </List>
      </div>

      <Divider />

      {/* Regional inputs */}
      <div>
        <Text size="xs" c="dimmed" tt="uppercase" lts={0.5} fw={600} mb="xs">Regional Inputs</Text>
        <List size="xs" spacing={4}>
          <List.Item>
            <Text span c="dimmed">Avg. precipitation: </Text>
            <Text span fw={500}>{cityMeta.avg_precip_inches}&quot;/yr</Text>
            <Text span c="dimmed"> — <Anchor href="https://open-meteo.com" target="_blank" rel="noopener noreferrer" size="xs">Open-Meteo</Anchor> 5-yr historical avg</Text>
          </List.Item>
          <List.Item>
            {cityMeta.sewer_cost_per_kgal > 0 ? (
              <>
                <Text span c="dimmed">True water cost: </Text>
                <Text span fw={500}>${cityMeta.total_water_cost_per_kgal?.toFixed(2)}/kgal</Text>
                <Text span c="dimmed"> (${cityMeta.water_cost_per_kgal} intake + ${cityMeta.sewer_cost_per_kgal} sewer){' '}</Text>
                {cityMeta.data_sources?.utility_rates && (
                  <Anchor href={cityMeta.data_sources.utility_rates} target="_blank" rel="noopener noreferrer" size="xs">
                    source ↗
                  </Anchor>
                )}
              </>
            ) : (
              <>
                <Text span c="dimmed">Water rate: </Text>
                <Text span fw={500}>${cityMeta.water_cost_per_kgal}/kgal</Text>
                {cityMeta.data_sources?.utility_rates && (
                  <> <Anchor href={cityMeta.data_sources.utility_rates} target="_blank" rel="noopener noreferrer" size="xs">source ↗</Anchor></>
                )}
              </>
            )}
          </List.Item>
          {cityMeta.stormwater_fee_per_sqft_yr > 0 && (
            <List.Item>
              <Text span c="dimmed">Stormwater fee: </Text>
              <Text span fw={500}>${cityMeta.stormwater_fee_per_sqft_yr}/sqft/yr</Text>
              <Text span c="dimmed"> (commercial impervious area)</Text>
            </List.Item>
          )}
          {cityMeta.water_stress_score != null ? (
            <List.Item>
              <Text span c="dimmed">Water stress: </Text>
              <Text span fw={500}>{cityMeta.water_stress_score}/5 — {cityMeta.water_stress}</Text>
              <Text span c="dimmed"> — <Anchor href="https://www.wri.org/data/aqueduct-global-maps-30-data" target="_blank" rel="noopener noreferrer" size="xs">WRI Aqueduct</Anchor></Text>
            </List.Item>
          ) : cityMeta.water_stress ? (
            <List.Item>
              <Text span c="dimmed">Water stress: </Text>
              <Text span fw={500}>{cityMeta.water_stress}</Text>
              <Text span c="dimmed"> — WRI Aqueduct</Text>
            </List.Item>
          ) : null}
          {cityMeta.esg_climate?.sec_10k_risk && (
            <List.Item>
              <Text span c="dimmed">SEC 10-K risk: </Text>
              <Text span fw={500}>{cityMeta.esg_climate.sec_10k_risk}</Text>
            </List.Item>
          )}
        </List>
      </div>

      <Divider />

      {/* Data sources */}
      <div>
        <Text size="xs" c="dimmed" tt="uppercase" lts={0.5} fw={600} mb="xs">Data Sources</Text>
        <List size="xs" spacing={4}>
          <List.Item>
            <Text span fw={500}>Building footprints </Text>
            <Text span c="dimmed">— <Anchor href="https://overpass-api.de" target="_blank" rel="noopener noreferrer" size="xs">OpenStreetMap / Overpass API</Anchor></Text>
          </List.Item>
          <List.Item>
            <Text span fw={500}>Precipitation </Text>
            <Text span c="dimmed">— <Anchor href="https://open-meteo.com" target="_blank" rel="noopener noreferrer" size="xs">Open-Meteo</Anchor> archive 2019–2023</Text>
          </List.Item>
          {/* City-specific sources from payload — shown when available */}
          {cityMeta.data_sources && Object.entries(cityMeta.data_sources).map(([key, url]) => (
            <List.Item key={key}>
              <Text span fw={500}>{key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} </Text>
              <Text span c="dimmed">— <Anchor href={url} target="_blank" rel="noopener noreferrer" size="xs">{url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]} ↗</Anchor></Text>
            </List.Item>
          ))}
          {/* Fallback generic sources when no city-specific data */}
          {!cityMeta.data_sources && (
            <>
              <List.Item>
                <Text span fw={500}>Water rates </Text>
                <Text span c="dimmed">— <Anchor href="https://www.epa.gov/watersense" target="_blank" rel="noopener noreferrer" size="xs">EPA WaterSense</Anchor> / state utility data</Text>
              </List.Item>
              <List.Item>
                <Text span fw={500}>Incentives </Text>
                <Text span c="dimmed">— <Anchor href="https://www.dsireusa.org" target="_blank" rel="noopener noreferrer" size="xs">DSIRE</Anchor></Text>
              </List.Item>
            </>
          )}
          <List.Item>
            <Text span fw={500}>Building demand index </Text>
            <Text span c="dimmed">— ASHRAE 189.1</Text>
          </List.Item>
        </List>
      </div>

      <Divider />

      {/* Score weights in use */}
      <div>
        <Text size="xs" c="dimmed" tt="uppercase" lts={0.5} fw={600} mb="xs">Score Weights in Use</Text>
        <Stack gap={4}>
          {Object.entries(weights).map(([key, val]) => (
            <Group key={key} justify="space-between">
              <Text size="xs" c="dimmed">{weightLabels[key]}</Text>
              <Badge size="xs" variant="light">{val}%</Badge>
            </Group>
          ))}
        </Stack>
      </div>
    </Stack>
  )
}

// ── Root sidebar ──────────────────────────────────────────────────────────────

export default function Sidebar({ cityMeta }) {
  const buildings = useStore((s) => s.buildings)
  const selectedBuilding = useStore((s) => s.selectedBuilding)

  return (
    <Stack gap={0} style={{ width: 320, borderLeft: '1px solid var(--mantine-color-dark-4)', height: '100%', overflow: 'hidden' }}>
      <ScrollArea style={{ flex: 1 }} p="md">
        <Stack gap="md">
          {selectedBuilding ? (
            <BuildingDetail building={selectedBuilding} cityMeta={cityMeta} />
          ) : (
            <ProspectList buildings={buildings} />
          )}
        </Stack>
      </ScrollArea>
    </Stack>
  )
}
