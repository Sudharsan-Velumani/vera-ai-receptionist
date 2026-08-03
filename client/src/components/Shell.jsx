import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { Grid, Phone, List, Calendar, Sliders, Card, Logout, Menu } from './Icons'

const LINKS = [
  { to: '/app', end: true, label: 'Overview', Icon: Grid },
  { to: '/app/call', label: 'Live call', Icon: Phone },
  { to: '/app/calls', label: 'Call log', Icon: List },
  { to: '/app/appointments', label: 'Appointments', Icon: Calendar },
]
const SETTINGS = [
  { to: '/app/preferences', label: 'Voice & business', Icon: Sliders },
  { to: '/app/billing', label: 'Credits', Icon: Card },
]

export default function Shell() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const onCallScreen = location.pathname === '/app/call'

  // Close the drawer on navigation, and lock the page behind it while open.
  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const close = () => setOpen(false)
  const credits = user?.credits ?? 0

  return (
    <div className={`shell ${open ? 'open' : ''}`}>
      {open && <div className="scrim" onClick={close} />}

      <aside className="side">
        <div className="brand">
          <span className="brand__mark">V</span>
          Vera
        </div>

        <nav className="nav">
          {LINKS.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={close}>
              <Icon width={17} height={17} />
              {label}
            </NavLink>
          ))}

          <div className="nav__label" style={{ marginTop: 18 }}>Settings</div>
          {SETTINGS.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} onClick={close}>
              <Icon width={17} height={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="side__foot">
          <div className="credits">
            <span className="small dim">Credits remaining</span>
            <b>{credits}</b>
            <div className="meter">
              <i style={{ width: `${Math.min(100, (credits / 500) * 100)}%` }} />
            </div>
            {credits < 10 && (
              <button
                className="btn btn--sm btn--block"
                style={{ marginTop: 12 }}
                onClick={() => { close(); navigate('/app/billing') }}
              >
                Top up
              </button>
            )}
          </div>

          <button
            className="btn btn--ghost btn--sm btn--block"
            onClick={() => { logout(); navigate('/') }}
          >
            <Logout width={16} height={16} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="row">
            <button
              className="side-toggle"
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle navigation"
              aria-expanded={open}
            >
              <Menu width={18} height={18} />
            </button>
            <div>
              <div style={{ fontWeight: 600 }}>{user?.business_name || 'Your business'}</div>
              <div className="small dim">Signed in as {user?.name}</div>
            </div>
          </div>
          {/* The single primary action for the whole app. Hidden on the live
              call screen itself, where it would point at the current page. */}
          {!onCallScreen && (
            <button className="btn btn--sm" onClick={() => navigate('/app/call')}>
              <Phone width={16} height={16} />
              Take a call
            </button>
          )}
        </header>

        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
