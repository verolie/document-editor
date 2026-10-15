# Document Editor

A web app for writing, formatting and sharing documents, in the spirit of a lightweight Google Docs. Users sign up (email + password or Google), create documents, format them with a rich-text editor, import existing files, add images, and share documents with other users as viewers or editors.

## Features

**Documents**
- Create, rename, edit, save and delete documents
- Save with the **Save** button or **Ctrl+S** (⌘S on Mac); the editor shows unsaved changes and warns before you leave
- "My documents" and "Shared with me" lists on the home page

**Editor**
- Bold, italic, underline: **Ctrl+B**, **Ctrl+I**, **Ctrl+U**
- Text style (Normal, Heading 1–3) and font size (10–48)
- Bullet lists: toolbar button, **Ctrl+Shift+8**, or type `-` / `*` then a space
- Align left / center / right (**Ctrl+Shift+L** / **Ctrl+Shift+E**)
- Line spacing and space between paragraphs (Shift+Enter for a line break without paragraph space)
- Images: toolbar button, paste (Ctrl+V) or drag and drop; resize by dragging a corner. Large photos are scaled to 1600 px and compressed before upload
- Undo / redo

**Import**
- Upload a `.txt`, `.md` or `.docx` file to turn it into a new document
- Or use **Import file** inside a document to insert a file's content at the cursor
- Headings, bold, italic, underline, lists and pictures from Word files are kept
- Example files to try are in [`samples/`](samples)

**Accounts and sharing**
- Sign up / sign in with email and password, or with Google
- Share a document by email with another registered user as **Can view** or **Can edit**
- Viewers get a read-only page; only the owner can share or delete
- Images follow the document's sharing: a user can only load an image if they can open a document that uses it

## Tech stack

