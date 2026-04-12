import { Fragment, useMemo, useState } from 'react'
import {
  AppShell, Stack, Text, Group, Table, ActionIcon, Paper, Center,
  Divider, Box, Grid, Progress, Button, Anchor, Alert,
} from '@mantine/core'
import {
  IconStarFilled, IconTrash, IconChevronDown, IconChevronUp,
  IconMapPin, IconMap2, IconCamera, IconExternalLink, IconBrandLinkedin,
  IconSearch, IconAlertCircle, IconDroplet, IconCoin, IconLeaf, IconSnowflake,
  IconBuilding, IconWorld, IconPhone, IconCloudRain, IconScale, IconDatabase,
} from '@tabler/icons-react'
import TopNav from '../components/TopNav'
import PermitExpandedDetail from '../components/PermitExpandedDetail'
import { useStore } from '../store'
import { calcROI, scoreHex } from '../utils/viabilityScore'

// ── Centroid helper ────────────────────────────────────────────────────────────

function computeCentroid(feature) {
  const coords = feature?.geometry?.coordinates?.[0]
  if (!coords?.length) return null
  const lon = coords.reduce((s, c) => s + c[0], 0) / coords.length
  const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
  return { lat, lon }
}

// ── Score bar ──────────────────────────────────────────────────────────────────

const BREAKDOWN_COLORS = { roof: 'blue', precip: 'cyan', cost: 'teal', esg: 'green', regulatory: 'violet' }
const BREAKDOWN_LABELS = { roof: 'Roof Area', precip: 'Precipitation', cost: 'Water Cost', esg: 'Water Demand', regulatory: 'Incentives' }

function ScoreBar({ label, value, color }) {
  const n = typeof value === 'number' ? value : Number(value)
  const clamped = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null
  return (
    <Box>
      <Group justify="space-between" mb={3}>
        <Text size="xs" c="dimmed">{label}</Text>
        <Text size="xs" fw={600}>{clamped != null ? clamped.toFixed(0) : '—'}</Text>
      </Group>
      <Progress value={clamped ?? 0} color={color} size="sm" radius="xl" />
    </Box>
  )
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ icon, label }) {
  const Svg = icon
  return (
    <Group gap={6} mb="sm">
      <Svg size={14} color="var(--mantine-color-dimmed)" />
      <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.06em' }}>{label}</Text>
    </Group>
  )
}

function Field({ label, value }) {
  return (
    <Box>
      <Text size="xs" c="dimmed" mb={2}>{label}</Text>
      <Text component="div" size="sm" fw={500}>{value ?? <Text span c="dimmed">—</Text>}</Text>
    </Box>
  )
}

// ── Full building expanded detail ──────────────────────────────────────────────

