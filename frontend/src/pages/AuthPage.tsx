import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type User } from '../api'
import { useAuth } from '../auth'
import GoogleButton from '../components/GoogleButton'
import { useToast } from '../toast'

type Mode = 'login' | 'signup'

interface AuthConfig {
  googleClientId: string | null
  passwordAuth: boolean
}

export default function AuthPage() {
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .config()
      .then(setConfig)
      .catch(() => setConfig({ googleClientId: null, passwordAuth: false }))
  }, [])

  async function signIn(action: () => Promise<User>, successTitle: string, failTitle: string) {
    setBusy(true)
    try {
      const user = await action()
      setUser(user)
      toast.success(`Welcome, ${user.name}!`, successTitle)
      navigate('/', { replace: true })
    } catch (err) {
      toast.error((err as Error).message, failTitle)
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-mark">D</span> Docs
        </div>
        <h1>Sign in to Docs</h1>
        <p className="muted">Use your Google account (Gmail) to sign in. New here? Signing in creates your account.</p>

        {config === null ? (
          <p className="muted">Loading…</p>
        ) : config.googleClientId ? (
          <div className={busy ? 'google-area busy' : 'google-area'}>
            <GoogleButton
              clientId={config.googleClientId}
              onCredential={(credential) =>
                signIn(() => api.google(credential), 'Signed in with Google', 'Google sign-in failed')
              }
              onError={(message) => toast.error(message, 'Google sign-in unavailable')}
            />
          </div>
        ) : (
          <p className="notice">
            Google sign-in isn't set up on this server yet. The site owner needs to set <code>GOOGLE_CLIENT_ID</code>.
          </p>
        )}

        {config?.passwordAuth && (
          <>
            <div className="divider">
              <span>or, for testing</span>
            </div>
            <PasswordForm busy={busy} onSubmit={signIn} />
          </>
        )}
      </div>
    </div>
  )
}

/** Email + password sign-in. Only shown when the server enables it (tests and preview deployments). */
function PasswordForm({
  busy,
  onSubmit,
}: {
  busy: boolean
  onSubmit: (action: () => Promise<User>, successTitle: string, failTitle: string) => void
}) {
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (mode === 'signup') {
      onSubmit(() => api.signup(name, email, password), 'Account created', 'Sign up failed')
    } else {
      onSubmit(() => api.login(email, password), 'Signed in', 'Sign in failed')
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      {mode === 'signup' && (
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your name" />
        </label>
      )}
      <label>
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
        />
      </label>
      <label>
        Password
        <input
          type="password"
          required
          minLength={mode === 'signup' ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          placeholder={mode === 'signup' ? 'At least 8 characters' : ''}
        />
      </label>
      <button type="submit" className="primary wide" disabled={busy}>
        {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
      </button>
      <p className="auth-switch">
        {mode === 'login' ? (
          <button type="button" className="link" onClick={() => setMode('signup')}>
            Create a test account
          </button>
        ) : (
          <button type="button" className="link" onClick={() => setMode('login')}>
            I already have an account
          </button>
        )}
      </p>
    </form>
  )
}
