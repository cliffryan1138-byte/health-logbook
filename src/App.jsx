import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'

function Gate() {
  const { session, profile } = useAuth()
  if (session === undefined || (session && profile === undefined)) {
    return <div className="authpage"><div className="empty">Loading…</div></div>
  }
  if (!session) return <Login />
  if (!profile) return <Onboarding />
  return <Dashboard />
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
