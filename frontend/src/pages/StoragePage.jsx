import { useState, useEffect, useMemo } from 'react'
import { boxesApi } from '../api/client'
import { useToast } from '../hooks/useToast'
import { PencilSquareIcon, TrashIcon, PlusIcon, ClipboardDocumentListIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { Modal, ConfirmModal } from '../components/Modal'
import { PageShell, Ladet, Leer } from '../components/PageShell'
import { STEINARTEN, steinFarbe, fuellFarbe } from '../lib/stein'
import { useNavigate } from 'react-router'

const EMPTY_FORM = { name: '', location: '', fill_level: 0, allowed_stone_types: [] }

/** Fuellstand als Noppenreihe: eine Noppe je 10 %.
 *  Eine Kiste zaehlt man in Steinen, nicht in Prozentpunkten. */
function Noppen({ prozent }) {
  const voll = Math.round(prozent / 10)
  const farbe = fuellFarbe(prozent)
  return (
    <div className="flex gap-[3px]" role="img" aria-label={`Füllstand ${prozent} Prozent`}>
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className={`relative h-4 flex-1 rounded-[3px] border ${
            i < voll ? '' : 'border-line bg-surface-3'
          }`}
          style={i < voll ? { background: farbe, borderColor: farbe } : undefined}
        >
          <span
            className={`absolute inset-x-[30%] top-[3px] h-[5px] rounded-[2px] ${
              i < voll ? 'bg-white/55' : 'bg-ink-3/25'
            }`}
          />
        </span>
      ))}
    </div>
  )
}

