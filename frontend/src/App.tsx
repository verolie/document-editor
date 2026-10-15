import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import AuthPage from './pages/AuthPage'
import DocumentsPage from './pages/DocumentsPage'

const RELOAD_KEY = 'editor-chunk-reload'

// The editor bundle is large, so it only loads when a document is opened.
// If the page is older than the server's files (after a deploy, or after the dev
// server re-optimizes dependencies) that load fails; reload once to get fresh files.
const EditorPage = lazy(() =>
  import('./pages/EditorPage').then(
    (module) => {
      storage(() => sessionStorage.removeItem(RELOAD_KEY))
      return module
    },
    (err: unknown) => {
      // Only retry once per tab; if storage is blocked, skip the retry to avoid reload loops.
      if (storage(() => sessionStorage.getItem(RELOAD_KEY)) === null) {
        storage(() => sessionStorage.setItem(RELOAD_KEY, '1'))
        window.location.reload()
        return new Promise<never>(() => {})
      }
      throw err
    },
  ),
)

// sessionStorage can throw in some privacy modes; treat that as "blocked".
function storage<T>(fn: () => T): T | 'blocked' {
  try {
    return fn()
  } catch {
    return 'blocked'
  }
}

const loading = <div className="center-screen muted">Loading…</div>

function App() {
  const { user } = useAuth()

  if (user === undefined) return loading

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Suspense fallback={loading}>
      <Routes>
        <Route path="/" element={<DocumentsPage />} />
        <Route path="/doc/:id" element={<EditorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
