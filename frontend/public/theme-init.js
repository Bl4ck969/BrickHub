// Laeuft vor React und vor dem ersten Anstrich: ohne das blitzt beim
// Laden kurz das falsche Theme auf. Gemerkte Wahl schlaegt System.
// Eigene Datei statt Inline-Skript, weil die CSP (script-src 'self') in
// backend/app/main.py Inline-Skripte blockiert. Wird in index.html bewusst
// klassisch (ohne type="module", ohne defer) geladen, damit es synchron
// vor dem Rendern laeuft. Der Schluessel muss zu useTheme.jsx passen.
;(function () {
  try {
    var gewaehlt = localStorage.getItem('brickhub-theme')
    var dunkel =
      gewaehlt === 'dark' ||
      (gewaehlt !== 'light' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dunkel)
  } catch (e) {
    // Privates Fenster oder gesperrte Speicherung: dann eben hell.
  }
})()
