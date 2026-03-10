import { useState, useRef, useEffect, useCallback } from 'react'
import { Modal } from './Modal'
import { imagesApi } from '../api/client'

const HANDLE_R = 12
const PAD = HANDLE_R + 6          // Padding um das Bild herum, damit Handles am Rand sichtbar bleiben
const COLORS = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B']
const LABELS = ['OL', 'OR', 'UR', 'UL']

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

export function ImageEditor({ open, onClose, setId, side, existingOriginalPath, onFinalized }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)

  // All mutable state for drag/pan performance (no re-renders during drag)
  const stateRef = useRef({
    corners: null,
    scale: 1,
    rotation: 0,
    dragging: -1,     // -1 = kein Drag, 0-3 = Handle-Index
    panning: false,    // true = gerade am Pannen
    panStartX: 0,
    panStartY: 0,
    panScrollX: 0,
    panScrollY: 0,
    imgEl: null,
    canvasW: 0,
    canvasH: 0,
  })

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

  const scale = baseScale * zoom

  // Rotierte Bounding-Box berechnen (für Wrapper-Dimensionen)
  const canvasW = imgSize.w ? Math.round(imgSize.w * scale) + 2 * PAD : 0
  const canvasH = imgSize.h ? Math.round(imgSize.h * scale) + 2 * PAD : 0
  const rad = (rotation || 0) * Math.PI / 180
  const absCos = Math.abs(Math.cos(rad))
  const absSin = Math.abs(Math.sin(rad))
  const rotatedW = Math.ceil(canvasW * absCos + canvasH * absSin) || 0
  const rotatedH = Math.ceil(canvasW * absSin + canvasH * absCos) || 0

  // Sync React state → mutable ref
  useEffect(() => {
    stateRef.current.corners = corners
    stateRef.current.scale = scale
    stateRef.current.rotation = rotation
  }, [corners, scale, rotation])

  // Reset
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

  // --- Imperative draw ---
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

    ctx.fillStyle = '#1f2937'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(imgEl, PAD, PAD, imgW, imgH)

    const sp = pts.map(([x, y]) => [x * s + PAD, y * s + PAD])

    // Overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, w, h)
    ctx.moveTo(sp[0][0], sp[0][1])
    for (let i = 3; i >= 0; i--) ctx.lineTo(sp[i][0], sp[i][1])
    ctx.closePath()
    ctx.fill('evenodd')
    ctx.restore()

    // Selection border
    ctx.beginPath()
    ctx.moveTo(sp[0][0], sp[0][1])
    for (let i = 1; i < 4; i++) ctx.lineTo(sp[i][0], sp[i][1])
    ctx.closePath()
    ctx.strokeStyle = '#FFD700'
    ctx.lineWidth = 2.5
    ctx.stroke()

    // Handles
    sp.forEach(([x, y], i) => {
      ctx.beginPath()
      ctx.arc(x, y, HANDLE_R + 2, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      ctx.fill()

      ctx.beginPath()
      ctx.arc(x, y, HANDLE_R, 0, Math.PI * 2)
      ctx.fillStyle = COLORS[i]
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 3
      ctx.stroke()

      ctx.fillStyle = '#fff'
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(LABELS[i], x, y)
    })
  }, [])

  useEffect(() => { drawCanvas() }, [corners, scale, drawCanvas])

  // Nach Zoom/Rotation: Scroll-Position zentrieren
  useEffect(() => {
    const container = containerRef.current
    if (!container || !rotatedW) return
    const excessW = rotatedW - container.clientWidth
    container.scrollLeft = excessW > 0 ? excessW / 2 : 0
    const excessH = rotatedH - container.clientHeight
    container.scrollTop = excessH > 0 ? excessH / 2 : 0
  }, [rotatedW, rotatedH])

  // --- Window-level pointer events: Handle-Drag + Pan ---
  useEffect(() => {
    const onMove = (e) => {
      const st = stateRef.current
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY

      // Handle-Drag
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

      // Pan
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
      if (st.panning) {
        st.panning = false
      }
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

  // Pointer down: Handle-Drag oder Pan starten
  const handlePointerDown = (e) => {
    const st = stateRef.current
    if (!st.corners) return
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const canvas = canvasRef.current
    if (!canvas) return

    const [cx, cy] = clientToCanvas(canvas, clientX, clientY, st.rotation)

    // Handle-Hit-Test
    const hitR = HANDLE_R * 4
    for (let i = 0; i < 4; i++) {
      const hx = st.corners[i][0] * st.scale + PAD
      const hy = st.corners[i][1] * st.scale + PAD
      if (Math.hypot(cx - hx, cy - hy) < hitR) {
        st.dragging = i
        e.preventDefault()
        return
      }
    }

    // Kein Handle getroffen → Pan starten
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

  // Mousewheel-Zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(z => Math.max(0.1, Math.min(10, z * delta)))
  }, [])

  // Upload
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
      const newCorners = suggested_corners || [
        [width * m, height * m],
        [width * (1 - m), height * m],
        [width * (1 - m), height * (1 - m)],
        [width * m, height * (1 - m)],
      ]
      setCorners(newCorners)
      setZoom(1)
      setPhase('edit')
    } catch (err) {
      alert(err.response?.data?.detail || 'Fehler beim Upload')
    } finally {
      setLoading('')
    }
  }

  // Vorhandenes Bild erneut bearbeiten
  const handleLoadExisting = async () => {
    setLoading('Lade vorhandenes Bild...')
    try {
      const res = await imagesApi.redetect(setId, side)
      const { original_path, width, height, suggested_corners } = res.data
      setOriginalPath(original_path)
      setImgSize({ w: width, h: height })
      setUploadTs(Date.now())
      const m = 0.03
      const newCorners = suggested_corners || [
        [width * m, height * m],
        [width * (1 - m), height * m],
        [width * (1 - m), height * (1 - m)],
        [width * m, height * (1 - m)],
      ]
      setCorners(newCorners)
      setZoom(1)
      setPhase('edit')
    } catch (err) {
      alert(err.response?.data?.detail || 'Fehler beim Laden des Bildes')
    } finally {
      setLoading('')
    }
  }

  // Load image for canvas
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

  // Preview
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
      alert(err.response?.data?.detail || 'Fehler bei Vorschau')
    } finally {
      setLoading('')
    }
  }

  // Finalize
  const handleFinalize = async () => {
    setLoading('Finalisiere Bild...')
    try {
      const res = await imagesApi.finalize(setId, side, { brightness, saturation })
      setFinalResult(res.data)
      setPhase('final')
    } catch (err) {
      alert(err.response?.data?.detail || 'Fehler beim Finalisieren')
    } finally {
      setLoading('')
    }
  }

  // Accept
  const handleAccept = () => {
    if (finalResult?.thumbnail) onFinalized(finalResult.thumbnail)
    onClose()
  }

  const sideLabel = side === 'frontcover' ? 'Frontcover' : 'Backcover'

  return (
    <Modal open={open} onClose={onClose} title={`${sideLabel} bearbeiten`} size="full">
      <div className="space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-navy mx-auto mb-3" />
              <p className="text-sm text-gray-600">{loading}</p>
            </div>
          </div>
        )}

        {/* Upload */}
        {phase === 'upload' && !loading && (
          <div className="flex items-center justify-center gap-6" style={{ minHeight: '250px' }}>
            {existingOriginalPath && (
              <button type="button"
                onClick={handleLoadExisting}
                className="flex flex-col items-center justify-center w-full max-w-xs h-52 border-2 border-dashed border-green-600 rounded-xl cursor-pointer hover:bg-green-50 transition">
                <svg className="w-12 h-12 text-green-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span className="text-base font-medium text-green-700">Vorhandenes Bild bearbeiten</span>
                <span className="text-xs text-gray-400 mt-1">Ecken, Rotation, Helligkeit anpassen</span>
              </button>
            )}
            <label className={`flex flex-col items-center justify-center w-full ${existingOriginalPath ? 'max-w-xs' : 'max-w-md'} h-52 border-2 border-dashed border-brand-navy rounded-xl cursor-pointer hover:bg-blue-50 transition`}>
              <svg className="w-12 h-12 text-brand-navy mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-base font-medium text-brand-navy">Neues Bild hochladen</span>
              <span className="text-xs text-gray-400 mt-1">JPG, PNG, WebP bis 30 MB</span>
              <input type="file" accept="image/*" className="hidden"
                onChange={e => { if (e.target.files[0]) handleFileSelect(e.target.files[0]) }} />
            </label>
          </div>
        )}

        {/* Edit */}
        {phase === 'edit' && !loading && (
          <div className="space-y-2">
            {/* Legende + Hinweis */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Ziehe die Eckpunkte auf die Verpackungsecken:
                {LABELS.map((l, i) => (
                  <span key={l}>
                    {' '}<span className="inline-block w-3 h-3 rounded-full align-middle" style={{ background: COLORS[i] }} /> {l}
                  </span>
                ))}
              </p>
              <span className="text-xs text-gray-400">Mausrad = Zoom, Ziehen = Verschieben</span>
            </div>

            {/* Controls – 2 Zeilen */}
            <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs space-y-1.5">
              {/* Zeile 1: Rotation + Ecken zurücksetzen */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <span className="text-gray-500 w-14">Rotation:</span>
                  <input type="range" min="-180" max="180" value={Math.max(-180, Math.min(180, rotation))}
                    onChange={e => setRotation(Number(e.target.value))}
                    className="flex-1 accent-brand-navy" />
                  <span className="font-mono text-gray-600 w-8 text-right">{rotation}°</span>
                  <button type="button" className="px-1.5 py-0.5 bg-gray-200 hover:bg-gray-300 rounded"
                    onClick={() => setRotation(r => r - 90)}>-90°</button>
                  <button type="button" className="px-1.5 py-0.5 bg-gray-200 hover:bg-gray-300 rounded"
                    onClick={() => setRotation(r => r + 90)}>+90°</button>
                  <button type="button" className="px-1.5 py-0.5 bg-gray-200 hover:bg-gray-300 rounded"
                    onClick={() => setRotation(0)}>0°</button>
                </div>
                <button type="button"
                  className="px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded border border-amber-300"
                  onClick={() => {
                    const m = 0.03
                    setCorners([
                      [imgSize.w * m, imgSize.h * m],
                      [imgSize.w * (1 - m), imgSize.h * m],
                      [imgSize.w * (1 - m), imgSize.h * (1 - m)],
                      [imgSize.w * m, imgSize.h * (1 - m)],
                    ])
                  }}>
                  Ecken zurücksetzen
                </button>
              </div>

              {/* Zeile 2: Helligkeit + Farbintensität */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                  <span className="text-gray-500 w-14">Helligkeit:</span>
                  <input type="range" min="0.5" max="2.0" step="0.05" value={brightness}
                    onChange={e => setBrightness(Number(e.target.value))}
                    className="flex-1 accent-brand-navy" />
                  <span className="font-mono text-gray-600 w-8 text-right">{Math.round(brightness * 100)}%</span>
                  <button type="button" className="px-1.5 py-0.5 bg-gray-200 hover:bg-gray-300 rounded"
                    onClick={() => setBrightness(1.05)}>Std</button>
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                  <span className="text-gray-500 w-14">Farbe:</span>
                  <input type="range" min="0.0" max="2.0" step="0.05" value={saturation}
                    onChange={e => setSaturation(Number(e.target.value))}
                    className="flex-1 accent-brand-navy" />
                  <span className="font-mono text-gray-600 w-8 text-right">{Math.round(saturation * 100)}%</span>
                  <button type="button" className="px-1.5 py-0.5 bg-gray-200 hover:bg-gray-300 rounded"
                    onClick={() => setSaturation(1.05)}>Std</button>
                </div>
              </div>
            </div>

            {/* Canvas */}
            <div ref={containerRef}
              className="relative overflow-auto rounded-lg bg-gray-800 border border-gray-300 select-none"
              style={{ maxHeight: 'calc(95vh - 340px)', touchAction: 'none' }}
              onWheel={handleWheel}>
              {/* Wrapper mit rotierten Dimensionen – gibt dem Scroll-Container die korrekte Größe */}
              <div style={{
                position: 'relative',
                width: rotatedW || 'auto',
                height: rotatedH || 'auto',
                minWidth: '100%',
                minHeight: '200px',
              }}>
                <canvas ref={canvasRef}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: `translate(-50%, -50%) ${rotation ? `rotate(${rotation}deg)` : ''}`,
                    transformOrigin: 'center center',
                    transition: 'transform 0.2s ease',
                    cursor: 'grab',
                    touchAction: 'none',
                    filter: `brightness(${brightness}) saturate(${saturation})`,
                  }}
                  onMouseDown={handlePointerDown}
                  onTouchStart={handlePointerDown} />
              </div>
              {/* Zoom-Anzeige */}
              <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded pointer-events-none">
                {Math.round(zoom * 100)}%
              </div>
            </div>

            {/* Rotation Hinweis */}
            {rotation !== 0 && (
              <p className="text-xs text-amber-600 text-center">
                Rotation {rotation}° wird bei der Vorschau angewendet
              </p>
            )}

            {/* Buttons */}
            <div className="flex justify-between pt-1">
              <button type="button" className="btn-secondary" onClick={onClose}>Abbrechen</button>
              <button type="button" className="btn-primary px-6" onClick={handlePreview}>
                Vorschau generieren
              </button>
            </div>
          </div>
        )}

        {/* Preview */}
        {phase === 'preview' && !loading && previewPath && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Vorschau nach Perspektivkorrektur. Sieht es korrekt aus?
            </p>
            <div className="flex justify-center bg-gray-100 rounded-lg p-2 overflow-auto"
              style={{ maxHeight: 'calc(95vh - 260px)' }}>
              <img src={imagesApi.fileUrl(previewPath) + '&t=' + Date.now()} alt="Preview"
                className="max-w-full object-contain" />
            </div>
            <div className="flex justify-between pt-1">
              <button type="button" className="btn-secondary" onClick={() => setPhase('edit')}>
                Zurück (Ecken anpassen)
              </button>
              <button type="button" className="btn-primary px-6" onClick={handleFinalize}>
                Fertigstellen
              </button>
            </div>
          </div>
        )}

        {/* Final */}
        {phase === 'final' && !loading && finalResult && (
          <div className="space-y-4">
            <p className="text-sm text-green-600 font-medium">Bild erfolgreich verarbeitet!</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {originalPath && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Vorher (Original)</p>
                  <div className="bg-gray-100 rounded-lg p-2">
                    <img src={imagesApi.fileUrl(originalPath) + '&t=' + uploadTs} alt="Original"
                      className="max-h-80 mx-auto object-contain" />
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-500 mb-1">Nachher (Fertig)</p>
                <div className="bg-gray-100 rounded-lg p-2">
                  <img src={imagesApi.fileUrl(finalResult.thumbnail) + '&t=' + Date.now()} alt="Fertig"
                    className="max-h-80 mx-auto object-contain" />
                </div>
              </div>
            </div>
            <div className="flex justify-between pt-1">
              <button type="button" className="btn-secondary"
                onClick={() => { setPreviewPath(null); setFinalResult(null); setPhase('edit') }}>
                Nochmal bearbeiten
              </button>
              <button type="button" className="btn-primary px-8" onClick={handleAccept}>
                Übernehmen
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
