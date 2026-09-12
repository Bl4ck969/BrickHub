/**
 * Rauchtest gegen die laufende Entwicklungsumgebung.
 *
 * Prueft mit echten Klicks und echten Eingaben, ob die Bedienung traegt -
 * nicht nur, ob es baut. Aendert genau einen Wert und setzt ihn zurueck.
 *
 * Voraussetzungen: Backend auf :8000, Frontend auf :5173 (siehe brickhub.bat),
 * und ein Anmeldekonto. Zum Aufruf siehe README.md in diesem Ordner.
 */
import { chromium } from 'playwright'

const URL = process.env.BH_URL || 'http://localhost:5173'
const NUTZER = process.env.BH_USER
const PASS = process.env.BH_PASS
const SHOTS = process.env.BH_SHOTS || null

if (!NUTZER || !PASS) {
  console.error('BH_USER und BH_PASS muessen gesetzt sein. Siehe tests/README.md.')
  process.exit(2)
}

const ergebnisse = []
const ok = (name, extra = '') => {
  ergebnisse.push(['OK', name])
  console.log('  OK   ' + name + (extra ? '  — ' + extra : ''))
}
const fail = (name, extra = '') => {
  ergebnisse.push(['FAIL', name])
  console.log('  FAIL ' + name + (extra ? '  — ' + extra : ''))
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1500, height: 940 } })
const page = await ctx.newPage()

const fehlerKonsole = []
page.on('console', (m) => {
  // 401 vor der Anmeldung ist erwartet - das ist der Auth-Check
  if (m.type() === 'error' && !m.text().includes('401')) fehlerKonsole.push(m.text())
})
page.on('pageerror', (e) => fehlerKonsole.push('pageerror: ' + e.message))

const schreibAufrufe = []
page.on('response', (r) => {
  const m = r.request().method()
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(m) && r.url().includes('/api/')) {
    schreibAufrufe.push({ m, url: r.url().replace(URL, ''), status: r.status() })
  }
})

