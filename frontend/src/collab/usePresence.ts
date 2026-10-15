import { useEffect, useRef, useState } from 'react'
import { api, type PresenceState } from '../api'

const INTERVAL_MS = 5000

/**
 * Sends a heartbeat every few seconds while the tab is visible and returns the latest
 * presence state: who else is here, the document's current version and a comments key.
 */
export function usePresence(documentId: string, isEditing: () => boolean) {
  const [state, setState] = useState<PresenceState | null>(null)
  // Read the latest value on each beat without restarting the timer.
  const editingRef = useRef(isEditing)
  editingRef.current = isEditing

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false

    async function beat() {
      if (stopped) return
      if (document.visibilityState === 'visible') {
        try {
          const next = await api.heartbeat(documentId, editingRef.current())
          if (!stopped) setState(next)
        } catch {
          // Network hiccup or expired session; the next beat retries.
        }
      }
      if (!stopped) timer = setTimeout(beat, INTERVAL_MS)
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timer)
        beat()
      }
    }
    const onUnload = () => api.leavePresence(documentId)

    beat()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pagehide', onUnload)
    return () => {
      stopped = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pagehide', onUnload)
      api.leavePresence(documentId)
    }
  }, [documentId])

  return state
}
