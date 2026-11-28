import { useState } from 'react'
import { authApi } from '../api/client'
import { fehlerText } from '../lib/fehler'
import { Modal } from './Modal'

const LEERE_FRAGEN = [
  { question: '', answer: '' },
  { question: '', answer: '' },
  { question: '', answer: '' },
]

/** Eigenes Passwort aendern, aus „Benutzer → Mein Konto“. Die Sicherheitsfragen
 *  lassen sich dabei neu festlegen; der Server nimmt sie nur zusammen mit einem
 *  neuen Passwort an. Der Pflichtwechsel nach einem Reset bleibt auf der eigenen
 *  Seite /change-password. Alle anderen Geraete werden dabei abgemeldet. */
export function PasswortDialog({ open, onClose, onGespeichert }) {
  const [form, setForm] = useState({ current_password: '', new_password: '', new_password_confirm: '' })
  const [mitFragen, setMitFragen] = useState(false)
  const [fragen, setFragen] = useState(LEERE_FRAGEN)
  const [fehler, setFehler] = useState('')
  const [speichert, setSpeichert] = useState(false)

  const zuruecksetzen = () => {
    setForm({ current_password: '', new_password: '', new_password_confirm: '' })
    setMitFragen(false)
    setFragen(LEERE_FRAGEN)
    setFehler('')
  }

  const schliessen = () => {
    zuruecksetzen()
    onClose()
  }

  const frageSetzen = (i, feld, wert) =>
    setFragen(alt => alt.map((f, j) => (j === i ? { ...f, [feld]: wert } : f)))

  const absenden = async (e) => {
    e.preventDefault()
    setFehler('')
    if (form.new_password !== form.new_password_confirm) {
      setFehler('Neue Passwörter stimmen nicht überein')
      return
    }
    if (mitFragen && fragen.some(f => !f.question.trim() || !f.answer.trim())) {
      setFehler('Alle 3 Sicherheitsfragen müssen ausgefüllt sein')
      return
    }
    setSpeichert(true)
    try {
      await authApi.changePassword({ ...form, ...(mitFragen ? { security_questions: fragen } : {}) })
      zuruecksetzen()
      onGespeichert?.()
    } catch (err) {
      setFehler(fehlerText(err, 'Fehler beim Ändern des Passworts'))
    } finally {
      setSpeichert(false)
    }
  }

  const feld = (schluessel, label, autocomplete, hinweis) => (
    <div>
      <label htmlFor={`pw-${schluessel}`} className="mb-1 block text-sm font-medium text-ink-2">{label}</label>
      <input
        id={`pw-${schluessel}`}
        type="password"
        className="input-field"
        autoComplete={autocomplete}
        value={form[schluessel]}
        onChange={e => setForm(f => ({ ...f, [schluessel]: e.target.value }))}
        required
        minLength={schluessel === 'current_password' ? undefined : 8}
      />
      {hinweis && <p className="mt-1 text-xs text-ink-3">{hinweis}</p>}
    </div>
  )

  return (
    <Modal open={open} onClose={schliessen} title="Passwort ändern">
      <form onSubmit={absenden} className="space-y-4">
        {feld('current_password', 'Aktuelles Passwort', 'current-password')}
        {feld('new_password', 'Neues Passwort', 'new-password', 'Mindestens 8 Zeichen, Groß- und Kleinbuchstaben und eine Zahl')}
        {feld('new_password_confirm', 'Neues Passwort wiederholen', 'new-password')}

        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={mitFragen} onChange={e => setMitFragen(e.target.checked)} className="accent-gold" />
          Sicherheitsfragen auch neu festlegen
        </label>
        {mitFragen && (
          <div className="space-y-3">
            {fragen.map((f, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-line bg-surface-2 p-3">
                <p className="text-[11px] font-semibold tracking-wider text-ink-3 uppercase">Frage {i + 1}</p>
                <input type="text" className="input-field" placeholder="Sicherheitsfrage…" aria-label={`Sicherheitsfrage ${i + 1}`}
                  value={f.question} onChange={e => frageSetzen(i, 'question', e.target.value)} />
                <input type="text" className="input-field" placeholder="Antwort…" aria-label={`Antwort ${i + 1}`}
                  value={f.answer} onChange={e => frageSetzen(i, 'answer', e.target.value)} />
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-ink-3">Andere Geräte werden danach abgemeldet, dieses bleibt angemeldet.</p>
        {fehler && <div role="alert" className="rounded-lg border border-crit/30 bg-crit-bg px-4 py-3 text-sm text-crit">{fehler}</div>}
        <div className="flex justify-end gap-3">
          <button type="button" className="btn-secondary" onClick={schliessen}>Abbrechen</button>
          <button type="submit" className="btn-primary" disabled={speichert}>{speichert ? 'Speichere…' : 'Passwort speichern'}</button>
        </div>
      </form>
    </Modal>
  )
}
