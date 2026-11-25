// Übersetzt Fehler aus axios in einen deutschen Text, der sich immer als String
// anzeigen lässt. FastAPI liefert `detail` bei Validierungsfehlern (422) als
// Liste von Objekten – als React-Kind gerendert würde das die Seite weiß machen.

const FELDNAMEN = {
  username: 'Benutzername',
  password: 'Passwort',
  new_password: 'Neues Passwort',
  old_password: 'Altes Passwort',
  email: 'E-Mail',
  name: 'Name',
}

// Häufige englische Pydantic-Meldungen (Typ -> deutscher Text).
const TYP_TEXTE = {
  missing: 'fehlt',
  string_too_short: 'ist zu kurz',
  string_too_long: 'ist zu lang',
  string_type: 'muss ein Text sein',
  int_parsing: 'muss eine ganze Zahl sein',
  int_type: 'muss eine ganze Zahl sein',
  float_parsing: 'muss eine Zahl sein',
  bool_parsing: 'muss Ja oder Nein sein',
  greater_than: 'ist zu klein',
  greater_than_equal: 'ist zu klein',
  less_than: 'ist zu groß',
  less_than_equal: 'ist zu groß',
  value_error: 'ist ungültig',
  json_invalid: 'ist kein gültiges JSON',
}

function feldName(loc) {
  if (!Array.isArray(loc)) return null
  // Erstes Element ist "body"/"query"/"path" – das interessiert den Nutzer nicht.
  const teile = loc.filter((t) => !['body', 'query', 'path'].includes(t))
  if (teile.length === 0) return null
  const letztes = String(teile[teile.length - 1])
  return FELDNAMEN[letztes] || letztes
}

function eintragText(e) {
  if (typeof e === 'string') return e
  if (!e || typeof e !== 'object') return null
  const feld = feldName(e.loc)
  const typ = typeof e.type === 'string' ? e.type : ''
  const text = TYP_TEXTE[typ] || (typ.startsWith('value_error') ? TYP_TEXTE.value_error : null)
  if (feld && text) return `${feld} ${text}`
  if (feld) return `${feld}: Eingabe ungültig`
  return typeof e.msg === 'string' ? e.msg : null
}

/** Macht aus einem `detail` (Text, Liste oder Objekt) einen Text. */
export function detailText(detail) {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const teile = detail.map(eintragText).filter(Boolean)
    return teile.length ? teile.join('; ') : null
  }
  if (detail && typeof detail === 'object') {
    return typeof detail.message === 'string' ? detail.message : eintragText(detail)
  }
  return null
}

/**
 * Deutscher Text zu einem axios-Fehler. Rückgabe ist immer ein String.
 * @param err      der gefangene Fehler
 * @param fallback Text, wenn nichts Genaueres bekannt ist
 */
export function fehlerText(err, fallback = 'Es ist ein Fehler aufgetreten') {
  const daten = err?.response?.data
  const text = detailText(daten?.detail) ?? (typeof daten?.message === 'string' ? daten.message : null)
  if (text) return text
  if (!err?.response) {
    if (err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT') {
      return 'Der Server antwortet nicht rechtzeitig. Bitte später noch einmal versuchen.'
    }
    if (err?.request || err?.code === 'ERR_NETWORK') {
      return 'Keine Verbindung zum Server. Bitte Netzwerk prüfen.'
    }
  }
  return fallback
}

/**
 * Für Abläufe, die axios-Fehler UND eigene `new Error('…')` mischen (Backup-Seite: Start per axios,
 * Fortschritt per EventSource). axios-Fehler über `fehlerText` – deren `message` ist englisch
 * („Request failed with status code 409“) –, eigene Fehler mit ihrer (deutschen) Meldung.
 */
export function fehlerOderMeldung(err, fallback = 'Es ist ein Fehler aufgetreten') {
  if (err?.isAxiosError || err?.response || err?.request) return fehlerText(err, fallback)
  return (typeof err?.message === 'string' && err.message) || fallback
}
