import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import MainDashboard from './components/MainDashboard'
import SettingsWindow from './pages/SettingsWindow'
import AlertDetail from './pages/AlertDetail'
import OnboardingFlow from './pages/Onboarding'
import StatisticsView from './pages/Statistics'
import InAppAlertOverlay from './components/InAppAlertOverlay'

export default function App() {
  return (
    <HashRouter>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div id="main-content" tabIndex={-1}>
        <InAppAlertOverlay />
        <Routes>
          <Route path="/" element={<MainDashboard />} />
          <Route path="/dashboard" element={<MainDashboard />} />
          <Route path="/settings" element={<SettingsWindow />} />
          <Route path="/alerts/:id" element={<AlertDetail />} />
          <Route path="/onboarding" element={<OnboardingFlow />} />
          <Route path="/statistics" element={<StatisticsView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </HashRouter>
  )
}
