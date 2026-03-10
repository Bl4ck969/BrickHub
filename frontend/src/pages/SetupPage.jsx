import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api/client'

const EMPTY_QUESTION = { question: '', answer: '' }

export function SetupPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    username: '',
    password: '',
    password_confirm: '',
    security_questions: [
      { ...EMPTY_QUESTION },
      { ...EMPTY_QUESTION },
      { ...EMPTY_QUESTION },
    ],
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const updateQuestion = (idx, field, value) => {
    setForm(f => {
      const qs = [...f.security_questions]
      qs[idx] = { ...qs[idx], [field]: value }
      return { ...f, security_questions: qs }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (form.password !== form.password_confirm) {
      setError('Passwörter stimmen nicht überein')
      return
    }

    const emptyQ = form.security_questions.find(q => !q.question.trim() || !q.answer.trim())
    if (emptyQ) {
      setError('Alle 3 Sicherheitsfragen und Antworten müssen ausgefüllt sein')
      return
    }

    setLoading(true)
    try {
      await authApi.registerFirstAdmin({
        username: form.username,
        password: form.password,
        password_confirm: form.password_confirm,
        role: 'admin',
        security_questions: form.security_questions,
      })
      navigate('/login')
    } catch (err) {
      setError(err.response?.data?.detail || 'Fehler beim Anlegen des Administrators')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-navy to-brand-navy-light flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-brand-navy">Willkommen bei BrickHub</h1>
          <p className="text-gray-500 text-sm mt-1">Erstanmeldung – Administrator anlegen</p>
        </div>

        <div className="flex mb-8">
          {['Zugangsdaten', 'Sicherheitsfragen'].map((label, i) => (
            <div key={i} className="flex-1 flex items-center">
              <div className={`flex items-center gap-2 ${i > 0 ? 'ml-2' : ''}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${step > i ? 'bg-brand-navy text-white' : step === i + 1 ? 'bg-brand-yellow text-brand-navy' : 'bg-gray-200 text-gray-500'}`}>
                  {i + 1}
                </div>
                <span className={`text-sm font-medium ${step === i + 1 ? 'text-brand-navy' : 'text-gray-400'}`}>{label}</span>
              </div>
              {i < 1 && <div className={`flex-1 h-0.5 mx-2 ${step > 1 ? 'bg-brand-navy' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Benutzername</label>
                <input
                  type="text"
                  className="input-field"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  required
                  minLength={3}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Passwort</label>
                <input
                  type="password"
                  className="input-field"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
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
                  value={form.password_confirm}
                  onChange={e => setForm(f => ({ ...f, password_confirm: e.target.value }))}
                  required
                />
              </div>
              {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
              <button
                type="button"
                className="btn-primary w-full py-3"
                onClick={() => {
                  if (!form.username || !form.password || !form.password_confirm) {
                    setError('Alle Felder ausfüllen')
                    return
                  }
                  if (form.password !== form.password_confirm) {
                    setError('Passwörter stimmen nicht überein')
                    return
                  }
                  setError('')
                  setStep(2)
                }}
              >
                Weiter
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <p className="text-sm text-gray-600">
                Legen Sie 3 Sicherheitsfragen fest. Diese werden benötigt, falls Sie Ihr Passwort vergessen.
              </p>
              {form.security_questions.map((sq, idx) => (
                <div key={idx} className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-brand-navy uppercase tracking-wide">Frage {idx + 1}</p>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ihre Sicherheitsfrage..."
                    value={sq.question}
                    onChange={e => updateQuestion(idx, 'question', e.target.value)}
                    required
                  />
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ihre Antwort..."
                    value={sq.answer}
                    onChange={e => updateQuestion(idx, 'answer', e.target.value)}
                    required
                  />
                </div>
              ))}

              {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

              <div className="flex gap-3">
                <button type="button" className="btn-secondary flex-1" onClick={() => setStep(1)}>
                  Zurück
                </button>
                <button type="submit" className="btn-primary flex-1 py-3" disabled={loading}>
                  {loading ? 'Erstelle...' : 'Administrator anlegen'}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
