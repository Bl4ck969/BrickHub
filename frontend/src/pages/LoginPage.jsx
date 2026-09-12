import { useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { AuthShell, AuthFeld, AuthFehler, authInput } from '../components/AuthShell'

export function LoginPage() {
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const userData = await login(form.username, form.password)
      if (userData.must_change_password) {
        navigate('/change-password')
      } else {
        navigate('/sets')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Login fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell titel="BrickHub" untertitel="Klemmbausteinset-Inventar">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthFeld id="lg-user" label="Benutzername">
          <input
            id="lg-user"
            type="text"
            className={authInput}
            value={form.username}
            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            required
            autoFocus
            autoComplete="username"
          />
        </AuthFeld>
        <AuthFeld id="lg-pass" label="Passwort">
          <input
            id="lg-pass"
            type="password"
            className={authInput}
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            required
            autoComplete="current-password"
          />
        </AuthFeld>

        <AuthFehler>{error}</AuthFehler>

        <button type="submit" className="btn-yellow w-full py-2.5 text-[14px]" disabled={loading}>
          {loading ? 'Anmelden…' : 'Anmelden'}
        </button>
      </form>

      <div className="text-center text-[12.5px] text-[#93a6c0]">
        <Link
          to="/forgot-password"
          className="border-b border-[rgb(200_214_232/0.3)] text-[#c8d6e8] no-underline hover:border-gold hover:text-gold"
        >
          Passwort vergessen?
        </Link>
      </div>
    </AuthShell>
  )
}
