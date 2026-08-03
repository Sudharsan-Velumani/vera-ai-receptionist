import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import Shell from './components/Shell'

// The landing page pulls in three.js. Lazy-loading it keeps ~600kB of WebGL
// out of the bundle every signed-in user downloads on every visit.
const Landing = lazy(() => import('./pages/Landing'))
import Login from './pages/Login'
import Signup from './pages/Signup'
import Overview from './pages/Overview'
import LiveCall from './pages/LiveCall'
import CallLogs from './pages/CallLogs'
import CallDetail from './pages/CallDetail'
import Appointments from './pages/Appointments'
import Preferences from './pages/Preferences'
import Billing from './pages/Billing'

function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="boot">
        <div className="spinner" />
      </div>
    )
  }
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route
        path="/"
        element={
          user ? (
            <Navigate to="/app" replace />
          ) : (
            <Suspense fallback={<div className="boot"><div className="spinner" /></div>}>
              <Landing />
            </Suspense>
          )
        }
      />
      <Route path="/login" element={user ? <Navigate to="/app" replace /> : <Login />} />
      <Route path="/signup" element={user ? <Navigate to="/app" replace /> : <Signup />} />

      <Route path="/app" element={<Protected><Shell /></Protected>}>
        <Route index element={<Overview />} />
        <Route path="call" element={<LiveCall />} />
        <Route path="calls" element={<CallLogs />} />
        <Route path="calls/:id" element={<CallDetail />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="preferences" element={<Preferences />} />
        <Route path="billing" element={<Billing />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
