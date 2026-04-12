import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AppShell, Group, Text, Badge, Button, Table,
  ThemeIcon, Skeleton, ActionIcon, Center, Stack,
  UnstyledButton, Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  IconDroplet, IconPlus, IconChevronUp, IconChevronDown,
  IconSelector, IconExternalLink, IconAdjustments,
} from '@tabler/icons-react'
import { useStore } from '../store'
import NewAuditModal from '../components/NewAuditModal'
import EditAuditModal from '../components/EditAuditModal'
import TopNav from '../components/TopNav'

function SortIcon({ sorted, direction }) {
  if (!sorted) return <IconSelector size={14} style={{ opacity: 0.4 }} />
  return direction === 'asc' ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />
}

function Th({ children, sorted, direction, onSort, style }) {
  return (
    <Table.Th style={style}>
      <UnstyledButton onClick={onSort} style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
        <Text size="xs" fw={600} tt="uppercase" lts={0.5} c="dimmed" style={{ whiteSpace: 'nowrap' }}>
          {children}
        </Text>
        <SortIcon sorted={sorted} direction={direction} />
      </UnstyledButton>
    </Table.Th>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const audits = useStore((s) => s.audits)
  const customAudits = useStore((s) => s.customAudits)
  const manifestLoaded = useStore((s) => s.manifestLoaded)
  const [modalOpened, { open, close }] = useDisclosure(false)
  const [editAuditId, setEditAuditId] = useState(null)
  const [editOpened, { open: openEdit, close: closeEdit }] = useDisclosure(false)

  const handleEdit = (e, auditId) => {
    e.stopPropagation()
    setEditAuditId(auditId)
    openEdit()
  }

  const [sortKey, setSortKey] = useState('auditedAt')
  const [sortDir, setSortDir] = useState('desc')

  const allAudits = useMemo(() => {
    return [...customAudits, ...audits]
  }, [audits, customAudits])

  const sorted = useMemo(() => {
    return [...allAudits].sort((a, b) => {
      let va = a[sortKey]; let vb = b[sortKey]
      if (sortKey === 'auditedAt') { va = new Date(va); vb = new Date(vb) }
      if (sortKey === 'building_count') { va = va ?? 0; vb = vb ?? 0 }
      if (sortKey === 'minRoofSqft') { va = va ?? 0; vb = vb ?? 0 }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [allAudits, sortKey, sortDir])

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const thProps = (key) => ({
    sorted: sortKey === key,
    direction: sortDir,
    onSort: () => handleSort(key),
  })

  return (
    <AppShell header={{ height: 60 }} padding="xl">
      <AppShell.Header>
        <TopNav />
      </AppShell.Header>

      <AppShell.Main>
        <Stack gap="lg">
          <Group justify="space-between" align="flex-end" mb={4}>
            <div>
              <Text size="xl" fw={700}>Audit Dashboard</Text>
              <Text c="dimmed" size="sm">
                Click any row to open the audit and explore buildings, scores, and ROI.
              </Text>
            </div>
            <Button leftSection={<IconPlus size={16} />} onClick={open}>
              New Audit
            </Button>
          </Group>

          {!manifestLoaded ? (
            <Stack gap="xs">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={44} radius="sm" />)}
            </Stack>
          ) : sorted.length === 0 ? (
            <Center py="xl">
              <Stack align="center" gap="sm">
                <Text c="dimmed">No audits yet.</Text>
                <Button leftSection={<IconPlus size={14} />} onClick={open} size="sm">
                  Run your first audit
                </Button>
              </Stack>
            </Center>
          ) : (
            <Table.ScrollContainer minWidth={600}>
              <Table highlightOnHover withTableBorder withColumnBorders verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Th {...thProps('label')} style={{ minWidth: 160 }}>Region</Th>
                    <Th {...thProps('auditedAt')} style={{ minWidth: 130 }}>Audit Date</Th>
                    <Th {...thProps('building_count')} style={{ minWidth: 110 }}>Buildings</Th>
                    <Th {...thProps('minRoofSqft')} style={{ minWidth: 120 }}>Min Roof Area</Th>
                    <Table.Th style={{ minWidth: 90 }}>
                      <Text size="xs" fw={600} tt="uppercase" lts={0.5} c="dimmed">Source</Text>
                    </Table.Th>
                    <Table.Th style={{ width: 60 }} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {sorted.map((audit) => {
                    const isCustom = audit.id?.startsWith('custom-')
                    const date = new Date(audit.auditedAt).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })
                    return (
                      <Table.Tr
                        key={audit.id}
                        onClick={() => navigate(`/audit/${audit.id}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <Table.Td>
                          <Group gap="xs">
                            <div>
                              <Text size="sm" fw={600}>{audit.label}</Text>
                              <Text size="xs" c="dimmed">{audit.state}</Text>
                            </div>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{date}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" fw={600} c="blue">
                            {audit.building_count != null
                              ? audit.building_count.toLocaleString()
                              : <Text span c="dimmed" size="xs">—</Text>}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">
                            {((audit.minRoofSqft ?? 100000) / 1000).toFixed(0)}k sqft
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            size="xs"
                            variant="light"
                            color={isCustom ? 'violet' : 'blue'}
                          >
                            {isCustom ? 'Custom' : 'Pre-loaded'}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Group gap={4} wrap="nowrap">
                            <Tooltip label="Edit score heuristics" withArrow>
                              <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                onClick={(e) => handleEdit(e, audit.id)}
                              >
                                <IconAdjustments size={14} />
                              </ActionIcon>
                            </Tooltip>
                            <ActionIcon variant="subtle" color="blue" size="sm">
                              <IconExternalLink size={14} />
                            </ActionIcon>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    )
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Stack>
      </AppShell.Main>

      <NewAuditModal opened={modalOpened} onClose={close} />
      <EditAuditModal auditId={editAuditId} opened={editOpened} onClose={closeEdit} />
    </AppShell>
  )
}
