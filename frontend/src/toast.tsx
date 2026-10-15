import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: number
  type: ToastType
  title?: string
  message: string
}

type Notify = (message: string, title?: string) => void

interface ToastApi {
  success: Notify
  error: Notify
  warning: Notify
  info: Notify
}

const DURATION: Record<ToastType, number> = {
  success: 3500,
  info: 4000,
  warning: 5000,
  error: 6000,
}

const MAX_TOASTS = 4

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const api = useMemo<ToastApi>(() => {
    const push = (type: ToastType) => (message: string, title?: string) => {
      const toast = { id: nextId.current++, type, title, message }
      setToasts((prev) => [...prev, toast].slice(-MAX_TOASTS))
    }
    return { success: push('success'), error: push('error'), warning: push('warning'), info: push('info') }
  }, [])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  // Modals use <dialog>, which renders in the browser's top layer above everything else.
  // Showing the toast area as a popover puts it in the top layer too, and re-showing it
  // whenever toasts change moves it above any dialog opened since.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof el.showPopover !== 'function') return
    if (el.matches(':popover-open')) el.hidePopover()
    if (toasts.length > 0) el.showPopover()
  }, [toasts])

  return (
    <div ref={ref} className="toast-viewport" popover="manual" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

const ICONS: Record<ToastType, ReactNode> = {
  success: <path d="M5 10.5l3.2 3.2L15 7" />,
  error: <path d="M6.5 6.5l7 7m0-7l-7 7" />,
  warning: (
    <>
      <path d="M10 5.5v5.5" />
      <path d="M10 14.2v.1" />
    </>
  ),
  info: (
    <>
      <path d="M10 9v5.5" />
      <path d="M10 5.8v.1" />
    </>
  ),
}

const DEFAULT_TITLES: Record<ToastType, string> = {
  success: 'Success',
  error: 'Something went wrong',
  warning: 'Warning',
  info: 'Notice',
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const timer = setTimeout(() => onDismiss(toast.id), DURATION[toast.type])
    return () => clearTimeout(timer)
  }, [paused, toast, onDismiss])

  return (
    <div
      className={`toast toast-${toast.type}`}
      role={toast.type === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span className="toast-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {ICONS[toast.type]}
        </svg>
      </span>
      <div className="toast-text">
        <strong>{toast.title ?? DEFAULT_TITLES[toast.type]}</strong>
        <span>{toast.message}</span>
      </div>
      <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => onDismiss(toast.id)}>
        ✕
      </button>
      {!paused && (
        <span className="toast-progress" style={{ animationDuration: `${DURATION[toast.type]}ms` }} />
      )}
    </div>
  )
}
