import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
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
  PlusIcon,
  CubeIcon,
  TableCellsIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline'
import { setsApi, labelsApi, imagesApi, boxesApi } from '../api/client'
import { fehlerText } from '../lib/fehler'
import { OneDriveIcon } from '../components/OneDriveIcon'
import { useAuth } from '../hooks/useAuth'
import { Modal, ConfirmModal } from '../components/Modal'
import { useToast } from '../hooks/useToast'
import { STEINARTEN, steinFarbe, fuellFarbe, zahl } from '../lib/stein'

/* Status ist ein Lebenszyklus, keine Schwereskala - die Farben bilden ihn ab.
   Umriss plus Punkt, damit es nie mit dem gefuellten Gold-Akzent kollidiert. */
const STATUS_STIL = {
  'Neu': 'text-st-new bg-st-new-bg border-st-new/30',
  'Aufgebaut': 'text-st-done bg-st-done-bg border-st-done/30',
  'Im Bau': 'text-st-build bg-st-build-bg border-st-build/30',
  'Eingelagert': 'text-st-rest bg-st-rest-bg border-st-rest/30',
}

const STATUSES = ['Neu', 'Aufgebaut', 'Im Bau', 'Eingelagert']

/* Filter und Sortierung stehen in der Adresse (/sets?stone_size=Diamond&sort=price&dir=desc).
   So fuehrt jeder Klick im Dashboard auf eine gefilterte Uebersicht, und ein Lesezeichen
   haelt den Filter fest. */
const FILTER_SCHLUESSEL = ['status', 'stone_size', 'manufacturer', 'category', 'subcategory']
const SORTIERBAR = ['name', 'manufacturer', 'manufacturer_number', 'parts_count', 'stone_size', 'category', 'status', 'bag_count', 'plate_count', 'price', 'notes']

/* Cover-Groesse in drei Stufen; S ist die Groesse von Design 2.0. Die Thumbnails sind
   400 px gross - mehr als L braucht. */
const COVER_STUFEN = [
  { kurz: 'S', name: 'klein', tabelle: 'h-[58px] w-[76px]', galerie: '176px' },
  { kurz: 'M', name: 'mittel', tabelle: 'h-[87px] w-[114px]', galerie: '240px' },
  { kurz: 'L', name: 'groß', tabelle: 'h-[122px] w-[160px]', galerie: '320px' },
]
const COVER_SPEICHER = 'brickhub-cover-groesse'

function coverStufeLaden() {
  try {
    const n = Number(localStorage.getItem(COVER_SPEICHER))
    return Number.isInteger(n) && n >= 0 && n < COVER_STUFEN.length ? n : 0
  } catch {
    return 0
  }
}


