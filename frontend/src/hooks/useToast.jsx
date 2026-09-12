import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircleIcon, ExclamationCircleIcon, InformationCircleIcon, ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline'

const ToastContext = createContext(null)

const TYPE_CONFIG = {
  success: {
    bg: 'bg-st-done-bg border-st-done/30',
    icon: <CheckCircleIcon className="w-5 h-5 text-st-done shrink-0" />,
    text: 'text-st-done',
  },
  error: {
    bg: 'bg-crit-bg border-crit/30',
    icon: <ExclamationCircleIcon className="w-5 h-5 text-crit shrink-0" />,
    text: 'text-crit',
  },
  info: {
    bg: 'bg-st-new-bg border-st-new/30',
    icon: <InformationCircleIcon className="w-5 h-5 text-st-new shrink-0" />,
    text: 'text-st-new',
  },
  warning: {
    bg: 'bg-st-build-bg border-st-build/30',
    icon: <ExclamationTriangleIcon className="w-5 h-5 text-st-build shrink-0" />,
    text: 'text-st-build',
  },
}

function ToastItem({ toast, onDismiss }) {
  const cfg = TYPE_CONFIG[toast.type] || TYPE_CONFIG.info
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-l ${cfg.bg} min-w-[260px] max-w-sm animate-fade-in`}>
      {cfg.icon}
      <p className={`flex-1 text-sm font-medium ${cfg.text}`}>{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-ink-3 hover:text-ink transition-colors shrink-0"
      >
        <XMarkIcon className="w-4 h-4" />
      </button>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const show = useCallback((message, type = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed inset-0 pointer-events-none z-200 flex items-center justify-center">
          <div className="pointer-events-auto flex flex-col gap-2">
            {toasts.map(t => (
              <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
            ))}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