export function StoragePage() {
  const [boxes, setBoxes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editBox, setEditBox] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()

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
    catch (err) { toast(err.response?.data?.detail || 'Fehler', 'error') }
  }

  const toggleStoneType = (type) => {
    setForm(f => ({
      ...f,
      allowed_stone_types: f.allowed_stone_types.includes(type)
        ? f.allowed_stone_types.filter(t => t !== type)
        : [...f.allowed_stone_types, type],
    }))
  }

  /* Zustand zuerst: „wo ist noch Platz“ vor allen Einzelkarten. */
  const bilanz = useMemo(() => {
    const voll = boxes.filter(b => b.fill_level >= 100).length
    const eng = boxes.filter(b => b.fill_level >= 70 && b.fill_level < 100).length
    const frei = boxes.filter(b => b.fill_level < 70).length
    const schnitt = boxes.length
      ? Math.round(boxes.reduce((s, b) => s + b.fill_level, 0) / boxes.length)
      : 0
    const sets = boxes.reduce((s, b) => s + (b.set_count || 0), 0)
    return { voll, eng, frei, schnitt, sets }
  }, [boxes])

  const orte = useMemo(
    () => [...new Set(boxes.map(b => b.location).filter(Boolean))],
    [boxes],
  )

  return (
    <PageShell
      titel="Lagerung"
      untertitel={
        boxes.length > 0 ? (
          <>
            <b className="font-semibold text-ink-2">{boxes.length}</b> Kisten
            {orte.length === 1 && ` in ${orte[0]}`}
            {' · '}<b className="font-semibold text-ink-2">{bilanz.sets}</b> Sets eingelagert
          </>
        ) : null
      }
      aktionen={
        <>
          <button onClick={() => navigate('/box-inventory')} className="btn-secondary">
            <ClipboardDocumentListIcon className="h-4 w-4" /> Zur Kisteninventur
          </button>
          <button onClick={openCreate} className="btn-yellow">
            <PlusIcon className="h-4 w-4 stroke-[2.2]" /> Neue Kiste
          </button>
        </>
      }
    >
      {loading ? (
        <Ladet />
      ) : boxes.length === 0 ? (
        <Leer>Noch keine Kisten angelegt</Leer>
      ) : (
        <>
          <div className="mb-3.5 flex flex-wrap items-center gap-x-5 gap-y-2.5 rounded-xl border border-line
            bg-surface px-4 py-3 shadow-s">
            <span className="flex items-baseline gap-1.5 text-[12.5px] text-ink-2">
              <b className="font-display text-[17px] font-bold text-ink tabular-nums">{boxes.length}</b> Kisten
            </span>
            <span className="h-5 w-px bg-line" aria-hidden="true" />
            <span className="flex items-baseline gap-1.5 text-[12.5px] text-crit">
              <b className="font-display text-[17px] font-bold tabular-nums">{bilanz.voll}</b> voll
            </span>
            <span className="flex items-baseline gap-1.5 text-[12.5px] text-st-build">
              <b className="font-display text-[17px] font-bold tabular-nums">{bilanz.eng}</b> fast voll
            </span>
            <span className="flex items-baseline gap-1.5 text-[12.5px] text-ink-2">
              <b className="font-display text-[17px] font-bold text-ink tabular-nums">{bilanz.frei}</b> mit Platz
            </span>
            <span className="h-5 w-px bg-line" aria-hidden="true" />
            <span className="flex items-baseline gap-1.5 text-[12.5px] text-ink-2">
              <b className="font-display text-[17px] font-bold text-ink tabular-nums">{bilanz.schnitt} %</b> Gesamtauslastung
            </span>
            <span className="ml-auto text-[11.5px] text-ink-3">Eine Noppe entspricht 10 % Füllstand</span>
          </div>

          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(272px,1fr))]">
            {boxes.map(box => {
              const voll = box.fill_level >= 100
              return (
                <article
                  key={box.id}
                  className={`flex flex-col gap-3 rounded-xl border bg-surface p-4 shadow-s transition-all duration-150
                    hover:shadow-m ${voll ? 'border-crit/45' : 'border-line hover:border-line-2'}`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="min-w-0">
                      <h3 className="font-display text-[19px] leading-tight font-bold">{box.name}</h3>
                      <p className="text-[11.5px] text-ink-3">{box.location || 'kein Standort'}</p>
                    </div>
                    <div className="ml-auto flex gap-0.5">
                      <button
                        onClick={() => openEdit(box)}
                        title={`Kiste ${box.name} bearbeiten`}
                        className="grid h-[26px] w-[26px] place-items-center rounded-md text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
                      >
                        <PencilSquareIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteId(box.id)}
                        title={`Kiste ${box.name} löschen`}
                        className="grid h-[26px] w-[26px] place-items-center rounded-md text-ink-3 transition-colors hover:bg-crit-bg hover:text-crit"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-baseline gap-2">
                      <span className="eyebrow mr-auto">Füllstand</span>
                      <span
                        className="text-[11px] font-semibold"
                        style={{ color: fuellFarbe(box.fill_level) }}
                      >
                        {voll ? 'Voll' : box.fill_level >= 70 ? 'Wird eng' : box.fill_level > 0 ? 'Platz frei' : 'Leer'}
                      </span>
                      <span className="font-display text-[15px] font-bold tabular-nums">{box.fill_level} %</span>
                    </div>
                    <Noppen prozent={box.fill_level} />
                  </div>

                  <div>
                    <div className="eyebrow mb-1.5">Erlaubte Steinarten</div>
                    <div className="flex flex-wrap gap-1.5">
                      {box.allowed_stone_types.length === 0 ? (
                        <span className="inline-flex items-center rounded-md border border-dashed border-line px-2 py-0.5
                          text-[11px] text-ink-3 italic">
                          Keine festgelegt
                        </span>
                      ) : (
                        box.allowed_stone_types.map(t => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-3
                              px-2 py-0.5 text-[11px] font-medium text-ink-2"
                          >
                            <span className="h-1.5 w-1.5 rounded-xs" style={{ background: steinFarbe(t) }} />
                            {t}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="mt-auto flex items-center gap-2 border-t border-line pt-3 text-[12px] text-ink-2">
                    <b className="font-semibold text-ink tabular-nums">{box.set_count}</b>
                    {box.set_count === 1 ? 'Set' : 'Sets'} eingelagert
                    <button
                      onClick={() => navigate('/box-inventory')}
                      className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-ink-3 transition-colors hover:text-gold"
                    >
                      Inhalt zeigen <ChevronRightIcon className="h-3 w-3" />
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}

      {/* Anlegen und Bearbeiten */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editBox ? 'Kiste bearbeiten' : 'Neue Kiste anlegen'}>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div>
            <label htmlFor="box-name" className="mb-1 block text-sm font-medium text-ink-2">Name *</label>
            <input id="box-name" type="text" className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="z.B. K1" />
          </div>
          <div>
            <label htmlFor="box-ort" className="mb-1 block text-sm font-medium text-ink-2">Standort</label>
            <input id="box-ort" type="text" className="input-field" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="z.B. Keller" />
          </div>
          <div>
            <label htmlFor="box-fuell" className="mb-1.5 block text-sm font-medium text-ink-2">
              Füllstand: <b className="tabular-nums">{form.fill_level} %</b>
            </label>
            <input
              id="box-fuell"
              type="range"
              min="0"
              max="100"
              step="10"
              className="w-full accent-gold"
              value={form.fill_level}
              onChange={e => setForm(f => ({ ...f, fill_level: Number(e.target.value) }))}
            />
            <div className="mt-2"><Noppen prozent={form.fill_level} /></div>
          </div>
          <div>
            <span className="mb-2 block text-sm font-medium text-ink-2">Erlaubte Steinarten (Mehrfachauswahl)</span>
            <div className="flex flex-wrap gap-2">
              {STEINARTEN.map(type => {
                const an = form.allowed_stone_types.includes(type)
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleStoneType(type)}
                    aria-pressed={an}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                      an
                        ? 'border-gold bg-gold-soft text-ink'
                        : 'border-line bg-surface-2 text-ink-2 hover:border-line-2 hover:text-ink'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-xs" style={{ background: steinFarbe(type) }} />
                    {type}
                  </button>
                )
              })}
            </div>
          </div>
          {error && (
            <div role="alert" className="rounded-lg border border-crit/30 bg-crit-bg px-4 py-3 text-sm text-crit">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Abbrechen</button>
            <button type="submit" className="btn-yellow" disabled={saving}>{saving ? 'Speichere…' : 'Speichern'}</button>
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
    </PageShell>
  )
}
