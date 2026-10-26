# LOOPA

A social app with its own names: **The Loop** (feed), **Radar** (discovery), **Flicks** (videos), **Sparks** (24-hour updates), **Whispers** (messages), **Echoes** (notifications), **Your Orbit** (profile), **Studio** (creation), and **Stash** (saved drops).

## Original architecture retained

Next.js App Router and route handlers, React, TypeScript, Tailwind CSS, Zod, and SQLite through Node's node:sqlite. The runtime schema and additive changes are in src/lib/db.ts. Existing accounts and content are preserved. There is no MongoDB or Express server.

Next.js and validation/test dependencies have been updated. The retained Prisma/PostgreSQL schema and SQL documents are legacy references, not another runtime. The db:migrate and db:push scripts do not update this application's SQLite database.

## Run locally

Use Node.js 24 and npm. Run from this directory (containing package.json):

```sh
npm ci
npm run setup
npm run db:seed
npm run dev
```

Open http://localhost:3000. Development uses Next.js Turbopack; the first request to a page compiles it. Setup creates a random session secret only if .env is absent. Seeding is optional, refuses production, and skips databases that already contain users. Demo login on a freshly seeded database: maya / loopa1234. Never seed a public deployment.

SQLite defaults to .data/loopa.db; uploaded media defaults to .data/uploads. Both require persistent local storage outside the public web directory. Optional ffmpeg and ffprobe executables on PATH enable video posters and metadata.

## Working flows

- Registration, password sign-in, logout, password reset and email verification endpoints, with persistent SMTP delivery.
- Text/photo/video drops, multiple attachments, ranked feeds, stable feed pagination, likes, comments, bookmarks, collections, share pages, hiding and deleting your own drops.
- Public/private profiles, editing/avatar uploads, following and follow-request approval. Public drops still respect a private author's account settings.
- Search and media grids, Flicks video playback, and Sparks with expiry, pause/navigation and reactions.
- Whispers with live SSE messages, replies, uploads, read state, typing and deletion. Reconnection fetches recent history; blocking revokes access.
- Existing communities, events, connections, notification preferences, reports and moderation screens remain under More navigation.
- Optional OAuth code requires Google/GitHub credentials and provider configuration; live providers have not been tested in this change.

## Backend protections

Bcrypt passwords; short-lived JWTs tied to database sessions; hashed rotating refresh tokens with replay revocation; immediate access invalidation after logout, suspension or password reset. Browser refreshes are coordinated, including across tabs where Web Locks is supported.

Mutations require the same origin, or X-Loopa-Request: 1 for non-browser clients. Related writes use transactions. Shared visibility checks protect feeds, post reads/interactions, private events and uploaded media. Images are decoded and re-encoded; uploads are bounded to 10 MB images and 25 MB videos. Protected media supports video byte ranges.

Rate limits use process memory by default. Optional Redis provides shared counters and pub/sub; rate-limit Redis errors fail closed in production. Set TRUST_PROXY=true only behind a proxy that overwrites forwarding headers and prevents direct access to the app.

## Email

Set SMTP_URL and MAIL_FROM, then run a separate worker alongside the app:

```sh
npm run mail:worker
```

The worker leases queued messages, retries up to five attempts, and clears recipient/body after delivery. Without SMTP, messages stay queued and no real emails are delivered. Monitor failed rows in mail_outbox. Delivery is at least once: a crash after SMTP acceptance can cause duplicates. Protect the database/backups because pending mail contains verification/reset links.

## Verification

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
npm audit
```

Unit/integration tests use in-memory SQLite and include sessions, privacy, transactions, feed cursors, uploads and a local SMTP exchange. Browser tests use disposable local accounts/data and exercise uploads, likes/comments/saves, follow approvals, messaging and mobile layouts.

Tests use installed Chrome. Alternatively run npx playwright install chromium and set PLAYWRIGHT_CHANNEL=chromium. The browser harness starts on port 3100, using a separate database/media directory. Set E2E_PRODUCTION=1 after building to test the production bundle. Development uses .next-dev and production uses .next, keeping their build caches separate. Build workers use an isolated in-memory database.

## Deployment limits

This is a functional application with hardened core paths, **not a certified enterprise service or complete Instagram feature parity**.

Use one long-running Node web process with persistent local SQLite/media storage, an SMTP worker, HTTPS reverse proxy and backups. npm start validates the secret, HTTPS APP_URL and mail settings. The proxy must allow unbuffered SSE. /api/health checks database connectivity.

- SQLite/local media target one host. Ephemeral/serverless storage and multiple app hosts are unsupported. Redis does not make storage horizontally scalable.
- Feed snapshots contain up to 300 candidates and expire after 15 minutes. Some lists are bounded. The message UI shows recent history without an older-message paging control.
- No end-to-end message encryption, calling, push notification service, music catalogue or video transcoding farm. Poll data can be stored via API, but voting/UI is not implemented.
- Tag suggestions and text moderation use local heuristics, not an external AI model. Email verification does not currently gate posting. OAuth, Redis failover, load capacity and disaster recovery need deployment-specific testing.
- Account deletion anonymizes identity and revokes sessions; it does not physically erase every authored item or backup. Media cleanup and expired token/outbox retention require an operational policy.
- Use SQLite online backup or VACUUM INTO, plus a media backup. Do not copy only the .db file during WAL writes. Test restoration before a public launch.

The original source backup is ../loopa-before-mongodb.zip. Do not restore it over a running app or overwrite current user data.

