import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { authApi } from '../api/client'

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
    <div className="min-h-screen bg-gradient-to-br from-brand-navy to-brand-navy-light flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-brand-navy">
            {isForcedChange ? 'Passwort festlegen' : 'Passwort ändern'}
          </h1>
          {isForcedChange && (
            <p className="text-amber-600 text-sm mt-1 bg-amber-50 rounded-lg px-4 py-2 mt-3">
              Bitte legen Sie ein neues Passwort und Sicherheitsfragen fest.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isForcedChange && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Aktuelles Passwort</label>
              <input
                type="password"
                className="input-field"
                value={form.current_password}
                onChange={e => setForm(f => ({ ...f, current_password: e.target.value }))}
                required={!isForcedChange}
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Neues Passwort</label>
            <input
              type="password"
              className="input-field"
              value={form.new_password}
              onChange={e => setForm(f => ({ ...f, new_password: e.target.value }))}
              required
              minLength={8}
            />
            <p className="text-xs text-gray-500 mt-1">Mindestens 8 Zeichen, Buchstaben und Zahlen</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Neues Passwort wiederholen</label>
            <input
              type="password"
              className="input-field"
              value={form.new_password_confirm}
              onChange={e => setForm(f => ({ ...f, new_password_confirm: e.target.value }))}
              required
            />
          </div>

          <div className="border-t border-gray-200 pt-4">
            <p className="text-sm font-semibold text-brand-navy mb-3">3 Sicherheitsfragen festlegen</p>
            {questions.map((q, idx) => (
              <div key={idx} className="bg-gray-50 rounded-xl p-4 space-y-2 mb-3">
                <p className="text-xs font-semibold text-brand-navy uppercase tracking-wide">Frage {idx + 1}</p>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ihre Sicherheitsfrage..."
                  value={q.question}
                  onChange={e => updateQuestion(idx, 'question', e.target.value)}
                  required
                />
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ihre Antwort..."
                  value={q.answer}
                  onChange={e => updateQuestion(idx, 'answer', e.target.value)}
                  required
                />
              </div>
            ))}
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

          <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
            {loading ? 'Speichere...' : 'Passwort speichern'}
          </button>
        </form>
      </div>
    </div>
  )
}
