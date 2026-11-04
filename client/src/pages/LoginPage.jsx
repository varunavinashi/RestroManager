import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { TOKEN_KEY, USER_KEY } from '../api/client'
import SqlPanel from '../components/SqlPanel'

const loginStaff = async (username, password) => {
  const res = await api.post('/auth/login', { username, password })
  return res.data.data
}

export default function LoginPage({ onLogin }) {
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!username.trim() || !password) {
      setError('Username and password are required.')
      return
    }

    try {
      setLoading(true)
      setError(null)
      const data = await loginStaff(username.trim(), password)
      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(USER_KEY, JSON.stringify(data.user))
      onLogin(data.token, data.user)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-6">
          <h1 className="text-2xl font-bold text-slate-800">Staff login</h1>
          <p className="mt-1 text-sm text-slate-600">Sign in to manage the restaurant.</p>

          <label className="mt-5 block text-sm font-medium text-slate-700">
            Username
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
          </label>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-5 w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600 disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <SqlPanel />
      </div>
    </div>
  )
}
