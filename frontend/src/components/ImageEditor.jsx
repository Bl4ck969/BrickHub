import { useState, useRef, useEffect, useCallback } from 'react'
import { Modal } from './Modal'
import { imagesApi } from '../api/client'
import { useToast } from '../hooks/useToast'

const HANDLE_R = 13
const PAD = HANDLE_R + 8
const COLORS = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B']
const LABELS = ['OL', 'OR', 'UR', 'UL']
const CORNER_NAMES = ['Oben Links', 'Oben Rechts', 'Unten Rechts', 'Unten Links']

/**
 * Rechnet Viewport-Koordinaten (clientX/Y) in Canvas-Pixel um.
 * Berücksichtigt CSS-Rotation des Canvas-Elements.
 */
function clientToCanvas(canvas, clientX, clientY, rotation) {
  const rect = canvas.getBoundingClientRect()

  if (!rotation) {
    const sfx = canvas.width / rect.width
    const sfy = canvas.height / rect.height
    return [
      (clientX - rect.left) * sfx,
      (clientY - rect.top) * sfy,
    ]
  }

  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const dx = clientX - cx
  const dy = clientY - cy
  const rad = -rotation * Math.PI / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const localX = dx * cos - dy * sin
  const localY = dx * sin + dy * cos
  const sfx = canvas.width / canvas.offsetWidth
  const sfy = canvas.height / canvas.offsetHeight
  return [
    (localX + canvas.offsetWidth / 2) * sfx,
    (localY + canvas.offsetHeight / 2) * sfy,
  ]
}

// ── Schritt-Anzeige ────────────────────────────────────────────────────────
const PHASES = ['upload', 'edit', 'preview', 'final']
const PHASE_LABELS = ['Upload', 'Bearbeiten', 'Vorschau', 'Fertig']