function BuildingExpandedDetail({ building }) {
  const auditsList = useStore((st) => st.audits)
  const customAuditsList = useStore((st) => st.customAudits)
  const audits = useMemo(
    () => [...auditsList, ...customAuditsList],
    [auditsList, customAuditsList],
  )

  const s = building?.properties
  if (!s) return null

  const center = computeCentroid(building)
  const roi = calcROI(s.area_sqft, s.annual_savings_usd, s.incentives)
  const scoreColor = scoreHex(s.viability_score ?? 0)

  const cityMeta = audits.find((a) => a.label === s.city) ?? null

  const addr = s.addr
  const addrLine1 = [addr?.housenumber, addr?.road ?? addr?.street].filter(Boolean).join(' ')
  const addrLine2 = [addr?.city, addr?.state, addr?.postcode].filter(Boolean).join(', ')
  const displayName = s.names?.primary

  // Derived values
  const yieldPerSqft = s.area_sqft > 0 ? (s.annual_gallons / s.area_sqft).toFixed(2) : null

  const mapsUrl = center ? `https://www.google.com/maps?q=${center.lat},${center.lon}` : null
  const streetViewUrl = center
    ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${center.lat},${center.lon}`
    : null
  const osmUrl = s.osm_id ? `https://www.openstreetmap.org/way/${s.osm_id}` : null
  const linkedInQuery = displayName
    ? `facility manager "${displayName}"`
    : `facility manager ${addrLine2 || ''}`
  const linkedInUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(linkedInQuery)}`
  const countyQuery = [displayName, addrLine1, addrLine2, 'property owner assessor'].filter(Boolean).join(' ')
  const regridUrl = center
    ? `https://app.regrid.com/us?lat=${center.lat}&lon=${center.lon}&zoom=18`
    : 'https://app.regrid.com'

  const hasIncentives = s.incentives && (
    s.incentives.tax_credit || s.incentives.tax_credit_notes ||
    s.incentives.stormwater_fee || s.incentives.rebate_usd > 0
  )

  return (
    <Box
      px="xl"
      py="md"
      style={{
        background: 'var(--mantine-color-dark-7)',
        borderTop: '1px solid var(--mantine-color-dark-5)',
        borderBottom: '1px solid var(--mantine-color-dark-5)',
      }}
    >
      <Grid gutter="xl">

        {/* Score + Physical */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <SectionHeader icon={IconBuilding} label="Physical Attributes" />
          <Grid gutter="sm">
            <Grid.Col span={6}>
              <Field label="Viability Score" value={
                <Text span fw={700} style={{ color: scoreColor }}>{s.viability_score ?? '—'} / 100</Text>
              } />
            </Grid.Col>
            <Grid.Col span={6}>
              <Field label="Building Type" value={s.class || '—'} />
            </Grid.Col>
            <Grid.Col span={6}>
              <Field label="Roof Area" value={s.area_sqft ? `${(s.area_sqft / 1000).toFixed(1)}k sqft` : '—'} />
            </Grid.Col>
            <Grid.Col span={6}>
              <Field label="Annual Rainwater Yield" value={s.annual_gallons ? `${(s.annual_gallons / 1000).toFixed(0)}k gal/yr` : '—'} />
            </Grid.Col>
            <Grid.Col span={6}>
              <Field label="Annual Savings" value={s.annual_savings_usd ? `$${s.annual_savings_usd.toLocaleString()}/yr` : '—'} />
            </Grid.Col>
            {s.num_floors && (
              <Grid.Col span={6}>
                <Field label="Floors" value={`${s.num_floors} fl`} />
              </Grid.Col>
            )}
            {s.height && (
              <Grid.Col span={6}>
                <Field label="Height" value={`${Math.round(s.height)} m`} />
              </Grid.Col>
            )}
            {s.operator && s.operator !== displayName && (
              <Grid.Col span={6}>
                <Field label="Operator" value={s.operator} />
              </Grid.Col>
            )}
            {s.cooling_tower_detected && (
              <Grid.Col span={6}>
                <Field label="Cooling Tower" value={
                  <Group gap={4}>
                    <IconSnowflake size={12} color="var(--mantine-color-grape-4)" />
                    <Text span size="sm" c="grape">Detected ({((s.cooling_tower_confidence ?? 0) * 100).toFixed(0)}% conf)</Text>
                  </Group>
                } />
              </Grid.Col>
            )}
          </Grid>
        </Grid.Col>

        {/* Score Breakdown */}
        {s.score_breakdown && (
          <Grid.Col span={{ base: 12, md: 6 }}>
            <SectionHeader icon={IconDroplet} label="Score Breakdown" />
            <Stack gap="xs">
              {Object.entries(BREAKDOWN_LABELS).map(([key, label]) => (
                <ScoreBar
                  key={key}
                  label={label}
                  value={s.score_breakdown[key]}
                  color={BREAKDOWN_COLORS[key]}
                />
              ))}
            </Stack>
          </Grid.Col>
        )}

        <Grid.Col span={12}><Divider /></Grid.Col>

        {/* Water & Precipitation */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <SectionHeader icon={IconCloudRain} label="Water & Precipitation" />
          <Grid gutter="sm">
            {cityMeta?.avg_precip_inches != null && (
              <Grid.Col span={6}>
                <Field label="Avg. Precipitation" value={`${cityMeta.avg_precip_inches}"/yr`} />
              </Grid.Col>
            )}
            {yieldPerSqft && (
              <Grid.Col span={6}>
                <Field label="Yield Efficiency" value={`${yieldPerSqft} gal/sqft/yr`} />
              </Grid.Col>
            )}
            {cityMeta?.water_cost_per_kgal != null && (
              <Grid.Col span={6}>
                <Field label="Water Intake Cost" value={`$${cityMeta.water_cost_per_kgal}/kgal`} />
              </Grid.Col>
            )}
            {cityMeta?.sewer_cost_per_kgal > 0 && (
              <Grid.Col span={6}>
                <Field label="Sewer Cost" value={`$${cityMeta.sewer_cost_per_kgal}/kgal`} />
              </Grid.Col>
            )}
            {cityMeta?.total_water_cost_per_kgal != null && (
              <Grid.Col span={6}>
                <Field label="Total Water Cost" value={`$${cityMeta.total_water_cost_per_kgal}/kgal`} />
              </Grid.Col>
            )}
            {cityMeta?.gallons_per_sqft_per_year != null && (
              <Grid.Col span={6}>
                <Field label="Rainfall Factor" value={`${cityMeta.gallons_per_sqft_per_year} gal/sqft/yr`} />
              </Grid.Col>
            )}
          </Grid>
        </Grid.Col>

        {/* Environmental Context */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <SectionHeader icon={IconScale} label="Environmental Context" />
          <Grid gutter="sm">
            {s.water_stress != null && (
              <Grid.Col span={6}>
                <Field
                  label="Water Stress Score"
                  value={cityMeta?.water_stress
                    ? `${s.water_stress} / 5 — ${cityMeta.water_stress}`
                    : `${s.water_stress} / 5`}
                />
              </Grid.Col>
            )}
            {(cityMeta?.stormwater_fee_per_sqft_yr > 0 || s.incentives?.stormwater_fee_per_sqft_yr > 0) && (
              <Grid.Col span={6}>
                <Field
                  label="Stormwater Fee"
                  value={`$${cityMeta?.stormwater_fee_per_sqft_yr ?? s.incentives?.stormwater_fee_per_sqft_yr ?? '—'}/sqft/yr`}
                />
              </Grid.Col>
            )}
            {cityMeta?.esg_climate?.regulatory_pressure != null && (
              <Grid.Col span={6}>
                <Field label="Regulatory Pressure" value={`${cityMeta.esg_climate.regulatory_pressure} / 5`} />
              </Grid.Col>
            )}
            {Array.isArray(cityMeta?.buildingTypes) && cityMeta.buildingTypes.length > 0 && (
              <Grid.Col span={6}>
                <Field label="Audit Building Types" value={cityMeta.buildingTypes.join(', ')} />
              </Grid.Col>
            )}
            {cityMeta?.minRoofSqft != null && (
              <Grid.Col span={6}>
                <Field label="Min. Roof Size Filter" value={`${(cityMeta.minRoofSqft / 1000).toFixed(0)}k sqft`} />
              </Grid.Col>
            )}
          </Grid>
        </Grid.Col>

        {/* Data Sources */}
        {cityMeta?.data_sources && Object.keys(cityMeta.data_sources).length > 0 && (
          <>
            <Grid.Col span={12}><Divider /></Grid.Col>
            <Grid.Col span={12}>
              <SectionHeader icon={IconDatabase} label="Data Sources" />
              <Stack gap={4}>
                {Object.entries(cityMeta.data_sources).map(([key, url]) => {
                  const href = String(url ?? '')
                  const host = href.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]
                  return (
                  <Group key={key} gap="xs">
                    <Text size="xs" c="dimmed" style={{ minWidth: 140 }}>
                      {key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </Text>
                    <Anchor href={href} target="_blank" rel="noopener noreferrer" size="xs">
                      {host} ↗
                    </Anchor>
                  </Group>
                  )
                })}
              </Stack>
            </Grid.Col>
          </>
        )}

        <Grid.Col span={12}><Divider /></Grid.Col>

        {/* ROI */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <SectionHeader icon={IconCoin} label="ROI Estimate" />
          <Grid gutter="sm">
            {[
              ['System Cost', `$${(roi.systemCost / 1000).toFixed(0)}k`],
              ['Rebates', roi.totalIncentives > 0 ? `-$${(roi.totalIncentives / 1000).toFixed(0)}k` : '—'],
              ['Net Cost', `$${(roi.netCost / 1000).toFixed(0)}k`],
              ['Payback', roi.paybackYears ? `${roi.paybackYears} yrs` : '—'],
              ['10yr NPV', `$${(roi.npv10yr / 1000).toFixed(0)}k`],
              ['Break-even', roi.breakEvenYear ? `Year ${roi.breakEvenYear}` : '—'],
            ].map(([label, value]) => (
              <Grid.Col key={label} span={6}>
                <Field label={label} value={value} />
              </Grid.Col>
            ))}
          </Grid>
        </Grid.Col>

        {/* Location */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <SectionHeader icon={IconMapPin} label="Location" />
          {addrLine1 && <Text size="sm" fw={600}>{addrLine1}</Text>}
          {addrLine2 && <Text size="xs" c="dimmed">{addrLine2}</Text>}
          {center && (
            <Text size="xs" c="dimmed" mt={2} mb={6} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {center.lat.toFixed(6)}, {center.lon.toFixed(6)}
            </Text>
          )}
          {s.phone && (
            <Group gap={4} mb={4}>
              <IconPhone size={11} color="var(--mantine-color-dimmed)" />
              <Anchor href={`tel:${s.phone}`} size="xs">{s.phone}</Anchor>
            </Group>
          )}
          {s.website && (
            <Group gap={4} mb={6}>
              <IconWorld size={11} color="var(--mantine-color-dimmed)" />
              <Anchor
                href={String(s.website).startsWith('http') ? String(s.website) : `https://${s.website}`}
                target="_blank" rel="noopener noreferrer" size="xs" truncate
              >
                {String(s.website).replace(/^https?:\/\/(www\.)?/, '')}
              </Anchor>
            </Group>
          )}
          <Group gap="xs" mb="sm">
            {mapsUrl && (
              <Button component="a"
                href={displayName
                  ? `https://www.google.com/maps/search/${encodeURIComponent(displayName)}/@${center.lat},${center.lon},17z`
                  : mapsUrl}
                target="_blank" rel="noopener noreferrer"
                size="xs" leftSection={<IconMap2 size={12} />} variant="light">
                Google Maps
              </Button>
            )}
            {streetViewUrl && (
              <Button component="a" href={streetViewUrl} target="_blank" rel="noopener noreferrer"
                size="xs" leftSection={<IconCamera size={12} />} variant="subtle">
                Street View
              </Button>
            )}
            {osmUrl && (
              <Button component="a" href={osmUrl} target="_blank" rel="noopener noreferrer"
                size="xs" leftSection={<IconExternalLink size={12} />} variant="subtle">
                OSM
              </Button>
            )}
          </Group>
          {center && (
            <Box style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--mantine-color-dark-4)' }}>
              <iframe
                title="building-location-map"
                width="100%"
                height="200"
                style={{ border: 0, display: 'block' }}
                loading="lazy"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${center.lon - 0.003},${center.lat - 0.002},${center.lon + 0.003},${center.lat + 0.002}&layer=mapnik&marker=${center.lat},${center.lon}`}
              />
            </Box>
          )}
        </Grid.Col>

        {/* Incentives */}
        {hasIncentives && (
          <>
            <Grid.Col span={12}><Divider /></Grid.Col>
            <Grid.Col span={12}>
              <SectionHeader icon={IconLeaf} label="Applicable Incentives" />
              <Stack gap="xs">
                {(s.incentives.tax_credit || s.incentives.tax_credit_notes) && (
                  <Paper withBorder p="xs" radius="md">
                    <Text size="xs" fw={600} mb={2}>Tax Incentive</Text>
                    <Text size="xs" c="dimmed">{s.incentives.tax_credit_notes || 'State tax credit or deduction for qualifying rainwater harvesting installation.'}</Text>
                    {s.incentives.legal_link && (
                      <Anchor href={s.incentives.legal_link} target="_blank" rel="noopener noreferrer" size="xs" mt={4} display="block">
                        View statute ↗
                      </Anchor>
                    )}
                  </Paper>
                )}
                {s.incentives.stormwater_fee && (
                  <Paper withBorder p="xs" radius="md">
                    <Text size="xs" fw={600} mb={2}>
                      {s.incentives.stormwater_fee_per_sqft_yr > 0
                        ? `Stormwater Fee Reduction — $${s.incentives.stormwater_fee_per_sqft_yr}/sqft/yr`
                        : 'Stormwater Utility Fee Reduction'}
                    </Text>
                    <Text size="xs" c="dimmed">{s.incentives.stormwater_notes || 'On-site retention qualifies for municipal stormwater fee credits on billable impervious area.'}</Text>
                  </Paper>
                )}
                {s.incentives.rebate_usd > 0 && (
                  <Paper withBorder p="xs" radius="md">
                    <Text size="xs" fw={600} mb={2}>${s.incentives.rebate_usd.toLocaleString()} Installation Rebate</Text>
                    <Text size="xs" c="dimmed">{s.incentives.rebate_notes || 'Direct rebate from state or local water authority for installing a qualifying rainwater harvesting system.'}</Text>
                  </Paper>
                )}
              </Stack>
            </Grid.Col>
          </>
        )}

        {/* Research & Outreach */}
        <Grid.Col span={12}><Divider /></Grid.Col>
        <Grid.Col span={12}>
          <SectionHeader icon={IconSearch} label="Research & Outreach" />
          <Group gap="xs" mb="sm">
            <Button component="a" href={linkedInUrl} target="_blank" rel="noopener noreferrer"
              size="xs" leftSection={<IconBrandLinkedin size={12} />} variant="light" color="blue">
              LinkedIn — Facility Manager
            </Button>
            <Button
              component="a"
              href={`https://www.google.com/search?q=${encodeURIComponent(countyQuery)}`}
              target="_blank" rel="noopener noreferrer"
              size="xs" leftSection={<IconSearch size={12} />} variant="subtle">
              County Assessor Records
            </Button>
            <Button component="a" href={regridUrl} target="_blank" rel="noopener noreferrer"
              size="xs" leftSection={<IconExternalLink size={12} />} variant="subtle">
              Regrid Property Lookup
            </Button>
          </Group>
          <Alert color="yellow" variant="light" icon={<IconAlertCircle size={14} />} title="Owner vs. Occupant">
            <Text size="xs" lh={1.5}>
              The visible occupant may not own this building. Use county assessor records or{' '}
              <Anchor href="https://regrid.com" target="_blank" size="xs">Regrid</Anchor> to find the
              property owner, then{' '}
              <Anchor href="https://opencorporates.com" target="_blank" size="xs">OpenCorporates</Anchor>
              {' '}to trace any holding company. Target the <strong>property manager</strong> or{' '}
              <strong>facilities director</strong> as the practical decision-maker.
            </Text>
          </Alert>
        </Grid.Col>

      </Grid>
    </Box>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Saved() {
  const [expandedBuildingId, setExpandedBuildingId] = useState(null)
  const [expandedPermitId, setExpandedPermitId] = useState(null)

  const savedBuildings = useStore((s) => s.savedBuildings)
  const toggleSavedBuilding = useStore((s) => s.toggleSavedBuilding)
  const savedPermits = useStore((s) => s.savedPermits)
  const toggleSavedPermit = useStore((s) => s.toggleSavedPermit)

  const toggleBuilding = (id) => setExpandedBuildingId((prev) => (prev === id ? null : id))
  const togglePermit = (id) => setExpandedPermitId((prev) => (prev === id ? null : id))

  return (
    <AppShell header={{ height: 60 }} padding="xl">
      <AppShell.Header>
        <TopNav />
      </AppShell.Header>

      <AppShell.Main>
        <Stack gap="xl">
          <Group justify="space-between" align="flex-end">
            <div>
              <Text size="xl" fw={700} mb={4}>Saved Pipeline</Text>
              <Text c="dimmed" size="sm">
                Your shortlisted buildings and monitored permits.
              </Text>
            </div>
          </Group>

          {/* Saved Buildings */}
          <div>
            <Group gap="xs" mb="sm">
              <IconStarFilled size={20} color="var(--mantine-color-yellow-filled)" />
              <Text size="lg" fw={600}>Saved Buildings ({savedBuildings.length})</Text>
            </Group>

            {savedBuildings.length === 0 ? (
              <Paper withBorder p="xl" radius="md">
                <Center>
                  <Text c="dimmed">No saved buildings yet. Explore an audit and click the Save icon.</Text>
                </Center>
              </Paper>
            ) : (
              <Table.ScrollContainer minWidth={700}>
                <Table highlightOnHover withTableBorder withColumnBorders verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 40 }} />
                      <Table.Th>Building</Table.Th>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>Score</Table.Th>
                      <Table.Th>Roof Area</Table.Th>
                      <Table.Th>Annual Savings</Table.Th>
                      <Table.Th style={{ width: 40 }} />
                    </Table.Tr>
                  </Table.Thead>
                  {savedBuildings.filter((b) => b?.properties?.id != null).map((b) => {
                      const id = String(b.properties.id)
                      const s = b.properties
                      const score = s.viability_score ?? 0
                      const scoreColor = scoreHex(score)
                      const name = s.names?.primary
                      const addr = s.addr
                      const addrShort = [addr?.housenumber, addr?.road ?? addr?.street].filter(Boolean).join(' ')
                      const expanded = expandedBuildingId === id

                      return (
                        <Table.Tbody key={id}>
                          <Table.Tr
                            onClick={() => toggleBuilding(id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <Table.Td onClick={(e) => e.stopPropagation()}>
                              <ActionIcon variant="subtle" color="red" onClick={() => toggleSavedBuilding(b)}>
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" fw={600}>
                                {name || addrShort || 'Unnamed building'}
                              </Text>
                              {name && addrShort && (
                                <Text size="xs" c="dimmed">{addrShort}</Text>
                              )}
                            </Table.Td>
                            <Table.Td>
                              {s.class
                                ? <Text size="sm">{s.class}</Text>
                                : <Text size="sm" c="dimmed">—</Text>}
                              {s.cooling_tower_detected && (
                                <Group gap={4} mt={2}>
                                  <IconSnowflake size={11} color="var(--mantine-color-grape-4)" />
                                  <Text size="xs" c="grape">Cooling tower</Text>
                                </Group>
                              )}
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" fw={700} style={{ color: scoreColor }}>{score}</Text>
                              <Text size="xs" c="dimmed">/ 100</Text>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" fw={500}>
                                {s.area_sqft ? `${(s.area_sqft / 1000).toFixed(1)}k sqft` : '—'}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" fw={600} c="green">
                                {s.annual_savings_usd ? `$${s.annual_savings_usd.toLocaleString()}/yr` : '—'}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <ActionIcon variant="subtle" color="gray" size="sm">
                                {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                              </ActionIcon>
                            </Table.Td>
                          </Table.Tr>
                          {expanded && (
                            <Table.Tr key={`${id}-detail`}>
                              <Table.Td colSpan={7} p={0}>
                                <BuildingExpandedDetail building={b} />
                              </Table.Td>
                            </Table.Tr>
                          )}
                        </Table.Tbody>
                      )
                    })}
                </Table>
              </Table.ScrollContainer>
            )}
          </div>

          <Divider my="sm" />

          {/* Saved Permits */}
          <div>
            <Group gap="xs" mb="sm">
              <IconStarFilled size={20} color="var(--mantine-color-yellow-filled)" />
              <Text size="lg" fw={600}>Saved Permits ({savedPermits.length})</Text>
            </Group>

            {savedPermits.length === 0 ? (
              <Paper withBorder p="xl" radius="md">
                <Center>
                  <Text c="dimmed">No saved permits yet. Search the Permit Pipeline and click the Save icon.</Text>
                </Center>
              </Paper>
            ) : (
              <Table.ScrollContainer minWidth={800}>
                <Table highlightOnHover withTableBorder withColumnBorders verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 40 }} />
                      <Table.Th>Address</Table.Th>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>Description</Table.Th>
                      <Table.Th>Job Value</Table.Th>
                      <Table.Th>Status / Date</Table.Th>
                      <Table.Th>Contractor</Table.Th>
                      <Table.Th style={{ width: 40 }} />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {savedPermits.filter((p) => p?.id != null).map((p) => {
                      const permitId = String(p.id)
                      const address = p.address
                        ? `${p.address.street_no || ''} ${p.address.street || ''}, ${p.address.city}, ${p.address.state} ${p.address.zip_code}`.trim()
                        : 'Unknown'
                      const expanded = expandedPermitId === permitId

                      return (
                        <Fragment key={permitId}>
                          <Table.Tr
                            onClick={() => togglePermit(permitId)}
                            style={{ cursor: 'pointer' }}
                          >
                            <Table.Td onClick={(e) => e.stopPropagation()}>
                              <ActionIcon variant="subtle" color="red" onClick={() => toggleSavedPermit(p)}>
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" fw={600}>{address}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm">{p.property_type || <Text span c="dimmed">—</Text>}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" lineClamp={2}>{p.description || <Text span c="dimmed">No description</Text>}</Text>
                              <Text size="xs" c="dimmed">{p.type} — {p.number}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" fw={600} c="green">
                                {p.job_value ? `$${p.job_value.toLocaleString()}` : <Text span c="dimmed">—</Text>}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm">{p.status || <Text span c="dimmed">—</Text>}</Text>
                              <Text size="xs" c="dimmed" mt={2}>{p.file_date || p.issue_date || '—'}</Text>
                            </Table.Td>
                            <Table.Td>
                              {p.contractor_id ? (
                                <Text size="xs" fw={500} c="dimmed">ID: {p.contractor_id}</Text>
                              ) : (
                                <Text size="xs" c="dimmed">—</Text>
                              )}
                            </Table.Td>
                            <Table.Td>
                              <ActionIcon variant="subtle" color="gray" size="sm">
                                {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                              </ActionIcon>
                            </Table.Td>
                          </Table.Tr>
                          {expanded && (
                            <Table.Tr key={`${permitId}-detail`}>
                              <Table.Td colSpan={8} p={0}>
                                <PermitExpandedDetail permit={p} />
                              </Table.Td>
                            </Table.Tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </div>
        </Stack>
      </AppShell.Main>
    </AppShell>
  )
}
