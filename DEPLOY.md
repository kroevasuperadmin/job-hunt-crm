# Job Hunt CRM — Deploy notes

## Production URL

**https://job-hunt-crm-one.vercel.app**

- Project name: `job-hunt-crm`
- Vercel team/scope: `kroevasuperadmins-projects` (account: kroevasuperadmin)
- Inspector: https://vercel.com/kroevasuperadmins-projects/job-hunt-crm

## What this app is

A Next.js (App Router) dashboard of Faris Irfan’s job applications. The dashboard layout is unchanged. Application rows and totals are loaded live:

- `GET /api/crm` — applications plus stats recomputed from those rows
- `POST` or `PUT /api/crm` — upsert one or many applications by `id`, then recompute stats
- Empty store on first load — seed from the committed `data/applications.json`
- Confirmation screenshots — still static files in `public/confirmations/`

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

Mrs. Shah’s automation should `POST` the new row as soon as the apply finishes. Upsert is by `id` (send the same id to correct a row). `confirmationImage` may be a filename such as `acme_confirmation.png`, a path such as `/confirmations/acme_confirmation.png`, or `null`. New PNG files still belong in `public/confirmations/` and need a code deploy; the row itself does not.

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

A successful response includes `totalApplications` and `stats` (no redeploy). The open dashboard polls `GET /api/crm` every few seconds and shows the new row and totals. A manual refresh is also immediate, because the page is rendered from the store on each request.

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

## Seed

On first read, if the Blob object `crm/applications.json` does not exist yet, the API writes a copy of `data/applications.json` and serves that. This checkout’s file has **158** applications. The site already deployed at the production URL was built from a different snapshot and currently shows **250** rows. That snapshot is not a superset of this file: some ids exist only in the deployment, and some ids in git are missing or different there.

The empty-store seed is whatever `data/applications.json` is in the deployment that handles the first request. Put the snapshot you want to keep into that file and deploy it before the Blob object is created. Once the object exists, the live store wins: editing the JSON file and redeploying will not replace it. Send further changes with `POST`.

Deleting the blob object makes the next load seed again from whatever `data/applications.json` is in that deployment.

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
- Send one ingest at a time from the automation. Concurrent `POST`s retry on Blob ETag conflicts; a single writer is the expected path.

## GitHub (source of truth for code)

**https://github.com/kroevasuperadmin/job-hunt-crm** (private)

Push code and screenshot changes here so version history stays clear. Vercel remains the live site at https://job-hunt-crm-one.vercel.app. Application rows recorded after this change live in the Blob store, not in git.