function StepIndicator({ phase }) {
  const current = PHASES.indexOf(phase)
  return (
    <div className="flex items-center gap-1.5">
      {PHASE_LABELS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={label} className="flex items-center gap-1.5">
            {i > 0 && (
              <div className={`w-5 h-0.5 rounded transition-all ${done || active ? 'bg-brand-navy' : 'bg-gray-200'}`} />
            )}
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              done ? 'bg-brand-navy border-brand-navy text-brand-yellow'
              : active ? 'bg-brand-yellow border-brand-yellow text-brand-navy font-bold'
              : 'bg-white border-gray-200 text-gray-400'
            }`}>
              <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-xs leading-none ${
                done ? 'bg-brand-yellow/20 text-brand-yellow'
                : active ? 'bg-brand-navy/15 text-brand-navy'
                : 'border border-gray-300 text-gray-400'
              }`}>
                {done ? '✓' : i + 1}
              </span>
              {label}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function ImageEditor({ open, onClose, setId, side, existingOriginalPath, onFinalized, manufacturer, setName }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)

  const stateRef = useRef({
    corners: null,
    scale: 1,
    rotation: 0,
    dragging: -1,
    panning: false,
    panStartX: 0,
    panStartY: 0,
    panScrollX: 0,
    panScrollY: 0,
    imgEl: null,
    canvasW: 0,
    canvasH: 0,
  })

  const toast = useToast()

  const [originalPath, setOriginalPath] = useState(null)
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  const [corners, setCorners] = useState(null)
  const [rotation, setRotation] = useState(0)
  const [brightness, setBrightness] = useState(1.05)
  const [saturation, setSaturation] = useState(1.05)
  const [previewPath, setPreviewPath] = useState(null)
  const [finalResult, setFinalResult] = useState(null)
  const [loading, setLoading] = useState('')
  const [zoom, setZoom] = useState(1)
  const [baseScale, setBaseScale] = useState(1)
  const [phase, setPhase] = useState('upload')
  const [uploadTs, setUploadTs] = useState(Date.now())
  const [isDragging, setIsDragging] = useState(false)

  const scale = baseScale * zoom

  // Rotierte Bounding-Box für Wrapper-Dimensionen
  const canvasW = imgSize.w ? Math.round(imgSize.w * scale) + 2 * PAD : 0
  const canvasH = imgSize.h ? Math.round(imgSize.h * scale) + 2 * PAD : 0
  const rad = (rotation || 0) * Math.PI / 180
  const absCos = Math.abs(Math.cos(rad))
  const absSin = Math.abs(Math.sin(rad))
  const rotatedW = Math.ceil(canvasW * absCos + canvasH * absSin) || 0
  const rotatedH = Math.ceil(canvasW * absSin + canvasH * absCos) || 0

  useEffect(() => {
    stateRef.current.corners = corners
    stateRef.current.scale = scale
    stateRef.current.rotation = rotation
  }, [corners, scale, rotation])

  // Reset bei jedem Öffnen
  useEffect(() => {
    if (open) {
      setOriginalPath(null)
      setCorners(null)
      setRotation(0)
      setBrightness(1.05)
      setSaturation(1.05)
      setPreviewPath(null)
      setFinalResult(null)
      setLoading('')
      setZoom(1)
      setBaseScale(1)
      setPhase('upload')
      setUploadTs(Date.now())
      stateRef.current = {
        corners: null, scale: 1, rotation: 0,
        dragging: -1, panning: false, panStartX: 0, panStartY: 0, panScrollX: 0, panScrollY: 0,
        imgEl: null, canvasW: 0, canvasH: 0,
      }
    }
  }, [open])

  // ── Canvas-Zeichnung ────────────────────────────────────────────────────
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const { imgEl, corners: pts, scale: s } = stateRef.current
    if (!canvas || !imgEl || !pts) return

    const ctx = canvas.getContext('2d')
    const imgW = Math.round(imgEl.naturalWidth * s)
    const imgH = Math.round(imgEl.naturalHeight * s)
    const w = imgW + 2 * PAD
    const h = imgH + 2 * PAD

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      stateRef.current.canvasW = w
      stateRef.current.canvasH = h
    } else {
      ctx.clearRect(0, 0, w, h)
    }

    // Hintergrund mit subtilen Grid-Linien
    ctx.fillStyle = '#111827'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 1
    for (let x = 0; x < w; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
    for (let y = 0; y < h; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }

    // Bild zeichnen
    ctx.drawImage(imgEl, PAD, PAD, imgW, imgH)

    // Skalierte Ecken
    const sp = pts.map(([x, y]) => [x * s + PAD, y * s + PAD])

    // Dunkles Overlay außerhalb der Auswahl
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, w, h)
    ctx.moveTo(sp[0][0], sp[0][1])
    for (let i = 3; i >= 0; i--) ctx.lineTo(sp[i][0], sp[i][1])
    ctx.closePath()
    ctx.fill('evenodd')
    ctx.restore()

    // Gestrichelte Auswahlgrenze in Gold
    ctx.beginPath()
    ctx.moveTo(sp[0][0], sp[0][1])
    for (let i = 1; i < 4; i++) ctx.lineTo(sp[i][0], sp[i][1])
    ctx.closePath()
    ctx.strokeStyle = '#FFD700'
    ctx.lineWidth = 2
    ctx.setLineDash([8, 4])
    ctx.stroke()
    ctx.setLineDash([])

    // Mittelpunkt-Handles auf jeder Seite (klein, weiß)
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4
      const mx = (sp[i][0] + sp[j][0]) / 2
      const my = (sp[i][1] + sp[j][1]) / 2
      ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5; ctx.stroke()
    }

    // Eck-Handles mit Glow-Effekt
    sp.forEach(([x, y], i) => {
      // Glow
      const glow = ctx.createRadialGradient(x, y, HANDLE_R - 2, x, y, HANDLE_R + 8)
      glow.addColorStop(0, COLORS[i] + '50')
      glow.addColorStop(1, 'transparent')
      ctx.beginPath(); ctx.arc(x, y, HANDLE_R + 8, 0, Math.PI * 2)
      ctx.fillStyle = glow; ctx.fill()

      // Schatten
      ctx.beginPath(); ctx.arc(x, y, HANDLE_R + 2, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill()

      // Haupt-Circle
      ctx.beginPath(); ctx.arc(x, y, HANDLE_R, 0, Math.PI * 2)
      ctx.fillStyle = COLORS[i]; ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke()

      // Label
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 9px Inter, sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(LABELS[i], x, y)
    })
  }, [])

  useEffect(() => { drawCanvas() }, [corners, scale, drawCanvas])

  // Scroll-Zentrierung nach Zoom/Rotation
  useEffect(() => {
    const container = containerRef.current
    if (!container || !rotatedW) return
    const excessW = rotatedW - container.clientWidth
    container.scrollLeft = excessW > 0 ? excessW / 2 : 0
    const excessH = rotatedH - container.clientHeight
    container.scrollTop = excessH > 0 ? excessH / 2 : 0
  }, [rotatedW, rotatedH])

  // ── Window-level Pointer-Events: Handle-Drag + Pan ─────────────────────
  useEffect(() => {
    const onMove = (e) => {
      const st = stateRef.current
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY

      if (st.dragging >= 0 && st.corners) {
        e.preventDefault()
        const canvas = canvasRef.current
        if (!canvas) return
        const [canvasX, canvasY] = clientToCanvas(canvas, clientX, clientY, st.rotation)
        const newX = (canvasX - PAD) / st.scale
        const newY = (canvasY - PAD) / st.scale
        st.corners = st.corners.map((c, i) => i === st.dragging ? [newX, newY] : c)
        drawCanvas()
        return
      }

      if (st.panning) {
        e.preventDefault()
        const container = containerRef.current
        if (!container) return
        container.scrollLeft = st.panScrollX - (clientX - st.panStartX)
        container.scrollTop = st.panScrollY - (clientY - st.panStartY)
      }
    }

    const onUp = () => {
      const st = stateRef.current
      if (st.dragging >= 0) {
        setCorners([...st.corners])
        st.dragging = -1
      }
      if (st.panning) st.panning = false
    }

    window.addEventListener('mousemove', onMove, { passive: false })
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [drawCanvas])

  const handlePointerDown = (e) => {
    const st = stateRef.current
    if (!st.corners) return
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const canvas = canvasRef.current
    if (!canvas) return

    const [cx, cy] = clientToCanvas(canvas, clientX, clientY, st.rotation)

    const hitR = HANDLE_R * 3.5
    for (let i = 0; i < 4; i++) {
      const hx = st.corners[i][0] * st.scale + PAD
      const hy = st.corners[i][1] * st.scale + PAD
      if (Math.hypot(cx - hx, cy - hy) < hitR) {
        st.dragging = i
        e.preventDefault()
        return
      }
    }

    const container = containerRef.current
    if (container) {
      st.panning = true
      st.panStartX = clientX
      st.panStartY = clientY
      st.panScrollX = container.scrollLeft
      st.panScrollY = container.scrollTop
      e.preventDefault()
    }
  }

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(z => Math.max(0.1, Math.min(10, z * delta)))
  }, [])

  // ── Clipboard-Paste & Drag-Drop ────────────────────────────────────────
  useEffect(() => {
    if (!open || phase !== 'upload') return
    const onPaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const blob = item.getAsFile()
          if (blob) handleFileSelect(blob)
          return
        }
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [open, phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer?.files?.[0]
    if (file && file.type.startsWith('image/')) handleFileSelect(file)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    // Nur wenn wir den Drop-Bereich wirklich verlassen
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false)
  }

  // ── Upload ──────────────────────────────────────────────────────────────
  const handleFileSelect = async (file) => {
    if (!file) return
    setLoading('Lade hoch...')
    try {
      const res = await imagesApi.uploadRaw(setId, side, file)
      const { original_path, width, height, suggested_corners } = res.data
      setOriginalPath(original_path)
      setImgSize({ w: width, h: height })
      setUploadTs(Date.now())
      const m = 0.03
      setCorners(suggested_corners || [
        [width * m, height * m],
        [width * (1 - m), height * m],
        [width * (1 - m), height * (1 - m)],
        [width * m, height * (1 - m)],
      ])
      setZoom(1)
      setPhase('edit')
    } catch (err) {
      toast(err.response?.data?.detail || 'Fehler beim Upload', 'error')
    } finally {
      setLoading('')
    }
  }

  // Vorhandenes Bild erneut bearbeiten – gespeicherte Eckpunkte + Rotation laden
  const handleLoadExisting = async () => {
    setLoading('Lade vorhandenes Bild...')
    try {
      const res = await imagesApi.redetect(setId, side)
      const { original_path, width, height, suggested_corners, saved_rotation } = res.data
      setOriginalPath(original_path)
      setImgSize({ w: width, h: height })
      setUploadTs(Date.now())
      const m = 0.03
      setCorners(suggested_corners || [
        [width * m, height * m],
        [width * (1 - m), height * m],
        [width * (1 - m), height * (1 - m)],
        [width * m, height * (1 - m)],
      ])
      setRotation(saved_rotation || 0)
      setZoom(1)
      setPhase('edit')
    } catch (err) {
      toast(err.response?.data?.detail || 'Fehler beim Laden des Bildes', 'error')
    } finally {
      setLoading('')
    }
  }

  // Bild für Canvas laden
  useEffect(() => {
    if (!originalPath || phase !== 'edit') return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      stateRef.current.imgEl = img
      requestAnimationFrame(() => {
        const container = containerRef.current
        const availW = container
          ? container.clientWidth
          : Math.min(window.innerWidth * 0.92 - 40, 1800)
        const availH = window.innerHeight * 0.95 - 300
        const s = Math.min(
          (availW - 2 * PAD) / img.naturalWidth,
          (availH - 2 * PAD) / img.naturalHeight,
          1,
        )
        setBaseScale(s)
        setZoom(1)
      })
    }
    img.src = imagesApi.fileUrl(originalPath) + '&t=' + uploadTs
  }, [originalPath, phase, uploadTs])

  // ── Preview ─────────────────────────────────────────────────────────────
  const handlePreview = async () => {
    setLoading('Generiere Vorschau...')
    try {
      const res = await imagesApi.preview(setId, side, {
        corners,
        rotation: rotation !== 0 ? rotation : null,
      })
      setPreviewPath(res.data.preview_path)
      setPhase('preview')
    } catch (err) {
      toast(err.response?.data?.detail || 'Fehler bei Vorschau', 'error')
    } finally {
      setLoading('')
    }
  }

  // ── Finalize ────────────────────────────────────────────────────────────
  const handleFinalize = async () => {
    setLoading('Finalisiere Bild...')
    try {
      const res = await imagesApi.finalize(setId, side, { brightness, saturation })
      setFinalResult(res.data)
      setPhase('final')
    } catch (err) {
      toast(err.response?.data?.detail || 'Fehler beim Finalisieren', 'error')
    } finally {
      setLoading('')
    }
  }

  const handleAccept = () => {
    if (finalResult?.thumbnail) onFinalized(finalResult.thumbnail, originalPath)
    onClose()
  }

  const resetCorners = () => {
    const m = 0.03
    setCorners([
      [imgSize.w * m, imgSize.h * m],
      [imgSize.w * (1 - m), imgSize.h * m],
      [imgSize.w * (1 - m), imgSize.h * (1 - m)],
      [imgSize.w * m, imgSize.h * (1 - m)],
    ])
  }

  const sideLabel = side === 'frontcover' ? 'Frontcover' : 'Backcover'

  const modalTitle = (
    <span className="flex flex-col leading-tight">
      <span>{sideLabel} bearbeiten</span>
      {(manufacturer || setName) && (
        <span className="text-sm font-normal text-gray-500 truncate max-w-[40vw]">
          {[manufacturer, setName].filter(Boolean).join(' – ')}
        </span>
      )}
    </span>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalTitle}
      size="full"
      titleExtra={<StepIndicator phase={phase} />}
      noBodyPadding
    >
      {/* ── Ladeindikator ── */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-navy mx-auto mb-3" />
            <p className="text-sm text-gray-600">{loading}</p>
          </div>
        </div>
      )}

      {/* ── Upload-Phase ── */}
      {phase === 'upload' && !loading && (
        <div
          className={`flex-1 flex items-center justify-center p-8 transition-colors ${isDragging ? 'bg-blue-50' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {isDragging ? (
            <div className="flex flex-col items-center justify-center w-full max-w-md h-56 border-2 border-dashed border-brand-navy rounded-2xl bg-blue-100/50">
              <svg className="w-14 h-14 text-brand-navy mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-lg font-semibold text-brand-navy">Bild hier ablegen</span>
            </div>
          ) : (
            <div className="flex flex-col items-center w-full max-w-2xl">
              <div className="flex items-center justify-center gap-6 w-full">
                {existingOriginalPath && (
                  <button
                    type="button"
                    onClick={handleLoadExisting}
                    className="flex flex-col items-center justify-center w-full max-w-xs h-56 border-2 border-dashed border-green-500 rounded-2xl cursor-pointer hover:bg-green-50 transition-all group"
                  >
                    <div className="w-14 h-14 rounded-xl bg-green-100 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </div>
                    <span className="text-base font-semibold text-green-700">Vorhandenes Bild bearbeiten</span>
                    <span className="text-xs text-gray-400 mt-1.5">Gespeicherte Ecken werden geladen</span>
                  </button>
                )}
                <label className={`flex flex-col items-center justify-center w-full ${existingOriginalPath ? 'max-w-xs' : 'max-w-md'} h-56 border-2 border-dashed border-brand-navy rounded-2xl cursor-pointer hover:bg-blue-50 transition-all group`}>
                  <div className="w-14 h-14 rounded-xl bg-blue-100 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <svg className="w-7 h-7 text-brand-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <span className="text-base font-semibold text-brand-navy">Neues Bild hochladen</span>
                  <span className="text-xs text-gray-400 mt-1.5">JPG, PNG, WebP bis 30 MB</span>
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => { if (e.target.files[0]) handleFileSelect(e.target.files[0]) }} />
                </label>
              </div>
              <p className="text-xs text-gray-400 mt-4">
                Oder: Bild per <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">Strg+V</span> aus der Zwischenablage einfügen · Drag &amp; Drop
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Edit-Phase: 2-Spalten-Layout ── */}
      {phase === 'edit' && !loading && (
        <div className="flex-1 flex overflow-hidden">

          {/* Seitenleiste */}
          <div className="flex-shrink-0 flex flex-col bg-gray-50 border-r border-gray-100 overflow-y-auto" style={{ width: '252px' }}>

            {/* Eckpunkte-Legende */}
            <div className="border-b border-gray-100 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2.5">Eckpunkte</p>
              <p className="text-xs text-gray-500 mb-3">Ziehe die Punkte auf die 4 Verpackungsecken:</p>
              <div className="grid grid-cols-2 gap-1.5">
                {LABELS.map((l, i) => (
                  <div key={l} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: COLORS[i] }}>
                    <div className="w-2.5 h-2.5 rounded-full bg-white/30 flex-shrink-0" />
                    {CORNER_NAMES[i]}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={resetCorners}
                className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg font-medium transition-all"
                style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Ecken zurücksetzen
              </button>
            </div>

            {/* Rotation */}
            <div className="border-b border-gray-100 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2.5">Rotation</p>
              <div className="flex items-center gap-2 mb-2.5">
                <input
                  type="range" min="-180" max="180" value={Math.max(-180, Math.min(180, rotation))}
                  onChange={e => setRotation(Number(e.target.value))}
                  className="flex-1 accent-brand-navy"
                />
                <span className="font-mono text-xs font-semibold text-brand-navy w-9 text-right">{rotation}°</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {[-90, -45, 0, 45, 90].map(deg => (
                  <button
                    key={deg}
                    type="button"
                    onClick={() => setRotation(deg)}
                    className={`px-2 py-1 rounded-lg text-xs font-medium border transition-all ${
                      rotation === deg
                        ? 'bg-brand-navy text-brand-yellow border-brand-navy'
                        : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-brand-navy hover:text-white hover:border-brand-navy'
                    }`}
                  >
                    {deg > 0 ? `+${deg}°` : `${deg}°`}
                  </button>
                ))}
              </div>
              {rotation !== 0 && (
                <p className="text-xs text-amber-600 mt-2">Rotation {rotation}° wird beim Speichern angewendet</p>
              )}
            </div>

            {/* Bildanpassung */}
            <div className="border-b border-gray-100 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Bildanpassung</p>
              {/* Helligkeit */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <span className="text-xs text-gray-600">Helligkeit</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-semibold text-brand-navy">{Math.round(brightness * 100)}%</span>
                    <button onClick={() => setBrightness(1.05)} className="text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-200 px-1 py-0.5 rounded transition-all">Std</button>
                  </div>
                </div>
                <input type="range" min="0.5" max="2.0" step="0.05" value={brightness}
                  onChange={e => setBrightness(Number(e.target.value))}
                  className="w-full accent-brand-navy" />
              </div>
              {/* Farbintensität */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                    <span className="text-xs text-gray-600">Farbintensität</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-semibold text-brand-navy">{Math.round(saturation * 100)}%</span>
                    <button onClick={() => setSaturation(1.05)} className="text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-200 px-1 py-0.5 rounded transition-all">Std</button>
                  </div>
                </div>
                <input type="range" min="0.0" max="2.0" step="0.05" value={saturation}
                  onChange={e => setSaturation(Number(e.target.value))}
                  className="w-full accent-brand-navy" />
              </div>
            </div>

            {/* Zoom */}
            <div className="border-b border-gray-100 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2.5">Ansicht</p>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-600">Zoom</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-semibold text-brand-navy">{Math.round(zoom * 100)}%</span>
                  <button onClick={() => setZoom(1)} className="text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-200 px-1 py-0.5 rounded transition-all">Reset</button>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setZoom(z => Math.max(0.1, z * 0.85))}
                  className="flex-shrink-0 w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold text-sm transition-all">−</button>
                <div className="flex-1 h-1.5 bg-gray-200 rounded-full mx-1 overflow-hidden">
                  <div className="h-full rounded-full bg-brand-navy transition-all"
                    style={{ width: `${Math.min(100, Math.max(3, ((zoom - 0.1) / (5 - 0.1)) * 100))}%` }} />
                </div>
                <button onClick={() => setZoom(z => Math.min(10, z * 1.2))}
                  className="flex-shrink-0 w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold text-sm transition-all">+</button>
              </div>
            </div>

            {/* Tastaturkürzel */}
            <div className="p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2.5">Tipps</p>
              <div className="space-y-1.5">
                {[
                  ['Mausrad', 'Zoom'],
                  ['Drag (leer)', 'Verschieben'],
                  ['Drag (Handle)', 'Ecke ziehen'],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{desc}</span>
                    <span className="text-xs font-mono bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">{key}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Canvas-Bereich */}
          <div className="flex-1 relative overflow-hidden" style={{ background: '#111827' }}>
            <div
              ref={containerRef}
              className="w-full h-full overflow-auto select-none"
              style={{ touchAction: 'none' }}
              onWheel={handleWheel}
            >
              <div style={{
                position: 'relative',
                width: rotatedW || 'auto',
                height: rotatedH || 'auto',
                minWidth: '100%',
                minHeight: '100%',
              }}>
                <canvas
                  ref={canvasRef}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: `translate(-50%, -50%) ${rotation ? `rotate(${rotation}deg)` : ''}`,
                    transformOrigin: 'center center',
                    transition: 'transform 0.2s ease',
                    cursor: 'crosshair',
                    touchAction: 'none',
                    filter: `brightness(${brightness}) saturate(${saturation})`,
                  }}
                  onMouseDown={handlePointerDown}
                  onTouchStart={handlePointerDown}
                />
              </div>
              {/* Zoom-Anzeige */}
              <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-lg pointer-events-none">
                {Math.round(zoom * 100)}%
              </div>
              {/* Hinweis-Badge oben */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm text-white/80 text-xs px-3 py-1.5 rounded-lg pointer-events-none whitespace-nowrap">
                Eckpunkte ziehen · Scrollen = Zoom · Drag = Verschieben
              </div>
              {/* Rotation-Badge */}
              {rotation !== 0 && (
                <div className="absolute bottom-3 left-3 bg-amber-500/80 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-lg pointer-events-none">
                  ⟳ {rotation}°
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Vorschau-Phase ── */}
      {phase === 'preview' && !loading && previewPath && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 flex items-center justify-center bg-gray-100 overflow-hidden p-4">
            <img src={imagesApi.fileUrl(previewPath) + '&t=' + Date.now()} alt="Vorschau"
              className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
              style={{ filter: `brightness(${brightness}) saturate(${saturation})` }} />
          </div>
          <div className="flex-shrink-0 flex justify-between items-center px-6 py-4 border-t border-gray-100 bg-white">
            <div>
              <p className="text-sm font-medium text-gray-700">Perspektivkorrektur angewendet</p>
              <p className="text-xs text-gray-400">Sieht es korrekt aus? Dann weiter zum Fertigstellen.</p>
            </div>
            <div className="flex gap-3">
              <button type="button" className="btn-secondary" onClick={() => setPhase('edit')}>
                ← Ecken anpassen
              </button>
              <button type="button" className="btn-primary px-6" onClick={handleFinalize}>
                Fertigstellen →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Final-Phase ── */}
      {phase === 'final' && !loading && finalResult && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-6">
            <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
              <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium text-green-700">Bild erfolgreich verarbeitet!</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {originalPath && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Vorher</p>
                  <div className="bg-gray-100 rounded-xl p-3">
                    <img src={imagesApi.fileUrl(originalPath) + '&t=' + uploadTs} alt="Original"
                      className="max-h-72 mx-auto object-contain" />
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Nachher</p>
                <div className="bg-gray-100 rounded-xl p-3">
                  <img src={imagesApi.fileUrl(finalResult.thumbnail) + '&t=' + Date.now()} alt="Fertig"
                    className="max-h-72 mx-auto object-contain" />
                </div>
              </div>
            </div>
          </div>
          <div className="flex-shrink-0 flex justify-between items-center px-6 py-4 border-t border-gray-100 bg-white">
            <button type="button" className="btn-secondary"
              onClick={() => { setPreviewPath(null); setFinalResult(null); setPhase('edit') }}>
              Nochmal bearbeiten
            </button>
            <button type="button" className="btn-primary px-8" onClick={handleAccept}>
              Übernehmen ✓
            </button>
          </div>
        </div>
      )}

      {/* ── Footer für Edit-Phase ── */}
      {phase === 'edit' && !loading && (
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-white">
          <div className="flex items-center gap-3">
            <button type="button" className="btn-secondary" onClick={onClose}>Abbrechen</button>
            {existingOriginalPath && (
              <button type="button"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-700 transition-all"
                onClick={() => { setPhase('upload'); setOriginalPath(null); setCorners(null) }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Anderes Bild
              </button>
            )}
          </div>
          <button type="button" className="btn-primary px-6" onClick={handlePreview}>
            Vorschau generieren →
          </button>
        </div>
      )}

      {/* Footer für Upload-Phase */}
      {phase === 'upload' && !loading && (
        <div className="flex-shrink-0 flex justify-start px-6 py-4 border-t border-gray-100 bg-white">
          <button type="button" className="btn-secondary" onClick={onClose}>Abbrechen</button>
        </div>
      )}
    </Modal>
  )
}
