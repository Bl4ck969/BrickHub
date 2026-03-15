import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircleIcon, ExclamationCircleIcon, InformationCircleIcon, ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline'

const ToastContext = createContext(null)

const TYPE_CONFIG = {
  success: {
    bg: 'bg-green-50 border-green-200',
    icon: <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0" />,
    text: 'text-green-800',
  },
  error: {
    bg: 'bg-red-50 border-red-200',
    icon: <ExclamationCircleIcon className="w-5 h-5 text-red-600 flex-shrink-0" />,
    text: 'text-red-800',
  },
  info: {
    bg: 'bg-blue-50 border-[#1E3A5F]/20',
    icon: <InformationCircleIcon className="w-5 h-5 text-[#1E3A5F] flex-shrink-0" />,
    text: 'text-[#1E3A5F]',
  },
  warning: {
    bg: 'bg-yellow-50 border-yellow-300',
    icon: <ExclamationTriangleIcon className="w-5 h-5 text-yellow-700 flex-shrink-0" />,
    text: 'text-yellow-800',
  },
}

function ToastItem({ toast, onDismiss }) {
  const cfg = TYPE_CONFIG[toast.type] || TYPE_CONFIG.info
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl ${cfg.bg} min-w-[260px] max-w-sm animate-fade-in`}>
      {cfg.icon}
      <p className={`flex-1 text-sm font-medium ${cfg.text}`}>{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
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
        <div className="fixed inset-0 pointer-events-none z-[200] flex items-center justify-center">
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
