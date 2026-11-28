import { useState, useEffect } from 'react'
import { usersApi } from '../api/client'
import { fehlerText } from '../lib/fehler'
import { useAuth } from '../hooks/useAuth'
import { PlusIcon, TrashIcon, KeyIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/outline'
import { PasswortDialog } from '../components/PasswortDialog'
import { PageShell, Ladet } from '../components/PageShell'
import { Modal, ConfirmModal } from '../components/Modal'
import { useToast } from '../hooks/useToast'

const EMPTY_USER = { username: '', initial_password: '', role: 'user' }

export function UsersPage() {
  const { user: currentUser, isAdmin } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(isAdmin)
  const [pwDialog, setPwDialog] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(EMPTY_USER)
  const [deleteId, setDeleteId] = useState(null)
  const [resetId, setResetId] = useState(null)
  const [newInitialPw, setNewInitialPw] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const fetch = async () => {
    // Nicht-Admins sehen nur „Mein Konto“ - die Liste darf nur ein Admin abrufen
    if (!isAdmin) return
    try { const res = await usersApi.list(); setUsers(res.data) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetch() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await usersApi.create(form)
      setShowCreate(false)
      setForm(EMPTY_USER)
      fetch()
    } catch (err) {
      setError(fehlerText(err, 'Fehler'))
    } finally {
      setSaving(false)
    }
  }

  const handleRoleToggle = async (user) => {
    try {
      await usersApi.updateRole(user.id, { role: user.role === 'admin' ? 'user' : 'admin' })
      fetch()
    } catch (err) {
      toast(fehlerText(err, 'Fehler'), 'error')
    }
  }

  const handleDelete = async (id) => {
    try { await usersApi.delete(id); fetch() }
    catch (err) { toast(fehlerText(err, 'Fehler'), 'error') }
  }

  const handleResetPassword = async () => {
    if (!newInitialPw) { toast('Passwort eingeben', 'warning'); return }
    try {
      await usersApi.resetPassword(resetId, { new_password: newInitialPw })
      setResetId(null)
      setNewInitialPw('')
      toast('Initialpasswort gesetzt. Benutzer muss es bei nächster Anmeldung ändern.', 'success')
    } catch (err) {
      toast(fehlerText(err, 'Fehler'), 'error')
    }
  }

  const initialen = (currentUser?.username || '?').slice(0, 2).toUpperCase()

  return (
    <PageShell
      titel="Benutzer"
      untertitel={isAdmin
        ? <><b className="font-semibold text-ink-2">{users.length}</b> {users.length === 1 ? 'Konto' : 'Konten'} · eigenes Passwort</>
        : 'Eigenes Konto und Passwort'}
      aktionen={isAdmin && (
        <button onClick={() => { setShowCreate(true); setForm(EMPTY_USER); setError('') }} className="btn-yellow">
          <PlusIcon className="h-4 w-4 stroke-[2.2]" /> Benutzer anlegen
        </button>
      )}
    >

      {/* Mein Konto: hier wohnt seit Ende November 2026 „Passwort ändern“
          (vorher unten in der Seitenleiste) */}
      <section className="card mx-auto mb-4 max-w-4xl" aria-labelledby="mein-konto">
        <h2 id="mein-konto" className="mb-3 font-display text-[15px] font-bold">Mein Konto</h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gold-soft font-display text-[13px] font-bold text-heading">
            {initialen}
          </span>
          <div className="mr-auto min-w-0">
            <div className="font-semibold">{currentUser?.username}</div>
            <div className="text-xs text-ink-3">{isAdmin ? 'Administrator' : 'Benutzer'}</div>
          </div>
          <button type="button" className="btn-secondary" onClick={() => setPwDialog(true)}>
            <KeyIcon className="h-4 w-4" /> Passwort ändern
          </button>
        </div>
      </section>

      {!isAdmin ? null : loading ? (
        <Ladet />
      ) : (
        <div className="panel mx-auto max-w-4xl">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Benutzername</th>
                <th className="table-th">Rolle</th>
                <th className="table-th">Erstellt</th>
                <th className="table-th">PW ändern erforderlich</th>
                <th className="table-th">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map(user => (
                <tr key={user.id} className="table-row">
                  <td className="table-td font-medium">
                    {user.username}
                    {user.id === currentUser?.id && <span className="ml-2 text-xs bg-brand-yellow text-[#16243b] px-1.5 py-0.5 rounded-sm">Ich</span>}
                  </td>
                  <td className="table-td">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${user.role === 'admin' ? 'bg-brand-navy text-white' : 'bg-surface-3 text-ink-2'}`}>
                      {user.role === 'admin' ? 'Administrator' : 'Benutzer'}
                    </span>
                  </td>
                  <td className="table-td">{new Date(user.created_at).toLocaleDateString('de-DE')}</td>
                  <td className="table-td">
                    <span className={`text-xs ${user.must_change_password ? 'text-st-build' : 'text-st-done'}`}>
                      {user.must_change_password ? 'Ja' : 'Nein'}
                    </span>
                  </td>
                  <td className="table-td">
                    <div className="flex items-center gap-1">
                      {user.id !== currentUser?.id && (
                        <>
                          <button
                            onClick={() => handleRoleToggle(user)}
                            className="p-1.5 text-ink-3 hover:text-heading hover:bg-surface-2 rounded-lg transition"
                            title={user.role === 'admin' ? 'Zu Benutzer herabstufen' : 'Zu Admin befördern'}
                          >
                            <ArrowsRightLeftIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { setResetId(user.id); setNewInitialPw('') }}
                            className="p-1.5 text-ink-3 hover:text-st-build hover:bg-st-build-bg rounded-lg transition"
                            title="Initialpasswort setzen"
                          >
                            <KeyIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteId(user.id)}
                            className="p-1.5 text-ink-3 hover:text-crit hover:bg-crit-bg rounded-lg transition"
                            title="Benutzer löschen"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create User Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Neuen Benutzer anlegen">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-2 mb-1">Benutzername *</label>
            <input type="text" className="input-field" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required minLength={3} />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-2 mb-1">Initialpasswort *</label>
            <input type="password" className="input-field" value={form.initial_password} onChange={e => setForm(f => ({ ...f, initial_password: e.target.value }))} required minLength={8} />
            <p className="text-xs text-ink-3 mt-1">Mindestens 8 Zeichen, Buchstaben und Zahlen. Benutzer muss es bei erster Anmeldung ändern.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-2 mb-1">Rolle</label>
            <select className="input-field" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="user">Benutzer (Leserechte)</option>
              <option value="admin">Administrator (alle Rechte)</option>
            </select>
          </div>
          {error && <div className="bg-crit-bg border border-crit/30 text-crit rounded-lg px-4 py-3 text-sm">{error}</div>}
          <div className="flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Abbrechen</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Erstelle...' : 'Benutzer anlegen'}</button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={!!resetId} onClose={() => setResetId(null)} title="Initialpasswort setzen" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-ink-2">Neues Initialpasswort setzen. Der Benutzer muss es bei der nächsten Anmeldung ändern.</p>
          <input type="password" className="input-field" placeholder="Neues Passwort..." value={newInitialPw} onChange={e => setNewInitialPw(e.target.value)} minLength={8} />
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setResetId(null)}>Abbrechen</button>
            <button className="btn-primary" onClick={handleResetPassword}>Setzen</button>
          </div>
        </div>
      </Modal>

      <PasswortDialog
        open={pwDialog}
        onClose={() => setPwDialog(false)}
        onGespeichert={() => {
          setPwDialog(false)
          toast('Passwort geändert. Andere Geräte sind abgemeldet.', 'success')
        }}
      />

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => handleDelete(deleteId)}
        title="Benutzer löschen"
        message="Soll dieser Benutzer wirklich gelöscht werden?"
      />
    </PageShell>
  )
}
