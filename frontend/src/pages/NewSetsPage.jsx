import { useState, useEffect } from 'react'
import { setsApi, imagesApi } from '../api/client'
import { SparklesIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { Modal } from '../components/Modal'
import { useReactTable, getCoreRowModel, getSortedRowModel, flexRender, createColumnHelper } from '@tanstack/react-table'
import { ArrowUpIcon, ArrowDownIcon, ArrowsUpDownIcon } from '@heroicons/react/24/outline'

export function NewSetsPage() {
  const [sets, setSets] = useState([])
  const [search, setSearch] = useState('')
  const [sorting, setSorting] = useState([])
  const [loading, setLoading] = useState(true)
  const [randomSet, setRandomSet] = useState(null)
  const [randomModal, setRandomModal] = useState(false)
  const [starting, setStarting] = useState(false)

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
    if (sets.length === 0) { alert('Keine neuen Sets vorhanden'); return }
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
      alert('Fehler beim Statusändern')
    } finally {
      setStarting(false)
    }
  }

  const columnHelper = createColumnHelper()
  const columns = [
    columnHelper.accessor('frontcover_thumbnail', {
      header: 'Cover', enableSorting: false,
      cell: ({ row }) => row.original.frontcover_thumbnail ? (
        <img src={imagesApi.fileUrl(row.original.frontcover_thumbnail)} alt="Front" className="w-10 h-12 object-cover rounded" />
      ) : <div className="w-10 h-12 bg-gray-100 rounded" />,
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
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <SparklesIcon className="w-7 h-7 text-brand-navy" />
          <h1 className="text-2xl font-bold text-brand-navy">Neue Sets</h1>
          <span className="bg-brand-yellow text-brand-navy text-sm font-semibold px-2.5 py-0.5 rounded-full">{sets.length}</span>
        </div>
        <button onClick={pickRandom} className="btn-yellow flex items-center gap-2 px-6" disabled={sets.length === 0}>
          🎲 Zufälliges Set auswählen
        </button>
      </div>

      <div className="card py-3">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Suche..." className="input-field pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-brand-navy">
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
            <tbody className="divide-y divide-gray-100">
              {loading ? <tr><td colSpan={999} className="text-center py-12 text-gray-400">Lade...</td></tr>
               : table.getRowModel().rows.length === 0 ? <tr><td colSpan={999} className="text-center py-12 text-gray-400">Keine neuen Sets vorhanden</td></tr>
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
              <img src={imagesApi.fileUrl(randomSet.frontcover_edited)} alt="Cover" className="w-full h-48 object-contain rounded-xl bg-gray-50" />
            )}
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-brand-navy">{randomSet.name}</h3>
              <p className="text-gray-600">{randomSet.manufacturer}</p>
              <div className="flex gap-4 text-sm text-gray-500">
                <span>🧱 {randomSet.parts_count?.toLocaleString('de-DE') || '?'} Teile</span>
                <span>📦 {randomSet.stone_size || '?'}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={pickRandom} className="btn-secondary flex-1">Anderes Set 🎲</button>
              <button onClick={handleStartBuilding} className="btn-primary flex-1" disabled={starting}>
                {starting ? '...' : '✓ Jetzt bauen!'}
              </button>
            </div>
            <p className="text-xs text-gray-400 text-center">Status wird auf "Im Bau" gesetzt</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
