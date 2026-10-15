# Submission: Document Editor

| | |
|---|---|
| **Live app** | https://document-editor-neon.vercel.app |
| **Repository** | https://github.com/verolie/document-editor |
| **Setup and full feature list** | [README.md](README.md) |

## What it is

A lightweight Google Docs–style web app. Users sign in, create and format documents in a rich-text editor, import existing files, add images, comment, see who else has a document open, browse and restore version history, export to PDF or Markdown, and share documents with role-based permissions.

## How to try it

1. Open https://document-editor-neon.vercel.app and click **Create an account** (any email and a password of 8+ characters). *Continue with Google* also appears once a Google Client ID is configured.
2. Create a document, or upload one of the files in [`samples/`](samples) (`.txt`, `.md`, `.docx`).
3. Format text (Ctrl+B / I / U, headings, font size, lists, alignment, spacing), paste or drag in an image, and save with **Ctrl+S**.
4. Select some text and click 💬 to comment. Open **History** to preview or restore an earlier version, or **Export** to download Markdown or print to PDF.
5. To see sharing and collaboration, create a second account in a private window, then share the document with it from **Share** as Viewer, Commenter or Editor. Open the document in both windows to see presence avatars, automatic updates, and the conflict dialog when both of you save.

## Features delivered

- **Documents:** create, rename, edit, save (button or Ctrl+S), delete with confirmation; "My documents" and "Shared with me" lists; unsaved-changes warning.
- **Rich-text editor (TipTap):** bold, italic, underline, headings, font size, bullet lists (including `-` / `*` autoformat), alignment, line and paragraph spacing, images (upload, paste, drag and drop, resize, align), undo and redo.
- **Import:** `.txt`, `.md` and `.docx` become new documents, or are inserted at the cursor. Formatting and pictures from Word files are kept.
- **Authentication:** email + password (scrypt hashes) and Google sign-in (ID token verified on the server). Sessions use an httpOnly JWT cookie.
- **Sharing and roles:** owner, editor, commenter and viewer. The owner can let editors share and can transfer ownership, and anyone can leave a shared document. Permissions are enforced by the server, including access to images.
- **Collaboration:** presence (who is viewing or editing), other people's saves loading automatically, and optimistic version checks: a stale save returns 409 and the user chooses which version to keep.
- **Comments:** anchored to quoted text with highlights; reply, edit, delete, resolve and reopen.
- **Version history:** saves are grouped per author within 10 minutes and the last 50 are kept; preview and restore (a restore is itself undoable).
- **Export:** Markdown download and PDF through the browser print dialog.

## Architecture

| Part | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router, TipTap |
| Backend | Node.js 24, Express 5, TypeScript |
| Database | PostgreSQL on Neon, Prisma ORM with versioned migrations |
| File storage | Vercel Blob (private) in production, local disk in development |
| Hosting | Vercel: static frontend plus the Express API as one serverless function |
| CI/CD | GitHub Actions: lint and build on every change, a Neon database branch and Vercel preview per pull request, and migrate-then-deploy to production on `main` |

The frontend and backend are npm workspaces in one repository. The project structure is in the [README](README.md#project-structure).

## Design decisions and trade-offs

- **Polling instead of WebSockets.** Presence and updates poll every 5 seconds, and conflicts are resolved by an optimistic version number. This works reliably on serverless hosting and loses no data (both versions stay in history), but two people cannot type in the same paragraph at the same time. Real-time co-editing (for example Yjs over WebSockets) is the natural next step.
- **Server-side permissions.** Every route loads the document through one access check (`backend/src/documentAccess.ts`). The UI only hides what the server would refuse anyway.
- **Comments stored separately from the document.** Commenting never changes the text, so commenters cannot alter content and comments don't create versions. Anchors are found again by quoted text plus surrounding context.
- **Images compressed in the browser** (scaled to 1600 px) to stay under Vercel's 4.5 MB request limit. Uploads are checked by file signature, not just by extension.
- **Google account linking** removes any existing password on an account with the same email, so nobody can pre-register someone else's address.

## Testing

- **End-to-end tests (Playwright), 32 tests** in [`e2e/tests`](e2e/tests): authentication, documents, editor formatting and shortcuts, import and export, sharing and roles, comments, version restore, save conflicts, and API permission checks (404 for outsiders, 403 for viewers, 409 for stale saves).
  - Run with `npm run test:e2e` after copying `e2e/.env.example` to `e2e/.env`.
  - They need a separate test database and refuse to run against the app's own database.
- **CI** lints, type-checks and builds the frontend and backend on every pull request and push to `main`.
- Features were also checked manually in the browser during development, against a throwaway local Postgres.

## Known limitations

- Updates arrive every 5 seconds, with no simultaneous typing or automatic merging (see above).
- Uploads and saved documents are limited to 4 MB (Vercel's request size limit).
- Text alignment from `.docx` files is not imported, and old `.doc` files are not supported.
- No rate limiting on sign-in yet.
- Google sign-in needs a Google OAuth Client ID configured; until then the live site offers email + password only.
- Automatic deploys from GitHub Actions need three repository secrets (`VERCEL_TOKEN`, `NEON_API_KEY`, `DATABASE_URL_UNPOOLED`). The current production deployment was made with the Vercel CLI.
