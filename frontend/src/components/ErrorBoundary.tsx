import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

// Shows a recoverable message instead of a blank page when rendering crashes.
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="center-screen">
        <h1>Something went wrong</h1>
        <p className="muted">The page failed to load. Reloading usually fixes it.</p>
        <div className="actions">
          <button type="button" onClick={() => window.location.assign('/')}>
            Go to documents
          </button>
          <button type="button" className="primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    )
  }
}
