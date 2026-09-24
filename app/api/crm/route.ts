import { NextResponse } from "next/server";
import { ingestSecret, isIngestAuthorized } from "@/lib/auth";
import { IngestError, parseIngestPayload } from "@/lib/applications";
import { ingestApplications, loadCrm, StoreError } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function GET() {
  try {
    return json(await loadCrm());
  } catch (error) {
    if (error instanceof StoreError) {
      return json({ error: error.message }, 503);
    }
    console.error(error);
    return json({ error: "Failed to load CRM data." }, 500);
  }
}

export async function POST(request: Request) {
  return writeApplications(request);
}

export async function PUT(request: Request) {
  return writeApplications(request);
}

async function writeApplications(request: Request) {
  if (!ingestSecret()) {
    return json(
      {
        error:
          "CRM_INGEST_SECRET is not configured. Set it in the Vercel project environment, then redeploy once.",
      },
      503,
    );
  }
  if (!isIngestAuthorized(request)) {
    return json({ error: "Unauthorized." }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  try {
    const incoming = parseIngestPayload(body);
    const result = await ingestApplications(incoming);
    return json({
      ok: true,
      upserted: result.upserted,
      totalApplications: result.stats.totalApplications,
      stats: result.stats,
      updatedAt: result.updatedAt,
      source: result.source,
      seeded: result.seeded,
    });
  } catch (error) {
    if (error instanceof IngestError) {
      return json({ error: error.message }, 400);
    }
    if (error instanceof StoreError) {
      return json({ error: error.message }, 503);
    }
    console.error(error);
    return json({ error: "Failed to save applications." }, 500);
  }
}
