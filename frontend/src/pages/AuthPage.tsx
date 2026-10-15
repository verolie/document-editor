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
  const [mode, setMode] = useState<Mode>('login')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .config()
      .then(setConfig)
      .catch(() => setConfig({ googleClientId: null, passwordAuth: true }))
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

  const google = config?.googleClientId
  const password = config?.passwordAuth

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-mark">D</span> Docs
        </div>
        <h1>{mode === 'login' ? 'Sign in to Docs' : 'Create your account'}</h1>
        <p className="muted">
          {google && password
            ? 'Continue with Google, or use your email and password.'
            : mode === 'login'
              ? 'Sign in to open your documents.'
              : 'Write, format and share documents for free.'}
        </p>

        {config === null && <p className="muted">Loading…</p>}

        {google && (
          <div className={busy ? 'google-area busy' : 'google-area'}>
            <GoogleButton
              clientId={google}
              onCredential={(credential) =>
                signIn(() => api.google(credential), 'Signed in with Google', 'Google sign-in failed')
              }
              onError={(message) => toast.error(message, 'Google sign-in unavailable')}
            />
          </div>
        )}

        {google && password && (
          <div className="divider">
            <span>or</span>
          </div>
        )}

        {password && <PasswordForm mode={mode} busy={busy} onModeChange={setMode} onSubmit={signIn} />}

        {config && !google && !password && (
          <p className="notice">Sign-in isn't configured on this server yet.</p>
        )}
      </div>
    </div>
  )
}

interface PasswordFormProps {
  mode: Mode
  busy: boolean
  onModeChange: (mode: Mode) => void
  onSubmit: (action: () => Promise<User>, successTitle: string, failTitle: string) => void
}

/** Email + password sign-in and sign-up, the alternative to Google. */
function PasswordForm({ mode, busy, onModeChange, onSubmit }: PasswordFormProps) {
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
          <>
            New here?{' '}
            <button type="button" className="link" onClick={() => onModeChange('signup')}>
              Create an account
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button type="button" className="link" onClick={() => onModeChange('login')}>
              Sign in
            </button>
          </>
        )}
      </p>
    </form>
  )
}
