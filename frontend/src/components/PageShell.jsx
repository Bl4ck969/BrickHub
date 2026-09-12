/* Gemeinsames Geruest der Seiten hinter der Anmeldung.
   Die Kopfleiste laeuft randlos ueber die volle Breite und traegt eine
   Trennlinie; der Inhalt darunter bekommt das Noppenraster und sein
   eigenes Innenmass. Die Sets-Seite baut dasselbe Muster direkt auf,
   weil sie eine eigene Werkzeugleiste mitbringt. */
export function PageShell({ titel, untertitel, aktionen, children }) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-wrap items-end gap-4 border-b border-line bg-surface px-4 py-4 md:px-6">
        <div className="mr-auto min-w-0">
          <h1 className="mb-0.5 text-[25px] font-bold">{titel}</h1>
          {untertitel && <p className="text-[12.5px] text-ink-3">{untertitel}</p>}
        </div>
        {aktionen && <div className="flex flex-wrap items-center gap-2">{aktionen}</div>}
      </div>
      <div className="studs-bg flex-1 p-4 md:p-5">{children}</div>
    </div>
  )
}

/** Ladezustand, einheitlich fuer alle Seiten */
export function Ladet({ text = 'Lade…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-ink-3">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-b-gold" />
      {text}
    </div>
  )
}

/** Leerzustand mit Platz fuer einen Hinweis */
export function Leer({ children }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface/60 py-12 text-center text-ink-3">
      {children}
    </div>
  )
}
