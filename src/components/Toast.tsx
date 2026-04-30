'use client'

import { createContext, useCallback, useContext, useState } from 'react'

type Toast = {
  id: string
  message: string
  type: 'success' | 'error'
  actionLabel?: string
  actionHref?: string
}
type ToastContextType = {
  showToast: (
    message: string,
    type?: 'success' | 'error',
    action?: { label: string; href: string }
  ) => void
}

const ToastContext = createContext<ToastContextType>({ showToast: () => {} })

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((
    message: string,
    type: 'success' | 'error' = 'success',
    action?: { label: string; href: string }
  ) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message, type, actionLabel: action?.label, actionHref: action?.href }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${
              toast.type === 'success' ? 'bg-slate-900' : 'bg-red-600'
            }`}
          >
            <div>{toast.type === 'success' ? '✓ ' : '✕ '}{toast.message}</div>
            {toast.actionHref && toast.actionLabel ? (
              <a href={toast.actionHref} className="mt-1 inline-block text-xs underline">
                {toast.actionLabel}
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
