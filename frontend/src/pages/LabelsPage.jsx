import { useState, useEffect } from 'react'
import { setsApi, labelsApi } from '../api/client'
import { TagIcon } from '@heroicons/react/24/outline'
import { PageShell, Leer } from '../components/PageShell'
import { useToast } from '../hooks/useToast'

export function LabelsPage() {
  const [sets, setSets] = useState([])
  const [selected, setSelected] = useState(['', '', '', '', '', ''])
  const [generating, setGenerating] = useState(false)
  const toast = useToast()

  useEffect(() => {
    setsApi.list({}).then(res => setSets(res.data.sets))
  }, [])

  const updateSelection = (idx, value) => {
    setSelected(prev => { const arr = [...prev]; arr[idx] = value; return arr })
  }

  const selectedSets = selected.map(id => id ? sets.find(s => String(s.id) === id) : null).filter(Boolean)

  const handleGenerate = async () => {
    const ids = selectedSets.map(s => s.id)
    if (ids.length === 0) { toast('Bitte mindestens ein Set auswählen', 'warning'); return }
    setGenerating(true)
    try {
      const res = await labelsApi.generate(ids)
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'BrickHub-Schilder.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast('Fehler beim Generieren der Schilder', 'error')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <PageShell
      titel="Einlagerungsschilder"
      untertitel="Bis zu 6 Sets - je Tüte und Platte ein Schild, 6 Schilder pro DIN-A4-Seite"
    >
      <div className="card mx-auto flex max-w-2xl flex-col gap-4">
        {[0, 1, 2, 3, 4, 5].map(idx => {
          const setId = selected[idx]
          const set = setId ? sets.find(s => String(s.id) === setId) : null
          return (
            <div key={idx} className="flex items-center gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold text-xs font-bold text-[#16243b]">
                {idx + 1}
              </div>
              <select
                className="input-field flex-1"
                value={selected[idx]}
                onChange={e => updateSelection(idx, e.target.value)}
              >
                <option value="">– Kein Set –</option>
                {sets.map(s => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name} – {s.manufacturer || ''}
                  </option>
                ))}
              </select>
              {set && (
                <span className="text-xs text-ink-3 shrink-0">
                  {set.bag_count || 0} Tüte{(set.bag_count || 0) !== 1 ? 'n' : ''} + {set.plate_count || 0} Platte{(set.plate_count || 0) !== 1 ? 'n' : ''}
                </span>
              )}
            </div>
          )
        })}

        {selectedSets.length > 0 && (
          <div className="rounded-xl border border-gold-line bg-gold-soft px-4 py-3 text-sm text-ink">
            <strong>Vorschau:</strong> {selectedSets.reduce((sum, s) => sum + (s.bag_count || 0) + (s.plate_count || 0), 0)} Schilder auf{' '}
            {Math.ceil(selectedSets.reduce((sum, s) => sum + (s.bag_count || 0) + (s.plate_count || 0), 0) / 6)} Seite(n)
          </div>
        )}

        <button
          onClick={handleGenerate}
          className="btn-yellow w-full justify-center py-2.5"
          disabled={generating || selectedSets.length === 0}
        >
          <TagIcon className="w-5 h-5" />
          {generating ? 'Generiere PDF...' : 'Schilder als PDF generieren'}
        </button>
      </div>

      {sets.length === 0 && (
        <div className="mx-auto mt-4 max-w-2xl">
          <Leer>Keine Sets vorhanden.</Leer>
        </div>
      )}
    </PageShell>
  )
}
