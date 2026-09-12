import { useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'

export function Modal({ open, onClose, title, children, size = 'md', titleExtra = null, noBodyPadding = false }) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const sizeClass = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-[95vw]',
  }[size] || 'max-w-lg'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2">
      <div
        className="absolute inset-0 bg-[#0a1019]/60 backdrop-blur-xs"
        onClick={onClose}
      />
      <div className={`relative bg-surface border border-line rounded-2xl shadow-l w-full ${sizeClass} max-h-[95vh] flex flex-col overflow-hidden`}>
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-line bg-surface-2">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-heading shrink-0">{title}</h2>
            {titleExtra}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-ink-3 hover:text-ink transition-colors p-1 rounded-lg hover:bg-surface-3"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <div className={noBodyPadding ? 'flex-1 overflow-hidden flex flex-col' : 'p-6 overflow-y-auto flex-1'}>{children}</div>
      </div>
    </div>
  )
}

export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel = 'Löschen', danger = true }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-ink-2 mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <button className="btn-secondary" onClick={onClose}>Abbrechen</button>
        <button
          className={danger ? 'btn-danger' : 'btn-primary'}
          onClick={() => { onConfirm(); onClose() }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
