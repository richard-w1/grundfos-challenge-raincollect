import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useStore } from './store'
import Dashboard from './pages/Dashboard'
import AuditDetail from './pages/AuditDetail'
import Permits from './pages/Permits'
import Saved from './pages/Saved'

export default function App() {
  const setAudits = useStore((s) => s.setAudits)
  const setCoolingTowersData = useStore((s) => s.setCoolingTowersData)

  useEffect(() => {
    // Load pre-audited city metadata
    fetch('/data/audit_manifest.json')
      .then((r) => r.json())
      .then((data) => setAudits(data.audits))
      .catch((err) => console.error('Failed to load audit manifest:', err))

    // Load TowerScout cooling tower detections (all cities in one file)
    fetch('/data/cooling_towers.json')
      .then((r) => r.json())
      .then((data) => {
        const { _meta, ...cities } = data
        const summary = Object.fromEntries(
          Object.entries(cities).map(([city, towers]) => [city, towers.length])
        )
        console.group('[TowerScout] cooling_towers.json loaded')
        console.log('Meta:', _meta)
        console.log('Cities:', summary)
        console.log('Total raw detections:', Object.values(cities).reduce((n, a) => n + a.length, 0))
        if (_meta?.conf_threshold !== undefined) {
          console.log('Server-side conf threshold used during export:', _meta.conf_threshold)
        }
        console.groupEnd()
        setCoolingTowersData(cities)
      })
      .catch((err) => console.warn('[TowerScout] cooling_towers.json not available — no tower data loaded:', err))
  }, [setAudits, setCoolingTowersData])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/audit/:regionId" element={<AuditDetail />} />
        <Route path="/permits" element={<Permits />} />
        <Route path="/saved" element={<Saved />} />
      </Routes>
    </BrowserRouter>
  )
}
