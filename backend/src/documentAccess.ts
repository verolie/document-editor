import type { Request, Response } from 'express'
import { accessibleBy, permissionsFor, roleFor, type Permission, type Role } from './access.js'
import { publicUser } from './auth.js'
import { prisma, type User } from './db.js'

export const userSelect = { id: true, email: true, name: true } as const

export const fullDocument = {
  owner: { select: userSelect },
  lastEditedBy: { select: userSelect },
  shares: { include: { user: { select: userSelect } }, orderBy: { createdAt: 'asc' } },
} as const

export function findDocument(id: string, userId: string) {
  return prisma.document.findFirst({ where: { id, ...accessibleBy(userId) }, include: fullDocument })
}

export type FullDocument = NonNullable<Awaited<ReturnType<typeof findDocument>>>

export function serializeDocument(doc: FullDocument, role: Role) {
  const permissions = permissionsFor(role, doc)
  return {
    id: doc.id,
    title: doc.title,
    content: doc.content,
    version: doc.version,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    role,
    permissions,
    editorsCanShare: doc.editorsCanShare,
    owner: publicUser(doc.owner),
    lastEditedBy: doc.lastEditedBy && publicUser(doc.lastEditedBy),
    ...(permissions.share && {
      shares: doc.shares.map((s) => ({ user: publicUser(s.user), role: s.role })),
    }),
  }
}

/**
 * Loads a document the user can open and checks one permission.
 * Sends the error response and returns null when either fails.
 */
export async function loadDocument(id: string, user: User, res: Response, need: Permission | 'view') {
  const doc = await findDocument(id, user.id)
  const role = doc && roleFor(doc, user.id)
  if (!doc || !role) {
    res.status(404).json({ error: 'Document not found' })
    return null
  }
  const permissions = permissionsFor(role, doc)
  if (need !== 'view' && !permissions[need]) {
    res.status(403).json({ error: 'You do not have permission to do that' })
    return null
  }
  return { doc, role, permissions }
}

/** The `:id` of the parent `/documents/:id` route, for routers mounted with mergeParams. */
export const documentId = (req: Request) => (req.params as Record<string, string>).id
