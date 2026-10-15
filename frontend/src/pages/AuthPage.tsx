import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type User } from '../api'
import { useAuth } from '../auth'
import GoogleButton from '../components/GoogleButton'
import { useToast } from '../toast'

type Mode = 'login' | 'signup'

export default function AuthPage() {
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [googleClientId, setGoogleClientId] = useState<string | null>(null)

  useEffect(() => {
    api
      .config()
      .then((config) => setGoogleClientId(config.googleClientId))
      .catch(() => setGoogleClientId(null))
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

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (mode === 'signup') {
      signIn(() => api.signup(name, email, password), 'Account created', 'Sign up failed')
    } else {
      signIn(() => api.login(email, password), 'Signed in', 'Sign in failed')
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-mark">D</span> Docs
        </div>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="muted">
          {mode === 'login'
            ? 'Sign in to open your documents.'
            : 'Write, format and share documents for free.'}
        </p>

        {googleClientId && (
          <>
            <GoogleButton
              clientId={googleClientId}
              onCredential={(credential) =>
                signIn(() => api.google(credential), 'Signed in with Google', 'Google sign-in failed')
              }
              onError={(message) => toast.error(message, 'Google sign-in unavailable')}
            />
            <div className="divider">
              <span>or</span>
            </div>
          </>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <label>
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Your name"
              />
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
        </form>

        <p className="auth-switch">
          {mode === 'login' ? (
            <>
              New here?{' '}
              <button type="button" className="link" onClick={() => setMode('signup')}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" className="link" onClick={() => setMode('login')}>
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
