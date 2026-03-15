import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import {
  PencilSquareIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowsUpDownIcon,
  DocumentArrowDownIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline'
import { setsApi, labelsApi, imagesApi, boxesApi } from '../api/client'
import { OneDriveIcon } from '../components/OneDriveIcon'
import { useAuth } from '../hooks/useAuth'
import { Modal, ConfirmModal } from '../components/Modal'

const STATUS_COLORS = {
  'Neu': 'bg-blue-100 text-blue-700',
  'Aufgebaut': 'bg-green-100 text-green-700',
  'Im Bau': 'bg-amber-100 text-amber-700',
  'Eingelagert': 'bg-gray-100 text-gray-600',
}

const STATUSES = ['Neu', 'Aufgebaut', 'Im Bau', 'Eingelagert']

const BAR_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#F97316', '#EF4444', '#6B7280']

export function SetsPage() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [sets, setSets] = useState([])
  const [summary, setSummary] = useState({ total_count: 0, total_price: 0, total_parts: 0, parts_by_stone_size: {} })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ status: '', stone_size: '', category: '', subcategory: '', manufacturer: '' })
  const [sorting, setSorting] = useState([])
  const [deleteId, setDeleteId] = useState(null)
  const [imageModal, setImageModal] = useState(null)
  const [importLoading, setImportLoading] = useState(false)
  const [boxes, setBoxes] = useState([])
  const [distinctValues, setDistinctValues] = useState({ manufacturers: [], categories: [], subcategories: [] })
  const [showStats, setShowStats] = useState(true)

  useEffect(() => {
    boxesApi.list().then(res => setBoxes(res.data)).catch(err => { if (import.meta.env.DEV) console.warn('Boxes laden fehlgeschlagen', err) })
    setsApi.distinctValues().then(res => setDistinctValues(res.data)).catch(err => { if (import.meta.env.DEV) console.warn('DistinctValues laden fehlgeschlagen', err) })
  }, [])

  const fetchSets = useCallback(async () => {
    setLoading(true)
    try {
      const params = { search, ...filters }
      const res = await setsApi.list(params)
      setSets(res.data.sets)
      setSummary(res.data)
      setImgCacheBuster(Date.now())
    } catch (err) {
      if (import.meta.env.DEV) console.warn('Sets laden fehlgeschlagen', err)
    } finally {
      setLoading(false)
    }
  }, [search, filters])

  useEffect(() => { fetchSets() }, [fetchSets])

  const handleDelete = async (id) => {
    try {
      await setsApi.delete(id)
      fetchSets()
    } catch (err) {
      alert(err.response?.data?.detail || 'Fehler beim Löschen')
    }
  }

  const handleStatusChange = async (id, status) => {
    try {
      await setsApi.updateStatus(id, { status })
      setSets(prev => prev.map(s => s.id === id ? { ...s, status } : s))
    } catch (err) {
      alert(err.response?.data?.detail || 'Fehler')
    }
  }

  const handleInlineChange = async (id, field, value) => {
    try {
      await setsApi.inlineUpdate(id, { [field]: value })
      setSets(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
    } catch (err) {
      if (import.meta.env.DEV) console.warn('Inline-Update fehlgeschlagen', err)
    }
  }

  const handleExportJson = async () => {
    try {
      const res = await setsApi.exportJson()
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `BrickHub-Export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Export fehlgeschlagen')
    }
  }

  const handleExportPdf = async () => {
    try {
      const res = await labelsApi.exportPdf()
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `BrickHub-Setliste-${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('PDF-Export fehlgeschlagen')
    }
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      alert('Datei zu groß (max. 10 MB)')
      e.target.value = ''
      return
    }
    setImportLoading(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      await setsApi.importJson(data)
      fetchSets()
      alert('Import erfolgreich')
    } catch (err) {
      alert(err.response?.data?.detail || 'Import fehlgeschlagen')
    } finally {
      setImportLoading(false)
      e.target.value = ''
    }
  }

  const columnHelper = createColumnHelper()
  // Cache-Buster: ändert sich bei jedem fetchSets(), damit neue Thumbnails sofort sichtbar sind
  const [imgCacheBuster, setImgCacheBuster] = useState(Date.now())

  const columns = [
    // Frontcover – eigene Spalte, adaptives Format (Quer/Hochkant)
    columnHelper.display({
      id: 'frontcover',
      header: 'Front',
      enableSorting: false,
      cell: ({ row }) => row.original.frontcover_thumbnail ? (
        <div className="flex items-center justify-center">
          <img
            src={imagesApi.fileUrl(row.original.frontcover_thumbnail) + '&t=' + imgCacheBuster}
            alt="Front"
            className="max-h-36 max-w-[120px] w-auto h-auto object-contain rounded cursor-pointer hover:opacity-80 transition"
            onClick={() => setImageModal({ url: imagesApi.fileUrl(row.original.frontcover_edited) + '&t=' + imgCacheBuster, title: `${row.original.name} – Frontcover` })}
          />
        </div>
      ) : (
        <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-gray-300 text-xs">–</div>
      ),
    }),
    // Backcover – eigene Spalte, adaptives Format
    columnHelper.display({
      id: 'backcover',
      header: 'Back',
      enableSorting: false,
      cell: ({ row }) => row.original.backcover_thumbnail ? (
        <div className="flex items-center justify-center">
          <img
            src={imagesApi.fileUrl(row.original.backcover_thumbnail) + '&t=' + imgCacheBuster}
            alt="Back"
            className="max-h-36 max-w-[120px] w-auto h-auto object-contain rounded cursor-pointer hover:opacity-80 transition"
            onClick={() => setImageModal({ url: imagesApi.fileUrl(row.original.backcover_edited) + '&t=' + imgCacheBuster, title: `${row.original.name} – Backcover` })}
          />
        </div>
      ) : (
        <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-gray-300 text-xs">–</div>
      ),
    }),
    columnHelper.accessor('name', { header: 'Name', cell: info => <span className="font-medium">{info.getValue()}</span> }),
    columnHelper.accessor('manufacturer', { header: 'Hersteller' }),
    columnHelper.accessor('manufacturer_number', { header: 'Nr.' }),
    columnHelper.accessor('parts_count', { header: 'Teile', cell: info => info.getValue()?.toLocaleString('de-DE') || '-' }),
    columnHelper.accessor('stone_size', { header: 'Steinart' }),
    columnHelper.accessor('category', { header: 'Kategorie', cell: info => <span>{info.getValue()}{info.row.original.subcategory ? ` / ${info.row.original.subcategory}` : ''}</span> }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: ({ row }) => isAdmin ? (
        <select
          value={row.original.status || ''}
          onChange={e => handleStatusChange(row.original.id, e.target.value)}
          className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLORS[row.original.status] || 'bg-gray-100'}`}
        >
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
      ) : (
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[row.original.status] || 'bg-gray-100'}`}>
          {row.original.status}
        </span>
      ),
    }),
    columnHelper.accessor('bag_count', {
      header: 'Tüten',
      cell: ({ row }) => isAdmin ? (
        <input
          type="number"
          min="0"
          value={row.original.bag_count ?? ''}
          onChange={e => handleInlineChange(row.original.id, 'bag_count', e.target.value ? parseInt(e.target.value) : null)}
          className="w-16 text-center border border-gray-200 rounded px-1 py-0.5 text-sm"
        />
      ) : (row.original.bag_count ?? '-'),
    }),
    columnHelper.accessor('plate_count', {
      header: 'Platten',
      cell: ({ row }) => isAdmin ? (
        <input
          type="number"
          min="0"
          value={row.original.plate_count ?? ''}
          onChange={e => handleInlineChange(row.original.id, 'plate_count', e.target.value ? parseInt(e.target.value) : null)}
          className="w-16 text-center border border-gray-200 rounded px-1 py-0.5 text-sm"
        />
      ) : (row.original.plate_count ?? '-'),
    }),
    // Kiste direkt auswählbar (Admin), gefiltert nach Steinart
    columnHelper.display({
      id: 'box',
      header: 'Kiste',
      enableSorting: false,
      cell: ({ row }) => {
        const stoneSize = row.original.stone_size
        const compatBoxes = stoneSize
          ? boxes.filter(b => !b.allowed_stone_types?.length || b.allowed_stone_types.includes(stoneSize))
          : boxes
        return isAdmin ? (
          <select
            value={row.original.box_id ?? ''}
            onChange={e => handleInlineChange(row.original.id, 'box_id', e.target.value !== '' ? Number(e.target.value) : null)}
            className="text-xs border border-gray-200 rounded px-1 py-0.5 min-w-[80px]"
          >
            <option value="">– Keine –</option>
            {compatBoxes.map(b => (
              <option key={b.id} value={b.id} disabled={b.fill_level >= 100}>
                {b.name} ({b.fill_level}%)
              </option>
            ))}
          </select>
        ) : (row.original.box?.name || '-')
      },
    }),
    columnHelper.accessor('price', { header: 'Preis (€)', cell: info => info.getValue() != null ? `${info.getValue().toFixed(2)} €` : '-' }),
    columnHelper.accessor('notes', { header: 'Anmerkungen', cell: info => <span className="max-w-sm block whitespace-normal break-words" title={info.getValue()}>{info.getValue() || ''}</span> }),
    columnHelper.display({
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          {row.original.onedrive_url && (
            <a
              href={row.original.onedrive_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition"
              title="OneDrive-Ordner öffnen"
            >
              <OneDriveIcon className="w-4 h-4" />
            </a>
          )}
          {isAdmin && (
            <>
              <button
                onClick={() => navigate(`/sets/${row.original.id}/edit`)}
                className="p-1.5 text-gray-400 hover:text-brand-navy hover:bg-blue-50 rounded-lg transition"
                title="Bearbeiten"
              >
                <PencilSquareIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDeleteId(row.original.id)}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                title="Löschen"
              >
                <div className="w-4 h-4 rounded-full bg-red-600 flex items-center justify-center">
                  <span className="text-white text-xs font-bold leading-none">×</span>
                </div>
              </button>
            </>
          )}
        </div>
      ),
    }),
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
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-brand-navy">Sets</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowStats(s => !s)} className="btn-secondary flex items-center gap-1.5 text-sm py-1.5">
            <ChartBarIcon className="w-4 h-4" /> Statistik {showStats ? '▲' : '▼'}
          </button>
          {isAdmin && (
            <>
              <button onClick={handleExportJson} className="btn-secondary flex items-center gap-1.5 text-sm py-1.5">
                <ArrowUpTrayIcon className="w-4 h-4" /> JSON Export
              </button>
              <label className="btn-secondary flex items-center gap-1.5 text-sm py-1.5 cursor-pointer">
                <ArrowDownTrayIcon className="w-4 h-4" /> {importLoading ? 'Importiere...' : 'JSON Import'}
                <input type="file" accept=".json" className="hidden" onChange={handleImport} />
              </label>
              <button onClick={handleExportPdf} className="btn-secondary flex items-center gap-1.5 text-sm py-1.5">
                <DocumentArrowDownIcon className="w-4 h-4" /> PDF Export
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {showStats && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="card py-3">
          <p className="text-xs text-gray-500">Gesamt Sets</p>
          <p className="text-2xl font-bold text-brand-navy">{summary.total_count}</p>
        </div>
        <div className="card py-3">
          <p className="text-xs text-gray-500">Gesamt Teile</p>
          <p className="text-2xl font-bold text-brand-navy">{summary.total_parts.toLocaleString('de-DE')}</p>
        </div>
        <div className="card py-3">
          <p className="text-xs text-gray-500">Gesamtwert</p>
          <p className="text-2xl font-bold text-brand-navy">{summary.total_price.toFixed(2)} €</p>
        </div>
        {/* Sets nach Steinart */}
        <div className="card py-3">
          <p className="text-xs text-gray-500 mb-2">Sets nach Steinart</p>
          {(() => {
            const counts = {}
            sets.forEach(s => { const k = s.stone_size || 'Unbekannt'; counts[k] = (counts[k] || 0) + 1 })
            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
            const total = sorted.reduce((s, [, v]) => s + v, 0)
            return sorted.length === 0 ? (
              <p className="text-sm text-gray-400">–</p>
            ) : (
              <>
                <div className="flex h-2.5 rounded-full overflow-hidden mb-2.5 gap-px">
                  {sorted.map(([k, v], i) => (
                    <div key={k} title={`${k}: ${v}`} className="transition-all" style={{ width: `${(v / total) * 100}%`, backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {sorted.map(([k, v], i) => (
                    <div key={k} className="flex items-start gap-1.5 min-w-0">
                      <div className="w-2 h-2 rounded-sm mt-0.5 shrink-0" style={{ backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
                      <span className="text-xs text-gray-600 leading-tight flex-1 break-words">{k}</span>
                      <span className="text-xs font-bold text-brand-navy shrink-0">{v}</span>
                    </div>
                  ))}
                </div>
              </>
            )
          })()}
        </div>
        {/* Teile nach Steinart */}
        <div className="card py-3">
          <p className="text-xs text-gray-500 mb-2">Teile nach Steinart</p>
          {(() => {
            const sorted = Object.entries(summary.parts_by_stone_size || {}).sort((a, b) => b[1] - a[1])
            const total = sorted.reduce((s, [, v]) => s + v, 0)
            return sorted.length === 0 ? (
              <p className="text-sm text-gray-400">–</p>
            ) : (
              <>
                <div className="flex h-2.5 rounded-full overflow-hidden mb-2.5 gap-px">
                  {sorted.map(([k, v], i) => (
                    <div key={k} title={`${k}: ${v.toLocaleString('de-DE')}`} className="transition-all" style={{ width: `${(v / total) * 100}%`, backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {sorted.map(([k, v], i) => (
                    <div key={k} className="flex items-start gap-1.5 min-w-0">
                      <div className="w-2 h-2 rounded-sm mt-0.5 shrink-0" style={{ backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
                      <span className="text-xs text-gray-600 leading-tight flex-1 break-words">{k}</span>
                      <span className="text-xs font-bold text-brand-navy shrink-0">{v.toLocaleString('de-DE')}</span>
                    </div>
                  ))}
                </div>
              </>
            )
          })()}
        </div>
      </div>}

      {/* Search & Filters */}
      <div className="card py-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Suche nach Name, Hersteller, Kategorie..."
            className="input-field pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input-field w-auto" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="">Alle Status</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="input-field w-auto" value={filters.stone_size} onChange={e => setFilters(f => ({ ...f, stone_size: e.target.value }))}>
          <option value="">Alle Steinarten</option>
          {['Standard', 'Standard, beleuchtet', 'Standard, Technik', 'Mini', 'Diamond', 'Sonder-Steine'].map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="input-field w-auto" value={filters.manufacturer} onChange={e => setFilters(f => ({ ...f, manufacturer: e.target.value }))}>
          <option value="">Alle Hersteller</option>
          {distinctValues.manufacturers.map(m => <option key={m}>{m}</option>)}
        </select>
        <select className="input-field w-auto" value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}>
          <option value="">Alle Kategorien</option>
          {distinctValues.categories.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="input-field w-auto" value={filters.subcategory} onChange={e => setFilters(f => ({ ...f, subcategory: e.target.value }))}>
          <option value="">Alle Unterkategorien</option>
          {distinctValues.subcategories?.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: showStats ? 'calc(100vh - 22rem)' : 'calc(100vh - 13rem)' }}>
          <table className="w-full">
            <thead className="bg-brand-navy sticky top-0 z-30">
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id}>
                  {hg.headers.map(header => (
                    <th
                      key={header.id}
                      className="table-th"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <span className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          header.column.getIsSorted() === 'asc' ? <ArrowUpIcon className="w-3 h-3" /> :
                          header.column.getIsSorted() === 'desc' ? <ArrowDownIcon className="w-3 h-3" /> :
                          <ArrowsUpDownIcon className="w-3 h-3 opacity-50" />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={999} className="text-center py-12 text-gray-400">Lade...</td></tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr><td colSpan={999} className="text-center py-12 text-gray-400">Keine Sets gefunden</td></tr>
              ) : (
                table.getRowModel().rows.map(row => (
                  <tr key={row.id} className="table-row">
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="table-td">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Image Modal */}
      <Modal open={!!imageModal} onClose={() => setImageModal(null)} title={imageModal?.title} size="xl">
        <img src={imageModal?.url} alt="Cover" className="w-full h-auto rounded-lg" />
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => handleDelete(deleteId)}
        title="Set löschen"
        message="Sind Sie sicher, dass Sie dieses Set löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden."
      />
    </div>
  )
}
