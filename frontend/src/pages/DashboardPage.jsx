import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRightIcon } from '@heroicons/react/24/outline'
import { setsApi, imagesApi } from '../api/client'
import { fehlerText } from '../lib/fehler'
import { PageShell, Ladet, Leer } from '../components/PageShell'
import { IconSets, IconParts, IconValue } from '../components/BrickIcons'
import { steinFarbe, zahl, euro } from '../lib/stein'

/* Dashboard: Kennzahlen der Sammlung. Jede Karte, jeder Balken und jeder Eintrag
   fuehrt auf die Sets-Uebersicht mit genau diesem Filter - die Filter stehen dort
   in der Adresse (SetsPage, FILTER_SCHLUESSEL). Grafiken bewusst ohne Bibliothek:
   Balken aus CSS, Farben aus den Design-Tokens. */

const STATUS_FARBE = {
  'Neu': 'var(--bh-st-new)',
  'Im Bau': 'var(--bh-st-build)',
  'Aufgebaut': 'var(--bh-st-done)',
  'Eingelagert': 'var(--bh-st-rest)',
}

const setsLink = (params) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  const text = q.toString()
  return text ? `/sets?${text}` : '/sets'
}

const centProStein = (wert) =>
  wert == null ? '–' : `${(wert * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Cent`

/** Klickbare Flaeche mit dezentem „→“, das beim Ueberfahren erscheint */
function Kachel({ to, label, children, className = '' }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className={`group relative block rounded-xl border border-line bg-surface shadow-s transition-all duration-150
        hover:-translate-y-px hover:border-gold hover:shadow-m focus-visible:border-gold focus-visible:outline-hidden ${className}`}
    >
      <ArrowRightIcon
        aria-hidden="true"
        className="absolute top-3 right-3 h-3.5 w-3.5 text-gold opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      />
      {children}
    </Link>
  )
}

function Kennzahl({ to, titel, wert, einheit, hinweis, Icon }) {
  return (
    <Kachel to={to} label={`${titel}: ${wert}${einheit ? ' ' + einheit : ''} – Sets anzeigen`} className="px-4 py-3.5">
      <div className="flex items-center gap-3">
        {Icon && <Icon className="h-8 w-8 shrink-0 text-icon-line" />}
        <div className="min-w-0">
          <div className="text-[10.5px] font-semibold tracking-wider text-ink-3 uppercase">{titel}</div>
          <div className="mt-0.5 font-display text-[26px] leading-tight font-bold tracking-tight tabular-nums">
            {wert}
            {einheit && <small className="ml-1 text-[14px] font-semibold text-ink-3">{einheit}</small>}
          </div>
          {hinweis && <div className="mt-0.5 text-[11.5px] text-ink-3">{hinweis}</div>}
        </div>
      </div>
    </Kachel>
  )
}

/** Eine Zeile eines Balkendiagramms, als Link */
function BalkenZeile({ to, name, wert, max, farbe, rechts, punkt }) {
  const inhalt = (
    <>
      <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-2">
        {punkt && <span className="h-[7px] w-[7px] shrink-0 rounded-xs" style={{ background: punkt }} />}
        <span className="truncate">{name}</span>
      </span>
      <span className="h-3 overflow-hidden rounded-[4px] bg-surface-3">
        <span
          className="block h-full rounded-[4px]"
          style={{ width: `${max ? Math.max(1, (wert / max) * 100) : 0}%`, background: farbe }}
        />
      </span>
      <span className="text-right text-[12px] font-semibold whitespace-nowrap tabular-nums">{rechts}</span>
    </>
  )
  const raster = 'grid grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-2.5 rounded-lg px-2 py-1.5'
  return to ? (
    <Link to={to} className={`${raster} transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-hidden`}>
      {inhalt}
    </Link>
  ) : (
    <div className={raster}>{inhalt}</div>
  )
}

function Kasten({ titel, hinweis, children }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 shadow-s">
      <h2 className="font-display text-[15px] font-bold">{titel}</h2>
      {hinweis && <p className="mb-2.5 text-[11.5px] text-ink-3">{hinweis}</p>}
      {children}
    </section>
  )
}

