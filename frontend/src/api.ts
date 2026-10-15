export interface User {
  id: string
  email: string
  name: string
}

export type ShareRole = 'viewer' | 'editor'
export type Role = 'owner' | ShareRole

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
  shares?: Share[]
}

export interface ImportedFile {
  title: string
  html: string
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
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
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
})

export const api = {
  config: () => request<{ googleClientId: string | null }>('/auth/config'),
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
  updateDocument: (id: string, data: { title?: string; content?: string }) =>
    request<Doc>(`/documents/${id}`, json('PATCH', data)),
  deleteDocument: (id: string) => request<void>(`/documents/${id}`, json('DELETE')),
  shareDocument: (id: string, email: string, role: ShareRole) =>
    request<Doc>(`/documents/${id}/shares`, json('POST', { email, role })),
  unshareDocument: (id: string, userId: string) =>
    request<Doc>(`/documents/${id}/shares/${userId}`, json('DELETE')),

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
