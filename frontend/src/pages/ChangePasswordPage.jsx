import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { authApi } from '../api/client'
import { AuthShell, AuthFehler, authInput } from '../components/AuthShell'

const EMPTY_Q = { question: '', answer: '' }

export function ChangePasswordPage() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    current_password: '',
    new_password: '',
    new_password_confirm: '',
  })
  const [questions, setQuestions] = useState([EMPTY_Q, EMPTY_Q, EMPTY_Q])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const isForcedChange = user?.must_change_password

  const updateQuestion = (idx, field, value) => {
    setQuestions(qs => {
      const arr = [...qs]
      arr[idx] = { ...arr[idx], [field]: value }
      return arr
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (form.new_password !== form.new_password_confirm) {
      setError('Neue Passwörter stimmen nicht überein')
      return
    }

    const emptyQ = questions.find(q => !q.question.trim() || !q.answer.trim())
    if (emptyQ) {
      setError('Alle 3 Sicherheitsfragen müssen ausgefüllt sein')
      return
    }

    setLoading(true)
    try {
      await authApi.changePassword({
        current_password: isForcedChange ? undefined : form.current_password,
        new_password: form.new_password,
        new_password_confirm: form.new_password_confirm,
        security_questions: questions,
      })
      await refreshUser()
      navigate('/sets')
    } catch (err) {
      setError(err.response?.data?.detail || 'Fehler beim Ändern des Passworts')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell titel={isForcedChange ? 'Passwort festlegen' : 'Passwort ändern'} breit>
      {isForcedChange && (
        <p className="rounded-[10px] border border-[rgb(251_146_60/0.35)] bg-[rgb(230_110_30/0.18)] px-3.5 py-2.5 text-[13px] text-[#fbbf7c]">
          Bitte legen Sie ein neues Passwort und Sicherheitsfragen fest.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {!isForcedChange && (
            <div>
              <label className="mb-1.5 block text-[11.5px] font-semibold tracking-[0.04em] text-[#93a6c0] uppercase">Aktuelles Passwort</label>
              <input
                type="password"
                className={authInput}
                value={form.current_password}
                onChange={e => setForm(f => ({ ...f, current_password: e.target.value }))}
                required={!isForcedChange}
              />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-[11.5px] font-semibold tracking-[0.04em] text-[#93a6c0] uppercase">Neues Passwort</label>
            <input
              type="password"
              className={authInput}
              value={form.new_password}
              onChange={e => setForm(f => ({ ...f, new_password: e.target.value }))}
              required
              minLength={8}
            />
            <p className="mt-1 text-[11px] text-[#93a6c0]">Mindestens 8 Zeichen, Buchstaben und Zahlen</p>
          </div>
          <div>
            <label className="mb-1.5 block text-[11.5px] font-semibold tracking-[0.04em] text-[#93a6c0] uppercase">Neues Passwort wiederholen</label>
            <input
              type="password"
              className={authInput}
              value={form.new_password_confirm}
              onChange={e => setForm(f => ({ ...f, new_password_confirm: e.target.value }))}
              required
            />
          </div>

          <div className="border-t border-white/12 pt-4">
            <p className="mb-3 text-[13px] font-semibold text-[#c8d6e8]">3 Sicherheitsfragen festlegen</p>
            {questions.map((q, idx) => (
              <div key={idx} className="mb-3 flex flex-col gap-2 rounded-xl border border-white/10 bg-[#0a1220]/30 p-3.5">
                <p className="text-[11px] font-semibold tracking-wider text-[#93a6c0] uppercase">Frage {idx + 1}</p>
                <input
                  type="text"
                  className={authInput}
                  placeholder="Ihre Sicherheitsfrage..."
                  value={q.question}
                  onChange={e => updateQuestion(idx, 'question', e.target.value)}
                  required
                />
                <input
                  type="text"
                  className={authInput}
                  placeholder="Ihre Antwort..."
                  value={q.answer}
                  onChange={e => updateQuestion(idx, 'answer', e.target.value)}
                  required
                />
              </div>
            ))}
          </div>

          <AuthFehler>{error}</AuthFehler>

          <button type="submit" className="btn-yellow w-full py-2.5" disabled={loading}>
            {loading ? 'Speichere...' : 'Passwort speichern'}
          </button>
      </form>
    </AuthShell>
  )
}
