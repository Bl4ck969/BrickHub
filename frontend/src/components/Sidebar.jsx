import { useState, useCallback } from 'react'
import { NavLink, useNavigate, useLocation, Link } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import {
  ArchiveBoxIcon,
  CubeIcon,
  TagIcon,
  SparklesIcon,
  ClipboardDocumentListIcon,
  UsersIcon,
  ArrowRightOnRectangleIcon,
  KeyIcon,
  ArchiveBoxArrowDownIcon,
  SunIcon,
  MoonIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'

/* Die Navigation ist gruppiert statt acht Punkte flach nebeneinander.
   `Set anlegen` steht bewusst NICHT hier - das ist eine Aktion und sitzt
   als Knopf auf der Sets-Seite. Die adminOnly-Marken sind dieselben wie
   in der Navbar aus 1.0. */
const NAV_GRUPPEN = [
  {
    titel: 'Sammlung',
    punkte: [
      { to: '/sets', label: 'Sets', icon: ArchiveBoxIcon, prefix: '/sets' },
      { to: '/new-sets', label: 'Neue Sets', icon: SparklesIcon },
      { to: '/labels', label: 'Schilder', icon: TagIcon },
    ],
  },
  {
    titel: 'Lager',
    punkte: [
      { to: '/storage', label: 'Lagerung', icon: CubeIcon, adminOnly: true },
      { to: '/box-inventory', label: 'Kisteninventur', icon: ClipboardDocumentListIcon },
    ],
  },
  {
    titel: 'Verwaltung',
    punkte: [
      { to: '/users', label: 'Benutzer', icon: UsersIcon, adminOnly: true },
      { to: '/backup', label: 'Backup', icon: ArchiveBoxArrowDownIcon, adminOnly: true },
    ],
  },
]

const RAIL_SPEICHER = 'brickhub-rail-eingeklappt'

function eingeklapptLaden() {
  try {
    return localStorage.getItem(RAIL_SPEICHER) === '1'
  } catch {
    return false
  }
}

/** Ein Eintrag in der Leiste. Der aktive tragt eine goldene Noppe am Rand. */
function RailLink({ to, label, icon: Icon, aktiv, eng }) {
  return (
    <NavLink
      to={to}
      end
      title={eng ? label : undefined}
      aria-current={aktiv ? 'page' : undefined}
      className={`relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px]
        transition-colors duration-150 ${eng ? 'justify-center' : ''} ${
        aktiv
          ? 'bg-rail-accent/15 font-semibold text-rail-accent'
          : 'font-normal text-rail-ink-2 hover:bg-white/6 hover:text-rail-ink'
      }`}
    >
      {aktiv && (
        <span
          aria-hidden="true"
          className="absolute top-1/2 -left-2.5 h-[18px] w-[5px] -translate-y-1/2 rounded-r bg-rail-accent"
        />
      )}
      <Icon className="h-[17px] w-[17px] shrink-0" />
      {!eng && label}
    </NavLink>
  )
}

export function Sidebar() {
  const { user, logout, isAdmin } = useAuth()
  const { dunkel, umschalten } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [eng, setEng] = useState(eingeklapptLaden)

  const einklappenUmschalten = useCallback(() => {
    setEng((v) => {
      const neu = !v
      try {
        localStorage.setItem(RAIL_SPEICHER, neu ? '1' : '0')
      } catch {
        // nicht speicherbar - gilt dann nur fuer diese Sitzung
      }
      return neu
    })
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const istAktiv = (punkt) =>
    punkt.prefix ? location.pathname.startsWith(punkt.prefix) : location.pathname === punkt.to

  const initialen = (user?.username || '?').slice(0, 2).toUpperCase()

  return (
    <aside
      className={`flex min-h-0 flex-col border-b border-rail-line bg-rail text-rail-ink
        md:border-r md:border-b-0 ${eng ? 'md:w-[62px]' : 'md:w-[234px]'}`}
    >
      {/* Kopf */}
      <div
        className={`flex items-center gap-2.5 border-b border-rail-line px-4 py-3.5
          ${eng ? 'md:justify-center md:px-2' : ''}`}
      >
        <img src="/logo.png" alt="" className="h-7 w-7 shrink-0 object-contain" />
        {!eng && (
          <span className="font-display text-[18px] font-bold tracking-tight">BrickHub</span>
        )}
      </div>

      {/* Navigation. Auf schmalen Fenstern liegt sie waagerecht und scrollt. */}
      <nav
        className={`flex min-h-0 flex-1 gap-2 overflow-x-auto px-2.5 py-2
          md:flex-col md:gap-3.5 md:overflow-x-visible md:overflow-y-auto md:py-3
          ${eng ? 'md:px-2' : ''}`}
      >
        {NAV_GRUPPEN.map((gruppe) => {
          const sichtbar = gruppe.punkte.filter((p) => !p.adminOnly || isAdmin)
          if (sichtbar.length === 0) return null
          return (
            <div key={gruppe.titel} className="flex items-center gap-1 md:flex-col md:items-stretch md:gap-0.5">
              {!eng && (
                <div className="eyebrow hidden px-2 pb-1 text-rail-ink-2/65 md:block">
                  {gruppe.titel}
                </div>
              )}
              {sichtbar.map((punkt) => (
                <RailLink
                  key={punkt.to}
                  to={punkt.to}
                  label={punkt.label}
                  icon={punkt.icon}
                  aktiv={istAktiv(punkt)}
                  eng={eng}
                />
              ))}
            </div>
          )
        })}
      </nav>

      {/* Fuss */}
      <div
        className={`flex items-center gap-1.5 border-t border-rail-line px-2.5 py-2
          md:flex-col md:items-stretch md:gap-0.5 ${eng ? 'md:px-2' : ''}`}
      >
        <div className={`mr-auto flex items-center gap-2.5 md:mr-0 md:px-2.5 md:py-2 ${eng ? 'md:justify-center md:px-0' : ''}`}>
          <div
            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-rail-accent
              font-display text-[12px] font-bold text-[#16243b]"
            title={user?.username}
          >
            {initialen}
          </div>
          {!eng && (
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[13px] font-semibold">{user?.username}</div>
              <div className="text-[11px] text-rail-ink-2">
                {user?.role === 'admin' ? 'Administrator' : 'Benutzer'}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={umschalten}
          title={dunkel ? 'Zu hell wechseln' : 'Zu dunkel wechseln'}
          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-rail-ink-2
            transition-colors duration-150 hover:bg-white/6 hover:text-rail-ink
            ${eng ? 'md:justify-center' : ''}`}
        >
          {dunkel ? (
            <SunIcon className="h-[17px] w-[17px] shrink-0" />
          ) : (
            <MoonIcon className="h-[17px] w-[17px] shrink-0" />
          )}
          {!eng && <span className="hidden md:inline">{dunkel ? 'Heller Modus' : 'Dunkler Modus'}</span>}
        </button>

        <Link
          to="/change-password"
          title="Passwort ändern"
          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-rail-ink-2
            transition-colors duration-150 hover:bg-white/6 hover:text-rail-ink
            ${eng ? 'md:justify-center' : ''}`}
        >
          <KeyIcon className="h-[17px] w-[17px] shrink-0" />
          {!eng && <span className="hidden md:inline">Passwort ändern</span>}
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          title="Abmelden"
          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-rail-ink-2
            transition-colors duration-150 hover:bg-white/6 hover:text-rail-ink
            ${eng ? 'md:justify-center' : ''}`}
        >
          <ArrowRightOnRectangleIcon className="h-[17px] w-[17px] shrink-0" />
          {!eng && <span className="hidden md:inline">Abmelden</span>}
        </button>

        <button
          type="button"
          onClick={einklappenUmschalten}
          title={eng ? 'Ausklappen' : 'Einklappen'}
          aria-expanded={!eng}
          className={`hidden items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-rail-ink-2
            transition-colors duration-150 hover:bg-white/6 hover:text-rail-ink md:flex
            ${eng ? 'md:justify-center' : ''}`}
        >
          {eng ? (
            <ChevronRightIcon className="h-[17px] w-[17px] shrink-0" />
          ) : (
            <ChevronLeftIcon className="h-[17px] w-[17px] shrink-0" />
          )}
          {!eng && 'Einklappen'}
        </button>
      </div>
    </aside>
  )
}
