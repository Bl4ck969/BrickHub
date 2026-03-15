import { useState, useEffect } from 'react'
import { usersApi } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { PlusIcon, TrashIcon, KeyIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/outline'
import { Modal, ConfirmModal } from '../components/Modal'
import { useToast } from '../hooks/useToast'

const EMPTY_USER = { username: '', initial_password: '', role: 'user' }

export function UsersPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(EMPTY_USER)
  const [deleteId, setDeleteId] = useState(null)
  const [resetId, setResetId] = useState(null)
  const [newInitialPw, setNewInitialPw] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const fetch = async () => {
    setLoading(true)
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
      setError(err.response?.data?.detail || 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  const handleRoleToggle = async (user) => {
    try {
      await usersApi.updateRole(user.id, { role: user.role === 'admin' ? 'user' : 'admin' })
      fetch()
    } catch (err) {
      toast(err.response?.data?.detail || 'Fehler', 'error')
    }
  }

  const handleDelete = async (id) => {
    try { await usersApi.delete(id); fetch() }
    catch (err) { toast(err.response?.data?.detail || 'Fehler', 'error') }
  }

  const handleResetPassword = async () => {
    if (!newInitialPw) { toast('Passwort eingeben', 'warning'); return }
    try {
      await usersApi.resetPassword(resetId, { new_password: newInitialPw })
      setResetId(null)
      setNewInitialPw('')
      toast('Initialpasswort gesetzt. Benutzer muss es bei nächster Anmeldung ändern.', 'success')
    } catch (err) {
      toast(err.response?.data?.detail || 'Fehler', 'error')
    }
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-navy">Benutzerverwaltung</h1>
        <button onClick={() => { setShowCreate(true); setForm(EMPTY_USER); setError('') }} className="btn-primary flex items-center gap-1.5">
          <PlusIcon className="w-4 h-4" /> Benutzer anlegen
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-navy" /></div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-brand-navy">
              <tr>
                <th className="table-th">Benutzername</th>
                <th className="table-th">Rolle</th>
                <th className="table-th">Erstellt</th>
                <th className="table-th">PW ändern erforderlich</th>
                <th className="table-th">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(user => (
                <tr key={user.id} className="table-row">
                  <td className="table-td font-medium">
                    {user.username}
                    {user.id === currentUser?.id && <span className="ml-2 text-xs bg-brand-yellow text-brand-navy px-1.5 py-0.5 rounded">Ich</span>}
                  </td>
                  <td className="table-td">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${user.role === 'admin' ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {user.role === 'admin' ? 'Administrator' : 'Benutzer'}
                    </span>
                  </td>
                  <td className="table-td">{new Date(user.created_at).toLocaleDateString('de-DE')}</td>
                  <td className="table-td">
                    <span className={`text-xs ${user.must_change_password ? 'text-amber-600' : 'text-green-600'}`}>
                      {user.must_change_password ? 'Ja' : 'Nein'}
                    </span>
                  </td>
                  <td className="table-td">
                    <div className="flex items-center gap-1">
                      {user.id !== currentUser?.id && (
                        <>
                          <button
                            onClick={() => handleRoleToggle(user)}
                            className="p-1.5 text-gray-400 hover:text-brand-navy hover:bg-blue-50 rounded-lg transition"
                            title={user.role === 'admin' ? 'Zu Benutzer herabstufen' : 'Zu Admin befördern'}
                          >
                            <ArrowsRightLeftIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { setResetId(user.id); setNewInitialPw('') }}
                            className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                            title="Initialpasswort setzen"
                          >
                            <KeyIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteId(user.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Benutzername *</label>
            <input type="text" className="input-field" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required minLength={3} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Initialpasswort *</label>
            <input type="password" className="input-field" value={form.initial_password} onChange={e => setForm(f => ({ ...f, initial_password: e.target.value }))} required minLength={8} />
            <p className="text-xs text-gray-500 mt-1">Mindestens 8 Zeichen, Buchstaben und Zahlen. Benutzer muss es bei erster Anmeldung ändern.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rolle</label>
            <select className="input-field" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="user">Benutzer (Leserechte)</option>
              <option value="admin">Administrator (alle Rechte)</option>
            </select>
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
          <div className="flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Abbrechen</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Erstelle...' : 'Benutzer anlegen'}</button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={!!resetId} onClose={() => setResetId(null)} title="Initialpasswort setzen" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Neues Initialpasswort setzen. Der Benutzer muss es bei der nächsten Anmeldung ändern.</p>
          <input type="password" className="input-field" placeholder="Neues Passwort..." value={newInitialPw} onChange={e => setNewInitialPw(e.target.value)} minLength={8} />
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setResetId(null)}>Abbrechen</button>
            <button className="btn-primary" onClick={handleResetPassword}>Setzen</button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => handleDelete(deleteId)}
        title="Benutzer löschen"
        message="Soll dieser Benutzer wirklich gelöscht werden?"
      />
    </div>
  )
}
