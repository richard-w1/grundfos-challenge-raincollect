/**
 * Pure controlled component — no store dependency.
 * Props:
 *   weights   { roof, precip, cost, esg, regulatory } — current values
 *   onChange  (weights) => void
 *   compact   boolean — condensed layout for sidebar
 */
import { Stack, Text, Slider, Group, Badge, Button, Divider, Tooltip } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'

export const DEFAULT_WEIGHTS = { roof: 30, precip: 25, cost: 20, esg: 15, regulatory: 10 }

export const WEIGHT_COMPONENTS = [
  {
    key: 'roof',
    label: 'Roof Area',
    color: 'blue',
    description: 'Larger catchment area → more annual volume. Scored on a log scale (100k sqft = baseline, 1M sqft = max).',
  },
  {
    key: 'precip',
    label: 'Precipitation',
    color: 'cyan',
    description: 'Annual average rainfall drives yield. Normalized across the US range of 8–62 inches/year.',
  },
  {
    key: 'cost',
    label: 'Water Cost',
    color: 'teal',
    description: 'Higher municipal water rates compress the ROI payback period. Normalized $3–$9/kgal.',
  },
  {
    key: 'esg',
    label: 'Water Demand',
    color: 'green',
    description: 'Building type proxy for occupant water intensity. Hospitals (85) and hotels (75) score highest; warehouses (35) lowest.',
  },
  {
    key: 'regulatory',
    label: 'Incentives',
    color: 'violet',
    description: 'State tax credits, stormwater fee reductions, and direct rebates that lower net system cost.',
  },
]

/**
 * Proportionally scale weights to sum to exactly 100.
 * Applies rounding correction to the largest component.
 */
export function normalizeWeights(weights) {
  const keys = Object.keys(weights)
  const total = keys.reduce((s, k) => s + (weights[k] || 0), 0)
  if (total === 0) return { ...DEFAULT_WEIGHTS }

  const sorted = [...keys].sort((a, b) => weights[b] - weights[a])
  const result = {}
  let remaining = 100

  sorted.forEach((k, i) => {
    if (i === sorted.length - 1) {
      result[k] = Math.max(0, remaining)
    } else {
      const share = Math.round((weights[k] / total) * 100)
      result[k] = share
      remaining -= share
    }
  })

  return result
}

export default function WeightSliders({ weights, onChange, compact = false }) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0)
  const isValid = total === 100
  const isClose = Math.abs(total - 100) <= 5

  const badgeColor = isValid ? 'green' : isClose ? 'yellow' : 'red'

  return (
    <Stack gap={compact ? 'xs' : 'md'}>
      <Group justify="space-between" align="center">
        <Text size="xs" c="dimmed">
          {compact ? 'Weights update scores live' : 'Weights must sum to 100% for accurate scoring'}
        </Text>
        <Group gap="xs">
          <Badge color={badgeColor} variant="light" size="sm">
            {total}%
          </Badge>
          {!isValid && (
            <Button
              size="xs"
              variant="light"
              color="gray"
              py={2}
              px={8}
              onClick={() => onChange(normalizeWeights(weights))}
            >
              Normalize
            </Button>
          )}
        </Group>
      </Group>

      {WEIGHT_COMPONENTS.map(({ key, label, color, description }) => (
        <div key={key}>
          <Group justify="space-between" mb={compact ? 2 : 4} align="center">
            <Group gap={4}>
              <Text size="xs" fw={500}>{label}</Text>
              {!compact && (
                <Tooltip label={description} withArrow multiline w={260} position="right">
                  <IconInfoCircle
                    size={13}
                    style={{ color: 'var(--mantine-color-dimmed)', cursor: 'help', flexShrink: 0 }}
                  />
                </Tooltip>
              )}
            </Group>
            <Text size="xs" c={color} fw={600}>{weights[key]}%</Text>
          </Group>
          <Slider
            min={0}
            max={60}
            step={5}
            value={weights[key]}
            onChange={(v) => onChange({ ...weights, [key]: v })}
            color={color}
            size="sm"
            mb={compact ? 0 : 4}
          />
        </div>
      ))}

      <Divider />

      <Button
        variant="subtle"
        size="xs"
        onClick={() => onChange({ ...DEFAULT_WEIGHTS })}
        fullWidth
      >
        Reset to defaults (30 / 25 / 20 / 15 / 10)
      </Button>
    </Stack>
  )
}
