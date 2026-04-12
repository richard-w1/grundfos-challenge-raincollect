import { useState, useEffect } from 'react'
import {
  Modal, Stack, Text, Group, Button, Divider, Badge, Paper,
  SimpleGrid, Alert,
} from '@mantine/core'
import { IconAdjustments, IconCheck, IconBuilding, IconMapPin } from '@tabler/icons-react'
import { useStore } from '../store'
import WeightSliders, { normalizeWeights } from './WeightSliders'

export default function EditAuditModal({ auditId, opened, onClose }) {
  const getAuditById = useStore((s) => s.getAuditById)
  const getAuditWeights = useStore((s) => s.getAuditWeights)
  const setAuditWeights = useStore((s) => s.setAuditWeights)
  const activeAuditId = useStore((s) => s.activeAuditId)

  const audit = auditId ? getAuditById(auditId) : null
  const [weights, setWeights] = useState(null)
  const [saved, setSaved] = useState(false)

  // Sync local weight state when audit changes
  useEffect(() => {
    if (auditId) {
      setWeights({ ...getAuditWeights(auditId) })
      setSaved(false)
    }
  }, [auditId, opened])

  if (!audit || !weights) return null

  const weightTotal = Object.values(weights).reduce((a, b) => a + b, 0)
  const isActive = activeAuditId === auditId

  const handleApply = () => {
    const finalWeights = weightTotal !== 100 ? normalizeWeights(weights) : weights
    setAuditWeights(auditId, finalWeights)
    setWeights(finalWeights)
    setSaved(true)
  }

  const auditDate = new Date(audit.auditedAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconAdjustments size={18} />
          <Text fw={600} size="lg">Edit Audit Settings</Text>
        </Group>
      }
      size="md"
      centered
    >
      <Stack gap="md">
        {/* Audit summary */}
        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb="xs">
            <Group gap="xs">
              <IconMapPin size={14} style={{ color: 'var(--mantine-color-dimmed)' }} />
              <Text size="sm" fw={600}>{audit.label}</Text>
            </Group>
            <Badge size="xs" variant="light" color={audit.source === 'custom' ? 'violet' : 'blue'}>
              {audit.source === 'custom' ? 'Custom' : 'Pre-loaded'}
            </Badge>
          </Group>
          <SimpleGrid cols={3} spacing="xs">
            {[
              ['Audited', auditDate],
              ['Buildings', (audit.building_count ?? '—').toLocaleString()],
              ['Min Roof', `${((audit.minRoofSqft ?? 100000) / 1000).toFixed(0)}k sqft`],
            ].map(([label, value]) => (
              <div key={label}>
                <Text size="xs" c="dimmed" tt="uppercase" lts={0.5} fw={500}>{label}</Text>
                <Text size="sm" fw={600}>{value}</Text>
              </div>
            ))}
          </SimpleGrid>
        </Paper>

        {isActive && !saved && (
          <Alert color="blue" variant="light" icon={<IconBuilding size={14} />}>
            This audit is currently open. Applying new weights will rescore all buildings on the map immediately.
          </Alert>
        )}

        {saved && (
          <Alert color="green" variant="light" icon={<IconCheck size={14} />}>
            Weights applied{isActive ? ' — map rescored.' : '.'}
          </Alert>
        )}

        <div>
          <Text size="sm" fw={600} mb="sm">Score Heuristics</Text>
          <WeightSliders weights={weights} onChange={(w) => { setWeights(w); setSaved(false) }} />
        </div>

        <Divider />

        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            {saved ? 'Close' : 'Cancel'}
          </Button>
          <Button
            leftSection={<IconCheck size={14} />}
            onClick={handleApply}
            disabled={saved}
            color={saved ? 'green' : 'blue'}
          >
            {saved ? 'Applied' : 'Apply & Rescore'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
