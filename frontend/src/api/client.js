import axios from 'axios'

// In dev mode, use empty base URL so Vite proxy handles /api routing.
// In production (Docker), FastAPI serves the frontend itself.
const API_BASE = import.meta.env.VITE_API_URL || ''

const client = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // Send HTTP-only cookies
  // Zeitgrenze: hängt der Server, wartet die Oberfläche nicht endlos. Bewusst großzügig,
  // weil Bild-Finalisierung (rembg), PDF-Export und Backup-Import legitim lange dauern.
  // Netz-/Zeitfehler übersetzt lib/fehler.js (fehlerText) in deutschen Text.
  timeout: 300000,
})

/* Sitzung erneuern: Das Zugangs-Cookie gilt nur 15 Minuten, das Erneuerungs-Cookie
   7 Tage (gleitend). Bei 401 einmal erneuern und die Anfrage wiederholen. Laufen
   mehrere Anfragen gleichzeitig auf 401, teilen sie sich EINE Erneuerung - sonst
   wuerde das Erneuerungs-Token mehrfach eingeloest. */
const OHNE_ERNEUERUNG = /\/api\/auth\/(login|refresh|logout|register-first-admin|forgot-password)/
let laufendeErneuerung = null

export function sitzungErneuern() {
  if (!laufendeErneuerung) {
    laufendeErneuerung = client
      .post('/api/auth/refresh', null, { _ohneErneuerung: true })
      .finally(() => { laufendeErneuerung = null })
  }
  return laufendeErneuerung
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const cfg = error.config
    if (
      error.response?.status === 401 && cfg && !cfg._erneuert && !cfg._ohneErneuerung &&
      !OHNE_ERNEUERUNG.test(cfg.url || '')
    ) {
      cfg._erneuert = true
      try {
        await sitzungErneuern()
        return client(cfg)
      } catch {
        // Erneuern ging nicht - weiter wie bisher zur Anmeldung
      }
    }
    if (error.response?.status === 401 && !cfg?._ohneErneuerung) {
      // Avoid redirect loop on login page
      if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/setup')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default client

// Auth API
export const authApi = {
  status: () => client.get('/api/auth/status'),
  login: (data) => client.post('/api/auth/login', data),
  logout: () => client.post('/api/auth/logout'),
  refresh: () => sitzungErneuern(),
  me: () => client.get('/api/auth/me'),
  registerFirstAdmin: (data) => client.post('/api/auth/register-first-admin', data),
  changePassword: (data) => client.post('/api/auth/change-password', data),
  forgotPasswordGetQuestions: (data) => client.post('/api/auth/forgot-password/get-questions', data),
  forgotPasswordReset: (data) => client.post('/api/auth/forgot-password/reset', data),
}

// Users API
export const usersApi = {
  list: () => client.get('/api/users/'),
  create: (data) => client.post('/api/users/', data),
  delete: (id) => client.delete(`/api/users/${id}`),
  updateRole: (id, data) => client.patch(`/api/users/${id}/role`, data),
  resetPassword: (id, data) => client.patch(`/api/users/${id}/reset-password`, data),
}

// Sets API
export const setsApi = {
  list: (params) => client.get('/api/sets/', { params }),
  get: (id) => client.get(`/api/sets/${id}`),
  create: (data) => client.post('/api/sets/', data),
  update: (id, data) => client.put(`/api/sets/${id}`, data),
  updateStatus: (id, data) => client.patch(`/api/sets/${id}/status`, data),
  inlineUpdate: (id, data) => client.patch(`/api/sets/${id}/inline`, data),
  delete: (id) => client.delete(`/api/sets/${id}`),
  distinctValues: () => client.get('/api/sets/distinct-values'),
  statistik: () => client.get('/api/sets/statistik'),
  exportJson: () => client.get('/api/sets/export/json'),
  importJson: (data) => client.post('/api/sets/import/json', data),
}

// Boxes API
export const boxesApi = {
  list: () => client.get('/api/boxes/'),
  get: (id) => client.get(`/api/boxes/${id}`),
  create: (data) => client.post('/api/boxes/', data),
  update: (id, data) => client.put(`/api/boxes/${id}`, data),
  delete: (id) => client.delete(`/api/boxes/${id}`),
  availableForStoneType: (stoneType) => client.get(`/api/boxes/available-for-stone-type/${encodeURIComponent(stoneType)}`),
}

// Images API
export const imagesApi = {
  upload: (setId, side, file) => {
    const form = new FormData()
    form.append('file', file)
    return client.post(`/api/images/upload/${setId}/${side}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  uploadRaw: (setId, side, file) => {
    const form = new FormData()
    form.append('file', file)
    return client.post(`/api/images/upload-raw/${setId}/${side}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  preview: (setId, side, data) => client.post(`/api/images/preview/${setId}/${side}`, data),
  finalize: (setId, side, data = {}) => client.post(`/api/images/finalize/${setId}/${side}`, data),
  redetect: (setId, side) => client.post(`/api/images/redetect/${setId}/${side}`),
  fileUrl: (path) => `${API_BASE}/api/images/file?path=${encodeURIComponent(path)}`,
  ollamaStatus: () => client.get('/api/images/ollama/status'),
}

// Settings API
export const settingsApi = {
  getAll: () => client.get('/api/settings/'),
  set: (key, value) => client.put(`/api/settings/${encodeURIComponent(key)}`, { value }),
}

// Backup API
export const backupApi = {
  startExport: () => client.post('/api/backup/export/start'),
  startImport: (form, mode, onUploadProgress) => client.post(
    `/api/backup/import/start?mode=${mode}`,
    form,
    // timeout 0 = keine Grenze: Der Upload einer grossen Sicherung (~600 MB) darf bei langsamem Netz laenger dauern.
    { headers: { 'Content-Type': 'multipart/form-data' }, onUploadProgress, timeout: 0 },
  ),
  // Automatische Backups
  getSchedule: () => client.get('/api/backup/schedule'),
  updateSchedule: (settings) => client.put('/api/backup/schedule', settings),
  getAutoBackups: () => client.get('/api/backup/auto-backups'),
  runNow: () => client.post('/api/backup/auto-backups/run-now'),
  downloadAutoBackup: (filename) => `/api/backup/auto-backups/download/${encodeURIComponent(filename)}`,
  deleteAutoBackup: (filename) => client.delete(`/api/backup/auto-backups/${encodeURIComponent(filename)}`),
}

// Labels API
export const labelsApi = {
  generate: (setIds) => client.post('/api/labels/generate', { set_ids: setIds }, { responseType: 'blob' }),
  exportPdf: () => client.get('/api/labels/sets-list', { responseType: 'blob', params: { t: Date.now() } }),
}