/** Ein einzelnes Set (groesstes, kleinstes …) mit Vorschaubild */
function SetKarte({ titel, set, zeile }) {
  if (!set) return null
  return (
    <Kachel to={setsLink({ search: set.name })} label={`${titel}: ${set.name} – in den Sets anzeigen`} className="p-3">
      <div className="flex items-center gap-3">
        <span className="grid h-14 w-[74px] shrink-0 place-items-center overflow-hidden rounded-md border border-line-2 bg-surface-2">
          {set.frontcover_thumbnail ? (
            <img src={imagesApi.fileUrl(set.frontcover_thumbnail)} alt="" loading="lazy" className="h-full w-full object-contain" />
          ) : (
            <span className="text-[10px] text-ink-3">Kein Cover</span>
          )}
        </span>
        <div className="min-w-0">
          <div className="text-[10.5px] font-semibold tracking-wider text-ink-3 uppercase">{titel}</div>
          <div className="truncate text-[14px] font-semibold">{set.name}</div>
          <div className="truncate text-[12px] text-ink-2">{zeile}</div>
        </div>
      </div>
    </Kachel>
  )
}

export function DashboardPage() {
  const [daten, setDaten] = useState(null)
  const [fehler, setFehler] = useState('')

  useEffect(() => {
    setsApi.statistik()
      .then(res => setDaten(res.data))
      .catch(err => setFehler(fehlerText(err, 'Statistik konnte nicht geladen werden')))
  }, [])

  const untertitel = 'Deine Sammlung in Zahlen · ein Klick führt zu den passenden Sets'

  if (fehler) return <PageShell titel="Dashboard" untertitel={untertitel}><Leer>{fehler}</Leer></PageShell>
  if (!daten) return <PageShell titel="Dashboard" untertitel={untertitel}><Ladet /></PageShell>
  if (daten.anzahl_sets === 0) {
    return <PageShell titel="Dashboard" untertitel={untertitel}><Leer>Noch keine Sets – hier erscheinen die Auswertungen, sobald es welche gibt.</Leer></PageShell>
  }

  const maxSteine = Math.max(...daten.steinarten.map(a => a.steine), 0)
  const maxHersteller = Math.max(...daten.hersteller_top.map(h => h.sets), 0)
  const statusHinweis = daten.status.map(s => `${zahl(s.sets)} ${s.name.toLowerCase()}`).join(' · ')
  const bekannt = (name) => name !== 'Unbekannt'
  const teile = (s) => `${zahl(s.parts_count)} Steine`

  return (
    <PageShell titel="Dashboard" untertitel={untertitel}>
      <div className="mx-auto flex max-w-6xl flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kennzahl to="/sets" titel="Anzahl Sets" wert={zahl(daten.anzahl_sets)} hinweis={statusHinweis} Icon={IconSets} />
          <Kennzahl
            to={setsLink({ sort: 'parts_count', dir: 'desc' })}
            titel="Anzahl Steine"
            wert={zahl(daten.steine_gesamt)}
            hinweis={`über ${zahl(daten.steinarten.length)} Steinarten`}
            Icon={IconParts}
          />
          <Kennzahl
            to={setsLink({ sort: 'price', dir: 'desc' })}
            titel="Gesamtwert"
            wert={euro(daten.wert_gesamt).replace(' €', '')}
            einheit="€"
            hinweis={`≈ ${centProStein(daten.preis_pro_stein)} pro Stein`}
            Icon={IconValue}
          />
          <Kennzahl
            to={setsLink({ sort: 'price', dir: 'desc' })}
            titel="Durchschnitt"
            wert={euro(daten.durchschnitt_preis).replace(' €', '')}
            einheit="€"
            hinweis={`${zahl(daten.durchschnitt_steine)} Steine pro Set`}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.1fr_1fr]">
          <Kasten titel="Steine nach Steinart" hinweis="Balken = Steine, rechts in grau die Zahl der Sets">
            {daten.steinarten.map((a, i) => (
              <BalkenZeile
                key={a.name}
                to={bekannt(a.name) ? setsLink({ stone_size: a.name }) : null}
                name={a.name}
                wert={a.steine}
                max={maxSteine}
                farbe={steinFarbe(a.name, i)}
                punkt={steinFarbe(a.name, i)}
                rechts={<>{zahl(a.steine)} <span className="font-normal text-ink-3">· {zahl(a.sets)}</span></>}
              />
            ))}
          </Kasten>
          <Kasten titel="Top 10 Hersteller" hinweis="nach Anzahl Sets">
            {daten.hersteller_top.map(h => (
              <BalkenZeile
                key={h.name}
                to={bekannt(h.name) ? setsLink({ manufacturer: h.name }) : null}
                name={h.name}
                wert={h.sets}
                max={maxHersteller}
                farbe="var(--bh-heading)"
                rechts={<>{zahl(h.sets)} <span className="font-normal text-ink-3">Sets</span></>}
              />
            ))}
          </Kasten>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <SetKarte titel="Größtes Set" set={daten.groesstes} zeile={daten.groesstes && `${daten.groesstes.manufacturer} · ${teile(daten.groesstes)}`} />
          <SetKarte titel="Kleinstes Set" set={daten.kleinstes} zeile={daten.kleinstes && `${daten.kleinstes.manufacturer} · ${teile(daten.kleinstes)}`} />
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
          <Kasten titel="Status" hinweis="Klick auf einen Abschnitt filtert">
            <div className="my-2 flex h-3.5 gap-0.5 overflow-hidden rounded-[5px]" role="list">
              {daten.status.map(s => (
                <Link
                  key={s.name}
                  role="listitem"
                  to={bekannt(s.name) ? setsLink({ status: s.name }) : '/sets'}
                  title={`${s.name}: ${zahl(s.sets)}`}
                  aria-label={`${s.name}: ${zahl(s.sets)} Sets anzeigen`}
                  className="transition-opacity hover:opacity-80"
                  style={{ flex: s.sets, background: STATUS_FARBE[s.name] || 'var(--bh-line-2)' }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {daten.status.map(s => (
                <Link
                  key={s.name}
                  to={bekannt(s.name) ? setsLink({ status: s.name }) : '/sets'}
                  className="inline-flex items-center gap-1.5 rounded px-1 text-[12px] text-ink-2 hover:bg-surface-2"
                >
                  <span className="h-[7px] w-[7px] rounded-full" style={{ background: STATUS_FARBE[s.name] || 'var(--bh-line-2)' }} />
                  {s.name} <b className="font-semibold text-ink tabular-nums">{zahl(s.sets)}</b>
                </Link>
              ))}
            </div>
          </Kasten>
          <Kasten titel="Preise" hinweis="teuerstes und günstigstes Set, Preis pro Stein">
            <div className="grid gap-2 sm:grid-cols-2">
              <SetKarte titel="Teuerstes Set" set={daten.teuerstes} zeile={daten.teuerstes && `${euro(daten.teuerstes.price)} · ${teile(daten.teuerstes)}`} />
              <SetKarte titel="Günstigstes Set" set={daten.guenstigstes} zeile={daten.guenstigstes && `${euro(daten.guenstigstes.price)} · ${teile(daten.guenstigstes)}`} />
              <SetKarte
                titel="Bester Preis pro Stein"
                set={daten.bester_preis_pro_stein}
                zeile={daten.bester_preis_pro_stein && `${centProStein(daten.bester_preis_pro_stein.preis_pro_stein)} · ${euro(daten.bester_preis_pro_stein.price)}`}
              />
              <SetKarte
                titel="Teuerster Preis pro Stein"
                set={daten.teuerster_preis_pro_stein}
                zeile={daten.teuerster_preis_pro_stein && `${centProStein(daten.teuerster_preis_pro_stein.preis_pro_stein)} · ${euro(daten.teuerster_preis_pro_stein.price)}`}
              />
            </div>
          </Kasten>
        </div>
      </div>
    </PageShell>
  )
}
