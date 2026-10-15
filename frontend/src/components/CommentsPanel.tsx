import { useState, type FormEvent } from 'react'
import { api, type CommentItem, type CommentThread } from '../api'
import type { Anchor } from '../collab/anchors'
import { formatDateTime, timeAgo } from '../collab/time'
import { useToast } from '../toast'
import ConfirmDialog from './ConfirmDialog'
import { initials, userColor } from './PresenceAvatars'

interface CommentsPanelProps {
  documentId: string
  threads: CommentThread[]
  onThreadsChange: (update: (threads: CommentThread[]) => CommentThread[]) => void
  canComment: boolean
  activeId: string | null
  onActivate: (threadId: string | null) => void
  /** Threads whose quoted text no longer exists in the document. */
  orphanIds: Set<string>
  /** A selection waiting for its first comment, or null. */
  draft: Anchor | null
  onDraftDone: () => void
  onClose: () => void
}

export default function CommentsPanel(props: CommentsPanelProps) {
  const { documentId, threads, onThreadsChange, canComment, activeId, onActivate, orphanIds, draft } = props
  const toast = useToast()
  const [tab, setTab] = useState<'open' | 'resolved'>('open')
  const [pendingDelete, setPendingDelete] = useState<{ threadId: string; comment: CommentItem; isThread: boolean } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const replace = (updated: CommentThread) =>
    onThreadsChange((list) => list.map((t) => (t.id === updated.id ? updated : t)))

  async function run<T>(action: () => Promise<T>, failTitle: string): Promise<T | null> {
    try {
      return await action()
    } catch (err) {
      toast.error((err as Error).message, failTitle)
      return null
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    const { threadId, comment, isThread } = pendingDelete
    const ok = await run(() => api.deleteComment(documentId, comment.id), 'Could not delete comment')
    setDeleting(false)
    if (ok === null) return
    setPendingDelete(null)
    onThreadsChange((list) =>
      isThread
        ? list.filter((t) => t.id !== threadId)
        : list.map((t) => (t.id === threadId ? { ...t, replies: t.replies.filter((r) => r.id !== comment.id) } : t)),
    )
    if (isThread && activeId === threadId) onActivate(null)
    toast.success(isThread ? 'The comment thread was deleted.' : 'The reply was deleted.', 'Comment deleted')
  }

  const shown = threads.filter((t) => (tab === 'open' ? !t.resolved : t.resolved))
  const openCount = threads.filter((t) => !t.resolved).length

  return (
    <aside className="side-panel" aria-label="Comments">
      <header className="side-panel-header">
        <h2>Comments</h2>
        <button type="button" className="icon-button" onClick={props.onClose} aria-label="Close comments">
          ✕
        </button>
      </header>

      {draft && (
        <NewComment
          draft={draft}
          onCancel={props.onDraftDone}
          onSubmit={async (body) => {
            const created = await run(
              () => api.addComment(documentId, { body, ...draft }),
              'Could not add comment',
            )
            if (!created) return false
            onThreadsChange((list) => [...list, created])
            onActivate(created.id)
            setTab('open')
            props.onDraftDone()
            return true
          }}
        />
      )}

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'open'} onClick={() => setTab('open')}>
          Open ({openCount})
        </button>
        <button type="button" role="tab" aria-selected={tab === 'resolved'} onClick={() => setTab('resolved')}>
          Resolved ({threads.length - openCount})
        </button>
      </div>

      {shown.length === 0 && (
        <p className="muted side-panel-empty">
          {tab === 'open'
            ? canComment
              ? 'No open comments. Select some text and click “Comment” (Ctrl+Alt+M).'
              : 'No open comments.'
            : 'No resolved comments.'}
        </p>
      )}

      <ul className="thread-list">
        {shown.map((thread) => (
          <ThreadCard
            key={thread.id}
            thread={thread}
            active={thread.id === activeId}
            orphan={orphanIds.has(thread.id)}
            canComment={canComment}
            onActivate={() => onActivate(thread.id)}
            onReply={async (body) => {
              const updated = await run(() => api.replyToComment(documentId, thread.id, body), 'Could not reply')
              if (updated) replace(updated)
              return Boolean(updated)
            }}
            onEdit={async (comment, body) => {
              const updated = await run(() => api.updateComment(documentId, comment.id, { body }), 'Could not edit comment')
              if (updated) replace(updated)
              return Boolean(updated)
            }}
            onResolve={async (resolved) => {
              const updated = await run(
                () => api.updateComment(documentId, thread.id, { resolved }),
                resolved ? 'Could not resolve' : 'Could not reopen',
              )
              if (!updated) return
              replace(updated)
              if (resolved && activeId === thread.id) onActivate(null)
              toast.success(resolved ? 'Moved to Resolved.' : 'The thread is open again.', resolved ? 'Comment resolved' : 'Comment reopened')
            }}
            onDelete={(comment, isThread) => setPendingDelete({ threadId: thread.id, comment, isThread })}
          />
        ))}
      </ul>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete?.isThread ? 'Delete comment thread?' : 'Delete reply?'}
        confirmLabel="Delete"
        busyLabel="Deleting…"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      >
        <p>
          {pendingDelete?.isThread
            ? 'The comment and all its replies will be deleted for everyone.'
            : 'This reply will be deleted for everyone.'}
        </p>
      </ConfirmDialog>
    </aside>
  )
}

