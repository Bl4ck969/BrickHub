import { useState, useRef } from 'react'
import { CloudArrowDownIcon, CloudArrowUpIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { backupApi } from '../api/client'

// Phasen-Labels
// 'building'   → Export: aktueller Set-Ordner-Name
// 'upload'     → Import: Datei wird hochgeladen
// 'validating' → Import: ZIP-Prüfung
// 'extracting' → Import: Bilder extrahieren
// 'importing'  → Import: DB-Inserts
function phaseLabel(phase, currentName) {
  if (phase === 'upload') return 'Datei wird hochgeladen…'
  if (phase === 'building') return currentName || 'ZIP wird erstellt…'
  if (phase === 'validating') return currentName || 'Backup wird geprüft…'
  if (phase === 'extracting') return 'Bilder werden extrahiert…'
  if (phase === 'importing') return currentName || 'Datenbank wird aktualisiert…'
  return currentName || ''
}

function ProgressBar({ progress }) {
  if (!progress) return null
  const { phase, current, total, current_name, uploadPercent } = progress

  let percent = null
  let detail = null

  if (phase === 'upload') {
    percent = uploadPercent ?? 0
  } else if ((phase === 'building' || phase === 'extracting' || phase === 'importing') && total > 0) {
    percent = Math.round((current / total) * 100)
    if (phase === 'extracting') detail = `${current} / ${total} Dateien`
    else detail = `${current} / ${total}`
  }

  return (
    <div className="mt-4 space-y-1.5">
      <div className="flex justify-between text-sm text-gray-600">
        <span className="truncate mr-2">{phaseLabel(phase, current_name)}</span>
        {detail && <span className="flex-shrink-0 font-medium">{detail}</span>}
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        {percent !== null ? (
          <div
            className="bg-brand-navy h-2 rounded-full transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        ) : (
          <div className="bg-brand-navy h-2 rounded-full animate-pulse w-full opacity-60" />
        )}
      </div>
      {percent !== null && (
        <p className="text-xs text-gray-500 text-right">{percent}%</p>
      )}
    </div>
  )
}

export function BackupPage() {
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(null)
  const [exportError, setExportError] = useState(null)

  const [selectedFile, setSelectedFile] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [importMode, setImportMode] = useState('append')
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [importError, setImportError] = useState(null)

  const fileInputRef = useRef(null)

  // ── Export ──────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    setExporting(true)
    setExportError(null)
    setExportProgress({ current: 0, total: 0, current_name: 'Wird vorbereitet…' })

    try {
      const { data: { task_id } } = await backupApi.startExport()

      await new Promise((resolve, reject) => {
        const es = new EventSource(`/api/backup/export/progress/${task_id}`)
        es.onmessage = (e) => {
          const data = JSON.parse(e.data)
          setExportProgress(data)
          if (data.status === 'done') { es.close(); resolve() }
          else if (data.status === 'error') { es.close(); reject(new Error(data.error || 'Export fehlgeschlagen')) }
        }
        es.onerror = () => { es.close(); reject(new Error('Verbindung unterbrochen')) }
      })

      window.location.href = `/api/backup/export/download/${task_id}`
    } catch (err) {
      setExportError(err.message || 'Export fehlgeschlagen')
    } finally {
      setExporting(false)
      setExportProgress(null)
    }
  }

  // ── Import ──────────────────────────────────────────────────────────────────

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0] || null)
    setImportResult(null)
    setImportError(null)
  }

  const handleImportClick = () => {
    if (!selectedFile) return
    setImportMode('append')
    setShowModal(true)
  }

  const handleImportConfirm = async () => {
    setShowModal(false)
    setImporting(true)
    setImportResult(null)
    setImportError(null)
    setImportProgress({ phase: 'upload', uploadPercent: 0 })

    try {
      const form = new FormData()
      form.append('file', selectedFile)

      const { data: { task_id } } = await backupApi.startImport(
        form,
        importMode,
        (e) => {
          if (e.total) {
            setImportProgress({ phase: 'upload', uploadPercent: Math.round((e.loaded / e.total) * 100) })
          }
        },
      )

      // Upload fertig → SSE für Verarbeitungs-Fortschritt
      const result = await new Promise((resolve, reject) => {
        const es = new EventSource(`/api/backup/import/progress/${task_id}`)
        es.onmessage = (e) => {
          const data = JSON.parse(e.data)
          setImportProgress(data)
          if (data.status === 'done') { es.close(); resolve(data.result) }
          else if (data.status === 'error') { es.close(); reject(new Error(data.error || 'Import fehlgeschlagen')) }
        }
        es.onerror = () => { es.close(); reject(new Error('Verbindung unterbrochen')) }
      })

      setImportResult(result)
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setImportError(err.message || 'Fehler beim Import')
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-brand-navy">Backup & Restore</h1>

      {/* Export */}
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <CloudArrowDownIcon className="w-8 h-8 text-brand-navy flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-brand-navy mb-1">Datenbank exportieren</h2>
            <p className="text-sm text-gray-600 mb-4">
              Erstellt eine vollständige ZIP-Datei mit allen Sets, Bildern, Kisten, Benutzern und Einstellungen.
            </p>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="btn-primary disabled:opacity-50"
            >
              {exporting ? 'Wird erstellt…' : 'ZIP herunterladen'}
            </button>

            {exporting && exportProgress && (
              <ProgressBar progress={{ ...exportProgress, phase: 'building' }} />
            )}

            {exportError && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
                {exportError}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Import */}
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <CloudArrowUpIcon className="w-8 h-8 text-brand-navy flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-brand-navy mb-1">Backup wiederherstellen</h2>
            <p className="text-sm text-gray-600 mb-4">
              Stellt ein zuvor erstelltes BrickHub-Backup aus einer ZIP-Datei wieder her.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleFileChange}
                className="input-field flex-1"
              />
              <button
                onClick={handleImportClick}
                disabled={!selectedFile || importing}
                className="btn-primary disabled:opacity-50 whitespace-nowrap"
              >
                {importing ? 'Wird importiert…' : 'Backup importieren'}
              </button>
            </div>

            {selectedFile && !importing && (
              <p className="text-sm text-gray-500 mb-2">
                Ausgewählt: <span className="font-medium">{selectedFile.name}</span>
                {' '}({(selectedFile.size / 1024 / 1024).toFixed(1)} MB)
              </p>
            )}

            {importing && <ProgressBar progress={importProgress} />}

            {importResult && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
                <p className="font-semibold mb-1">Import erfolgreich</p>
                <ul className="space-y-0.5">
                  <li>Sets: {importResult.sets}</li>
                  <li>Kisten: {importResult.boxes}</li>
                  <li>Benutzer importiert: {importResult.users_imported}</li>
                  {importResult.users_skipped > 0 && (
                    <li>Benutzer übersprungen (bereits vorhanden): {importResult.users_skipped}</li>
                  )}
                  <li>Bilder: {importResult.images}</li>
                </ul>
              </div>
            )}

            {importError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
                {importError}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="text-lg font-semibold text-brand-navy">Backup importieren</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600">Wähle den Import-Modus:</p>

              <label className="flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors
                               hover:border-brand-navy"
                     style={{ borderColor: importMode === 'append' ? '#1E3A5F' : '#e5e7eb' }}>
                <input
                  type="radio"
                  name="mode"
                  value="append"
                  checked={importMode === 'append'}
                  onChange={() => setImportMode('append')}
                  className="mt-0.5"
                />
                <div>
                  <p className="font-medium text-gray-900">Ergänzen</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Neue Sets und Kisten werden hinzugefügt. Benutzer mit gleichem Namen werden übersprungen.
                  </p>
                  <p className="text-xs text-green-700 mt-1 font-medium">→ Kein Datenverlust möglich</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors
                               hover:border-red-400"
                     style={{ borderColor: importMode === 'replace' ? '#ef4444' : '#e5e7eb' }}>
                <input
                  type="radio"
                  name="mode"
                  value="replace"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                  className="mt-0.5"
                />
                <div>
                  <p className="font-medium text-gray-900">Alles ersetzen ⚠️</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Alle bestehenden Daten und Bilder werden gelöscht und durch das Backup ersetzt.
                  </p>
                  <p className="text-xs text-red-700 mt-1 font-medium">→ Echter Restore, nicht umkehrbar</p>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-3 p-5 border-t">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
                Abbrechen
              </button>
              <button
                onClick={handleImportConfirm}
                className={importMode === 'replace' ? 'btn-danger' : 'btn-primary'}
              >
                Importieren
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
