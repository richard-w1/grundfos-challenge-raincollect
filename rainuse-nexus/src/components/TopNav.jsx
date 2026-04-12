import { Group, Text, UnstyledButton } from '@mantine/core'
import { IconMap, IconStar, IconFileDescription } from '@tabler/icons-react'
import { useLocation, useNavigate } from 'react-router-dom'

export default function TopNav({ children }) {
  const navigate = useNavigate()
  const location = useLocation()

  const tabs = [
    { label: 'Audits', path: '/', icon: IconMap },
    { label: 'Permits', path: '/permits', icon: IconFileDescription },
    { label: 'Saved', path: '/saved', icon: IconStar },
  ]

  return (
    <Group h="100%" px="xl" justify="space-between">
      <Group gap="lg">
        <Group gap="xs" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
          <img
            src="/logo.png"
            alt="RainCollect"
            height={40}
            width={40}
            style={{ display: 'block', objectFit: 'contain' }}
          />
          <div>
            <Text span fw={700} size="lg" c="blue">RainCollect</Text>
          </div>
        </Group>

        <Group gap="sm">
          {tabs.map((tab) => {
            const active = location.pathname === tab.path || (tab.path === '/' && location.pathname.startsWith('/audit'))
            const Icon = tab.icon
            return (
              <UnstyledButton
                key={tab.path}
                onClick={() => navigate(tab.path)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: active ? 'var(--mantine-primary-color-light)' : 'transparent',
                  color: active ? 'var(--mantine-primary-color-filled)' : 'var(--mantine-color-text)',
                  fontWeight: active ? 600 : 500,
                }}
              >
                <Icon size={18} />
                {tab.label}
              </UnstyledButton>
            )
          })}
        </Group>
      </Group>
      {children && <Group>{children}</Group>}
    </Group>
  )
}
