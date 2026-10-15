import type { Prisma } from './generated/prisma/client.js'
import type { ShareRole } from './db.js'

export type Role = 'owner' | ShareRole

const RANK: Record<Role, number> = { viewer: 0, commenter: 1, editor: 2, owner: 3 }

export const atLeast = (role: Role, minimum: Role) => RANK[role] >= RANK[minimum]

/** What a role may do with a document. Sent to the client so the UI follows the same rules. */
export function permissionsFor(role: Role, doc: { editorsCanShare: boolean }) {
  return {
    comment: atLeast(role, 'commenter'),
    edit: atLeast(role, 'editor'),
    history: atLeast(role, 'editor'),
    share: role === 'owner' || (role === 'editor' && doc.editorsCanShare),
    /** Delete, transfer ownership, change sharing settings. */
    manage: role === 'owner',
  }
}

export type Permission = keyof ReturnType<typeof permissionsFor>

/** Documents the user owns or that are shared with them. */
export const accessibleBy = (userId: string): Prisma.DocumentWhereInput => ({
  OR: [{ ownerId: userId }, { shares: { some: { userId } } }],
})

export function roleFor(
  doc: { ownerId: string; shares: { userId: string; role: ShareRole }[] },
  userId: string,
): Role | null {
  if (doc.ownerId === userId) return 'owner'
  return doc.shares.find((s) => s.userId === userId)?.role ?? null
}
