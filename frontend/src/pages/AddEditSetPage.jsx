import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { setsApi, boxesApi, imagesApi, settingsApi } from '../api/client'
import { PhotoIcon, PencilSquareIcon, ClipboardDocumentIcon, CheckIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import { OneDriveIcon } from '../components/OneDriveIcon'
import { useAuth } from '../hooks/useAuth'
import { ImageEditor } from '../components/ImageEditor'

const STONE_SIZES = ['Standard', 'Standard, beleuchtet', 'Standard, Technik', 'Mini', 'Diamond', 'Sonder-Steine']
const STATUSES = ['Neu', 'Aufgebaut', 'Im Bau', 'Eingelagert']

const EMPTY_FORM = {
  name: '', manufacturer: '', manufacturer_number: '',
  parts_count: '', stone_size: '', category: '', subcategory: '',
  status: 'Neu', bag_count: '', plate_count: '', price: '', notes: '',
  box_id: '', onedrive_url: '',
}

export function AddEditSetPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const isEdit = !!id

  const [form, setForm] = useState(EMPTY_FORM)
  const [suggestions, setSuggestions] = useState({ manufacturers: [], categories: [], subcategories: [] })
  const [boxes, setBoxes] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [savedSetId, setSavedSetId] = useState(null)
  const [imagePreviews, setImagePreviews] = useState({ frontcover: null, backcover: null })
  const [originalPaths, setOriginalPaths] = useState({ frontcover: null, backcover: null })
  const [editorOpen, setEditorOpen] = useState(null) // 'frontcover' | 'backcover' | null
  const [oneDriveBaseUrl, setOneDriveBaseUrl] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [editingBaseUrl, setEditingBaseUrl] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef(null)

  useEffect(() => {
    return () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current) }
  }, [])

  useEffect(() => {
    settingsApi.getAll().then(res => {
      setOneDriveBaseUrl(res.data.onedrive_base_url || '')
      setBaseUrlInput(res.data.onedrive_base_url || '')
    }).catch(err => { if (import.meta.env.DEV) console.warn('Settings laden fehlgeschlagen', err) })
    setsApi.distinctValues().then(res => setSuggestions(res.data)).catch(err => { if (import.meta.env.DEV) console.warn('DistinctValues laden fehlgeschlagen', err) })
    boxesApi.list().then(res => setBoxes(res.data)).catch(err => { if (import.meta.env.DEV) console.warn('Boxes laden fehlgeschlagen', err) })
    if (isEdit) {
      setsApi.get(id).then(res => {
        const s = res.data
        setForm({
          name: s.name || '', manufacturer: s.manufacturer || '',
          manufacturer_number: s.manufacturer_number || '',
          parts_count: s.parts_count ?? '', stone_size: s.stone_size || '',
          category: s.category || '', subcategory: s.subcategory || '',
          status: s.status || 'Neu', bag_count: s.bag_count ?? '',
          plate_count: s.plate_count ?? '', price: s.price ?? '', notes: s.notes || '',
          box_id: s.box_id ?? '', onedrive_url: s.onedrive_url || '',
        })
        setSavedSetId(Number(id))
        if (s.frontcover_thumbnail) setImagePreviews(p => ({ ...p, frontcover: imagesApi.fileUrl(s.frontcover_thumbnail) }))
        if (s.backcover_thumbnail) setImagePreviews(p => ({ ...p, backcover: imagesApi.fileUrl(s.backcover_thumbnail) }))
        setOriginalPaths({
          frontcover: s.frontcover_original || null,
          backcover: s.backcover_original || null,
        })
      }).catch(err => { if (import.meta.env.DEV) console.warn('Set laden fehlgeschlagen', err) })
    }
  }, [id])

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload = {
        ...form,
        parts_count: form.parts_count !== '' ? Number(form.parts_count) : null,
        bag_count: form.bag_count !== '' ? Number(form.bag_count) : null,
        plate_count: form.plate_count !== '' ? Number(form.plate_count) : null,
        price: form.price !== '' ? Number(form.price) : null,
        box_id: form.box_id !== '' ? Number(form.box_id) : null,
        onedrive_url: form.onedrive_url?.trim() || null,
      }
      let res
      if (isEdit) {
        res = await setsApi.update(id, payload)
      } else {
        res = await setsApi.create(payload)
      }
      setSavedSetId(res.data.id)
      if (!isEdit) {
        navigate(`/sets/${res.data.id}/edit`, { replace: true })
      }
      alert(isEdit ? 'Set gespeichert' : 'Set angelegt – jetzt Bilder hochladen')
    } catch (err) {
      setError(err.response?.data?.detail || 'Fehler beim Speichern')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenEditor = (side) => {
    if (!savedSetId) {
      alert('Bitte erst Set speichern, dann Bilder hochladen')
      return
    }
    setEditorOpen(side)
  }

  const handleEditorFinalized = (side, thumbnailPath) => {
    setImagePreviews(p => ({ ...p, [side]: imagesApi.fileUrl(thumbnailPath) + '&t=' + Date.now() }))
  }

  const field = (name) => ({
    value: form[name],
    onChange: e => setForm(f => ({ ...f, [name]: e.target.value })),
  })

  // Nur kompatible Kisten anzeigen (basierend auf gewählter Steinart)
  const compatibleBoxes = boxes.filter(b => {
    if (!form.stone_size) return true
    if (!b.allowed_stone_types || b.allowed_stone_types.length === 0) return true
    return b.allowed_stone_types.includes(form.stone_size)
  })

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-brand-navy">{isEdit ? 'Set bearbeiten' : 'Neues Set anlegen'}</h1>
        <button onClick={() => navigate('/sets')} className="btn-secondary text-sm">Zurück</button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Basic Info */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-brand-navy border-b border-gray-100 pb-2">Grunddaten</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input type="text" className="input-field" {...field('name')} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hersteller</label>
              <input type="text" className="input-field" list="manufacturers-list" {...field('manufacturer')} />
              <datalist id="manufacturers-list">{suggestions.manufacturers.map(m => <option key={m} value={m} />)}</datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Herstellernummer</label>
              <input type="text" className="input-field" {...field('manufacturer_number')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teilezahl</label>
              <input type="number" min="0" className="input-field" {...field('parts_count')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preis (€)</label>
              <input type="number" step="0.01" min="0" className="input-field" {...field('price')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Steinart</label>
              <select className="input-field" {...field('stone_size')}>
                <option value="">– Auswählen –</option>
                {STONE_SIZES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select className="input-field" {...field('status')}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kategorie</label>
              <input type="text" className="input-field" list="categories-list" {...field('category')} />
              <datalist id="categories-list">{suggestions.categories.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unterkategorie</label>
              <input type="text" className="input-field" list="subcategories-list" {...field('subcategory')} />
              <datalist id="subcategories-list">{suggestions.subcategories.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Anzahl Tüten</label>
              <input type="number" min="0" className="input-field" {...field('bag_count')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Anzahl Platten</label>
              <input type="number" min="0" className="input-field" {...field('plate_count')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Lagerort / Kiste
                {form.stone_size && compatibleBoxes.length < boxes.length && (
                  <span className="ml-2 text-xs text-amber-600 font-normal">
                    (gefiltert nach Steinart)
                  </span>
                )}
              </label>
              <select className="input-field" {...field('box_id')}>
                <option value="">– Keine –</option>
                {compatibleBoxes.map(b => (
                  <option key={b.id} value={b.id} disabled={b.fill_level >= 100}>
                    {b.name} ({b.location || 'kein Ort'}) – {b.fill_level}% voll
                  </option>
                ))}
              </select>
              {form.stone_size && compatibleBoxes.length === 0 && (
                <p className="text-xs text-red-500 mt-1">Keine kompatible Kiste für diese Steinart gefunden.</p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Anmerkungen</label>
              <textarea rows={3} className="input-field resize-none" {...field('notes')} />
            </div>
          </div>
        </div>

        {/* OneDrive-Verknüpfung */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-brand-navy border-b border-gray-100 pb-2 flex items-center gap-2">
            <OneDriveIcon className="w-5 h-5" />
            OneDrive-Verknüpfung
          </h2>

          {/* Basis-Ordner */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Basis-Ordner</label>
            {oneDriveBaseUrl && !editingBaseUrl ? (
              <div className="flex items-center gap-2">
                <a
                  href={oneDriveBaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                >
                  <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                  Klemmbausteine-Ordner öffnen
                </a>
                {isAdmin && (
                  <button
                    type="button"
                    className="p-1 text-gray-400 hover:text-brand-navy hover:bg-blue-50 rounded transition"
                    title="Basis-Link bearbeiten"
                    onClick={() => setEditingBaseUrl(true)}
                  >
                    <PencilSquareIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : isAdmin ? (
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  className="input-field flex-1"
                  placeholder="OneDrive Basis-URL einfügen..."
                  value={baseUrlInput}
                  onChange={e => setBaseUrlInput(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-primary text-sm px-3 py-2 whitespace-nowrap"
                  onClick={async () => {
                    if (!baseUrlInput.trim()) return
                    try {
                      await settingsApi.set('onedrive_base_url', baseUrlInput.trim())
                      setOneDriveBaseUrl(baseUrlInput.trim())
                      setEditingBaseUrl(false)
                    } catch { alert('Fehler beim Speichern') }
                  }}
                >
                  Speichern
                </button>
                {oneDriveBaseUrl && (
                  <button
                    type="button"
                    className="btn-secondary text-sm px-3 py-2 whitespace-nowrap"
                    onClick={() => {
                      setBaseUrlInput(oneDriveBaseUrl)
                      setEditingBaseUrl(false)
                    }}
                  >
                    Abbrechen
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Noch nicht konfiguriert (Admin-Einstellung)</p>
            )}
          </div>

          {/* Automatisch generierter Ordnername */}
          {form.manufacturer && form.manufacturer_number && form.name && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ordnername</label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono bg-gray-50 border border-gray-200 rounded px-3 py-2 flex-1 select-all">
                  {form.manufacturer} - {form.manufacturer_number} - {form.name}
                </span>
                <button
                  type="button"
                  className="p-2 text-gray-500 hover:text-brand-navy hover:bg-blue-50 rounded-lg transition"
                  title="Ordnernamen kopieren"
                  onClick={() => {
                    navigator.clipboard.writeText(`${form.manufacturer} - ${form.manufacturer_number} - ${form.name}`)
                    setCopied(true)
                    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
                    copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
                  }}
                >
                  {copied ? <CheckIcon className="w-5 h-5 text-green-600" /> : <ClipboardDocumentIcon className="w-5 h-5" />}
                </button>
              </div>
            </div>
          )}

          {/* OneDrive Unterordner-Link */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">OneDrive Unterordner-Link</label>
            <input
              type="url"
              className="input-field"
              placeholder="Link zum Set-Ordner in OneDrive einfügen..."
              {...field('onedrive_url')}
            />
            {form.onedrive_url && (
              <a
                href={form.onedrive_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1 text-xs text-blue-600 hover:underline"
              >
                <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                Ordner öffnen
              </a>
            )}
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

        <div className="flex justify-end">
          <button type="submit" className="btn-primary px-8 py-3" disabled={loading}>
            {loading ? 'Speichere...' : (isEdit ? 'Speichern' : 'Set anlegen')}
          </button>
        </div>
      </form>

      {/* Image Upload */}
      <div className="card mt-6 space-y-4">
        <h2 className="font-semibold text-brand-navy border-b border-gray-100 pb-2">
          Bilder {!savedSetId && <span className="text-xs font-normal text-gray-400">(erst Set speichern)</span>}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {['frontcover', 'backcover'].map(side => (
            <div key={side}>
              <p className="text-sm font-medium text-gray-700 mb-2">{side === 'frontcover' ? 'Frontcover' : 'Backcover'}</p>
              <div
                className={`relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer transition overflow-hidden ${savedSetId ? 'border-brand-navy hover:bg-blue-50' : 'border-gray-200 cursor-not-allowed opacity-50'}`}
                onClick={() => savedSetId && handleOpenEditor(side)}
              >
                {imagePreviews[side] ? (
                  <img
                    src={imagePreviews[side]}
                    alt={side}
                    className="absolute inset-0 w-full h-full object-contain p-2"
                  />
                ) : (
                  <div className="text-center text-gray-400">
                    <PhotoIcon className="w-10 h-10 mx-auto mb-2" />
                    <p className="text-sm">Bild hochladen</p>
                    <p className="text-xs mt-1">JPG, PNG, WebP bis 30 MB</p>
                  </div>
                )}
              </div>
              {imagePreviews[side] && savedSetId && (
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-green-600">Bild verarbeitet</p>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-brand-navy hover:underline"
                    onClick={() => handleOpenEditor(side)}
                  >
                    <PencilSquareIcon className="w-3.5 h-3.5" />
                    Bearbeiten
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Image Editor Modal */}
      {editorOpen && (
        <ImageEditor
          open={!!editorOpen}
          onClose={() => setEditorOpen(null)}
          setId={savedSetId}
          side={editorOpen}
          existingOriginalPath={originalPaths[editorOpen] || null}
          onFinalized={(thumbPath) => handleEditorFinalized(editorOpen, thumbPath)}
        />
      )}
    </div>
  )
}
