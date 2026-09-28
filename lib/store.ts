import { promises as fs } from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import snapshotMeta from "@/data/stats.json";
import {
  mergeApplication,
  seedApplications,
  upsertApplications,
} from "./applications";
import { computeStats } from "./stats";
import type { Application, Stats } from "./types";

const BLOB_PATH = "crm/applications.json";
const CACHE_TTL_MS = 10 * 60 * 1000;

export type StoreSource = "blob" | "local" | "saved-copy";

export interface CrmSnapshot {
  applications: Application[];
  stats: Stats;
  updatedAt: string | null;
  source: StoreSource;
  seeded: boolean;
  notice: string | null;
}

export interface IngestResult extends CrmSnapshot {
  upserted: string[];
}

interface StoreDocument {
  version: 1;
  applications: Application[];
  updatedAt: string;
}

interface MemoryCache {
  snapshot: CrmSnapshot;
  storedAt: number;
}

export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreError";
  }
}

function storageMode(): "blob" | "local" {
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID || process.env.VERCEL) {
    return "blob";
  }
  return "local";
}

function localStorePath(): string {
  return process.env.CRM_LOCAL_STORE || path.join(process.cwd(), ".data", "crm.json");
}

function bundledUpdatedAt(): string {
  const raw = snapshotMeta as { updated_at?: unknown };
  if (typeof raw.updated_at === "string" && raw.updated_at.trim()) return raw.updated_at;
  return new Date(0).toISOString();
}

function formatCopyTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = date.getUTCDate();
  const month = months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hour}:${minute} UTC`;
}

function snapshot(
  applications: Application[],
  updatedAt: string | null,
  source: StoreSource,
  seeded: boolean,
  notice: string | null = null,
): CrmSnapshot {
  return {
    applications,
    stats: computeStats(applications),
    updatedAt,
    source,
    seeded,
    notice,
  };
}

function bundledSnapshot(): CrmSnapshot {
  return snapshot(seedApplications(), bundledUpdatedAt(), "saved-copy", false);
}

function savedCopySnapshot(lastGood: CrmSnapshot | null): CrmSnapshot {
  const base = lastGood ?? bundledSnapshot();
  const updatedAt = base.updatedAt ?? bundledUpdatedAt();
  return snapshot(
    base.applications,
    updatedAt,
    "saved-copy",
    false,
    `Showing a saved copy from ${formatCopyTime(updatedAt)}.`,
  );
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

function applicationKey(app: Application): string {
  return JSON.stringify([
    app.id,
    app.time,
    app.company,
    app.role,
    app.url,
    app.status,
    app.confirmation,
    app.confirmationImage,
  ]);
}

function sameApplications(left: Application[], right: Application[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (applicationKey(left[index]) !== applicationKey(right[index])) return false;
  }
  return true;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

let cache: MemoryCache | null = null;
let lastGood: CrmSnapshot | null = null;
let inFlight: Promise<CrmSnapshot> | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();

export function clearCrmCacheForTests(): void {
  cache = null;
  lastGood = null;
  inFlight = null;
  writeQueue = Promise.resolve();
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function remember(snapshotValue: CrmSnapshot): CrmSnapshot {
  cache = { snapshot: snapshotValue, storedAt: Date.now() };
  if (snapshotValue.source === "blob") lastGood = snapshotValue;
  return snapshotValue;
}

function freshCache(): CrmSnapshot | null {
  if (!cache) return null;
  if (Date.now() - cache.storedAt >= CACHE_TTL_MS) return null;
  return cache.snapshot;
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

async function readLocalSnapshot(): Promise<CrmSnapshot> {
  try {
    const existing = await readLocal();
    if (existing) {
      return snapshot(existing.applications, existing.updatedAt, "local", false);
    }
  } catch (error) {
    console.error("CRM local read failed", errorMessage(error));
    return savedCopySnapshot(null);
  }
  return snapshot(seedApplications(), bundledUpdatedAt(), "local", false);
}

async function readBlobDocument(): Promise<StoreDocument | null> {
  const result = await get(BLOB_PATH, { access: "private" });
  if (!result) return null;
  if (result.statusCode !== 200 || !result.stream) {
    throw new StoreError("CRM store returned no file body.");
  }
  const text = await new Response(result.stream).text();
  return parseDocument(text);
}

async function putDocument(document: StoreDocument): Promise<void> {
  await put(BLOB_PATH, JSON.stringify(document), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function readBlobSnapshot(): Promise<CrmSnapshot> {
  try {
    const document = await readBlobDocument();
    if (document) {
      return remember(snapshot(document.applications, document.updatedAt, "blob", false));
    }
  } catch (error) {
    console.error("CRM blob read failed", errorMessage(error));
  }
  return remember(savedCopySnapshot(lastGood));
}

export async function loadCrm(): Promise<CrmSnapshot> {
  try {
    if (storageMode() === "local") return readLocalSnapshot();
    const cached = freshCache();
    if (cached) return cached;
    if (!inFlight) {
      inFlight = readBlobSnapshot().finally(() => {
        inFlight = null;
      });
    }
    return await inFlight;
  } catch (error) {
    console.error("CRM load failed", errorMessage(error));
    return savedCopySnapshot(lastGood);
  }
}

export async function ingestApplications(rawItems: unknown[]): Promise<IngestResult> {
  const mode = storageMode();

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
      if (existing && sameApplications(existing.applications, applications)) {
        return {
          ...snapshot(applications, existing.updatedAt, "local", false),
          upserted,
        };
      }
      const updatedAt = new Date().toISOString();
      await writeLocal({ version: 1, applications, updatedAt });
      return {
        ...snapshot(applications, updatedAt, "local", !existing),
        upserted,
      };
    });
  }

  return enqueue(async () => {
    let existing: StoreDocument | null;
    try {
      existing = await readBlobDocument();
    } catch (error) {
      console.error("CRM blob read failed", errorMessage(error));
      throw new StoreError("Could not read the CRM store, so nothing was written.");
    }

    const base = existing?.applications ?? seedApplications();
    const { applications, upserted } = apply(base);
    if (sameApplications(base, applications)) {
      const unchanged = existing
        ? snapshot(applications, existing.updatedAt, "blob", false)
        : snapshot(applications, bundledUpdatedAt(), "saved-copy", false);
      if (existing) remember(unchanged);
      return { ...unchanged, upserted };
    }

    const updatedAt = new Date().toISOString();
    const document: StoreDocument = { version: 1, applications, updatedAt };
    try {
      await putDocument(document);
    } catch (error) {
      console.error("CRM blob write failed", errorMessage(error));
      throw new StoreError("Could not save applications to the CRM store.");
    }
    const saved = remember(snapshot(applications, updatedAt, "blob", !existing));
    return { ...saved, upserted };
  });
}
