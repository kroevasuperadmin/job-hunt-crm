# Job Hunt CRM

Demo dashboard of fictional job applications. The page keeps the same layout as before. Application rows and totals are no longer baked in at build time.

## Live data

`GET /api/crm` returns the current `{ applications, stats }`. The homepage is rendered dynamically from that store and the open dashboard refreshes every few seconds, so a new row shows up without a Vercel rebuild.

`POST` or `PUT /api/crm` upserts one application or a batch by `id`, then recomputes stats. Requests must send `CRM_INGEST_SECRET` in the `x-crm-ingest-secret` header (or `Authorization: Bearer <secret>`). GitHub is not involved.

If the store is empty on first load, it is seeded from `data/applications.json`. Later edits to that file do not change the live site; send them through the ingest API. `data/stats.json` is not read at runtime — totals always come from the stored applications.

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
