// Lauf (aus frontend/): node --test src/lib/fehler.test.js   (kein Testframework nötig)
import test from 'node:test'
import assert from 'node:assert/strict'
import { fehlerText, detailText, fehlerOderMeldung } from './fehler.js'

const antwort = (data, status = 422) => ({ response: { status, data } })

test('422-Liste wird zu deutschem Text, nie zu Objekt/Array', () => {
  const err = antwort({
    detail: [
      { type: 'string_too_short', loc: ['body', 'username'], msg: 'String should have at least 3 characters' },
      { type: 'missing', loc: ['body', 'password'], msg: 'Field required' },
    ],
  })
  const t = fehlerText(err, 'Login fehlgeschlagen')
  assert.equal(typeof t, 'string')
  assert.equal(t, 'Benutzername ist zu kurz; Passwort fehlt')
})

test('Unbekannter Typ mit Feld und ohne Feld', () => {
  assert.equal(detailText([{ type: 'xyz', loc: ['body', 'foo'], msg: 'x' }]), 'foo: Eingabe ungültig')
  assert.equal(detailText([{ type: 'xyz', loc: ['body'], msg: 'Eigene Meldung' }]), 'Eigene Meldung')
})

test('Leere/kaputte Liste fällt auf den Fallback', () => {
  assert.equal(fehlerText(antwort({ detail: [] }), 'Fallback'), 'Fallback')
  assert.equal(fehlerText(antwort({ detail: [null, 5] }), 'Fallback'), 'Fallback')
  assert.equal(fehlerText(antwort({ detail: { zahl: 1 } }), 'Fallback'), 'Fallback')
})

test('Text-detail bleibt unverändert', () => {
  assert.equal(fehlerText(antwort({ detail: 'Benutzer existiert schon' }, 400), 'x'), 'Benutzer existiert schon')
})

test('Netzfehler und Zeitüberschreitung werden unterschieden', () => {
  assert.match(fehlerText({ code: 'ECONNABORTED', request: {} }, 'x'), /nicht rechtzeitig/)
  assert.match(fehlerText({ code: 'ERR_NETWORK', request: {} }, 'x'), /Keine Verbindung/)
})

test('fehlerOderMeldung: 409 vom Server zeigt den deutschen detail-Text, nicht axios-Englisch', () => {
  // axios-Fehler tragen isAxiosError und eine englische message ("Request failed with status code 409")
  const err = { isAxiosError: true, message: 'Request failed with status code 409',
    response: { status: 409, data: { detail: 'Es läuft bereits ein Import oder Export.', code: 'KONFLIKT' } } }
  assert.equal(fehlerOderMeldung(err, 'Export fehlgeschlagen'), 'Es läuft bereits ein Import oder Export.')
})

test('fehlerOderMeldung: eigene Error-Meldung (z. B. aus dem Fortschritts-Strom) bleibt erhalten', () => {
  assert.equal(fehlerOderMeldung(new Error('Verbindung unterbrochen'), 'Export fehlgeschlagen'), 'Verbindung unterbrochen')
  assert.equal(fehlerOderMeldung(new Error(''), 'Export fehlgeschlagen'), 'Export fehlgeschlagen')
  assert.equal(fehlerOderMeldung(undefined, 'Export fehlgeschlagen'), 'Export fehlgeschlagen')
})

test('Ohne Informationen gilt der Fallback; undefined crasht nicht', () => {
  assert.equal(fehlerText(antwort(undefined, 500), 'Fallback'), 'Fallback')
  assert.equal(fehlerText(undefined, 'Fallback'), 'Fallback')
})