try {
  // ---------- Anmelden ueber das echte Formular ----------
  await page.goto(URL + '/login', { waitUntil: 'networkidle' })
  await page.fill('#lg-user', NUTZER)
  await page.fill('#lg-pass', PASS)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/sets', { timeout: 15000 })
  await page.waitForSelector('table tbody tr', { timeout: 15000 })
  ok('Anmeldung über das Formular')

  const zeilen = await page.locator('table tbody tr').count()
  zeilen > 0 ? ok('Tabelle gefüllt', zeilen + ' Zeilen') : fail('Tabelle gefüllt', '0 Zeilen')

  const icons = await page.locator('section svg').count()
  icons >= 3 ? ok('Kennzahl-Icons gerendert', icons + ' SVG') : fail('Kennzahl-Icons gerendert', String(icons))

  // ---------- Sortierung ----------
  const vorher = (await page.locator('table tbody tr td:nth-child(2)').first().innerText()).trim()
  await page.getByRole('columnheader', { name: /Teile/ }).click()
  await page.waitForTimeout(400)
  const nachher = (await page.locator('table tbody tr td:nth-child(2)').first().innerText()).trim()
  vorher !== nachher
    ? ok('Sortierung per Klick', `"${vorher}" → "${nachher}"`)
    : fail('Sortierung per Klick', 'Reihenfolge unverändert')

  // ---------- Schreibtest, danach zuruecksetzen ----------
  const feld = page.locator('input[aria-label^="Tüten für"]').first()
  const alt = await feld.inputValue()
  const zaehlerVor = schreibAufrufe.length
  await feld.fill(String((parseInt(alt || '0', 10) || 0) + 7))
  await page.waitForTimeout(1200)
  const geschrieben = schreibAufrufe.slice(zaehlerVor).filter((a) => a.status < 400)
  geschrieben.length
    ? ok('Inline-Bearbeitung speichert', geschrieben.map((a) => a.m + ' ' + a.status).join(', '))
    : fail('Inline-Bearbeitung speichert', 'kein erfolgreicher Schreibaufruf')
  await feld.fill(alt)
  await page.waitForTimeout(1000)
  ;(await feld.inputValue()) === alt
    ? ok('Testwert zurückgesetzt', `wieder "${alt}"`)
    : fail('Testwert zurückgesetzt', 'Wert weicht ab — BITTE PRÜFEN')

  // ---------- Bedienelemente in der Tabelle ----------
  const status = page.locator('select[aria-label^="Status von"]').first()
  const werte = await status.locator('option').count()
  werte === 4 ? ok('Status-Auswahl vollständig', '4 Werte') : fail('Status-Auswahl', werte + ' Werte')

  const kiste = page.locator('select[aria-label^="Kiste für"]').first()
  const gesperrt = await kiste.locator('option[disabled]').count()
  ok('Kisten-Auswahl', `${await kiste.locator('option').count()} Optionen, ${gesperrt} gesperrt (volle Kisten)`)

  // ---------- Bild-Vergroesserung ----------
  const cover = page.locator('button[title*="Frontcover"]').first()
  if (await cover.count()) {
    await cover.click()
    await page.waitForTimeout(700)
    ;(await page.locator('img[alt="Cover"]').count())
      ? ok('Bild-Vergrößerung öffnet')
      : fail('Bild-Vergrößerung öffnet')
    await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {})
    await page.waitForTimeout(400)
  }

  // ---------- Galerie ----------
  await page.getByRole('button', { name: 'Galerie' }).click()
  await page.waitForTimeout(900)
  const karten = await page.locator('article').count()
  karten > 0 ? ok('Galerie-Ansicht', karten + ' Karten') : fail('Galerie-Ansicht', '0 Karten')
  await page.getByRole('button', { name: 'Tabelle' }).click()
  await page.waitForTimeout(600)

  // ---------- Theme ----------
  const dunkelVor = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  await page.getByTitle(/Zu (hell|dunkel) wechseln/).click()
  await page.waitForTimeout(500)
  const dunkelNach = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  dunkelVor !== dunkelNach ? ok('Theme-Umschalter') : fail('Theme-Umschalter', 'keine Änderung')

  // ---------- Seitenleiste ----------
  await page.getByRole('button', { name: 'Einklappen' }).click()
  await page.waitForTimeout(500)
  ;(await page.evaluate(() => localStorage.getItem('brickhub-rail-eingeklappt'))) === '1'
    ? ok('Seitenleiste einklappen', 'gemerkt')
    : fail('Seitenleiste einklappen')
  await page.getByTitle('Ausklappen').click()
  await page.waitForTimeout(400)

  // ---------- Alle Seiten ----------
  for (const [label, pfad] of [
    ['Lagerung', '/storage'],
    ['Kisteninventur', '/box-inventory'],
    ['Neue Sets', '/new-sets'],
    ['Schilder', '/labels'],
    ['Benutzer', '/users'],
    ['Backup', '/backup'],
  ]) {
    try {
      await page.getByRole('link', { name: label, exact: true }).click()
      await page.waitForURL('**' + pfad, { timeout: 12000 })
      await page.waitForTimeout(800)
      const h1 = (await page.locator('h1').first().innerText()).trim()
      h1 ? ok('Seite ' + label, '„' + h1 + '“') : fail('Seite ' + label, 'keine Überschrift')
    } catch (e) {
      fail('Seite ' + label, e.message.split('\n')[0])
    }
  }

  // ---------- Set-Formular ----------
  await page.goto(URL + '/sets', { waitUntil: 'networkidle' })
  await page.waitForSelector('table tbody tr')
  await page.locator('button[title="Bearbeiten"]').first().click()
  await page.waitForURL('**/edit', { timeout: 10000 })
  await page.waitForTimeout(1500)
  const felder = await page.locator('input, select, textarea').count()
  felder > 8 ? ok('Set-Formular geladen', felder + ' Felder') : fail('Set-Formular geladen', String(felder))

  // ---------- Ersteinrichtung (oeffentliche Route) ----------
  await page.goto(URL + '/setup', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  const setupFelder = await page.locator('input').count()
  setupFelder >= 3 ? ok('Ersteinrichtung rendert', setupFelder + ' Felder') : fail('Ersteinrichtung rendert')

  // ---------- Schmale Ansicht ----------
  await page.setViewportSize({ width: 390, height: 840 })
  await page.goto(URL + '/sets', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const ueberbreit = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  )
  ueberbreit ? fail('Kein seitliches Scrollen bei 390 px') : ok('Kein seitliches Scrollen bei 390 px')
  if (SHOTS) await page.screenshot({ path: SHOTS + '/mobil.png' })
} catch (e) {
  fail('Ablauf abgebrochen', e.message.split('\n')[0])
} finally {
  console.log('\n--- Schreibaufrufe ---')
  schreibAufrufe.forEach((a) => console.log('   ' + a.m + ' ' + a.url + ' -> ' + a.status))
  console.log('\n--- Konsolenfehler ---')
  console.log(fehlerKonsole.length ? fehlerKonsole.slice(0, 8).map((t) => '   ' + t.slice(0, 160)).join('\n') : '   keine')
  const schlecht = ergebnisse.filter((r) => r[0] === 'FAIL').length
  console.log('\n=== ' + (ergebnisse.length - schlecht) + ' von ' + ergebnisse.length + ' Prüfungen bestanden ===')
  await browser.close()
  process.exit(schlecht ? 1 : 0)
}
