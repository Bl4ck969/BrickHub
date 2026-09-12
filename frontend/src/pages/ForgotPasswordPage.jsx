import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { authApi } from '../api/client'
import { AuthShell, AuthFeld, AuthFehler, authInput } from '../components/AuthShell'

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
    <AuthShell
      titel="Passwort vergessen"
      untertitel={step === 1 ? 'Benutzername eingeben' : 'Sicherheitsfragen beantworten'}
    >
      {step === 1 ? (
        <form onSubmit={handleStep1} className="flex flex-col gap-4">
          <AuthFeld id="fp-user" label="Benutzername">
            <input
              id="fp-user"
              type="text"
              className={authInput}
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
            />
          </AuthFeld>
          <AuthFehler>{error}</AuthFehler>
          <button type="submit" className="btn-yellow w-full py-2.5 text-[14px]" disabled={loading}>
            {loading ? 'Suche…' : 'Weiter'}
          </button>
          <div className="text-center text-[12.5px]">
            <Link
              to="/login"
              className="border-b border-[rgb(200_214_232/0.3)] text-[#c8d6e8] no-underline hover:border-gold hover:text-gold"
            >
              Zurück zur Anmeldung
            </Link>
          </div>
        </form>
      ) : (
        <form onSubmit={handleStep2} className="flex flex-col gap-4">
          {questions.map(q => (
            <div key={q.id} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-[#0a1220]/30 p-3.5">
              <p className="text-[13px] font-medium text-[#c8d6e8]">{q.question}</p>
              <input
                type="text"
                className={authInput}
                placeholder="Ihre Antwort…"
                value={answers[q.id] || ''}
                onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                required
              />
            </div>
          ))}
          <AuthFeld id="fp-neu" label="Neues Passwort">
            <input
              id="fp-neu"
              type="password"
              className={authInput}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
            <p className="text-[11px] text-[#93a6c0]">Mindestens 8 Zeichen, Buchstaben und Zahlen</p>
          </AuthFeld>
          <AuthFeld id="fp-neu2" label="Passwort wiederholen">
            <input
              id="fp-neu2"
              type="password"
              className={authInput}
              value={newPasswordConfirm}
              onChange={e => setNewPasswordConfirm(e.target.value)}
              required
            />
          </AuthFeld>
          <AuthFehler>{error}</AuthFehler>
          <div className="flex gap-3">
            <button
              type="button"
              className="flex-1 rounded-lg border border-white/16 py-2.5 text-sm font-medium text-[#c8d6e8]
                transition-colors hover:bg-white/6"
              onClick={() => setStep(1)}
            >
              Zurück
            </button>
            <button type="submit" className="btn-yellow flex-1 py-2.5" disabled={loading}>
              {loading ? 'Speichere…' : 'Passwort speichern'}
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  )
}
