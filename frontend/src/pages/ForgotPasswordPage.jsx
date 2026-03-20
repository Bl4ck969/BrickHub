import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { authApi } from '../api/client'

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [username, setUsername] = useState('')
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleStep1 = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.forgotPasswordGetQuestions({ username })
      setQuestions(res.data.questions)
      const initialAnswers = {}
      res.data.questions.forEach(q => { initialAnswers[q.id] = '' })
      setAnswers(initialAnswers)
      setStep(2)
    } catch (err) {
      setError(err.response?.data?.detail || 'Anfrage fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  const handleStep2 = async (e) => {
    e.preventDefault()
    setError('')

    if (newPassword !== newPasswordConfirm) {
      setError('Passwörter stimmen nicht überein')
      return
    }

    const answersArray = questions.map(q => ({ question_id: q.id, answer: answers[q.id] || '' }))

    setLoading(true)
    try {
      await authApi.forgotPasswordReset({
        username,
        answers: answersArray,
        new_password: newPassword,
        new_password_confirm: newPasswordConfirm,
      })
      navigate('/login', { state: { message: 'Passwort erfolgreich zurückgesetzt. Bitte anmelden.' } })
    } catch (err) {
      setError(err.response?.data?.detail || 'Fehler beim Zurücksetzen des Passworts')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-navy to-brand-navy-light flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-brand-navy">Passwort vergessen</h1>
          <p className="text-gray-500 text-sm mt-1">
            {step === 1 ? 'Benutzername eingeben' : 'Sicherheitsfragen beantworten'}
          </p>
        </div>

        {step === 1 ? (
          <form onSubmit={handleStep1} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Benutzername</label>
              <input
                type="text"
                className="input-field"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
            <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
              {loading ? 'Suche...' : 'Weiter'}
            </button>
            <div className="text-center">
              <Link to="/login" className="text-sm text-brand-navy hover:underline">Zurück zur Anmeldung</Link>
            </div>
          </form>
        ) : (
          <form onSubmit={handleStep2} className="space-y-4">
            {questions.map(q => (
              <div key={q.id} className="bg-gray-50 rounded-xl p-4 space-y-2">
                <p className="text-sm font-medium text-gray-700">{q.question}</p>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ihre Antwort..."
                  value={answers[q.id] || ''}
                  onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                  required
                />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Neues Passwort</label>
              <input
                type="password"
                className="input-field"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
              <p className="text-xs text-gray-500 mt-1">Mindestens 8 Zeichen, Buchstaben und Zahlen</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Passwort wiederholen</label>
              <input
                type="password"
                className="input-field"
                value={newPasswordConfirm}
                onChange={e => setNewPasswordConfirm(e.target.value)}
                required
              />
            </div>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
            <div className="flex gap-3">
              <button type="button" className="btn-secondary flex-1" onClick={() => setStep(1)}>Zurück</button>
              <button type="submit" className="btn-primary flex-1 py-3" disabled={loading}>
                {loading ? 'Speichere...' : 'Passwort speichern'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
