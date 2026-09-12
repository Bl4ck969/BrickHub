import { useState, useEffect } from 'react'
import { setsApi, imagesApi } from '../api/client'
import { useToast } from '../hooks/useToast'
import { SparklesIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { Modal } from '../components/Modal'
import { useReactTable, getCoreRowModel, getSortedRowModel, flexRender, createColumnHelper } from '@tanstack/react-table'
import { ArrowUpIcon, ArrowDownIcon, ArrowsUpDownIcon } from '@heroicons/react/24/outline'
import { PageShell } from '../components/PageShell'

export function NewSetsPage() {
  const [sets, setSets] = useState([])
  const [search, setSearch] = useState('')
  const [sorting, setSorting] = useState([])
  const [loading, setLoading] = useState(true)
  const [randomSet, setRandomSet] = useState(null)
  const [randomModal, setRandomModal] = useState(false)
  const [starting, setStarting] = useState(false)
  const toast = useToast()

  const fetchSets = async () => {
    setLoading(true)
    try {
      const res = await setsApi.list({ status: 'Neu', search })
      setSets(res.data.sets)
    } catch (err) {
      if (import.meta.env.DEV) console.warn('Neue Sets laden fehlgeschlagen', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSets() }, [search])

  const pickRandom = () => {
    if (sets.length === 0) { toast('Keine neuen Sets vorhanden', 'info'); return }
    const idx = Math.floor(Math.random() * sets.length)
    setRandomSet(sets[idx])
    setRandomModal(true)
  }

  const handleStartBuilding = async () => {
    if (!randomSet) return
    setStarting(true)
    try {
      await setsApi.updateStatus(randomSet.id, { status: 'Im Bau' })
      setRandomModal(false)
      fetchSets()
    } catch {
      toast('Fehler beim Statusändern', 'error')
    } finally {
      setStarting(false)
    }
  }

  const columnHelper = createColumnHelper()
  const columns = [
    columnHelper.accessor('frontcover_thumbnail', {
      header: 'Cover', enableSorting: false,
      cell: ({ row }) => row.original.frontcover_thumbnail ? (
        <img src={imagesApi.fileUrl(row.original.frontcover_thumbnail)} alt="Front" className="w-10 h-12 object-cover rounded-sm" />
      ) : <div className="w-10 h-12 bg-surface-3 rounded-sm" />,
    }),
    columnHelper.accessor('name', { header: 'Name', cell: info => <span className="font-medium">{info.getValue()}</span> }),
    columnHelper.accessor('manufacturer', { header: 'Hersteller' }),
    columnHelper.accessor('manufacturer_number', { header: 'Nr.' }),
    columnHelper.accessor('parts_count', { header: 'Teile', cell: info => info.getValue()?.toLocaleString('de-DE') || '-' }),
    columnHelper.accessor('stone_size', { header: 'Steinart' }),
    columnHelper.accessor('category', { header: 'Kategorie' }),
    columnHelper.accessor('subcategory', { header: 'Unterkategorie' }),
    columnHelper.accessor('notes', { header: 'Anmerkungen', cell: info => <span className="max-w-xs truncate block">{info.getValue() || ''}</span> }),
  ]

  const table = useReactTable({
    data: sets,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <PageShell
      titel="Neue Sets"
      untertitel={<><b className="font-semibold text-ink-2">{sets.length}</b> noch nicht gebaut</>}
      aktionen={
        <button onClick={pickRandom} className="btn-yellow px-5" disabled={sets.length === 0}>
          🎲 Zufälliges Set auswählen
        </button>
      }
    >
      <div className="card mb-3 py-3">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" />
          <input type="text" placeholder="Suche..." className="input-field pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="panel">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id}>
                  {hg.headers.map(h => (
                    <th key={h.id} className="table-th" onClick={h.column.getToggleSortingHandler()}>
                      <span className="flex items-center gap-1">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {h.column.getCanSort() && (h.column.getIsSorted() === 'asc' ? <ArrowUpIcon className="w-3 h-3" /> : h.column.getIsSorted() === 'desc' ? <ArrowDownIcon className="w-3 h-3" /> : <ArrowsUpDownIcon className="w-3 h-3 opacity-50" />)}
                      </span>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-line">
              {loading ? <tr><td colSpan={999} className="text-center py-12 text-ink-3">Lade...</td></tr>
               : table.getRowModel().rows.length === 0 ? <tr><td colSpan={999} className="text-center py-12 text-ink-3">Keine neuen Sets vorhanden</td></tr>
               : table.getRowModel().rows.map(row => (
                <tr key={row.id} className="table-row">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="table-td">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Random set modal */}
      <Modal open={randomModal} onClose={() => setRandomModal(false)} title="Zufälliges Set" size="md">
        {randomSet && (
          <div className="space-y-4">
            {randomSet.frontcover_edited && (
              <img src={imagesApi.fileUrl(randomSet.frontcover_edited)} alt="Cover" className="w-full h-48 object-contain rounded-xl bg-surface-2" />
            )}
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-heading">{randomSet.name}</h3>
              <p className="text-ink-2">{randomSet.manufacturer}</p>
              <div className="flex gap-4 text-sm text-ink-3">
                <span>🧱 {randomSet.parts_count?.toLocaleString('de-DE') || '?'} Teile</span>
                <span>📦 {randomSet.stone_size || '?'}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={pickRandom} className="btn-secondary flex-1">Anderes Set 🎲</button>
              <button onClick={handleStartBuilding} className="btn-yellow flex-1" disabled={starting}>
                {starting ? '...' : '✓ Jetzt bauen!'}
              </button>
            </div>
            <p className="text-xs text-ink-3 text-center">Status wird auf "Im Bau" gesetzt</p>
          </div>
        )}
      </Modal>
    </PageShell>
  )
}
