import { NavLink, useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  ArchiveBoxIcon,
  PlusCircleIcon,
  CubeIcon,
  TagIcon,
  SparklesIcon,
  ClipboardDocumentListIcon,
  UsersIcon,
  ArrowRightOnRectangleIcon,
  KeyIcon,
} from '@heroicons/react/24/outline'

const navItems = [
  { to: '/sets', label: 'Sets', icon: ArchiveBoxIcon, adminOnly: false, prefix: '/sets' },
  { to: '/sets/new', label: 'Set anlegen', icon: PlusCircleIcon, adminOnly: true },
  { to: '/storage', label: 'Lagerung', icon: CubeIcon, adminOnly: true },
  { to: '/labels', label: 'Schilder', icon: TagIcon, adminOnly: false },
  { to: '/new-sets', label: 'Neue Sets', icon: SparklesIcon, adminOnly: false },
  { to: '/box-inventory', label: 'Kisteninventur', icon: ClipboardDocumentListIcon, adminOnly: false },
  { to: '/users', label: 'Benutzer', icon: UsersIcon, adminOnly: true },
]

export function Navbar() {
  const { user, logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const visibleItems = navItems.filter(item => !item.adminOnly || isAdmin)

  return (
    <nav className="bg-brand-navy text-white shadow-lg sticky top-0 z-40">
      <div className="max-w-full px-4">
        <div className="flex items-center h-16 gap-1">
          {/* Logo */}
          <div className="flex items-center gap-2 mr-4 pr-4 border-r border-white/20 flex-shrink-0">
            <img src="/logo.png" alt="BrickHub Logo" className="w-8 h-8 object-contain" />
            <span className="font-bold text-xl tracking-tight">BrickHub</span>
          </div>

          {/* Nav Links */}
          <div className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-hide">
            {visibleItems.map(({ to, label, icon: Icon, prefix }) => {
              const isActive = prefix
                ? location.pathname.startsWith(prefix)
                : location.pathname === to
              return (
                <NavLink
                  key={to}
                  to={to}
                  end
                  className={() =>
                    `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                      isActive
                        ? 'bg-brand-yellow text-brand-navy'
                        : 'text-white/80 hover:bg-white/10 hover:text-white'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </NavLink>
              )
            })}
          </div>

          {/* User info + logout */}
          <div className="flex items-center gap-2 flex-shrink-0 pl-4 border-l border-white/20">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{user?.username}</p>
              <p className="text-xs text-white/60">{user?.role === 'admin' ? 'Administrator' : 'Benutzer'}</p>
            </div>
            <Link
              to="/change-password"
              className="flex items-center gap-1.5 text-white/80 hover:text-white hover:bg-white/10 px-2 py-2 rounded-lg transition-all duration-200"
              title="Passwort ändern"
            >
              <KeyIcon className="w-5 h-5" />
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-white/80 hover:text-white hover:bg-white/10 px-2 py-2 rounded-lg transition-all duration-200"
              title="Abmelden"
            >
              <ArrowRightOnRectangleIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}

function BrickHubLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* === 3D Klemmstein === */}

      {/* Rechte Seite (dunkelgold) */}
      <path d="M21 15 L27 9 L27 24 L21 29 Z" fill="#9A7000"/>

      {/* Oberfläche (hellgelb) */}
      <path d="M3 15 L9 9 L27 9 L21 15 Z" fill="#FFE44D"/>

      {/* Front-Fläche (gelb) */}
      <rect x="3" y="15" width="18" height="14" fill="#FFD700"/>

      {/* Noppe 1 – linke Seite */}
      {/* Noppen-Seite (rechts sichtbar) */}
      <path d="M11.5 5 L13.5 3.5 L13.5 8.5 L11.5 10 Z" fill="#9A7000"/>
      {/* Noppen-Körper (Front) */}
      <rect x="5" y="5" width="6.5" height="5" fill="#FFD700"/>
      {/* Noppen-Oben */}
      <ellipse cx="8.3" cy="5" rx="3.3" ry="1.5" fill="#FFF07A"/>
      {/* Noppen-Basis auf Oberfläche */}
      <ellipse cx="8.3" cy="10" rx="3.3" ry="1.5" fill="#DDB800"/>

      {/* Noppe 2 – rechte Seite */}
      <path d="M20.5 5 L22.5 3.5 L22.5 8.5 L20.5 10 Z" fill="#9A7000"/>
      <rect x="14" y="5" width="6.5" height="5" fill="#FFD700"/>
      <ellipse cx="17.3" cy="5" rx="3.3" ry="1.5" fill="#FFF07A"/>
      <ellipse cx="17.3" cy="10" rx="3.3" ry="1.5" fill="#DDB800"/>

      {/* Highlight-Linie (Vorderkante oben) */}
      <line x1="3" y1="15" x2="21" y2="15" stroke="#FFE88A" strokeWidth="0.7" opacity="0.6"/>
    </svg>
  )
}
