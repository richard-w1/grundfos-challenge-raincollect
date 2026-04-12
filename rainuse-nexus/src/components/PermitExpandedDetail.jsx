import { Box, Grid, Text, Badge, Group, Divider, Anchor, Button } from '@mantine/core'
import {
  IconCalendar, IconCoin, IconTag, IconHome, IconMapPin, IconId, IconMap2, IconCamera,
} from '@tabler/icons-react'

const dash = '—'

function fmt(value, type) {
  if (value == null || value === '' || value === undefined) return dash
  switch (type) {
    case 'currency': return `$${Number(value).toLocaleString()}`
    case 'days': return `${value} day${value !== 1 ? 's' : ''}`
    case 'pct': return `${value}%`
    case 'sqft': return `${Number(value).toLocaleString()} sqft`
    case 'num': return Number(value).toLocaleString()
    default: return String(value)
  }
}

function Field({ label, value }) {
  return (
    <Box>
      <Text size="xs" c="dimmed" mb={2}>{label}</Text>
      <Text component="div" size="sm" fw={500}>{value === dash ? <Text span c="dimmed">{dash}</Text> : value}</Text>
    </Box>
  )
}

function SectionHeader({ icon, label }) {
  const Svg = icon
  return (
    <Group gap={6} mb="sm">
      <Svg size={14} color="var(--mantine-color-dimmed)" />
      <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.06em' }}>{label}</Text>
    </Group>
  )
}

