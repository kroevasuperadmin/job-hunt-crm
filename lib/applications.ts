import rawApplications from "@/data/applications.json";
import type { Application } from "./types";

const MAX_BATCH = 2000;

export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function seedApplications(): Application[] {
  return (rawApplications as Application[]).map((app) => ({
    id: app.id,
    time: app.time ?? "",
    company: app.company,
    role: app.role,
    url: app.url ?? "",
    status: app.status,
    confirmation: app.confirmation ?? null,
    confirmationImage: app.confirmationImage ?? null,
  }));
}

export function parseIngestPayload(body: unknown): unknown[] {
  if (Array.isArray(body)) return assertBatch(body);
  if (!isRecord(body)) {
    throw new IngestError(
      "Body must be an application object, an array of applications, { application }, or { applications }.",
    );
  }
  if ("applications" in body) {
    if (!Array.isArray(body.applications)) {
      throw new IngestError("applications must be an array.");
    }
    return assertBatch(body.applications);
  }
  if ("application" in body) {
    if (!isRecord(body.application)) {
      throw new IngestError("application must be an object.");
    }
    return [body.application];
  }
  if ("id" in body || "company" in body || "role" in body) {
    return [body];
  }
  throw new IngestError(
    "Body must be an application object, an array of applications, { application }, or { applications }.",
  );
}

function assertBatch(items: unknown[]): unknown[] {
  if (items.length === 0) {
    throw new IngestError("No applications to upsert.");
  }
  if (items.length > MAX_BATCH) {
    throw new IngestError(`At most ${MAX_BATCH} applications per request.`);
  }
  return items;
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
  existing: string | undefined,
): string {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    if (existing && existing.trim()) return existing;
    throw new IngestError(`${key} is required.`);
  }
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new IngestError(`${key} must be a non-empty string.`);
  }
  return value.trim();
}

function plainString(
  record: Record<string, unknown>,
  key: string,
  existing: string,
): string {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return existing;
  const value = record[key];
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") {
    throw new IngestError(`${key} must be a string.`);
  }
  return value;
}

function nullableString(
  record: Record<string, unknown>,
  key: string,
  existing: string | null,
): string | null {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return existing;
  const value = record[key];
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new IngestError(`${key} must be a string or null.`);
  }
  return value;
}

export function mergeApplication(
  existing: Application | undefined,
  raw: unknown,
): Application {
  if (!isRecord(raw)) {
    throw new IngestError("Each application must be an object.");
  }
  return {
    id: requiredString(raw, "id", existing?.id),
    time: plainString(raw, "time", existing?.time ?? ""),
    company: requiredString(raw, "company", existing?.company),
    role: requiredString(raw, "role", existing?.role),
    url: plainString(raw, "url", existing?.url ?? ""),
    status: requiredString(raw, "status", existing?.status),
    confirmation: nullableString(raw, "confirmation", existing?.confirmation ?? null),
    confirmationImage: nullableString(
      raw,
      "confirmationImage",
      existing?.confirmationImage ?? null,
    ),
  };
}

export function upsertApplications(
  current: Application[],
  incoming: Application[],
): { applications: Application[]; upserted: string[] } {
  const applications = current.map((app) => ({ ...app }));
  const indexById = new Map(applications.map((app, index) => [app.id, index]));
  const upserted: string[] = [];

  for (const app of incoming) {
    const index = indexById.get(app.id);
    if (index === undefined) {
      indexById.set(app.id, applications.length);
      applications.push(app);
    } else {
      applications[index] = app;
    }
    upserted.push(app.id);
  }

  return { applications, upserted };
}
