/**
 * One-time migration: copies users, documents and shares from the old JSON file
 * (backend/data/db.json) into Postgres. Safe to run more than once.
 *
 *   npm run db:import-json -w backend [path/to/db.json]
 */
import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '../src/db.js'

interface OldData {
  users: { id: string; email: string; name: string; passwordHash?: string; googleId?: string; createdAt: string }[]
  documents: {
    id: string
    ownerId: string
    title: string
    content: string
    createdAt: string
    updatedAt: string
    shares: { userId: string; role: 'viewer' | 'editor' }[]
  }[]
}

const file = process.argv[2] ?? path.join(import.meta.dirname, '..', 'data', 'db.json')
const data = JSON.parse(await readFile(file, 'utf8')) as OldData

for (const user of data.users) {
  await prisma.user.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      email: user.email,
      name: user.name,
      passwordHash: user.passwordHash ?? null,
      googleId: user.googleId ?? null,
      createdAt: new Date(user.createdAt),
    },
    update: {},
  })
}

for (const doc of data.documents) {
  await prisma.document.upsert({
    where: { id: doc.id },
    create: {
      id: doc.id,
      ownerId: doc.ownerId,
      title: doc.title,
      content: doc.content,
      createdAt: new Date(doc.createdAt),
      updatedAt: new Date(doc.updatedAt),
    },
    update: {},
  })
  for (const share of doc.shares) {
    await prisma.share.upsert({
      where: { documentId_userId: { documentId: doc.id, userId: share.userId } },
      create: { documentId: doc.id, userId: share.userId, role: share.role },
      update: {},
    })
  }
}

console.log(`Imported ${data.users.length} users and ${data.documents.length} documents from ${file}`)
await prisma.$disconnect()
