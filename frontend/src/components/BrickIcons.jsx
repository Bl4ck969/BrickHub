/* Isometrische Kennzahl-Icons.
   Schachtel, Stein, Muenze - das sind die drei Dinge, um die es geht.
   Die Goldtoene sind fest: Gold traegt auf hellem wie dunklem Grund.
   Die Kontur laeuft ueber currentColor, damit sie im Dunkelmodus nicht
   mit der Karte verschmilzt (Aufrufer setzt `text-icon-line`). */

const L = '#F5CC5E' // Deckflaeche
const R = '#E0A526' // rechte Seite
const S = '#C98F16' // linke Seite

/** Gesamtzahl der Sets: ein Stapel Schachteln */
export function IconSets({ className = '' }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
        <path d="M7 22.5 L7 27.5 L20 34 L20 29 Z" fill={S} />
        <path d="M20 29 L20 34 L33 27.5 L33 22.5 Z" fill={R} />
        <path d="M20 16 L33 22.5 L20 29 L7 22.5 Z" fill={L} />
        <path d="M7 17.5 L7 22.5 L20 29 L20 24 Z" fill={S} />
        <path d="M20 24 L20 29 L33 22.5 L33 17.5 Z" fill={R} />
        <path d="M20 11 L33 17.5 L20 24 L7 17.5 Z" fill={L} />
        <path d="M7 12.5 L7 17.5 L20 24 L20 19 Z" fill={S} />
        <path d="M20 19 L20 24 L33 17.5 L33 12.5 Z" fill={R} />
        <path d="M20 6 L33 12.5 L20 19 L7 12.5 Z" fill={L} />
      </g>
    </svg>
  )
}

/** Gesamtzahl der Teile: ein einzelner Stein mit vier Noppen */
export function IconParts({ className = '' }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
        <path d="M7 19 L7 26 L20 32.5 L20 25.5 Z" fill={S} />
        <path d="M20 25.5 L20 32.5 L33 26 L33 19 Z" fill={R} />
        <path d="M20 12.5 L33 19 L20 25.5 L7 19 Z" fill={L} />
      </g>
      <g stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round">
        <path d="M17.2 14.5 L17.2 16.4 A2.8 1.4 0 0 1 22.8 16.4 L22.8 14.5 Z" fill={R} />
        <ellipse cx="20" cy="14.5" rx="2.8" ry="1.4" fill={L} />
        <path d="M12 17.1 L12 19 A2.8 1.4 0 0 1 17.6 19 L17.6 17.1 Z" fill={R} />
        <ellipse cx="14.8" cy="17.1" rx="2.8" ry="1.4" fill={L} />
        <path d="M22.4 17.1 L22.4 19 A2.8 1.4 0 0 1 28 19 L28 17.1 Z" fill={R} />
        <ellipse cx="25.2" cy="17.1" rx="2.8" ry="1.4" fill={L} />
        <path d="M17.2 19.7 L17.2 21.6 A2.8 1.4 0 0 1 22.8 21.6 L22.8 19.7 Z" fill={R} />
        <ellipse cx="20" cy="19.7" rx="2.8" ry="1.4" fill={L} />
      </g>
    </svg>
  )
}

/** Gesamtwert: eine Muenze */
export function IconValue({ className = '' }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <path
        d="M7 18 L7 21 A13 12 0 0 1 33 21 L33 18 Z"
        fill={S}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <ellipse cx="20" cy="18" rx="13" ry="12" fill="#F0B429" stroke="currentColor" strokeWidth="1.3" />
      <ellipse cx="20" cy="18" rx="10.8" ry="9.9" fill="none" stroke="currentColor" strokeWidth="0.8" opacity=".3" />
      <path
        d="M26.2 12.5 C23.1 9.4 14.3 11.2 14.3 18 C14.3 24.8 23.1 26.7 26.2 23.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M13.9 16.1 H24.3 M13.9 19.9 H24.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  )
}
