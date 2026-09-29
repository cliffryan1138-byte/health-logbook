import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import SetPassword from './pages/SetPassword'

function Gate() {
  const { session, profile, recovery } = useAuth()
  if (session === undefined || (session && profile === undefined)) {
    return <div className="authpage"><div className="empty">Loading…</div></div>
  }
  if (!session) return <Login />
  if (recovery) return <SetPassword />
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
