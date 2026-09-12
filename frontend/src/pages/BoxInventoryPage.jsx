import { useState, useEffect } from 'react'
import { setsApi, boxesApi } from '../api/client'
import { useToast } from '../hooks/useToast'
import { MagnifyingGlassIcon, PencilSquareIcon, CheckIcon, ArrowUpIcon, ArrowDownIcon, ArrowsUpDownIcon } from '@heroicons/react/24/outline'
import { PageShell, Ladet } from '../components/PageShell'

const SORT_COLS = {
  name: (a, b) => (a.name || '').localeCompare(b.name || ''),
  manufacturer: (a, b) => (a.manufacturer || '').localeCompare(b.manufacturer || ''),
  parts_count: (a, b) => (a.parts_count || 0) - (b.parts_count || 0),
  stone_size: (a, b) => (a.stone_size || '').localeCompare(b.stone_size || ''),
  bag_count: (a, b) => (a.bag_count || 0) - (b.bag_count || 0),
  plate_count: (a, b) => (a.plate_count || 0) - (b.plate_count || 0),
}

export function BoxInventoryPage() {
  const [sets, setSets] = useState([])
  const [boxes, setBoxes] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [editingSet, setEditingSet] = useState(null)
  const [selectedBox, setSelectedBox] = useState('')
  const [saving, setSaving] = useState(false)
  const [sortCol, setSortCol] = useState('')
  const [sortDir, setSortDir] = useState('asc')
  const toast = useToast()

  const fetchData = async () => {
    setLoading(true)
    try {
      const [setsRes, boxesRes] = await Promise.all([
        setsApi.list({ status: 'Eingelagert', search }),
        boxesApi.list(),
      ])
      setSets(setsRes.data.sets)
      setBoxes(boxesRes.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [search])

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <ArrowsUpDownIcon className="w-3 h-3 opacity-40 inline ml-0.5" />
    return sortDir === 'asc'
      ? <ArrowUpIcon className="w-3 h-3 inline ml-0.5" />
      : <ArrowDownIcon className="w-3 h-3 inline ml-0.5" />
  }

  const handleEditBox = (set) => {
    setEditingSet(set)
    setSelectedBox(String(set.box_id || ''))
  }

  const handleSaveBox = async () => {
    if (!editingSet) return
    setSaving(true)
    try {
      await setsApi.inlineUpdate(editingSet.id, { box_id: selectedBox ? Number(selectedBox) : null })
      setEditingSet(null)
      fetchData()
    } catch {
      toast('Fehler beim Speichern', 'error')
    } finally {
      setSaving(false)
    }
  }

  const filteredSets = sets.filter(s =>
    !search ||
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.manufacturer?.toLowerCase().includes(search.toLowerCase())
  )

  const sortedSets = sortCol
    ? [...filteredSets].sort((a, b) => {
        // Dynamische Sort-Funktion für Box-Spalten (box_123 → sortiert nach Zugehörigkeit)
        let cmp
        if (sortCol.startsWith('box_')) {
          const boxId = Number(sortCol.replace('box_', ''))
          const aIn = a.box_id === boxId ? 1 : 0
          const bIn = b.box_id === boxId ? 1 : 0
          cmp = aIn - bIn
        } else {
          cmp = SORT_COLS[sortCol]?.(a, b) ?? 0
        }
        return sortDir === 'asc' ? cmp : -cmp
      })
    : filteredSets

  const thClass = "table-th cursor-pointer select-none hover:bg-surface-3 transition"

  return (
    <PageShell titel="Kisteninventur" untertitel="Welches Set liegt in welcher Kiste">
      <div className="card mb-3 py-3">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" />
          <input type="text" placeholder="Suche nach Name, Hersteller..." className="input-field pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <Ladet />
      ) : (
        <div className="panel">
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-14rem)]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-30">
                <tr>
                  <th className={thClass} onClick={() => handleSort('name')}>Name <SortIcon col="name"/></th>
                  <th className={thClass} onClick={() => handleSort('manufacturer')}>Hersteller <SortIcon col="manufacturer"/></th>
                  <th className={thClass} onClick={() => handleSort('parts_count')}>Teile <SortIcon col="parts_count"/></th>
                  <th className={thClass} onClick={() => handleSort('stone_size')}>Steinart <SortIcon col="stone_size"/></th>
                  <th className={thClass} onClick={() => handleSort('bag_count')}>Tüten <SortIcon col="bag_count"/></th>
                  <th className={thClass} onClick={() => handleSort('plate_count')}>Platten <SortIcon col="plate_count"/></th>
                  {boxes.map(box => (
                    <th key={box.id} className={thClass + ' text-center'} onClick={() => handleSort(`box_${box.id}`)}>
                      {box.name} <SortIcon col={`box_${box.id}`}/>
                    </th>
                  ))}
                  <th className="table-th">Kiste ändern</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sortedSets.length === 0 ? (
                  <tr><td colSpan={999} className="text-center py-12 text-ink-3">Keine eingelagerten Sets</td></tr>
                ) : sortedSets.map(set => (
                  <tr key={set.id} className="table-row">
                    <td className="table-td font-medium">{set.name}</td>
                    <td className="table-td">{set.manufacturer || '-'}</td>
                    <td className="table-td">{set.parts_count?.toLocaleString('de-DE') || '-'}</td>
                    <td className="table-td">{set.stone_size || '-'}</td>
                    <td className="table-td text-center">{set.bag_count ?? '-'}</td>
                    <td className="table-td text-center">{set.plate_count ?? '-'}</td>
                    {boxes.map(box => (
                      <td key={box.id} className="table-td text-center">
                        {set.box_id === box.id ? (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-st-done-bg font-semibold text-st-done">✓</span>
                        ) : ''}
                      </td>
                    ))}
                    <td className="table-td">
                      {editingSet?.id === set.id ? (
                        <div className="flex items-center gap-1">
                          <select
                            className="input-field py-1 text-xs"
                            value={selectedBox}
                            onChange={e => setSelectedBox(e.target.value)}
                          >
                            <option value="">– Keine –</option>
                            {boxes.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
                          </select>
                          <button onClick={handleSaveBox} className="grid h-7 w-7 place-items-center rounded-md text-st-done transition-colors hover:bg-st-done-bg" disabled={saving}>
                            <CheckIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => handleEditBox(set)} className="grid h-7 w-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink">
                          <PencilSquareIcon className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageShell>
  )
}
