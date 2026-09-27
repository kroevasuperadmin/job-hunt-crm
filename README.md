# Job Hunt CRM

Demo dashboard of fictional job applications. The page keeps the same layout as before. Application rows and totals are no longer baked in at build time.

## Live data

`GET /api/crm` returns the current `{ applications, stats }`. The homepage reads one Blob file, `crm/applications.json`, and keeps that result for 10 minutes. It does not list the store, and it does not refresh on a timer. A new row shows up without a Vercel rebuild after an ingest; a refresh on another server process can take up to 10 minutes.

`POST` or `PUT /api/crm` upserts one application or a batch by `id`, then recomputes stats. Requests must send `CRM_INGEST_SECRET` in the `x-crm-ingest-secret` header (or `Authorization: Bearer <secret>`). GitHub is not involved. The batch is one `put()`, and only when the stored rows actually change.

If Blob is paused or unreachable, the page stays up on the last good copy, or on `data/applications.json` (the bundled synthetic snapshot), and shows the time of that copy. `data/stats.json` records that snapshot time. Totals on the page are recomputed from the rows being shown.

This demo does not include confirmation screenshots. A row still renders when `confirmationImage` is `null`, a filename, or a path.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `CRM_INGEST_SECRET` | Yes, for ingest | Shared secret for `POST` / `PUT /api/crm` |
| `BLOB_READ_WRITE_TOKEN` | Yes, outside Vercel OIDC | Read-write token for the private Blob store |
| `BLOB_STORE_ID` | Set by Vercel when a store is linked | Selects the Blob store with OIDC |
| `CRM_LOCAL_STORE` | No | Local JSON file used only when Blob is not configured |

Copy `.env.example` to `.env.local` for local development. Without a Blob token, the app stores data in `.data/crm.json` (gitignored). On Vercel, create a **private** Blob store, link it to this project, and set `CRM_INGEST_SECRET`. See [DEPLOY.md](DEPLOY.md) for the curl Ingest automation should run after each apply.

## Local

```bash
npm install
npm run dev
```

```bash
curl -s http://localhost:3000/api/crm | head
```
