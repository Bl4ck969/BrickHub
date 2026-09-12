import { useState } from 'react'
import { useNavigate } from 'react-router'
import { authApi } from '../api/client'
import { AuthShell, AuthFehler, authInput } from '../components/AuthShell'

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
    <AuthShell titel="Willkommen bei BrickHub" untertitel="Erstanmeldung – Administrator anlegen" breit>
        <div className="flex">
          {['Zugangsdaten', 'Sicherheitsfragen'].map((label, i) => (
            <div key={i} className="flex-1 flex items-center">
              <div className={`flex items-center gap-2 ${i > 0 ? 'ml-2' : ''}`}>
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${step >= i + 1 ? 'bg-gold text-[#16243b]' : 'bg-white/10 text-[#93a6c0]'}`}>
                  {i + 1}
                </div>
                <span className={`text-sm font-medium ${step === i + 1 ? 'text-[#e7edf6]' : 'text-[#93a6c0]'}`}>{label}</span>
              </div>
              {i < 1 && <div className={`mx-2 h-0.5 flex-1 ${step > 1 ? 'bg-gold' : 'bg-white/12'}`} />}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[11.5px] font-semibold tracking-[0.04em] text-[#93a6c0] uppercase">Benutzername</label>
                <input
                  type="text"
                  className={authInput}
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  required
                  minLength={3}
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11.5px] font-semibold tracking-[0.04em] text-[#93a6c0] uppercase">Passwort</label>
                <input
                  type="password"
                  className={authInput}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required
                  minLength={8}
                />
                <p className="mt-1 text-[11px] text-[#93a6c0]">Mindestens 8 Zeichen, Buchstaben und Zahlen</p>
              </div>
              <div>
                <label className="mb-1.5 block text-[11.5px] font-semibold tracking-[0.04em] text-[#93a6c0] uppercase">Passwort wiederholen</label>
                <input
                  type="password"
                  className={authInput}
                  value={form.password_confirm}
                  onChange={e => setForm(f => ({ ...f, password_confirm: e.target.value }))}
                  required
                />
              </div>
              <AuthFehler>{error}</AuthFehler>
              <button
                type="button"
                className="btn-yellow w-full py-2.5"
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
              <p className="text-[13px] text-[#c8d6e8]">
                Legen Sie 3 Sicherheitsfragen fest. Diese werden benötigt, falls Sie Ihr Passwort vergessen.
              </p>
              {form.security_questions.map((sq, idx) => (
                <div key={idx} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-[#0a1220]/30 p-3.5">
                  <p className="text-[11px] font-semibold tracking-wider text-[#93a6c0] uppercase">Frage {idx + 1}</p>
                  <input
                    type="text"
                    className={authInput}
                    placeholder="Ihre Sicherheitsfrage..."
                    value={sq.question}
                    onChange={e => updateQuestion(idx, 'question', e.target.value)}
                    required
                  />
                  <input
                    type="text"
                    className={authInput}
                    placeholder="Ihre Antwort..."
                    value={sq.answer}
                    onChange={e => updateQuestion(idx, 'answer', e.target.value)}
                    required
                  />
                </div>
              ))}

              <AuthFehler>{error}</AuthFehler>

              <div className="flex gap-3">
                <button type="button" className="flex-1 rounded-lg border border-white/16 py-2.5 text-sm font-medium text-[#c8d6e8] transition-colors hover:bg-white/6" onClick={() => setStep(1)}>
                  Zurück
                </button>
                <button type="submit" className="btn-yellow flex-1 py-2.5" disabled={loading}>
                  {loading ? 'Erstelle...' : 'Administrator anlegen'}
                </button>
              </div>
            </div>
          )}
        </form>
    </AuthShell>
  )
}
