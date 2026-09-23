# Job Hunt CRM — Deploy notes

## Production URL

**https://job-hunt-crm-one.vercel.app**

- Project name: `job-hunt-crm`
- Vercel team/scope: `kroevasuperadmins-projects` (account: kroevasuperadmin)
- Inspector: https://vercel.com/kroevasuperadmins-projects/job-hunt-crm

## What this app is

A static Next.js (App Router) dashboard of fictional job applications.
Data is baked in at build time from:

- `data/applications.json`
- `data/stats.json`
- Confirmation screenshots in `public/confirmations/`

No login for v1 (treat the URL as private).

## Redeploy

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

## Updating application data

1. Edit or replace `data/applications.json` and `data/stats.json`.
2. Copy any new confirmation PNGs into `public/confirmations/`.
3. Redeploy with the command above.

## Notes

- First deploy created project `job-hunt-crm` under the kroevasuperadmin personal projects scope.
- CLI deploy does not require GitHub.
