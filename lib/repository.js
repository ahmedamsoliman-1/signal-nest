import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { loadLocalEnv } from "./env.js";
import { isFirestoreConfigured, getFirebaseDb } from "./firebase-admin.js";
import { providersById } from "./providers/index.js";

const DATA_DIR = path.join(process.cwd(), ".data");
const JOBS_FILE = path.join(DATA_DIR, "jobs.json");
const RUNS_FILE = path.join(DATA_DIR, "runs.json");
const PUSH_FILE = path.join(DATA_DIR, "push-subscriptions.json");
const JOBS_COLLECTION = "signalnest_jobs";
const RUNS_COLLECTION = "signalnest_job_runs";
const PUSH_COLLECTION = "signalnest_push_subscriptions";

function tokenDocumentId(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function defaultJobShape(partial) {
  return {
    id: partial.id ?? randomUUID(),
    name: partial.name,
    providerId: partial.providerId,
    providerName: partial.providerName,
    enabled: partial.enabled ?? true,
    intervalMinutes: partial.intervalMinutes ?? 5,
    config: partial.config ?? {},
    createdAt: partial.createdAt ?? new Date().toISOString(),
    lastCheckedAt: partial.lastCheckedAt ?? null,
    lastChangedAt: partial.lastChangedAt ?? null,
    lastResult: partial.lastResult ?? null,
    lastRunStartedAt: partial.lastRunStartedAt ?? null,
    lastRunFinishedAt: partial.lastRunFinishedAt ?? null,
    lastDurationMs: partial.lastDurationMs ?? null,
    isRunning: partial.isRunning ?? false,
    runCount: partial.runCount ?? 0
  };
}

function makeDefaultJobs() {
  loadLocalEnv();

  const seedId =
    process.env.SIGNALNEST_DEFAULT_NATIONAL_ID ?? process.env.PASSPORT_NATIONAL_ID ?? "";

  if (!seedId) {
    return [];
  }

  const provider = providersById.get("cgsudan-passports");

  return [
    defaultJobShape({
      name: "CGSudan default watch",
      providerId: provider.id,
      providerName: provider.name,
      config: {
        nationalId: seedId
      }
    })
  ];
}

async function ensureLocalDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readLocalJson(filePath, fallback) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function writeLocalJson(filePath, value) {
  await ensureLocalDir();
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readLocalJobsRaw() {
  const jobs = await readLocalJson(JOBS_FILE, null);
  if (jobs) {
    return jobs.map((job) => defaultJobShape(job));
  }

  const seeded = makeDefaultJobs();
  await writeLocalJson(JOBS_FILE, seeded);
  return seeded;
}

async function readLocalRunsRaw() {
  return readLocalJson(RUNS_FILE, []);
}

async function writeLocalJobsRaw(jobs) {
  await writeLocalJson(JOBS_FILE, jobs);
}

async function writeLocalRunsRaw(runs) {
  await writeLocalJson(RUNS_FILE, runs);
}

async function readLocalPushRaw() {
  return readLocalJson(PUSH_FILE, []);
}

async function writeLocalPushRaw(entries) {
  await writeLocalJson(PUSH_FILE, entries);
}

async function bootstrapFirestoreFromLocalIfNeeded(db) {
  const snapshot = await db.collection(JOBS_COLLECTION).limit(1).get();
  if (!snapshot.empty) {
    return;
  }

  const localJobs = await readLocalJson(JOBS_FILE, []);
  if (!localJobs.length) {
    return;
  }

  for (const job of localJobs) {
    await db.collection(JOBS_COLLECTION).doc(job.id).set(defaultJobShape(job));
  }

  const localRuns = await readLocalJson(RUNS_FILE, []);
  for (const run of localRuns) {
    await db.collection(RUNS_COLLECTION).doc(run.id).set(run);
  }

  const localPush = await readLocalJson(PUSH_FILE, []);
  for (const entry of localPush) {
    await db.collection(PUSH_COLLECTION).doc(entry.id ?? tokenDocumentId(entry.token)).set(entry);
  }
}

async function readFirestoreJobsRaw() {
  const db = getFirebaseDb();
  await bootstrapFirestoreFromLocalIfNeeded(db);
  const snapshot = await db.collection(JOBS_COLLECTION).orderBy("createdAt", "desc").get();
  return snapshot.docs.map((doc) => defaultJobShape(doc.data()));
}

async function writeFirestoreJob(job) {
  const db = getFirebaseDb();
  await db.collection(JOBS_COLLECTION).doc(job.id).set(job);
}

async function deleteFirestoreJob(jobId) {
  const db = getFirebaseDb();
  await db.collection(JOBS_COLLECTION).doc(jobId).delete();
  const runs = await db.collection(RUNS_COLLECTION).where("jobId", "==", jobId).get();
  for (const run of runs.docs) {
    await run.ref.delete();
  }
}

async function appendFirestoreRun(run) {
  const db = getFirebaseDb();
  await db.collection(RUNS_COLLECTION).doc(run.id).set(run);
}

async function readFirestoreRunsForJob(jobId, limit = 8) {
  const db = getFirebaseDb();
  const snapshot = await db.collection(RUNS_COLLECTION).where("jobId", "==", jobId).get();

  return snapshot.docs
    .map((doc) => doc.data())
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit);
}

async function upsertFirestorePushSubscription(subscription) {
  const db = getFirebaseDb();
  const id = subscription.id ?? tokenDocumentId(subscription.token);
  await db.collection(PUSH_COLLECTION).doc(id).set({ ...subscription, id }, { merge: true });
  return id;
}

async function readFirestorePushSubscriptions() {
  const db = getFirebaseDb();
  const snapshot = await db.collection(PUSH_COLLECTION).where("enabled", "==", true).get();
  return snapshot.docs.map((doc) => doc.data());
}

async function disableFirestorePushSubscription(token) {
  const db = getFirebaseDb();
  const id = tokenDocumentId(token);
  await db.collection(PUSH_COLLECTION).doc(id).set(
    {
      id,
      token,
      enabled: false,
      updatedAt: new Date().toISOString()
    },
    { merge: true }
  );
}

export function getStorageBackendLabel() {
  return isFirestoreConfigured() ? "Firestore" : "Local JSON";
}

export async function listJobsWithRuns(limit = 8) {
  const jobs = isFirestoreConfigured() ? await readFirestoreJobsRaw() : await readLocalJobsRaw();
  const runs = isFirestoreConfigured() ? null : await readLocalRunsRaw();

  return jobs.map((job) => ({
    ...job,
    recentRuns: isFirestoreConfigured()
      ? []
      : runs.filter((run) => run.jobId === job.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit)
  }));
}

export async function hydrateJobsWithRuns(jobs, limit = 8) {
  if (isFirestoreConfigured()) {
    return Promise.all(
      jobs.map(async (job) => ({
        ...job,
        recentRuns: await readFirestoreRunsForJob(job.id, limit)
      }))
    );
  }

  const runs = await readLocalRunsRaw();
  return jobs.map((job) => ({
    ...job,
    recentRuns: runs
      .filter((run) => run.jobId === job.id)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit)
  }));
}

