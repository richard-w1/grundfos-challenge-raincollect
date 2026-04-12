import { useState, useEffect, useRef } from 'react'
import {
  AppShell, Stack, Text, Group, TextInput, NumberInput, Button,
  Table, Badge, ActionIcon, Paper, Alert, SimpleGrid,
  Combobox, InputBase, useCombobox, Loader,
} from '@mantine/core'
import {
  IconSearch, IconStar, IconStarFilled,
  IconChevronDown, IconChevronUp, IconInfoCircle, IconMapPin,
} from '@tabler/icons-react'
import TopNav from '../components/TopNav'
import PermitExpandedDetail from '../components/PermitExpandedDetail'
import { useStore } from '../store'

const todayStr = () => new Date().toISOString().split('T')[0]
const yearsAgoStr = (n) => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - n)
  return d.toISOString().split('T')[0]
}

const SHOVELS_BASE = '/shovels-api'

export default function Permits() {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  })

  const [locationInput, setLocationInput] = useState('')
  const [locationOptions, setLocationOptions] = useState([])
  const [locationLoading, setLocationLoading] = useState(false)
  const [selectedGeoId, setSelectedGeoId] = useState(null)
  const [selectedLocationName, setSelectedLocationName] = useState('')

  const [descQuery, setDescQuery] = useState('')
  const [dateFrom, setDateFrom] = useState(yearsAgoStr(2))
  const [dateTo, setDateTo] = useState(todayStr())
  const [minBuildingArea, setMinBuildingArea] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)
  const [expandedPermitId, setExpandedPermitId] = useState(null)

  const savedPermits = useStore((s) => s.savedPermits)
  const toggleSavedPermit = useStore((s) => s.toggleSavedPermit)

  const debounceRef = useRef(null)

  useEffect(() => {
    const raw = locationInput.trim()

    if (raw.length < 2) {
      setLocationOptions([])
      return
    }

    // State abbreviation — use directly as geo_id, no API needed
    if (/^[A-Za-z]{2}$/.test(raw)) {
      const code = raw.toUpperCase()
      const STATE_NAMES = {
        AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
        CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
        HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
        KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',
        MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',
        MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',
        NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',
        ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',
        RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',
        TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',
        WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'Washington D.C.',
      }
      if (STATE_NAMES[code]) {
        setLocationOptions([{ geo_id: code, name: `${STATE_NAMES[code]} (${code}) — entire state` }])
      } else {
        setLocationOptions([])
      }
      return
    }

    // ZIP code — use directly as geo_id, no API needed
    if (/^\d{5}$/.test(raw)) {
      setLocationOptions([{ geo_id: raw, name: `ZIP Code ${raw}` }])
      return
    }

    // City name — call the Shovels cities/search API
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLocationLoading(true)
      try {
        const res = await fetch(
          `${SHOVELS_BASE}/cities/search?q=${encodeURIComponent(raw)}&size=10`
        )
        if (res.ok) {
          const data = await res.json()
          // API may return paginated { items: [...] } or a bare array
          const items = Array.isArray(data) ? data : (data.items ?? [])
          setLocationOptions(items)
        } else {
          const body = await res.json().catch(() => ({}))
          console.error('[Shovels cities/search]', res.status, body)
          setLocationOptions([])
        }
      } catch (err) {
        console.error('[Shovels cities/search] network error:', err)
        setLocationOptions([])
      } finally {
        setLocationLoading(false)
      }
    }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [locationInput])

  const handleSelectLocation = (geoId) => {
    const option = locationOptions.find((o) => o.geo_id === geoId)
    if (option) {
      setSelectedGeoId(option.geo_id)
      setSelectedLocationName(option.name)
      setLocationInput(option.name)
    }
    combobox.closeDropdown()
  }

  const toggleExpand = (id) => setExpandedPermitId((prev) => (prev === id ? null : id))

  const handleSearch = async () => {
    if (!selectedGeoId) return
    setLoading(true)
    setError(null)
    setExpandedPermitId(null)

    try {
      let url = `${SHOVELS_BASE}/permits/search?size=50`
      url += `&permit_from=${encodeURIComponent(dateFrom)}`
      url += `&permit_to=${encodeURIComponent(dateTo)}`
      url += `&geo_id=${encodeURIComponent(selectedGeoId)}`

      if (descQuery.trim()) {
        url += `&permit_q=${encodeURIComponent(descQuery.trim())}`
      }

      if (minBuildingArea) {
        url += `&property_min_building_area=${encodeURIComponent(minBuildingArea)}`
      }

      const res = await fetch(url)

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const detail = body?.detail?.[0]?.msg || body?.detail || `HTTP ${res.status}`
        throw new Error(String(detail))
      }

      const data = await res.json()
      setResults(data.items || [])
      if ((data.items || []).length === 0) {
        setError('No permits found. Try broadening the date range or removing the description filter.')
      }
    } catch (err) {
      console.error(err)
      setResults([])
      setError(`Search failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const canSearch = !!selectedGeoId

  return (
    <AppShell header={{ height: 60 }} padding="xl">
      <AppShell.Header>
        <TopNav />
      </AppShell.Header>

      <AppShell.Main>
        <Stack gap="lg">
          <Group justify="space-between" align="flex-end">
            <div>
              <Text size="xl" fw={700} mb={4}>Permit Pipeline</Text>
              <Text c="dimmed" size="sm">
                Search building permits by location and description to find construction opportunities.
              </Text>
            </div>
          </Group>

          <Paper withBorder p="md" radius="md">
            <Stack gap="sm">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <Combobox store={combobox} onOptionSubmit={handleSelectLocation}>
                  <Combobox.Target>
                    <InputBase
                      label="Location"
                      description="City name, 2-letter state (CA), or 5-digit ZIP code"
                      placeholder="e.g. Berkeley, CA, or 94704"
                      value={locationInput}
                      leftSection={<IconMapPin size={16} />}
                      rightSection={locationLoading ? <Loader size={14} /> : null}
                      onChange={(e) => {
                        setLocationInput(e.currentTarget.value)
                        setSelectedGeoId(null)
                        setSelectedLocationName('')
                        combobox.openDropdown()
                      }}
                      onFocus={() => locationInput.length >= 2 && combobox.openDropdown()}
                      onKeyDown={(e) => e.key === 'Enter' && canSearch && handleSearch()}
                      onBlur={() => {
                        combobox.closeDropdown()
                        if (!selectedGeoId) setLocationInput(selectedLocationName)
                      }}
                    />
                  </Combobox.Target>
                  <Combobox.Dropdown>
                    <Combobox.Options>
                      {locationOptions.length === 0 && !locationLoading && locationInput.trim().length >= 2 && (
                        <Combobox.Empty>
                          No results — try a 2-letter state (CA) or 5-digit ZIP
                        </Combobox.Empty>
                      )}
                      {locationOptions.map((option) => (
                        <Combobox.Option key={option.geo_id} value={option.geo_id}>
                          {option.name}
                        </Combobox.Option>
                      ))}
                    </Combobox.Options>
                  </Combobox.Dropdown>
                </Combobox>

                <TextInput
                  label="Description keyword"
                  description="Optional: search within permit descriptions"
                  placeholder="e.g. solar, HVAC, battery..."
                  value={descQuery}
                  onChange={(e) => setDescQuery(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canSearch && handleSearch()}
                  leftSection={<IconSearch size={16} />}
                />
              </SimpleGrid>

              <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
                <TextInput
                  label="Permit from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.currentTarget.value)}
                />
                <TextInput
                  label="Permit to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.currentTarget.value)}
                />
                <NumberInput
                  label="Min. building area"
                  description="sqft"
                  placeholder="e.g. 100000"
                  value={minBuildingArea}
                  onChange={setMinBuildingArea}
                  min={0}
                  step={10000}
                  thousandSeparator=","
                  hideControls
                />
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <Button
                    onClick={handleSearch}
                    loading={loading}
                    fullWidth
                    disabled={!canSearch}
                    title={!canSearch ? 'Select a city first' : undefined}
                  >
                    Search Permits
                  </Button>
                </div>
              </SimpleGrid>
            </Stack>
          </Paper>

          {error && (
            <Alert icon={<IconInfoCircle size={16} />} color="orange" variant="light">
              {error}
            </Alert>
          )}

          {results.length > 0 && (
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
                  {results.map((p) => {
                    const saved = savedPermits.some((sp) => sp.id === p.id)
                    const expanded = expandedPermitId === p.id
                    const address = p.address
                      ? `${p.address.street_no || ''} ${p.address.street || ''}, ${p.address.city}, ${p.address.state} ${p.address.zip_code}`.trim()
                      : 'Unknown'
                    return (
                      <>
                        <Table.Tr
                          key={p.id}
                          onClick={() => toggleExpand(p.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <Table.Td onClick={(e) => e.stopPropagation()}>
                            <ActionIcon
                              variant="subtle"
                              color={saved ? 'yellow' : 'gray'}
                              onClick={() => toggleSavedPermit(p)}
                            >
                              {saved ? <IconStarFilled size={18} /> : <IconStar size={18} />}
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
                          <Table.Tr key={`${p.id}-detail`}>
                            <Table.Td colSpan={8} p={0}>
                              <PermitExpandedDetail permit={p} />
                            </Table.Td>
                          </Table.Tr>
                        )}
                      </>
                    )
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}

          {results.length === 0 && !loading && !error && (
            <Group justify="center" py="xl">
              <Text c="dimmed">Search a city to find permit records.</Text>
            </Group>
          )}
        </Stack>
      </AppShell.Main>
    </AppShell>
  )
}
