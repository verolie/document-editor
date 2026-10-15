export interface User {
  id: string
  email: string
  name: string
}

export type ShareRole = 'viewer' | 'commenter' | 'editor'
export type Role = 'owner' | ShareRole

/** What the current user may do with a document; computed by the server. */
export interface Permissions {
  comment: boolean
  edit: boolean
  history: boolean
  share: boolean
  /** Delete, transfer ownership, change sharing settings. */
  manage: boolean
}

export interface Share {
  user: User
  role: ShareRole
}

export interface DocSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  role: Role
  owner: User | null
}

export interface Doc extends DocSummary {
  content: string
  version: number
  permissions: Permissions
  editorsCanShare: boolean
  lastEditedBy: User | null
  shares?: Share[]
}

export interface ImportedFile {
  title: string
  html: string
}

export interface CommentItem {
  id: string
  body: string
  createdAt: string
  updatedAt: string
  editedAt: string | null
  author: User
  canEdit: boolean
  canDelete: boolean
}

export interface CommentThread extends CommentItem {
  quote: string
  prefix: string | null
  suffix: string | null
  resolved: boolean
  replies: CommentItem[]
}

export interface VersionSummary {
  id: string
  number: number
  title: string
  restoredFrom: string | null
  createdAt: string
  updatedAt: string
  author: User | null
}

export interface Version extends VersionSummary {
  content: string
}

export interface PresenceState {
  users: (User & { editing: boolean })[]
  version: number
  updatedAt: string
  lastEditedBy: User | null
  commentsKey: string
}

export interface SaveConflict {
  version: number
  updatedAt: string
  lastEditedBy: User | null
}

export class ApiError extends Error {
  status: number
  /** Parsed JSON error body, for errors that carry details (e.g. save conflicts). */
  body: Record<string, unknown> | null

  constructor(status: number, message: string, body: Record<string, unknown> | null = null) {
    super(message)
    this.status = status
    this.body = body
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: isForm ? init.headers : { 'Content-Type': 'application/json', ...init.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`, body)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
})

export const api = {
  config: () => request<{ googleClientId: string | null; passwordAuth: boolean }>('/auth/config'),
  me: () => request<User>('/auth/me'),
  signup: (name: string, email: string, password: string) =>
    request<User>('/auth/signup', json('POST', { name, email, password })),
  login: (email: string, password: string) =>
    request<User>('/auth/login', json('POST', { email, password })),
  google: (credential: string) => request<User>('/auth/google', json('POST', { credential })),
  logout: () => request<void>('/auth/logout', json('POST')),

  listDocuments: () => request<DocSummary[]>('/documents'),
  createDocument: (data: { title?: string; content?: string } = {}) =>
    request<Doc>('/documents', json('POST', data)),
  getDocument: (id: string) => request<Doc>(`/documents/${id}`),
  /** Saving content needs `baseVersion`; a newer save by someone else fails with 409. */
  updateDocument: (id: string, data: { title?: string; content?: string; baseVersion?: number }) =>
    request<Doc>(`/documents/${id}`, json('PATCH', data)),
  deleteDocument: (id: string) => request<void>(`/documents/${id}`, json('DELETE')),
  updateSettings: (id: string, settings: { editorsCanShare: boolean }) =>
    request<Doc>(`/documents/${id}/settings`, json('PATCH', settings)),
  shareDocument: (id: string, email: string, role: ShareRole) =>
    request<Doc>(`/documents/${id}/shares`, json('POST', { email, role })),
  unshareDocument: (id: string, userId: string) =>
    request<Doc>(`/documents/${id}/shares/${userId}`, json('DELETE')),
  leaveDocument: (id: string, userId: string) =>
    request<void>(`/documents/${id}/shares/${userId}`, json('DELETE')),
  transferOwnership: (id: string, userId: string) =>
    request<Doc>(`/documents/${id}/transfer`, json('POST', { userId })),

  heartbeat: (id: string, editing: boolean) =>
    request<PresenceState>(`/documents/${id}/presence`, json('POST', { editing })),
  leavePresence: (id: string) =>
    fetch(`/api/documents/${id}/presence`, { method: 'DELETE', credentials: 'same-origin', keepalive: true }),

  listComments: (id: string) => request<CommentThread[]>(`/documents/${id}/comments`),
  addComment: (id: string, data: { body: string; quote: string; prefix: string; suffix: string }) =>
    request<CommentThread>(`/documents/${id}/comments`, json('POST', data)),
  replyToComment: (id: string, threadId: string, body: string) =>
    request<CommentThread>(`/documents/${id}/comments/${threadId}/replies`, json('POST', { body })),
  updateComment: (id: string, commentId: string, data: { body?: string; resolved?: boolean }) =>
    request<CommentThread>(`/documents/${id}/comments/${commentId}`, json('PATCH', data)),
  deleteComment: (id: string, commentId: string) =>
    request<void>(`/documents/${id}/comments/${commentId}`, json('DELETE')),

  listVersions: (id: string) => request<VersionSummary[]>(`/documents/${id}/versions`),
  getVersion: (id: string, versionId: string) => request<Version>(`/documents/${id}/versions/${versionId}`),
  restoreVersion: (id: string, versionId: string) =>
    request<Doc>(`/documents/${id}/versions/${versionId}/restore`, json('POST')),

  uploadImage: (image: Blob, filename: string, documentId: string) => {
    const form = new FormData()
    form.append('documentId', documentId)
    form.append('file', image, filename)
    return request<{ id: string; url: string }>('/images', { method: 'POST', body: form })
  },

  importFile: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<ImportedFile>('/import', { method: 'POST', body: form })
  },
}
