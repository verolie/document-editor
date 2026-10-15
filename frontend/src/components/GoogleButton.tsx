import { useEffect, useRef } from 'react'

interface GoogleId {
  initialize: (options: {
    client_id: string
    callback: (response: { credential: string }) => void
  }) => void
  renderButton: (element: HTMLElement, options: Record<string, unknown>) => void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } }
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
let scriptPromise: Promise<void> | null = null

function loadScript() {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('Could not load Google sign-in'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

interface GoogleButtonProps {
  clientId: string
  onCredential: (credential: string) => void
  onError: (message: string) => void
}

export default function GoogleButton({ clientId, onCredential, onError }: GoogleButtonProps) {
  const container = useRef<HTMLDivElement>(null)
  // Keep the latest callbacks without re-rendering Google's button on every render.
  const callbacks = useRef({ onCredential, onError })
  callbacks.current = { onCredential, onError }

  useEffect(() => {
    let cancelled = false
    loadScript()
      .then(() => {
        const googleId = window.google?.accounts.id
        if (cancelled || !googleId || !container.current) return
        googleId.initialize({
          client_id: clientId,
          callback: (response) => callbacks.current.onCredential(response.credential),
        })
        googleId.renderButton(container.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          width: 320,
        })
      })
      .catch((err: Error) => callbacks.current.onError(err.message))
    return () => {
      cancelled = true
    }
  }, [clientId])

  return <div ref={container} className="google-button" />
}
