import { promises as fs } from "fs";
import path from "path";
import {
  BlobAccessError,
  BlobNotFoundError,
  BlobPreconditionFailedError,
  BlobStoreNotFoundError,
  get,
  put,
} from "@vercel/blob";
import {
  mergeApplication,
  seedApplications,
  upsertApplications,
} from "./applications";
import { computeStats } from "./stats";
import type { Application, Stats } from "./types";

const BLOB_PATH = "crm/applications.json";
const WRITE_ATTEMPTS = 5;

export type StoreSource = "blob" | "local" | "seed";

export interface CrmSnapshot {
  applications: Application[];
  stats: Stats;
  updatedAt: string | null;
  source: StoreSource;
  seeded: boolean;
}

export interface IngestResult extends CrmSnapshot {
  upserted: string[];
}

interface StoreDocument {
  version: 1;
  applications: Application[];
  updatedAt: string;
}

interface BlobRead {
  document: StoreDocument;
  etag: string;
}

export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreError";
  }
}

function storageMode(): "blob" | "local" | "memory" {
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) return "blob";
  if (process.env.VERCEL) return "memory";
  return "local";
}

function localStorePath(): string {
  return process.env.CRM_LOCAL_STORE || path.join(process.cwd(), ".data", "crm.json");
}

function snapshot(
  applications: Application[],
  updatedAt: string | null,
  source: StoreSource,
  seeded: boolean,
): CrmSnapshot {
  return {
    applications,
    stats: computeStats(applications),
    updatedAt,
    source,
    seeded,
  };
}

function previewId(raw: unknown): string | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const id = (raw as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneStoredApplication(value: unknown): Application {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim()) {
    throw new StoreError("CRM store contains an invalid application.");
  }
  return {
    id: value.id,
    time: typeof value.time === "string" ? value.time : "",
    company: typeof value.company === "string" ? value.company : "",
    role: typeof value.role === "string" ? value.role : "",
    url: typeof value.url === "string" ? value.url : "",
    status: typeof value.status === "string" ? value.status : "",
    confirmation: typeof value.confirmation === "string" ? value.confirmation : null,
    confirmationImage:
      typeof value.confirmationImage === "string" ? value.confirmationImage : null,
  };
}

function parseDocument(text: string): StoreDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new StoreError("CRM store document is not valid JSON.");
  }
  if (Array.isArray(parsed)) {
    return {
      version: 1,
      applications: parsed.map(cloneStoredApplication),
      updatedAt: new Date(0).toISOString(),
    };
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.applications)) {
    throw new StoreError("CRM store document is missing applications.");
  }
  return {
    version: 1,
    applications: parsed.applications.map(cloneStoredApplication),
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
  };
}

let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function readLocal(): Promise<StoreDocument | null> {
  try {
    const text = await fs.readFile(localStorePath(), "utf8");
    return parseDocument(text);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    if (error instanceof StoreError) throw error;
    throw new StoreError("Could not read the local CRM store.");
  }
}

async function writeLocal(document: StoreDocument): Promise<void> {
  const file = localStorePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(document));
  await fs.rename(temporary, file);
}

function blobFailure(error: unknown): StoreError {
  console.error("CRM blob operation failed", error);
  if (error instanceof BlobStoreNotFoundError) {
    return new StoreError(
      "Blob store was not found. Create a private Vercel Blob store and link it to this project.",
    );
  }
  if (error instanceof BlobAccessError) {
    return new StoreError(
      "Blob access was denied. Check BLOB_READ_WRITE_TOKEN or the store linked to this project.",
    );
  }
  return new StoreError("Could not access the CRM blob store.");
}

async function readBlob(): Promise<BlobRead | null> {
  try {
    // Overwrites are cached for up to 60s unless the read bypasses the CDN.
    const result = await get(BLOB_PATH, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return { document: parseDocument(text), etag: result.blob.etag };
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw blobFailure(error);
  }
}

async function tryCreateBlob(document: StoreDocument): Promise<"ok" | "conflict"> {
  try {
    await put(BLOB_PATH, JSON.stringify(document), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/json",
    });
    return "ok";
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) return "conflict";
    const existing = await readBlob().catch(() => null);
    if (existing) return "conflict";
    throw error instanceof StoreError ? error : blobFailure(error);
  }
}

async function tryUpdateBlob(
  document: StoreDocument,
  etag: string,
): Promise<"ok" | "conflict"> {
  try {
    await put(BLOB_PATH, JSON.stringify(document), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      ifMatch: etag,
    });
    return "ok";
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) return "conflict";
    throw blobFailure(error);
  }
}

function memoryStoreError(): StoreError {
  return new StoreError(
    "Blob store is not configured. Connect a private Vercel Blob store so BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN is set, then retry.",
  );
}

export async function loadCrm(): Promise<CrmSnapshot> {
  const mode = storageMode();
  if (mode === "memory") {
    return snapshot(seedApplications(), null, "seed", false);
  }
  if (mode === "local") {
    return enqueue(async () => {
      const existing = await readLocal();
      if (existing) {
        return snapshot(existing.applications, existing.updatedAt, "local", false);
      }
      const applications = seedApplications();
      const updatedAt = new Date().toISOString();
      await writeLocal({ version: 1, applications, updatedAt });
      return snapshot(applications, updatedAt, "local", true);
    });
  }

  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
    const existing = await readBlob();
    if (existing) {
      return snapshot(
        existing.document.applications,
        existing.document.updatedAt,
        "blob",
        false,
      );
    }
    const applications = seedApplications();
    const updatedAt = new Date().toISOString();
    const created = await tryCreateBlob({ version: 1, applications, updatedAt });
    if (created === "ok") {
      return snapshot(applications, updatedAt, "blob", true);
    }
  }
  throw new StoreError("Could not seed the CRM blob store.");
}

export async function ingestApplications(rawItems: unknown[]): Promise<IngestResult> {
  const mode = storageMode();
  if (mode === "memory") throw memoryStoreError();

  const apply = (current: Application[]) => {
    const scratch = new Map(current.map((app) => [app.id, app]));
    const merged: Application[] = [];
    for (const raw of rawItems) {
      const id = previewId(raw);
      const app = mergeApplication(id ? scratch.get(id) : undefined, raw);
      scratch.set(app.id, app);
      merged.push(app);
    }
    return upsertApplications(current, merged);
  };

  if (mode === "local") {
    return enqueue(async () => {
      const existing = await readLocal();
      const base = existing?.applications ?? seedApplications();
      const { applications, upserted } = apply(base);
      const updatedAt = new Date().toISOString();
      await writeLocal({ version: 1, applications, updatedAt });
      return {
        ...snapshot(applications, updatedAt, "local", !existing),
        upserted,
      };
    });
  }

  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
    const existing = await readBlob();
    const base = existing?.document.applications ?? seedApplications();
    const { applications, upserted } = apply(base);
    const updatedAt = new Date().toISOString();
    const document: StoreDocument = { version: 1, applications, updatedAt };
    const saved = existing
      ? await tryUpdateBlob(document, existing.etag)
      : await tryCreateBlob(document);
    if (saved === "ok") {
      return {
        ...snapshot(applications, updatedAt, "blob", !existing),
        upserted,
      };
    }
  }
  throw new StoreError(
    "Could not save applications because the CRM store changed during the write. Retry the request.",
  );
}
