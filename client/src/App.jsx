import { useState } from 'react'
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { TOKEN_KEY, USER_KEY } from './api/client'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import MenuPage from './pages/MenuPage'
import TablesPage from './pages/TablesPage'
import OrdersPage from './pages/OrdersPage'
import NewOrderPage from './pages/NewOrderPage'
import ReportPage from './pages/ReportPage'
import QueryLabPage from './pages/QueryLabPage'
import SchemaPage from './pages/SchemaPage'
import InsightsPage from './pages/InsightsPage'

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/menu', label: 'Menu' },
  { to: '/tables', label: 'Tables' },
  { to: '/orders', label: 'Orders', end: true },
  { to: '/orders/new', label: 'New Order' },
  { to: '/reports', label: 'Reports' },
  { to: '/insights', label: 'Insights' },
  { to: '/query-lab', label: 'Query Lab' },
  { to: '/schema', label: 'Schema' },
]

const getStoredUser = () => {
  try {
    const stored = localStorage.getItem(USER_KEY)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

function canSeeLink(link, user) {
  if (link.to === '/orders/new') return user.role === 'waiter' || user.role === 'manager'
  if (link.to === '/reports') return user.role === 'manager'
  return true
}

function NavBar({ user, onLogout }) {
  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <span className="text-lg font-bold text-slate-800">RestroManager</span>

        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {NAV_LINKS.filter((link) => canSeeLink(link, user)).map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `rounded px-2 py-1 text-sm font-medium transition ${
                  isActive
                    ? 'bg-amber-500 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-slate-600">
            {user.name} ({user.role})
          </span>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Log out
          </button>
        </div>
      </div>
    </nav>
  )
}

function RequireAuth({ isAuthenticated, user, roles, children }) {
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

function App() {
  const navigate = useNavigate()

  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState(() => (localStorage.getItem(TOKEN_KEY) ? getStoredUser() : null))

  const isAuthenticated = Boolean(token && user)

  const handleLogin = (nextToken, nextUser) => {
    setToken(nextToken)
    setUser(nextUser)
  }

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {isAuthenticated && <NavBar user={user} onLogout={handleLogout} />}
      <main className="mx-auto max-w-6xl">
        <Routes>
          <Route
            path="/login"
            element={
              isAuthenticated ? <Navigate to="/" replace /> : <LoginPage onLogin={handleLogin} />
            }
          />
          <Route
            path="/"
            element={
              <RequireAuth isAuthenticated={isAuthenticated} user={user}>
                <HomePage />
              </RequireAuth>
            }
          />
          <Route
            path="/menu"
            element={
              <RequireAuth isAuthenticated={isAuthenticated} user={user}>
                <MenuPage />
              </RequireAuth>
            }
          />
          <Route
            path="/tables"
            element={
              <RequireAuth isAuthenticated={isAuthenticated} user={user}>
                <TablesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/orders"
            element={
              <RequireAuth isAuthenticated={isAuthenticated} user={user}>
                <OrdersPage />
              </RequireAuth>
            }
          />
          <Route
            path="/orders/new"
            element={
              <RequireAuth
                isAuthenticated={isAuthenticated}
                user={user}
                roles={['waiter', 'manager']}
              >
                <NewOrderPage />
              </RequireAuth>
            }
          />
          <Route
            path="/reports"
            element={
              <RequireAuth isAuthenticated={isAuthenticated} user={user} roles={['manager']}>
                <ReportPage />
              </RequireAuth>
            }
          />
          <Route
            path="/insights"
            element={
              <RequireAuth isAuthenticated={isAuthenticated} user={user}>
                <InsightsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/query-lab"
            element={
              <RequireAuth isAuthenticated={isAuthenticated} user={user}>
                <QueryLabPage />
              </RequireAuth>
            }
          />
          <Route
            path="/schema"
            element={
              <RequireAuth isAuthenticated={isAuthenticated} user={user}>
                <SchemaPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to={isAuthenticated ? '/' : '/login'} replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
