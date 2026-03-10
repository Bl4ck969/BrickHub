import { useState, useEffect } from 'react'
import { boxesApi } from '../api/client'
import { PencilSquareIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline'
import { Modal, ConfirmModal } from '../components/Modal'

const STONE_SIZES = ['Standard', 'Standard, beleuchtet', 'Standard, Technik', 'Mini', 'Diamond', 'Sonder-Steine']

const EMPTY_FORM = { name: '', location: '', fill_level: 0, allowed_stone_types: [] }

export function StoragePage() {
  const [boxes, setBoxes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editBox, setEditBox] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const fetch = async () => {
    setLoading(true)
    try {
      const res = await boxesApi.list()
      setBoxes(res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetch() }, [])

  const openCreate = () => { setForm(EMPTY_FORM); setEditBox(null); setError(''); setShowForm(true) }
  const openEdit = (box) => {
    setForm({ name: box.name, location: box.location || '', fill_level: box.fill_level, allowed_stone_types: box.allowed_stone_types })
    setEditBox(box)
    setError('')
    setShowForm(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name erforderlich'); return }
    setSaving(true)
    try {
      if (editBox) {
        await boxesApi.update(editBox.id, form)
      } else {
        await boxesApi.create(form)
      }
      setShowForm(false)
      fetch()
    } catch (err) {
      setError(err.response?.data?.detail || 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try { await boxesApi.delete(id); fetch() }
    catch (err) { alert(err.response?.data?.detail || 'Fehler') }
  }

  const toggleStoneType = (type) => {
    setForm(f => ({
      ...f,
      allowed_stone_types: f.allowed_stone_types.includes(type)
        ? f.allowed_stone_types.filter(t => t !== type)
        : [...f.allowed_stone_types, type],
    }))
  }

  const fillColor = (level) => {
    if (level >= 100) return 'bg-red-500'
    if (level >= 70) return 'bg-amber-500'
    return 'bg-green-500'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-navy">Lagerung – Kisten</h1>
        <button onClick={openCreate} className="btn-primary flex items-center gap-1.5">
          <PlusIcon className="w-4 h-4" /> Neue Kiste
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-navy" /></div>
      ) : boxes.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">Noch keine Kisten angelegt</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {boxes.map(box => (
            <div key={box.id} className="card space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-brand-navy text-lg">{box.name}</h3>
                  <p className="text-sm text-gray-500">{box.location || 'kein Standort'}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(box)} className="p-1.5 text-gray-400 hover:text-brand-navy hover:bg-blue-50 rounded-lg transition">
                    <PencilSquareIcon className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteId(box.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Fill level */}
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Füllheitsgrad</span>
                  <span className="font-semibold">{box.fill_level}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div className={`h-2.5 rounded-full transition-all ${fillColor(box.fill_level)}`} style={{ width: `${box.fill_level}%` }} />
                </div>
                {box.fill_level >= 100 && <p className="text-xs text-red-500 mt-1">Kiste voll</p>}
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1">Erlaubte Steinarten</p>
                <div className="flex flex-wrap gap-1">
                  {box.allowed_stone_types.length === 0
                    ? <span className="text-xs text-gray-400">Keine festgelegt</span>
                    : box.allowed_stone_types.map(t => (
                      <span key={t} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{t}</span>
                    ))
                  }
                </div>
              </div>

              <p className="text-xs text-gray-500">{box.set_count} Set{box.set_count !== 1 ? 's' : ''} eingelagert</p>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editBox ? 'Kiste bearbeiten' : 'Neue Kiste anlegen'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input type="text" className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="z.B. K1" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Standort</label>
            <input type="text" className="input-field" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="z.B. Keller" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Füllheitsgrad: {form.fill_level}%</label>
            <input type="range" min="0" max="100" step="10" className="w-full" value={form.fill_level} onChange={e => setForm(f => ({ ...f, fill_level: Number(e.target.value) }))} />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>0%</span><span>100%</span></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Erlaubte Steinarten (Mehrfachauswahl)</label>
            <div className="flex flex-wrap gap-2">
              {STONE_SIZES.map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleStoneType(type)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${form.allowed_stone_types.includes(type) ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
          <div className="flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Abbrechen</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Speichere...' : 'Speichern'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => handleDelete(deleteId)}
        title="Kiste löschen"
        message="Soll diese Kiste wirklich gelöscht werden? Eingelagerte Sets werden dadurch keiner Kiste mehr zugeordnet."
      />
    </div>
  )
}
