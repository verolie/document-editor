import type { Prisma } from './generated/prisma/client.js'
import type { ShareRole } from './db.js'

export type Role = 'owner' | ShareRole

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
