/* Eine Quelle fuer die Steinart-Farben: dieselbe Farbe meint ueberall
   dieselbe Steinart - in der Verteilung, in der Tabelle, auf den Karten
   der Lagerung und in der Galerie. */

export const STEINARTEN = [
  'Standard',
  'Standard, beleuchtet',
  'Standard, Technik',
  'Mini',
  'Diamond',
  'Sonder-Steine',
]

const FARBEN = {
  'Standard': 'var(--bh-s1)',
  'Diamond': 'var(--bh-s2)',
  'Standard, Technik': 'var(--bh-s3)',
  'Mini': 'var(--bh-s4)',
  'Standard, beleuchtet': 'var(--bh-s5)',
  'Sonder-Steine': 'var(--bh-s6)',
}

const REST = ['var(--bh-s6)', 'var(--bh-s1)', 'var(--bh-s2)', 'var(--bh-s3)']

/** Farbe einer Steinart; unbekannte bekommen der Reihe nach eine aus dem Rest. */
export function steinFarbe(name, i = 0) {
  return FARBEN[name] || REST[i % REST.length]
}

/** Fuellstand einer Kiste: voll ist kritisch, leer ist neutral. */
export function fuellFarbe(prozent) {
  if (prozent >= 100) return 'var(--bh-crit)'
  if (prozent >= 70) return 'var(--bh-st-build)'
  if (prozent > 0) return 'var(--bh-st-done)'
  return 'var(--bh-line-2)'
}

export const zahl = (n) => (n == null ? '–' : n.toLocaleString('de-DE'))

export const euro = (n) =>
  n == null ? '–' : n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
