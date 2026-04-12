import { AppShell, Stack, Text, Group, Table, Badge, ActionIcon, Paper, Center, Divider } from '@mantine/core'
import { IconStarFilled, IconDeviceComputerCamera, IconTrash } from '@tabler/icons-react'
import TopNav from '../components/TopNav'
import { useStore } from '../store'
import { useNavigate } from 'react-router-dom'

// Simple hash function to generate stable mock data based on ID
const hashStr = (str) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = Math.imul(31, hash) + str.charCodeAt(i) | 0
  return Math.abs(hash)
}

const generateMockContact = (id) => {
  const names = ['John Doe', 'Jane Smith', 'Michael Johnson', 'Emily Davis', 'Robert Wilson']
  const roles = ['Property Manager', 'Facility Director', 'Building Owner', 'Chief Engineer']
  const hash = hashStr(id || 'default')
  return {
    name: names[hash % names.length],
    role: roles[hash % roles.length],
    phone: `(555) ${100 + (hash % 899)}-${1000 + (hash % 8999)}`,
    email: `contact${hash % 100}@example.com`
  }
}

const generateMockSensorData = (id) => {
  const hash = hashStr(id || 'default')
  return {
    status: hash % 3 === 0 ? 'Offline' : 'Active (Live)',
    flowRate: (1.5 + (hash % 10) * 0.3).toFixed(1), // L/min
    dailyCatchment: (150 + (hash % 50) * 12).toFixed(0), // Gallons
    lastUpdate: 'Just now'
  }
}

export default function Saved() {
  const navigate = useNavigate()
  const savedBuildings = useStore((s) => s.savedBuildings)
  const toggleSavedBuilding = useStore((s) => s.toggleSavedBuilding)
  const savedPermits = useStore((s) => s.savedPermits)
  const toggleSavedPermit = useStore((s) => s.toggleSavedPermit)

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
                Your shortlisted buildings and monitored permits. View live Pi sensor telemetry and contact details.
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
              <Table.ScrollContainer minWidth={1000}>
                <Table highlightOnHover withTableBorder withColumnBorders verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 40 }} />
                      <Table.Th>Address / Property</Table.Th>
                      <Table.Th>Score</Table.Th>
                      <Table.Th>Point of Contact</Table.Th>
                      <Table.Th>Live Pi Telemetry (RainUSE Phase 2)</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {savedBuildings.map((b) => {
                      const id = String(b.properties.id)
                      const contact = generateMockContact(id)
                      const sensor = generateMockSensorData(id)
                      const score = b.properties.viability_score || 0
                      
                      return (
                        <Table.Tr key={id}>
                          <Table.Td>
                            <ActionIcon variant="subtle" color="red" onClick={() => toggleSavedBuilding(b)}>
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" fw={600}>{b.properties.names?.primary || `${b.properties.addr?.housenumber || ''} ${b.properties.addr?.street || ''}` || 'Unknown Address'}</Text>
                            <Text size="xs" c="dimmed">Roof: {((b.properties.roof_area_sqft || 0)/1000).toFixed(1)}k sqft</Text>
                          </Table.Td>
                          <Table.Td>
                            <Badge 
                              size="sm" 
                              color={score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red'}
                            >
                              {score} / 100
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" fw={500}>{contact.name} <Text span size="xs" c="dimmed">({contact.role})</Text></Text>
                            <Text size="xs">{contact.email} • {contact.phone}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Group gap="xs" align="flex-start" wrap="nowrap">
                              <ThemeIcon size="md" variant="light" color={sensor.status === 'Offline' ? 'gray' : 'blue'}>
                                <IconDeviceComputerCamera size={16} />
                              </ThemeIcon>
                              <div>
                                <Group gap="xs" mb={2}>
                                  <Badge size="xs" color={sensor.status === 'Offline' ? 'gray' : 'green'}>{sensor.status}</Badge>
                                  <Text size="xs" c="dimmed">Updated: {sensor.lastUpdate}</Text>
                                </Group>
                                {sensor.status !== 'Offline' && (
                                  <Group gap="md">
                                    <Text size="xs" fw={600}>Flow: <Text span c="blue">{sensor.flowRate} L/min</Text></Text>
                                    <Text size="xs" fw={600}>Daily: <Text span c="teal">{sensor.dailyCatchment} gal</Text></Text>
                                  </Group>
                                )}
                              </div>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      )
                    })}
                  </Table.Tbody>
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
                      <Table.Th>Description</Table.Th>
                      <Table.Th>Job Value</Table.Th>
                      <Table.Th>Status / Date</Table.Th>
                      <Table.Th>Point of Contact</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {savedPermits.map((p) => {
                      const id = String(p.id)
                      const contact = generateMockContact(p.contractor_id || id)
                      const address = p.address ? `${p.address.street_no || ''} ${p.address.street || ''}, ${p.address.city}, ${p.address.state} ${p.address.zip_code}` : 'Unknown'
                      
                      return (
                        <Table.Tr key={p.id}>
                          <Table.Td>
                            <ActionIcon variant="subtle" color="red" onClick={() => toggleSavedPermit(p)}>
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" fw={600}>{address}</Text>
                            <Badge size="xs" variant="light" color="blue" mt={4}>{p.property_type}</Badge>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" lineClamp={2}>{p.description}</Text>
                            <Text size="xs" c="dimmed">{p.type} — {p.number}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" fw={600} c="green">
                              {p.job_value ? `$${p.job_value.toLocaleString()}` : <Text span c="dimmed">—</Text>}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Badge size="xs" color={p.status === 'active' ? 'blue' : 'orange'}>
                              {p.status}
                            </Badge>
                            <Text size="xs" c="dimmed" mt={4}>{p.file_date || p.issue_date || 'Unknown Date'}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" fw={500}>{contact.name} <Text span size="xs" c="dimmed">(General Contractor)</Text></Text>
                            <Text size="xs">{contact.email} • {contact.phone}</Text>
                          </Table.Td>
                        </Table.Tr>
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
