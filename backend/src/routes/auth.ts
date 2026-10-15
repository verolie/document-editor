import { Router, type RequestHandler } from 'express'
import { OAuth2Client } from 'google-auth-library'
import {
  clearSession,
  hashPassword,
  publicUser,
  requireAuth,
  setSession,
  verifyPassword,
} from '../auth.js'
import { prisma } from '../db.js'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? ''
// Email + password sign-in is on unless explicitly turned off (Google sign-in is the other option).
const PASSWORD_AUTH = process.env.PASSWORD_AUTH_ENABLED !== 'false'
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const normalizeEmail = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLowerCase() : ''

export const authRouter = Router()

const passwordAuthOnly: RequestHandler = (_req, res, next) => {
  if (PASSWORD_AUTH) return next()
  res.status(403).json({ error: 'Email sign-in is turned off. Sign in with Google instead.' })
}

authRouter.get('/config', (_req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID || null, passwordAuth: PASSWORD_AUTH })
})

authRouter.post('/signup', passwordAuthOnly, async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''

  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'Please enter a valid email address' })
    return
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' })
    return
  }
  if (await prisma.user.findUnique({ where: { email } })) {
    res.status(409).json({ error: 'An account with this email already exists' })
    return
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: name || email.split('@')[0],
      passwordHash: await hashPassword(password),
    },
  })

  setSession(res, user.id)
  res.status(201).json(publicUser(user))
})

authRouter.post('/login', passwordAuthOnly, async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  const password = typeof req.body?.password === 'string' ? req.body.password : ''

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    const hint = user && !user.passwordHash ? ' This account uses Google sign-in.' : ''
    res.status(401).json({ error: `Incorrect email or password.${hint}` })
    return
  }

  setSession(res, user.id)
  res.json(publicUser(user))
})

authRouter.post('/google', async (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    res.status(501).json({ error: 'Google sign-in is not configured' })
    return
  }
  const credential = typeof req.body?.credential === 'string' ? req.body.credential : ''

  let payload
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    })
    payload = ticket.getPayload()
  } catch {
    res.status(401).json({ error: 'Google sign-in failed' })
    return
  }
  if (!payload?.email || !payload.email_verified) {
    res.status(401).json({ error: 'Your Google email address is not verified' })
    return
  }

  const email = payload.email.toLowerCase()
  const existing = await prisma.user.findFirst({
    where: { OR: [{ googleId: payload.sub }, { email }] },
  })
  const user = existing
    ? existing.googleId
      ? existing
      : // Link Google to an existing account with the same verified email. Its password is
        // removed: whoever set it never proved they own this email, Google just did.
        await prisma.user.update({
          where: { id: existing.id },
          data: { googleId: payload.sub, passwordHash: null },
        })
    : await prisma.user.create({
        data: { email, name: payload.name ?? email.split('@')[0], googleId: payload.sub },
      })

  setSession(res, user.id)
  res.json(publicUser(user))
})

authRouter.post('/logout', (_req, res) => {
  clearSession(res)
  res.status(204).end()
})

authRouter.get('/me', requireAuth, (req, res) => {
  res.json(publicUser(req.user!))
})
