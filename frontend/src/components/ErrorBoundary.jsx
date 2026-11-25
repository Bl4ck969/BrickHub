import { Component } from 'react'

/** Fängt Fehler beim Anzeigen ab und zeigt eine Meldung statt einer weißen Seite.
 *  `resetKey` (z. B. der Pfad) setzt den Fehler beim Seitenwechsel zurück. */
export class ErrorBoundary extends Component {
  state = { fehler: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(fehler) {
    return { fehler }
  }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey) return { fehler: null, resetKey: props.resetKey }
    return null
  }

  componentDidCatch(fehler, info) {
    console.error('Anzeigefehler:', fehler, info?.componentStack)
  }

  render() {
    if (!this.state.fehler) return this.props.children
    return (
      <div role="alert" className="mx-auto max-w-lg p-8 text-center">
        <h2 className="text-lg font-semibold text-heading">Hier ist etwas schiefgegangen</h2>
        <p className="mt-2 text-ink-2">
          Diese Seite konnte nicht angezeigt werden. Die übrigen Bereiche funktionieren weiter.
        </p>
        <button
          type="button"
          className="btn-primary mt-4"
          onClick={() => window.location.reload()}
        >
          Seite neu laden
        </button>
      </div>
    )
  }
}