| Part | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router, [TipTap](https://tiptap.dev) editor |
| Backend | Node.js, Express 5, TypeScript |
| Database | PostgreSQL ([Neon](https://neon.tech)) with [Prisma](https://www.prisma.io) ORM and migrations |
| File storage | [Vercel Blob](https://vercel.com/docs/vercel-blob) (private) in production, local disk in development |
| Auth | Password hashing with scrypt, sessions in an httpOnly JWT cookie, Google Identity Services |
| File import | [mammoth](https://github.com/mwilliamson/mammoth.js) (.docx), [marked](https://marked.js.org) (.md) |
| Hosting | [Vercel](https://vercel.com): static frontend + the Express API as one serverless function |

## Project structure

```
.
├── api/index.js            Vercel entry point; loads the compiled Express app
├── backend/
│   ├── prisma/             Database schema and migrations
│   ├── scripts/            One-off scripts (import old JSON data)
│   └── src/
│       ├── app.ts          Express app (routes, middleware, error handling)
│       ├── index.ts        Local server: starts the app, serves the built frontend
│       ├── auth.ts         Password hashing, sessions, requireAuth middleware
│       ├── access.ts       Who can open a document (owner / editor / viewer)
│       ├── storage.ts      Image file storage (Vercel Blob or local disk)
│       └── routes/         auth, documents (+ sharing), images, import
├── frontend/
│   └── src/
│       ├── pages/          Sign-in, documents list, editor
│       ├── components/     Toolbar, menus, dialogs, notifications
│       ├── api.ts          Typed client for the backend API
│       ├── images.ts       Image compression and upload
│       └── spacing.ts      Line / paragraph spacing editor extension
├── samples/                Example .txt, .md and .docx files to import
├── vercel.json             Vercel build and routing config
└── package.json            npm workspaces: frontend + backend
```

## Running locally

### Prerequisites

- [Node.js](https://nodejs.org) 24
- A PostgreSQL database. The easiest is a free [Neon](https://neon.tech) project; any Postgres 14+ works (for example one in Docker)

### 1. Install

```bash
git clone https://github.com/verolie/document-editor.git
cd document-editor
npm install
```

`npm install` installs both the frontend and backend (they are npm workspaces) and generates the Prisma client.

### 2. Configure the backend

Copy the example environment file and fill it in:

```bash
cp backend/.env.example backend/.env
```

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string used by the app. For Neon, use the **pooled** URL (host contains `-pooler`) |
| `DATABASE_URL_UNPOOLED` | Neon only | Direct connection used for migrations (the same URL without `-pooler`). Falls back to `DATABASE_URL` |
| `JWT_SECRET` | In production | Long random string that signs login sessions. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` |
| `GOOGLE_CLIENT_ID` | No | Enables "Continue with Google" (see [Google sign-in](#google-sign-in)) |
| `BLOB_READ_WRITE_TOKEN` | No | Stores images in Vercel Blob. Without it, images are saved in `backend/uploads` |
| `PORT` | No | Backend port, default `5000` |

### 3. Create the database tables

```bash
npm run db:deploy -w backend
```

### 4. Start the app

Run the backend and frontend in two terminals:

```bash
npm run dev:backend     # API on http://localhost:5000
npm run dev:frontend    # site on http://localhost:5173
```

Open http://localhost:5173 and create an account. The frontend dev server forwards `/api` requests to the backend.

### Production build without Vercel

```bash
npm run build   # builds frontend and backend
npm start       # one server on http://localhost:5000 serving the API and the site
```

## Scripts

Run from the project root:

| Command | What it does |
|---|---|
| `npm run dev:backend` | Backend with auto-reload |
| `npm run dev:frontend` | Frontend dev server |
| `npm run build` | Build frontend and backend |
| `npm start` | Run the built app as a single server |
| `npm run db:migrate -w backend` | Create and apply a migration after changing `backend/prisma/schema.prisma` |
| `npm run db:deploy -w backend` | Apply pending migrations (the deploy workflows run this automatically) |
| `npm run db:import-json -w backend` | Copy data from the old JSON file store (`backend/data/db.json`) into Postgres |

## Deployment (CI/CD)

Builds and deployments are automated with GitHub Actions. The app is hosted on Vercel and the database on Neon.

| Workflow | Runs on | What it does |
|---|---|---|
| [`ci.yml`](.github/workflows/ci.yml) | Called by the two below | `npm ci`, lint, type-check and build frontend + backend |
| [`preview.yml`](.github/workflows/preview.yml) | Pull request opened / updated | CI → creates a **Neon branch** `preview/pr-<number>` (a copy of the production database) → applies migrations to it → deploys a **Vercel preview** connected to that branch → comments the preview link on the pull request |
| [`preview-cleanup.yml`](.github/workflows/preview-cleanup.yml) | Pull request closed or merged | Deletes the pull request's Neon branch |
| [`production.yml`](.github/workflows/production.yml) | Push to `main` (or run manually) | CI → applies migrations to the **production** Neon database → builds and deploys to **Vercel production** |

So the everyday flow is: open a pull request → test it on its own preview URL with its own database copy → merge → it goes live.

Deployments come only from these workflows: `vercel.json` turns off Vercel's own Git deployments so nothing deploys twice.

### One-time setup

**1. Create the Vercel project and get its IDs**

From the project root, log in and link (this creates the Vercel project if it doesn't exist):

```bash
npx vercel login
npx vercel link
```

This writes `.vercel/project.json` (not committed) containing `orgId` and `projectId`. You can also create the project from the Vercel dashboard (**Add New → Project**, Framework *Other*, Root `./`) and copy the **Project ID** from *Settings → General*; for a personal account, the org ID is the **Vercel ID** under *Account Settings → General*.

**2. Add environment variables in Vercel** (*Project → Settings → Environment Variables*)

| Variable | Environments | Value |
|---|---|---|
| `DATABASE_URL` | Production only | Pooled Neon URL of the production database (previews get their own branch URL from the workflow) |
| `JWT_SECRET` | Production and Preview | A long random string, different from your local one |
| `GOOGLE_CLIENT_ID` | Production and Preview | Optional, for Google sign-in |

Then, for images, open the project's **Storage** tab, create a **Blob** store with **Private** access and connect it to Production and Preview (this adds `BLOB_READ_WRITE_TOKEN`).

**3. Get your Neon details** (from [console.neon.tech](https://console.neon.tech))

- **API key**: *Account settings → API keys → Create new API key*
- **Project ID**: *Project settings → General*
- **Database name**: shown on the project dashboard (for example `document editor`)

**4. Add GitHub secrets and variables** (*GitHub repo → Settings → Secrets and variables → Actions*)

| Name | Type | Value |
|---|---|---|
| `VERCEL_TOKEN` | Secret | Create at [vercel.com/account/tokens](https://vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | Secret | `orgId` from step 1 |
| `VERCEL_PROJECT_ID` | Secret | `projectId` from step 1 |
| `NEON_API_KEY` | Secret | Neon API key from step 3 |
| `DATABASE_URL_UNPOOLED` | Secret | **Direct** (non-pooled) URL of the production database, used to run migrations |
| `NEON_PROJECT_ID` | Variable | Neon project ID from step 3 |
| `NEON_DATABASE` | Variable | Database name from step 3 |
| `NEON_ROLE` | Variable (optional) | Database role, defaults to `neondb_owner` |

**5. Deploy**

Push to `main`, or open *Actions → Production → Run workflow*. If anything is missing, the first step of the deploy job names the secret or variable to add.

### Notes

- Migrations run before the new version goes live. Keep them backward compatible (add new columns first, remove old ones in a later release) so the running version keeps working during a deploy.
- Preview databases start as a copy of production data. Vercel protects preview URLs with Vercel login by default; keep that on.
- Pull requests from forks don't get secrets, so they run CI only (no preview deploy).
- Manual deploy without GitHub Actions: `npx vercel pull --environment=production`, `npx vercel build --prod`, `npx vercel deploy --prebuilt --prod` (run `npm run db:deploy -w backend` against production first if there are new migrations).

## Google sign-in

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type **Web application**.
2. Under **Authorized JavaScript origins**, add `http://localhost:5173` and your production URL (e.g. `https://your-app.vercel.app`).
3. Set the client ID as `GOOGLE_CLIENT_ID` in `backend/.env` and in Vercel. The Google button appears automatically.

## Limits

- Uploaded files (imports and images) and saved documents: up to **4 MB**, because Vercel rejects request bodies over 4.5 MB
- Images: PNG, JPG, GIF or WebP. Photos are scaled to 1600 px and must be under 2 MB after compressing; GIFs are kept as-is to preserve animation
- Import: `.txt`, `.md`, `.docx`. Old `.doc` files must be saved as `.docx` first. Text alignment from Word files is not kept
- If two people edit the same document at the same time, the last save wins

## Troubleshooting

- **"DATABASE_URL is not set"**: create `backend/.env` (step 2) and restart the backend.
- **Blank page after updating the app**: the page reloads itself once to pick up the new version; if it still fails, use the **Reload** button.
- **Google button doesn't appear**: `GOOGLE_CLIENT_ID` is empty, or the backend wasn't restarted after setting it.
- **Images fail to upload on Vercel**: the Blob store isn't connected yet (see step 2 of the deployment setup).
- **A deploy workflow fails at "Check required secrets"**: add the secret or variable named in the error (see step 4 of the deployment setup), then re-run the workflow.