export default function PermitExpandedDetail({ permit: p }) {
  const hasProperty = p.property_type || p.property_type_detail || p.property_legal_owner ||
    p.property_owner_type || p.property_lot_size || p.property_building_area ||
    p.property_story_count || p.property_unit_count || p.property_year_built ||
    p.property_assess_market_value || p.property_census_tract || p.property_congressional_district

  const hasLocation = p.address?.county || p.address?.jurisdiction || p.jurisdiction ||
    (p.address?.latlng && p.address.latlng[0] != null)

  const hasTags = Array.isArray(p.tags) && p.tags.length > 0

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

        {/* Timeline */}
        <Grid.Col span={12}>
          <SectionHeader icon={IconCalendar} label="Timeline" />
          <Grid gutter="sm">
            {[
              ['File Date', fmt(p.file_date)],
              ['Issue Date', fmt(p.issue_date)],
              ['Final Date', fmt(p.final_date)],
              ['Start Date', fmt(p.start_date)],
              ['End Date', fmt(p.end_date)],
              ['Total Duration', fmt(p.total_duration, 'days')],
              ['Approval Duration', fmt(p.approval_duration, 'days')],
              ['Construction Duration', fmt(p.construction_duration, 'days')],
              ['Inspection Pass Rate', fmt(p.inspection_pass_rate, 'pct')],
            ].map(([label, value]) => (
              <Grid.Col key={label} span={{ base: 6, sm: 4, md: 3 }}>
                <Field label={label} value={value} />
              </Grid.Col>
            ))}
          </Grid>
        </Grid.Col>

        <Grid.Col span={12}><Divider /></Grid.Col>

        {/* Financials */}
        <Grid.Col span={12}>
          <SectionHeader icon={IconCoin} label="Financials" />
          <Grid gutter="sm">
            <Grid.Col span={{ base: 6, sm: 4, md: 3 }}>
              <Field label="Job Value" value={fmt(p.job_value, 'currency')} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4, md: 3 }}>
              <Field label="Permit Fees" value={fmt(p.fees, 'currency')} />
            </Grid.Col>
            {p.subtype && (
              <Grid.Col span={{ base: 6, sm: 4, md: 3 }}>
                <Field label="Subtype" value={p.subtype} />
              </Grid.Col>
            )}
          </Grid>
        </Grid.Col>

        {/* Tags */}
        {hasTags && (
          <>
            <Grid.Col span={12}><Divider /></Grid.Col>
            <Grid.Col span={12}>
              <SectionHeader icon={IconTag} label="Tags" />
              <Group gap="xs">
                {p.tags.map((tag, i) => {
                  const label = String(tag ?? '').replace(/_/g, ' ')
                  return (
                    <Badge key={`${String(tag)}-${i}`} size="sm" variant="light" color="cyan">
                      {label || dash}
                    </Badge>
                  )
                })}
              </Group>
            </Grid.Col>
          </>
        )}

        {/* Property */}
        {hasProperty && (
          <>
            <Grid.Col span={12}><Divider /></Grid.Col>
            <Grid.Col span={12}>
              <SectionHeader icon={IconHome} label="Property" />
              <Grid gutter="sm">
                {[
                  ['Type', fmt(p.property_type)],
                  ['Type Detail', fmt(p.property_type_detail)],
                  ['Legal Owner', fmt(p.property_legal_owner)],
                  ['Owner Type', fmt(p.property_owner_type)],
                  ['Building Area', fmt(p.property_building_area, 'sqft')],
                  ['Lot Size', fmt(p.property_lot_size, 'sqft')],
                  ['Stories', fmt(p.property_story_count, 'num')],
                  ['Units', fmt(p.property_unit_count, 'num')],
                  ['Year Built', fmt(p.property_year_built)],
                  ['Assessed Market Value', fmt(p.property_assess_market_value, 'currency')],
                  ['Census Tract', fmt(p.property_census_tract)],
                  ['Congressional District', fmt(p.property_congressional_district)],
                ]
                  .filter(([, v]) => v !== dash)
                  .map(([label, value]) => (
                    <Grid.Col key={label} span={{ base: 6, sm: 4, md: 3 }}>
                      <Field label={label} value={value} />
                    </Grid.Col>
                  ))}
              </Grid>
            </Grid.Col>
          </>
        )}

        {/* Location */}
        {hasLocation && (
          <>
            <Grid.Col span={12}><Divider /></Grid.Col>
            <Grid.Col span={12}>
              <SectionHeader icon={IconMapPin} label="Location Details" />
              <Grid gutter="sm">
                {p.jurisdiction && (
                  <Grid.Col span={{ base: 6, sm: 4, md: 3 }}>
                    <Field label="Jurisdiction (Filed)" value={p.jurisdiction} />
                  </Grid.Col>
                )}
                {p.address?.county && (
                  <Grid.Col span={{ base: 6, sm: 4, md: 3 }}>
                    <Field label="County" value={p.address.county} />
                  </Grid.Col>
                )}
                {p.address?.jurisdiction && (
                  <Grid.Col span={{ base: 6, sm: 4, md: 3 }}>
                    <Field label="Address Jurisdiction" value={p.address.jurisdiction} />
                  </Grid.Col>
                )}
                {p.address?.latlng && p.address.latlng[0] != null && (
                  <Grid.Col span={{ base: 6, sm: 4, md: 3 }}>
                    <Field
                      label="Coordinates"
                      value={`${Number(p.address.latlng[0]).toFixed(6)}, ${Number(p.address.latlng[1]).toFixed(6)}`}
                    />
                  </Grid.Col>
                )}
              </Grid>

              {/* Map links + embed */}
              {(() => {
                const lat = p.address?.latlng?.[0]
                const lng = p.address?.latlng?.[1]
                const addrStr = p.address
                  ? [p.address.street_no, p.address.street, p.address.city, p.address.state, p.address.zip_code].filter(Boolean).join(' ')
                  : null
                const mapsQuery = addrStr || (lat != null ? `${lat},${lng}` : null)
                const mapsUrl = mapsQuery
                  ? `https://www.google.com/maps/search/${encodeURIComponent(mapsQuery)}`
                  : null
                const streetViewUrl = lat != null
                  ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`
                  : null

                if (!mapsUrl && lat == null) return null
                return (
                  <Box mt="sm">
                    <Group gap="xs" mb="sm">
                      {mapsUrl && (
                        <Button component="a" href={mapsUrl} target="_blank" rel="noopener noreferrer"
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
                    </Group>
                    {lat != null && (
                      <Box style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--mantine-color-dark-4)' }}>
                        <iframe
                          title="permit-location-map"
                          width="100%"
                          height="200"
                          style={{ border: 0, display: 'block' }}
                          loading="lazy"
                          src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.003},${lat - 0.002},${lng + 0.003},${lat + 0.002}&layer=mapnik&marker=${lat},${lng}`}
                        />
                      </Box>
                    )}
                  </Box>
                )
              })()}
            </Grid.Col>
          </>
        )}

        {/* Contractor */}
        {p.contractor_id && (
          <>
            <Grid.Col span={12}><Divider /></Grid.Col>
            <Grid.Col span={12}>
              <SectionHeader icon={IconId} label="Contractor" />
              <Field label="Contractor ID" value={p.contractor_id} />
            </Grid.Col>
          </>
        )}

      </Grid>
    </Box>
  )
}
