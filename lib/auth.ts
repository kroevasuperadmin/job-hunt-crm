import { timingSafeEqual } from "crypto";

export const INGEST_SECRET_HEADER = "x-crm-ingest-secret";

export function ingestSecret(): string | null {
  const value = process.env.CRM_INGEST_SECRET?.trim();
  return value ? value : null;
}

export function isIngestAuthorized(request: Request): boolean {
  const secret = ingestSecret();
  if (!secret) return false;

  const header = request.headers.get(INGEST_SECRET_HEADER);
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  const provided = header ?? bearer;
  if (!provided) return false;

  const actual = Buffer.from(secret);
  const given = Buffer.from(provided);
  if (actual.length !== given.length) return false;
  return timingSafeEqual(actual, given);
}