export function SetsPage() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [sets, setSets] = useState([])
  const [summary, setSummary] = useState({ total_count: 0, total_price: 0, total_parts: 0 })
  const [loading, setLoading] = useState(true)
  const [searchParams, setSearchParams] = useSearchParams()
  // Fuer die Abfrage gilt die Suche aus der Adresse ...
  const search = searchParams.get('search') || ''
  // Als Text verglichen, damit `filters` nur bei echter Aenderung neu entsteht (fetchSets haengt daran)
  const filterText = JSON.stringify(FILTER_SCHLUESSEL.map(k => searchParams.get(k) || ''))
  const filters = useMemo(() => {
    const werte = JSON.parse(filterText)
    return Object.fromEntries(FILTER_SCHLUESSEL.map((k, i) => [k, werte[i]]))
  }, [filterText])
  // Einen Parameter aendern, die anderen behalten; leere Werte fliegen aus der Adresse
  /* Vom aktuellen Stand der Adresse ausgehen, nicht von `prev`: react-router 8 reicht
     dort die Parameter des letzten Renders - zwei Aenderungen kurz hintereinander
     (verzoegerte Suche + Filter) wuerden sich sonst gegenseitig ueberschreiben. */
  const paramSetzen = useCallback((schluessel, wert) => {
    setSearchParams(() => {
      const neu = new URLSearchParams(window.location.search)
      if (wert) neu.set(schluessel, wert)
      else neu.delete(schluessel)
      return neu
    }, { replace: true })
  }, [setSearchParams])
  /* ... das Eingabefeld hat aber einen eigenen Zustand. Haengt es direkt an der Adresse,
     kommt jeder Tastendruck erst ueber eine Transition an (react-router 8 aktualisiert
     die Adresse in startTransition) - der Cursor springt, Zeichen gehen verloren.
     Geschrieben wird 300 ms nach dem letzten Tastendruck. Aendert sich die Adresse von
     aussen (Dashboard-Link, Klick auf „Sets“), zieht das Feld nach. */
  const [suchText, setSuchText] = useState(search)
  const [eigeneSuche, setEigeneSuche] = useState(search)
  const [gesehen, setGesehen] = useState(search)
  if (search !== gesehen) {
    setGesehen(search)
    if (search !== eigeneSuche) {
      setSuchText(search)
      setEigeneSuche(search)
    }
  }
  useEffect(() => {
    if (suchText === eigeneSuche) return undefined
    const t = setTimeout(() => {
      setEigeneSuche(suchText)
      paramSetzen('search', suchText.trim() ? suchText : '')
    }, 300)
    return () => clearTimeout(t)
  }, [suchText, eigeneSuche, paramSetzen])

  // Sortierung steht in der Adresse (Dashboard: "Anzahl Steine" -> nach Teilen absteigend)
  const sortId = searchParams.get('sort')
  const sortAbsteigend = searchParams.get('dir') === 'desc'
  const sorting = useMemo(
    () => (SORTIERBAR.includes(sortId) ? [{ id: sortId, desc: sortAbsteigend }] : []),
    [sortId, sortAbsteigend],
  )
  const setSorting = useCallback((aenderung) => {
    const neu = typeof aenderung === 'function' ? aenderung(sorting) : aenderung
    setSearchParams(() => {
      const p = new URLSearchParams(window.location.search)
      if (neu?.[0]) {
        p.set('sort', neu[0].id)
        p.set('dir', neu[0].desc ? 'desc' : 'asc')
      } else {
        p.delete('sort')
        p.delete('dir')
      }
      return p
    }, { replace: true })
  }, [sorting, setSearchParams])
  const [coverStufe, setCoverStufe] = useState(coverStufeLaden)
  const coverStufeSetzen = useCallback((n) => {
    setCoverStufe(n)
    try {
      localStorage.setItem(COVER_SPEICHER, String(n))
    } catch {
      // nicht speicherbar - gilt dann nur fuer diese Sitzung
    }
  }, [])
  const [deleteId, setDeleteId] = useState(null)
  const [imageModal, setImageModal] = useState(null)
  const [importLoading, setImportLoading] = useState(false)
  const [boxes, setBoxes] = useState([])
  const [distinctValues, setDistinctValues] = useState({ manufacturers: [], categories: [], subcategories: [] })
  // Die gewaehlte Ansicht ueberlebt den Seitenwechsel
  const [ansicht, setAnsicht] = useState(() => {
    try {
      return localStorage.getItem('brickhub-sets-ansicht') === 'galerie' ? 'galerie' : 'tabelle'
    } catch {
      return 'tabelle'
    }
  })

  const ansichtWechseln = useCallback((neu) => {
    setAnsicht(neu)
    try {
      localStorage.setItem('brickhub-sets-ansicht', neu)
    } catch {
      // nicht speicherbar - gilt dann nur fuer diese Sitzung
    }
  }, [])
  // Cache-Buster: aendert sich bei jedem fetchSets(), damit neue Thumbnails sofort sichtbar sind
  const [imgCacheBuster, setImgCacheBuster] = useState(Date.now())

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
      toast(fehlerText(err, 'Fehler beim Löschen'), 'error')
    }
  }

  const handleStatusChange = async (id, status) => {
    try {
      await setsApi.updateStatus(id, { status })
      setSets(prev => prev.map(s => s.id === id ? { ...s, status } : s))
    } catch (err) {
      toast(fehlerText(err, 'Fehler'), 'error')
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
    } catch {
      toast('Export fehlgeschlagen', 'error')
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
    } catch {
      toast('PDF-Export fehlgeschlagen', 'error')
    }
  }

  const handleImport = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      toast('Datei zu groß (max. 10 MB)', 'warning')
      e.target.value = ''
      return
    }
    setImportLoading(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      await setsApi.importJson(data)
      fetchSets()
      toast('Import erfolgreich', 'success')
    } catch (err) {
      toast(fehlerText(err, 'Import fehlgeschlagen'), 'error')
    } finally {
      setImportLoading(false)
      e.target.value = ''
    }
  }

  const coverUrl = (pfad) => imagesApi.fileUrl(pfad) + '&t=' + imgCacheBuster

  /* Vorder- und Rueckseite nebeneinander statt gestapelt: gestapelt verdeckt
     die Rueckseite fast vollstaendig. `object-contain` statt `cover`, damit
     nichts beschnitten wird - die Verpackungen sind mal quer, mal hochkant. */
  const CoverPaar = ({ row }) => {
    const s = row.original
    const bild = (pfad, gross, titel) =>
      pfad ? (
        <button
          type="button"
          onClick={() => setImageModal({ url: coverUrl(gross), title: `${s.name} – ${titel}` })}
          title={`${s.name} – ${titel} vergrößern`}
          className={`block ${COVER_STUFEN[coverStufe].tabelle} shrink-0 cursor-zoom-in overflow-hidden rounded-md border
            border-line-2 bg-surface-2 p-px shadow-s transition-all duration-150
            hover:border-gold hover:shadow-m focus-visible:border-gold`}
        >
          <img src={coverUrl(pfad)} alt="" loading="lazy" className="h-full w-full rounded-sm object-contain" />
        </button>
      ) : (
        <div
          className={`grid ${COVER_STUFEN[coverStufe].tabelle} shrink-0 place-items-center rounded-md border border-dashed
            border-line text-[10px] text-ink-3`}
          title={`Kein ${titel}`}
        >
          {titel === 'Frontcover' ? 'Vorne' : 'Hinten'}
        </div>
      )
    return (
      <div className="flex items-center gap-1.5">
        {bild(s.frontcover_thumbnail, s.frontcover_edited, 'Frontcover')}
        {bild(s.backcover_thumbnail, s.backcover_edited, 'Backcover')}
      </div>
    )
  }

  const columnHelper = createColumnHelper()

  const columns = [
    columnHelper.display({
      id: 'cover',
      header: 'Cover',
      enableSorting: false,
      cell: ({ row }) => <CoverPaar row={row} />,
    }),
    columnHelper.accessor('name', {
      header: 'Set',
      cell: info => <span className="font-semibold">{info.getValue()}</span>,
    }),
    columnHelper.accessor('manufacturer', {
      header: 'Hersteller',
      cell: info => <span className="text-ink-2">{info.getValue()}</span>,
    }),
    columnHelper.accessor('manufacturer_number', {
      header: 'Nr.',
      cell: info => <span className="font-mono text-[11.5px] text-ink-2">{info.getValue()}</span>,
    }),
    columnHelper.accessor('parts_count', {
      header: 'Teile',
      meta: { rechts: true },
      cell: info => zahl(info.getValue()),
    }),
    columnHelper.accessor('stone_size', {
      header: 'Steinart',
      cell: info => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-ink-2">
          <span className="h-[7px] w-[7px] shrink-0 rounded-xs" style={{ background: steinFarbe(info.getValue()) }} />
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor('category', {
      header: 'Kategorie',
      cell: info => (
        <div className="leading-tight">
          <div className="text-[12.5px]">{info.getValue()}</div>
          {info.row.original.subcategory && (
            <div className="text-[11px] text-ink-3">{info.row.original.subcategory}</div>
          )}
        </div>
      ),
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: ({ row }) => {
        const stil = STATUS_STIL[row.original.status] || 'text-ink-2 bg-surface-3 border-line'
        return isAdmin ? (
          <select
            value={row.original.status || ''}
            onChange={e => handleStatusChange(row.original.id, e.target.value)}
            aria-label={`Status von ${row.original.name}`}
            className={`cursor-pointer appearance-none rounded-full border py-[3px] pr-5 pl-5 text-[11.5px]
              font-semibold ${stil} bg-[image:radial-gradient(circle_at_9px_50%,currentColor_3px,transparent_3.6px)]
              bg-no-repeat hover:brightness-97`}
          >
            {STATUSES.map(s => <option key={s} className="bg-surface font-medium text-ink">{s}</option>)}
          </select>
        ) : (
          <span className={`status-pill ${stil}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {row.original.status}
          </span>
        )
      },
    }),
    columnHelper.accessor('bag_count', {
      header: 'Tüten',
      meta: { rechts: true },
      cell: ({ row }) => isAdmin ? (
        <input
          type="number"
          min="0"
          value={row.original.bag_count ?? ''}
          onChange={e => handleInlineChange(row.original.id, 'bag_count', e.target.value ? parseInt(e.target.value) : null)}
          aria-label={`Tüten für ${row.original.name}`}
          className="w-11 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-right text-[12.5px]
            transition-colors hover:border-line-2 hover:bg-surface focus:border-gold focus:bg-surface
            focus:ring-3 focus:ring-gold-soft focus:outline-hidden"
        />
      ) : (row.original.bag_count ?? '–'),
    }),
    columnHelper.accessor('plate_count', {
      header: 'Platten',
      meta: { rechts: true },
      cell: ({ row }) => isAdmin ? (
        <input
          type="number"
          min="0"
          value={row.original.plate_count ?? ''}
          onChange={e => handleInlineChange(row.original.id, 'plate_count', e.target.value ? parseInt(e.target.value) : null)}
          aria-label={`Platten für ${row.original.name}`}
          className="w-11 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-right text-[12.5px]
            transition-colors hover:border-line-2 hover:bg-surface focus:border-gold focus:bg-surface
            focus:ring-3 focus:ring-gold-soft focus:outline-hidden"
        />
      ) : (row.original.plate_count ?? '–'),
    }),
    columnHelper.display({
      id: 'box',
      header: 'Kiste',
      enableSorting: false,
      cell: ({ row }) => {
        const stoneSize = row.original.stone_size
        const compatBoxes = stoneSize
          ? boxes.filter(b => !b.allowed_stone_types?.length || b.allowed_stone_types.includes(stoneSize))
          : boxes
        const aktuell = boxes.find(b => b.id === row.original.box_id)
        return isAdmin ? (
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            {aktuell && (
              <span className="h-1 w-6 shrink-0 overflow-hidden rounded-full bg-surface-3" title={`Füllstand ${aktuell.fill_level} %`}>
                <span className="block h-full rounded-full" style={{ width: `${aktuell.fill_level}%`, background: fuellFarbe(aktuell.fill_level) }} />
              </span>
            )}
            <select
              value={row.original.box_id ?? ''}
              onChange={e => handleInlineChange(row.original.id, 'box_id', e.target.value !== '' ? Number(e.target.value) : null)}
              aria-label={`Kiste für ${row.original.name}`}
              className={`min-w-[92px] cursor-pointer rounded-md border border-transparent bg-transparent py-0.5 pr-1 pl-1.5
                text-[12px] transition-colors hover:border-line-2 hover:bg-surface focus:border-gold focus:bg-surface
                focus:ring-3 focus:ring-gold-soft focus:outline-hidden ${aktuell ? '' : 'text-ink-3'}`}
            >
              <option value="">– Keine –</option>
              {compatBoxes.map(b => (
                <option key={b.id} value={b.id} disabled={b.fill_level >= 100 && b.id !== row.original.box_id}>
                  {b.name} ({b.fill_level}%)
                </option>
              ))}
            </select>
          </span>
        ) : (row.original.box?.name || '–')
      },
    }),
    columnHelper.accessor('price', {
      header: 'Preis',
      meta: { rechts: true },
      cell: info => info.getValue() != null
        ? <span className="font-medium">{info.getValue().toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
        : '–',
    }),
    columnHelper.accessor('notes', {
      header: 'Anmerkung',
      cell: info => (
        <span className="block max-w-[230px] min-w-[150px] text-[12px] leading-snug wrap-break-word whitespace-normal text-ink-2" title={info.getValue()}>
          {info.getValue() || ''}
        </span>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-0.5 opacity-60 transition-opacity
          group-hover/row:opacity-100 focus-within:opacity-100 max-[1024px]:opacity-100">
          {row.original.onedrive_url && (
            <a
              href={row.original.onedrive_url}
              target="_blank"
              rel="noopener noreferrer"
              className="grid h-[26px] w-[26px] place-items-center rounded-md text-ink-3 transition-colors
                hover:bg-st-new-bg hover:text-st-new"
              title="OneDrive-Ordner öffnen"
            >
              <OneDriveIcon className="h-4 w-4" />
            </a>
          )}
          {isAdmin && (
            <>
              <button
                onClick={() => navigate(`/sets/${row.original.id}/edit`)}
                className="grid h-[26px] w-[26px] place-items-center rounded-md text-ink-3 transition-colors
                  hover:bg-surface-3 hover:text-ink"
                title="Bearbeiten"
              >
                <PencilSquareIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => setDeleteId(row.original.id)}
                className="grid h-[26px] w-[26px] place-items-center rounded-md text-ink-3 transition-colors
                  hover:bg-crit-bg hover:text-crit"
                title="Löschen"
              >
                <TrashIcon className="h-4 w-4" />
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
    enableMultiSort: false, // in der Adresse steht genau eine Sortierung
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const Werkzeug = () => (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-0.5 rounded-lg border border-line bg-surface p-[3px] shadow-s" role="group" aria-label="Darstellung">
        {[
          { id: 'tabelle', label: 'Tabelle', Icon: TableCellsIcon },
          { id: 'galerie', label: 'Galerie', Icon: Squares2X2Icon },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => ansichtWechseln(id)}
            aria-pressed={ansicht === id}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
              ansicht === id ? 'bg-brand-navy text-white dark:bg-surface-3 dark:text-ink' : 'text-ink-2 hover:bg-surface-3 hover:text-ink'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {isAdmin && (
        <>
          <button onClick={handleExportJson} className="btn-secondary">
            <ArrowUpTrayIcon className="h-4 w-4" /> JSON Export
          </button>
          <label className="btn-secondary cursor-pointer">
            <ArrowDownTrayIcon className="h-4 w-4" /> {importLoading ? 'Importiere…' : 'JSON Import'}
            <input type="file" accept=".json" className="hidden" onChange={handleImport} />
          </label>
          <button onClick={handleExportPdf} className="btn-secondary">
            <DocumentArrowDownIcon className="h-4 w-4" /> PDF Export
          </button>
          <button onClick={() => navigate('/sets/new')} className="btn-yellow">
            <PlusIcon className="h-4 w-4 stroke-[2.2]" /> Set anlegen
          </button>
        </>
      )}
    </div>
  )

  return (
    <div className="flex min-h-screen flex-col">
      {/* Kopfleiste */}
      <div className="flex flex-wrap items-end gap-4 border-b border-line bg-surface px-4 py-4 md:px-6">
        <div className="mr-auto min-w-0">
          <h1 className="mb-0.5 text-[25px] font-bold">Sets</h1>
          <p className="text-[12.5px] text-ink-3">
            <b className="font-semibold text-ink-2">{zahl(summary.total_count)}</b> Sets
            {' · '}<b className="font-semibold text-ink-2">{zahl(summary.total_parts)}</b> Teile
            {' · '}<b className="font-semibold text-ink-2">
              {summary.total_price.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </b>
          </p>
        </div>
        <Werkzeug />
      </div>

      <div className="studs-bg flex-1 p-4 md:p-5">
        {/* Suche und Filter */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <input
              type="text"
              placeholder="Suche nach Name, Hersteller, Kategorie…"
              className="input-field pl-9"
              value={suchText}
              onChange={e => setSuchText(e.target.value)}
            />
          </div>
          {[
            { schluessel: 'status', leer: 'Alle Status', werte: STATUSES },
            { schluessel: 'stone_size', leer: 'Alle Steinarten', werte: STEINARTEN },
            { schluessel: 'manufacturer', leer: 'Alle Hersteller', werte: distinctValues.manufacturers },
            { schluessel: 'category', leer: 'Alle Kategorien', werte: distinctValues.categories },
            { schluessel: 'subcategory', leer: 'Alle Unterkategorien', werte: distinctValues.subcategories || [] },
          ].map(({ schluessel, leer, werte }) => (
            <select
              key={schluessel}
              aria-label={leer}
              className="rounded-lg border border-line bg-surface px-2.5 py-2 text-[12.5px] text-ink-2 shadow-s
                focus:border-gold focus:ring-3 focus:ring-gold-soft focus:outline-hidden"
              value={filters[schluessel]}
              onChange={e => paramSetzen(schluessel, e.target.value)}
            >
              <option value="">{leer}</option>
              {/* Kommt ein Wert per Adresse, den die Liste nicht kennt, trotzdem zeigen */}
              {filters[schluessel] && !werte.includes(filters[schluessel]) && <option>{filters[schluessel]}</option>}
              {werte.map(w => <option key={w}>{w}</option>)}
            </select>
          ))}
          <CoverSchieber stufe={coverStufe} setzen={coverStufeSetzen} />
        </div>

        {/* Tabelle */}
        {ansicht === 'tabelle' && (
          <div className="panel">
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 15rem)' }}>
              <table className="w-full border-separate border-spacing-0">
                <thead className="sticky top-0 z-30">
                  {table.getHeaderGroups().map(hg => (
                    <tr key={hg.id}>
                      {hg.headers.map(header => (
                        <th
                          key={header.id}
                          className={`table-th ${header.column.columnDef.meta?.rechts ? 'text-right' : ''}`}
                          onClick={header.column.getToggleSortingHandler()}
                          aria-sort={
                            header.column.getIsSorted() === 'asc' ? 'ascending'
                              : header.column.getIsSorted() === 'desc' ? 'descending'
                                : undefined
                          }
                        >
                          <span className={`flex items-center gap-1.5 ${header.column.columnDef.meta?.rechts ? 'justify-end' : ''}`}>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getCanSort() && (
                              header.column.getIsSorted() === 'asc' ? <ArrowUpIcon className="h-3 w-3 text-gold" /> :
                                header.column.getIsSorted() === 'desc' ? <ArrowDownIcon className="h-3 w-3 text-gold" /> :
                                  <ArrowsUpDownIcon className="h-3 w-3 opacity-35" />
                            )}
                          </span>
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={999} className="py-12 text-center text-ink-3">Lade…</td></tr>
                  ) : table.getRowModel().rows.length === 0 ? (
                    <tr><td colSpan={999} className="py-12 text-center text-ink-3">Keine Sets gefunden</td></tr>
                  ) : (
                    table.getRowModel().rows.map(row => (
                      <tr key={row.id} className="group/row table-row">
                        {row.getVisibleCells().map(cell => (
                          <td key={cell.id} className={`table-td ${cell.column.columnDef.meta?.rechts ? 'text-right whitespace-nowrap' : ''}`}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-line bg-surface-2 px-3.5 py-2.5 text-[12px] text-ink-3">
              <span>
                <b className="font-semibold text-ink-2">{sets.length}</b> von{' '}
                <b className="font-semibold text-ink-2">{summary.total_count}</b> Sets
              </span>
              {isAdmin && (
                <span className="ml-auto">Änderungen an Status, Tüten, Platten und Kiste werden sofort gespeichert</span>
              )}
            </div>
          </div>
        )}

        {/* Galerie */}
        {ansicht === 'galerie' && (
          loading ? (
            <div className="py-12 text-center text-ink-3">Lade…</div>
          ) : sets.length === 0 ? (
            <div className="py-12 text-center text-ink-3">Keine Sets gefunden</div>
          ) : (
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${COVER_STUFEN[coverStufe].galerie}, 1fr))` }}
            >
              {table.getRowModel().rows.map(({ original: s }) => (
                <article
                  key={s.id}
                  className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-s
                    transition-all duration-150 hover:-translate-y-0.5 hover:border-line-2 hover:shadow-m"
                >
                  <button
                    type="button"
                    onClick={() => s.frontcover_edited && setImageModal({ url: coverUrl(s.frontcover_edited), title: `${s.name} – Frontcover` })}
                    className="relative block aspect-4/3 w-full cursor-zoom-in overflow-hidden border-b border-line bg-surface-2"
                  >
                    {s.frontcover_thumbnail ? (
                      <img src={coverUrl(s.frontcover_thumbnail)} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-[11px] text-ink-3">Kein Cover</span>
                    )}
                    {s.stone_size && (
                      <span className="absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-md bg-[#0a1220]/65
                        px-1.5 py-0.5 text-[10.5px] font-semibold text-white backdrop-blur-xs">
                        <span className="h-1.5 w-1.5 rounded-xs" style={{ background: steinFarbe(s.stone_size) }} />
                        {s.stone_size}
                      </span>
                    )}
                    <span
                      className={`absolute top-2 right-2 h-2.5 w-2.5 rounded-full border-2 border-[#0a1220]/35
                        ${STATUS_STIL[s.status]?.split(' ')[0]?.replace('text-', 'bg-') || 'bg-ink-3'}`}
                      title={s.status}
                    />
                  </button>
                  <div className="flex flex-1 flex-col gap-0.5 px-3 pt-2.5 pb-2.5">
                    <div className="text-[13px] leading-snug font-semibold">{s.name}</div>
                    <div className="text-[11.5px] text-ink-3">{s.manufacturer}</div>
                    <div className="mt-1.5 mb-2 flex items-baseline gap-2 text-[11.5px] text-ink-2 tabular-nums">
                      <span>{zahl(s.parts_count)} Teile</span>
                      {s.price != null && (
                        <span className="ml-auto font-semibold text-ink">
                          {s.price.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                        </span>
                      )}
                    </div>
                    {/* Fusszeile: Kiste als Tag, rechts die Aktionen. Immer sichtbar -
                        am Handy gibt es kein Ueberfahren mit der Maus. */}
                    <div className="mt-auto flex items-center gap-1 border-t border-dashed border-line pt-2">
                      <KistenTag kiste={boxes.find(b => b.id === s.box_id) || s.box} />
                      <span className="ml-auto" />
                      {s.onedrive_url && (
                        <a
                          href={s.onedrive_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-st-new transition-colors hover:bg-st-new-bg"
                          title="OneDrive-Ordner öffnen"
                          aria-label={`OneDrive-Ordner von ${s.name} öffnen`}
                        >
                          <OneDriveIcon className="h-4 w-4" />
                        </a>
                      )}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => navigate(`/sets/${s.id}/edit`)}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line text-ink-2
                            transition-colors hover:bg-surface-3 hover:text-ink"
                          title="Bearbeiten"
                          aria-label={`${s.name} bearbeiten`}
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )
        )}
      </div>

      {/* Bild-Vergrößerung */}
      <Modal open={!!imageModal} onClose={() => setImageModal(null)} title={imageModal?.title} size="xl">
        <img src={imageModal?.url} alt="Cover" className="h-auto w-full rounded-lg" />
      </Modal>

      {/* Löschen bestätigen */}
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


/** Kiste als Tag: Symbol, Name und Fuellstand wie in der Tabelle. */
function KistenTag({ kiste }) {
  if (!kiste) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-line px-1.5 py-0.5
        text-[11px] text-ink-3">
        <CubeIcon className="h-3 w-3" /> keine Kiste
      </span>
    )
  }
  const fuell = kiste.fill_level
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-line-2 bg-surface-2 py-0.5 pr-1.5 pl-1
        text-[11px] font-semibold text-ink-2"
      title={fuell != null ? `${kiste.name} · Füllstand ${fuell} %` : kiste.name}
    >
      <CubeIcon className="h-3 w-3 shrink-0" />
      <span className="truncate">{kiste.name}</span>
      {fuell != null && (
        <span className="h-1 w-[18px] shrink-0 overflow-hidden rounded-full bg-surface-3">
          <span className="block h-full rounded-full" style={{ width: `${Math.min(fuell, 100)}%`, background: fuellFarbe(fuell) }} />
        </span>
      )}
    </span>
  )
}

/** Schieber fuer die Cover-Groesse, drei Raststufen. Gilt fuer Tabelle und Galerie. */
function CoverSchieber({ stufe, setzen }) {
  return (
    <label
      className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 shadow-s"
      title="Cover-Größe"
    >
      <span className="text-[10.5px] font-semibold tracking-wider text-ink-3 uppercase">Cover</span>
      <span aria-hidden="true" className="h-2.5 w-3 rounded-[2px] border-[1.5px] border-ink-3" />
      <input
        type="range"
        min="0"
        max={COVER_STUFEN.length - 1}
        step="1"
        value={stufe}
        onChange={e => setzen(Number(e.target.value))}
        aria-label="Cover-Größe"
        aria-valuetext={COVER_STUFEN[stufe].name}
        className="w-20 cursor-pointer accent-gold"
      />
      <span aria-hidden="true" className="h-3.5 w-[18px] rounded-[2px] border-[1.5px] border-ink-3" />
      <span className="w-3 font-mono text-[11.5px] font-semibold text-ink-2">{COVER_STUFEN[stufe].kurz}</span>
    </label>
  )
}
