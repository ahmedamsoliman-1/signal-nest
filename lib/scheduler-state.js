import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getFirebaseDb, isFirestoreConfigured } from "./firebase-admin.js";

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE_PATH = path.join(DATA_DIR, "scheduler-state.json");
const COLLECTION = "signalnest_meta";
const DOC_ID = "scheduler_state";

const DEFAULT_STATE = {
  schedulerType: "external_http_ping",
  source: null,
  lastHitAt: null,
  lastProcessedAt: null,
  lastStatus: null,
  lastRanCount: 0,
  lastSkippedCount: 0,
  updatedAt: null
};

async function ensureLocalDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readLocalState() {
  try {
    const raw = await readFile(FILE_PATH, "utf8");
    return {
      ...DEFAULT_STATE,
      ...JSON.parse(raw)
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return DEFAULT_STATE;
    }
    throw error;
  }
}

async function writeLocalState(state) {
  await ensureLocalDir();
  await writeFile(FILE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function readFirestoreState() {
  const db = getFirebaseDb();
  const snapshot = await db.collection(COLLECTION).doc(DOC_ID).get();
  return snapshot.exists ? { ...DEFAULT_STATE, ...snapshot.data() } : DEFAULT_STATE;
}

async function writeFirestoreState(state) {
  const db = getFirebaseDb();
  await db.collection(COLLECTION).doc(DOC_ID).set(state, { merge: true });
}

export async function getSchedulerState() {
  return isFirestoreConfigured() ? readFirestoreState() : readLocalState();
}

export async function recordSchedulerHeartbeat(input) {
  const state = {
    schedulerType: "external_http_ping",
    source: input.source ?? "unknown",
    lastHitAt: input.lastHitAt ?? new Date().toISOString(),
    lastProcessedAt: input.lastProcessedAt ?? null,
    lastStatus: input.lastStatus ?? "ok",
    lastRanCount: input.lastRanCount ?? 0,
    lastSkippedCount: input.lastSkippedCount ?? 0,
    updatedAt: new Date().toISOString()
  };

  if (isFirestoreConfigured()) {
    await writeFirestoreState(state);
    return state;
  }

  await writeLocalState(state);
  return state;
}
