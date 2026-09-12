/* Geruest der vier Seiten vor der Anmeldung: Anmeldung, Ersteinrichtung,
   Passwort vergessen, Passwort aendern.
   Der Grund traegt das Noppenraster - Materialitaet statt flacher Flaeche -
   und bleibt in beiden Modi dunkel: das ist die Markenseite. */
export function AuthShell({ titel, untertitel, breit = false, children }) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10
      [background:radial-gradient(120%_90%_at_50%_0%,#24405f_0%,#16243b_48%,#0c1626_100%)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0
          [background-image:radial-gradient(rgb(255_255_255/0.09)_1px,transparent_1.2px)]
          [background-size:22px_22px]
          [mask-image:radial-gradient(80%_70%_at_50%_40%,#000_20%,transparent_78%)]"
      />
      <div
        className={`relative flex w-full flex-col gap-4 rounded-[18px] border border-white/12
          bg-white/5 p-7 text-[#e7edf6] shadow-l backdrop-blur-[14px]
          ${breit ? 'max-w-xl' : 'max-w-[400px]'}`}
      >
        <div className="flex flex-col items-center gap-2">
          <img src="/logo.png" alt="" className="h-13 w-13 object-contain" />
          <h1 className="mt-1 text-[27px] font-extrabold tracking-[-0.03em]">{titel}</h1>
          {untertitel && <p className="text-[12.5px] text-[#93a6c0]">{untertitel}</p>}
        </div>
        {children}
      </div>
    </div>
  )
}

/** Beschriftetes Eingabefeld auf dunklem Grund */
export function AuthFeld({ id, label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[11.5px] font-semibold tracking-[0.04em] text-[#93a6c0] uppercase">
        {label}
      </label>
      {children}
    </div>
  )
}

/** Einheitliche Klasse fuer die Eingabefelder der Auth-Seiten */
export const authInput =
  'w-full rounded-[10px] border border-white/16 bg-[#0a1220]/42 px-3.5 py-2.5 text-sm text-[#e7edf6] ' +
  'placeholder:text-[#64789a] focus:border-gold focus:ring-3 focus:ring-[rgb(240_180_41/0.18)] focus:outline-hidden'

/** Fehlermeldung, sichtbar auf dunklem Grund */
export function AuthFehler({ children }) {
  if (!children) return null
  return (
    <div
      role="alert"
      className="rounded-[10px] border border-[rgb(255_123_123/0.35)] bg-[rgb(200_60_60/0.18)] px-3.5 py-2.5 text-[13px] text-[#ffb4b4]"
    >
      {children}
    </div>
  )
}