function Avatar({ user }: { user: { id: string; name: string } }) {
  return (
    <span className="avatar small" style={{ background: userColor(user.id) }} aria-hidden="true">
      {initials(user.name)}
    </span>
  )
}

function CommentBox({
  placeholder,
  submitLabel,
  initial = '',
  autoFocus,
  onSubmit,
  onCancel,
}: {
  placeholder: string
  submitLabel: string
  initial?: string
  autoFocus?: boolean
  onSubmit: (body: string) => Promise<boolean>
  onCancel?: () => void
}) {
  const [body, setBody] = useState(initial)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault()
    if (!body.trim() || busy) return
    setBusy(true)
    const ok = await onSubmit(body.trim())
    setBusy(false)
    if (ok) setBody('')
  }

  return (
    <form className="comment-box" onSubmit={handleSubmit}>
      <textarea
        value={body}
        placeholder={placeholder}
        rows={2}
        autoFocus={autoFocus}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Ctrl+Enter posts; Escape cancels.
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit()
          if (e.key === 'Escape' && onCancel) onCancel()
        }}
      />
      <div className="comment-box-actions">
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        <button type="submit" className="primary" disabled={!body.trim() || busy}>
          {busy ? 'Posting…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

function NewComment({
  draft,
  onSubmit,
  onCancel,
}: {
  draft: Anchor
  onSubmit: (body: string) => Promise<boolean>
  onCancel: () => void
}) {
  return (
    <div className="thread new-thread">
      <blockquote className="thread-quote">{draft.quote}</blockquote>
      <CommentBox placeholder="Add a comment… (Ctrl+Enter to post)" submitLabel="Comment" autoFocus onSubmit={onSubmit} onCancel={onCancel} />
    </div>
  )
}

interface ThreadCardProps {
  thread: CommentThread
  active: boolean
  orphan: boolean
  canComment: boolean
  onActivate: () => void
  onReply: (body: string) => Promise<boolean>
  onEdit: (comment: CommentItem, body: string) => Promise<boolean>
  onResolve: (resolved: boolean) => void
  onDelete: (comment: CommentItem, isThread: boolean) => void
}

function ThreadCard({ thread, active, orphan, canComment, onActivate, onReply, onEdit, onResolve, onDelete }: ThreadCardProps) {
  return (
    <li
      className={`thread${active ? ' active' : ''}${thread.resolved ? ' resolved' : ''}`}
      onClick={onActivate}
      id={`thread-${thread.id}`}
    >
      <blockquote className="thread-quote" title={thread.quote}>
        {orphan ? <em className="muted">The commented text was removed</em> : thread.quote}
      </blockquote>
      <CommentView comment={thread} onEdit={(body) => onEdit(thread, body)} onDelete={() => onDelete(thread, true)} />
      {thread.replies.map((reply) => (
        <CommentView key={reply.id} comment={reply} reply onEdit={(body) => onEdit(reply, body)} onDelete={() => onDelete(reply, false)} />
      ))}
      {(active || thread.resolved) && canComment && (
        <div className="thread-footer" onClick={(e) => e.stopPropagation()}>
          {!thread.resolved && <CommentBox placeholder="Reply…" submitLabel="Reply" onSubmit={onReply} />}
          <button type="button" className="link" onClick={() => onResolve(!thread.resolved)}>
            {thread.resolved ? 'Reopen' : 'Resolve'}
          </button>
        </div>
      )}
    </li>
  )
}

function CommentView({
  comment,
  reply,
  onEdit,
  onDelete,
}: {
  comment: CommentItem
  reply?: boolean
  onEdit: (body: string) => Promise<boolean>
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const edited = comment.editedAt !== null

  return (
    <div className={`comment${reply ? ' reply' : ''}`}>
      <div className="comment-meta">
        <Avatar user={comment.author} />
        <strong>{comment.author.name}</strong>
        <span className="muted" title={formatDateTime(comment.createdAt)}>
          {timeAgo(comment.createdAt)}
          {edited && ' · edited'}
        </span>
        <span className="comment-actions" onClick={(e) => e.stopPropagation()}>
          {comment.canEdit && !editing && (
            <button type="button" className="link" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {comment.canDelete && (
            <button type="button" className="link danger" onClick={onDelete}>
              Delete
            </button>
          )}
        </span>
      </div>
      {editing ? (
        <div onClick={(e) => e.stopPropagation()}>
          <CommentBox
            placeholder="Edit comment"
            submitLabel="Save"
            initial={comment.body}
            autoFocus
            onCancel={() => setEditing(false)}
            onSubmit={async (body) => {
              const ok = await onEdit(body)
              if (ok) setEditing(false)
              return ok
            }}
          />
        </div>
      ) : (
        <p className="comment-body">{comment.body}</p>
      )}
    </div>
  )
}
