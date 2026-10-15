import type { User } from '../api'

/** A stable color per user, so the same person always looks the same. */
export function userColor(userId: string) {
  let hash = 0
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return `hsl(${Math.abs(hash) % 360} 65% 45%)`
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

const MAX_SHOWN = 4

export default function PresenceAvatars({ users }: { users: (User & { editing: boolean })[] }) {
  if (users.length === 0) return null
  const shown = users.slice(0, MAX_SHOWN)
  const extra = users.length - shown.length
  const editingCount = users.filter((u) => u.editing).length

  return (
    <div
      className="presence"
      aria-label={`${users.length} other ${users.length === 1 ? 'person' : 'people'} here${
        editingCount ? `, ${editingCount} editing` : ''
      }`}
    >
      {shown.map((user) => (
        <span
          key={user.id}
          className={`avatar${user.editing ? ' editing' : ''}`}
          style={{ background: userColor(user.id) }}
          title={`${user.name} (${user.email}) · ${user.editing ? 'editing' : 'viewing'}`}
        >
          {initials(user.name)}
          {user.editing && <span className="avatar-badge" aria-hidden="true">✎</span>}
        </span>
      ))}
      {extra > 0 && (
        <span className="avatar more" title={users.slice(MAX_SHOWN).map((u) => u.name).join(', ')}>
          +{extra}
        </span>
      )}
    </div>
  )
}
