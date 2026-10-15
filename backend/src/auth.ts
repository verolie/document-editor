import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { prisma, type User } from './db.js'

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

const COOKIE_NAME = 'session'
const SESSION_DAYS = 7
const isProduction = process.env.NODE_ENV === 'production'

const JWT_SECRET = process.env.JWT_SECRET ?? (isProduction ? '' : 'dev-only-secret-change-me')
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production')
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scryptAsync(password, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':')
  const expected = Buffer.from(hashHex, 'hex')
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return timingSafeEqual(actual, expected)
}

export function setSession(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` })
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  })
}

export function clearSession(res: Response) {
  res.clearCookie(COOKIE_NAME)
}

export function publicUser(user: Pick<User, 'id' | 'email' | 'name'>) {
  return { id: user.id, email: user.email, name: user.name }
}

declare global {
  namespace Express {
    interface Request {
      user?: User
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token: unknown = req.cookies?.[COOKIE_NAME]
  let userId: string | null = null
  if (typeof token === 'string') {
    try {
      userId = (jwt.verify(token, JWT_SECRET) as { sub: string }).sub
    } catch {
      // Invalid or expired token: fall through to 401.
    }
  }
  const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null
  if (!user) {
    res.status(401).json({ error: 'Not signed in' })
    return
  }
  req.user = user
  next()
}