export async function listJobs() {
  const jobs = isFirestoreConfigured() ? await readFirestoreJobsRaw() : await readLocalJobsRaw();
  return hydrateJobsWithRuns(jobs);
}

export async function createJobRecord(input) {
  const job = defaultJobShape(input);

  if (isFirestoreConfigured()) {
    await writeFirestoreJob(job);
    return job;
  }

  const jobs = await readLocalJobsRaw();
  jobs.unshift(job);
  await writeLocalJobsRaw(jobs);
  return job;
}

export async function getJob(jobId) {
  const jobs = isFirestoreConfigured() ? await readFirestoreJobsRaw() : await readLocalJobsRaw();
  return jobs.find((job) => job.id === jobId) ?? null;
}

export async function updateJob(jobId, updater) {
  if (isFirestoreConfigured()) {
    const current = await getJob(jobId);
    if (!current) {
      return null;
    }
    const next = defaultJobShape(updater(current));
    await writeFirestoreJob(next);
    return next;
  }

  const jobs = await readLocalJobsRaw();
  let nextJob = null;
  const nextJobs = jobs.map((job) => {
    if (job.id !== jobId) {
      return job;
    }
    nextJob = defaultJobShape(updater(job));
    return nextJob;
  });
  await writeLocalJobsRaw(nextJobs);
  return nextJob;
}

export async function deleteJobRecord(jobId) {
  if (isFirestoreConfigured()) {
    await deleteFirestoreJob(jobId);
    return;
  }

  const jobs = await readLocalJobsRaw();
  const nextJobs = jobs.filter((job) => job.id !== jobId);
  await writeLocalJobsRaw(nextJobs);

  const runs = await readLocalRunsRaw();
  await writeLocalRunsRaw(runs.filter((run) => run.jobId !== jobId));
}

export async function appendRunLog(run) {
  const entry = {
    id: run.id ?? randomUUID(),
    ...run
  };

  if (isFirestoreConfigured()) {
    await appendFirestoreRun(entry);
    return entry;
  }

  const runs = await readLocalRunsRaw();
  runs.unshift(entry);
  await writeLocalRunsRaw(runs);
  return entry;
}

export async function upsertPushSubscription(input) {
  const entry = {
    id: tokenDocumentId(input.token),
    token: input.token,
    enabled: input.enabled ?? true,
    userAgent: input.userAgent ?? "",
    platform: input.platform ?? "",
    locale: input.locale ?? "",
    permission: input.permission ?? "default",
    createdAt: input.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastDeliveredAt: input.lastDeliveredAt ?? null,
    lastSeenAt: input.lastSeenAt ?? new Date().toISOString()
  };

  if (isFirestoreConfigured()) {
    await upsertFirestorePushSubscription(entry);
    return entry;
  }

  const existing = await readLocalPushRaw();
  const next = existing.filter((item) => item.id !== entry.id);
  next.unshift(entry);
  await writeLocalPushRaw(next);
  return entry;
}

export async function listActivePushSubscriptions() {
  if (isFirestoreConfigured()) {
    return readFirestorePushSubscriptions();
  }

  const existing = await readLocalPushRaw();
  return existing.filter((item) => item.enabled);
}

export async function disablePushSubscription(token) {
  if (isFirestoreConfigured()) {
    await disableFirestorePushSubscription(token);
    return;
  }

  const existing = await readLocalPushRaw();
  const next = existing.map((item) =>
    item.token === token
      ? {
          ...item,
          enabled: false,
          updatedAt: new Date().toISOString()
        }
      : item
  );
  await writeLocalPushRaw(next);
}

export async function touchPushSubscription(token) {
  if (isFirestoreConfigured()) {
    await upsertFirestorePushSubscription({
      id: tokenDocumentId(token),
      token,
      enabled: true,
      lastDeliveredAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return;
  }

  const existing = await readLocalPushRaw();
  const next = existing.map((item) =>
    item.token === token
      ? {
          ...item,
          enabled: true,
          updatedAt: new Date().toISOString(),
          lastDeliveredAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString()
        }
      : item
  );
  await writeLocalPushRaw(next);
}
