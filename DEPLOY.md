# Job Hunt CRM — Deploy notes

## Production URL

**https://job-hunt-crm-one.vercel.app**

- Project name: `job-hunt-crm`
- Vercel team/scope: `kroevasuperadmins-projects` (account: kroevasuperadmin)
- Inspector: https://vercel.com/kroevasuperadmins-projects/job-hunt-crm

## What this app is

A Next.js (App Router) dashboard of fictional job applications. The dashboard layout is unchanged. Application rows and totals are loaded live:

- `GET /api/crm` — applications plus stats recomputed from those rows
- `POST` or `PUT /api/crm` — upsert one or many applications by `id`, then recompute stats
- Reads use one file, `crm/applications.json`, cached in the server for 10 minutes. Opening the page does not list the store and does not write.
- If Blob is paused or unreachable, the page serves the last good copy, or the copy bundled from `data/applications.json`, and shows the time of that copy.
- Confirmation screenshots are not included in this public demo

No login for v1 (treat the URL as private). Runtime application updates do **not** go through GitHub and do **not** need a rebuild.

`data/stats.json` is unused at runtime. Stats in the API response are derived from the stored applications.

## Environment variables

Set these on the Vercel project (Production, and Preview if you ingest there). Do not commit the values.

| Variable | Purpose |
| --- | --- |
| `CRM_INGEST_SECRET` | Shared secret. Ingest routes reject requests without it. |
| `BLOB_READ_WRITE_TOKEN` | Read-write token for the private Vercel Blob store. Required for ingest from outside Vercel (local scripts). On Vercel, linking the store also provides OIDC plus `BLOB_STORE_ID`, which the Blob SDK uses automatically. |

Optional local-only variable: `CRM_LOCAL_STORE` (path to a JSON file). It is used only when no Blob store is configured. On Vercel, do not rely on the filesystem — connect Blob.

### Create the Blob store (once)

From the Vercel project: **Storage → Create → Blob → Private**, and connect it to `job-hunt-crm`.

Or with the CLI:

```bash
npx vercel blob create-store crm --access private --yes --token "$VERCEL_TOKEN"
```

Link the store to the project so Production has `BLOB_STORE_ID` (and OIDC). Copy the read-write token into `BLOB_READ_WRITE_TOKEN` if you want to run ingest from a machine that is not the Vercel function.

Generate a long random `CRM_INGEST_SECRET` and add it in **Project → Settings → Environment Variables**. Redeploy **once** after the variables exist so the new API routes and env are live. After that, each application is a `POST` — not a deploy.

## One application after each apply

Ingest automation should `POST` the new row as soon as the apply finishes. Upsert is by `id` (send the same id to correct a row). `confirmationImage` may be a filename such as `acme_confirmation.png`, a path such as `/confirmations/acme_confirmation.png`, or `null`. New PNG files still belong in `public/confirmations/` and need a code deploy; the row itself does not.

```bash
curl -sS -X POST "https://job-hunt-crm-one.vercel.app/api/crm" \
  -H "Content-Type: application/json" \
  -H "x-crm-ingest-secret: $CRM_INGEST_SECRET" \
  -d '{
    "application": {
      "id": "acme-growth-lead",
      "time": "2026-09-24 18:05 MYT",
      "company": "Acme",
      "role": "Growth Lead",
      "url": "https://example.com/jobs/growth",
      "status": "SUBMITTED",
      "confirmation": "Application received.",
      "confirmationImage": null
    }
  }'
```

A successful response includes `totalApplications` and `stats` (no redeploy). The dashboard does not poll. A refresh shows the new row once this server process has taken the write; another process can be up to 10 minutes behind, because reads are cached and do not call Blob again inside that window. Unchanged rows do not call `put()`.

`Authorization: Bearer $CRM_INGEST_SECRET` is accepted instead of the custom header. `PUT` behaves the same as `POST`.

Several rows in one call:

```bash
curl -sS -X POST "https://job-hunt-crm-one.vercel.app/api/crm" \
  -H "Content-Type: application/json" \
  -H "x-crm-ingest-secret: $CRM_INGEST_SECRET" \
  -d '{
    "applications": [
      {
        "id": "acme-growth-lead",
        "time": "2026-09-24 18:05 MYT",
        "company": "Acme",
        "role": "Growth Lead",
        "url": "https://example.com/jobs/growth",
        "status": "SUBMITTED",
        "confirmation": "Application received.",
        "confirmationImage": null
      }
    ]
  }'
```

Required on each new row: `id`, `company`, `role`, `status`. Omitted fields on an existing `id` are left as they were. Status values used by the filters are `SUBMITTED`, `SKIPPED`, and `BLOCKED`.

Check what the dashboard is reading:

```bash
curl -sS "https://job-hunt-crm-one.vercel.app/api/crm"
```

## Saved copy

`data/applications.json` is a bundled synthetic snapshot of fictional applications. `data/stats.json` records the same totals and the snapshot time (`updated_at`). Runtime stats are recomputed from the applications.

The page reads that bundled file when Blob is missing, paused, or unreachable. It does not `put()` a seed on page view. The first ingest that actually changes a row writes `crm/applications.json` once. After that object exists, editing the JSON files and redeploying does not replace it. Send further changes with `POST`.

## Redeploy (code and screenshots only)

From this directory, with `VERCEL_TOKEN` set in the environment (do not commit the token):

```bash
cd /workspace/job-hunt-crm
# refresh confirmation PNGs if needed (from /workspace/job-hunt)
# then:
npx vercel --prod --yes --token "$VERCEL_TOKEN"
```

Local build check:

```bash
npm install
npm run build
npm run start
```

Local ingest (no Blob token — writes `.data/crm.json`):

```bash
export CRM_INGEST_SECRET=dev-secret
npm run dev
# then the same curl as above against http://localhost:3000/api/crm
```

## Notes

- First deploy created project `job-hunt-crm` under the kroevasuperadmin personal projects scope.
- CLI deploy does not require GitHub. Runtime application updates do not require GitHub either.
- Send one ingest at a time from the automation. Each request writes the whole batch with at most one `put()`, and only when a row changed.

## GitHub (source of truth for code)

**https://github.com/kroevasuperadmin/job-hunt-crm** (private)

Push code and screenshot changes here so version history stays clear. Vercel remains the live site at https://job-hunt-crm-one.vercel.app. Application rows recorded after this change live in the Blob store, not in git.
