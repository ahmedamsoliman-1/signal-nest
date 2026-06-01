import { randomUUID } from "node:crypto";
import { appendRunLog, createJobRecord, deleteJobRecord, getJob, listJobs as listJobRecords, updateJob } from "./repository.js";
import { providers, providersById } from "./providers/index.js";
import { sendDesktopNotification } from "./notifier.js";
import { sendPushNotification } from "./push.js";
import { getNotificationMode, isAlwaysNotifyMode, isCronForceRunEnabled } from "./runtime-config.js";

function normalizeIntervalMinutes(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 5;
  }

  return Math.max(1, Math.round(parsed));
}

function jobChanged(previous, current) {
  if (!previous) {
    return false;
  }

  return (
    previous.status !== current.status ||
    previous.message !== current.message ||
    JSON.stringify(previous.details ?? {}) !== JSON.stringify(current.details ?? {})
  );
}

function shouldNotify(previous, current) {
  if (isAlwaysNotifyMode()) {
    return true;
  }

  if (!previous) {
    return current.status === "available";
  }

  if (jobChanged(previous, current)) {
    return true;
  }

  return previous.status !== "available" && current.status === "available";
}

function getNotificationReason(previous, current) {
  if (isAlwaysNotifyMode()) {
    return "always_mode";
  }

  if (!previous && current.status === "available") {
    return "initial_available";
  }

  if (jobChanged(previous, current)) {
    return "state_changed";
  }

  if (previous?.status !== "available" && current.status === "available") {
    return "became_available";
  }

  return "quiet";
}

function buildJobNotification(job, currentResult) {
  const isAvailable = currentResult.status === "available";
  const title = isAvailable
    ? `${job.name} is available`
    : `${job.name} changed`;
  const body = isAvailable
    ? currentResult.details?.name
      ? `${currentResult.details.name} is now ready.`
      : currentResult.message
    : currentResult.message;

  const url = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/?job=${job.id}`
    : `/?job=${job.id}`;

  return {
    title,
    body,
    url,
    tag: `job-${job.id}`
  };
}

export async function listJobs() {
  return listJobRecords();
}

export async function createJob(input) {
  const provider = providersById.get(input.providerId);

  if (!provider) {
    throw new Error("Unknown provider.");
  }

  const nationalId = String(input.config?.nationalId ?? "").trim();
  if (!/^\d+$/u.test(nationalId)) {
    throw new Error("National ID must contain digits only.");
  }

  await createJobRecord({
    id: randomUUID(),
    name: input.name || `${provider.name} monitor`,
    providerId: provider.id,
    providerName: provider.name,
    enabled: true,
    intervalMinutes: normalizeIntervalMinutes(input.intervalMinutes),
    config: { nationalId },
    createdAt: new Date().toISOString(),
    lastCheckedAt: null,
    lastChangedAt: null,
    lastResult: null,
    lastRunStartedAt: null,
    lastRunFinishedAt: null,
    lastDurationMs: null,
    isRunning: false,
    runCount: 0
  });
}

export async function setJobEnabled(jobId, enabled) {
  await updateJob(jobId, (job) => ({ ...job, enabled }));
}

export async function deleteJob(jobId) {
  await deleteJobRecord(jobId);
}

export async function runJobNow(jobId) {
  const job = await getJob(jobId);

  if (!job) {
    throw new Error("Job not found.");
  }

  const provider = providersById.get(job.providerId);
  const previousResult = job.lastResult;
  const startedAt = new Date().toISOString();

  await updateJob(jobId, (entry) => ({
    ...entry,
    isRunning: true,
    lastRunStartedAt: startedAt
  }));

  let currentResult;
  try {
    currentResult = await provider.check(job.config);
  } catch (error) {
    currentResult = {
      status: "error",
      message: error instanceof Error ? error.message : "Unknown provider error",
      details: {},
      checkedAt: new Date().toISOString()
    };
  }

  const finishedAt = new Date().toISOString();
  const durationMs = Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime());
  const notify = shouldNotify(previousResult, currentResult);
  const notificationReason = getNotificationReason(previousResult, currentResult);
  let pushDelivery = { sent: 0, failed: 0, skipped: true };
  if (notify) {
    await sendDesktopNotification(job.name, `${currentResult.status}: ${currentResult.message}`);
    try {
      pushDelivery = await sendPushNotification(buildJobNotification(job, currentResult));
    } catch (error) {
      pushDelivery = {
        sent: 0,
        failed: 1,
        skipped: false,
        error: error instanceof Error ? error.message : "Push delivery failed"
      };
    }
  }

  await appendRunLog({
    jobId,
    jobName: job.name,
    providerId: job.providerId,
    providerName: job.providerName,
    startedAt,
    finishedAt,
    durationMs,
    status: currentResult.status,
    message: currentResult.message,
    changed: jobChanged(previousResult, currentResult),
    notified: notify,
    notificationReason,
    notificationMode: getNotificationMode(),
    pushDelivery,
    details: currentResult.details ?? {},
    trace: currentResult.trace ?? []
  });

  await updateJob(jobId, (entry) => ({
    ...entry,
    isRunning: false,
    lastCheckedAt: currentResult.checkedAt,
    lastRunFinishedAt: finishedAt,
    lastDurationMs: durationMs,
    runCount: (entry.runCount ?? 0) + 1,
    lastChangedAt: jobChanged(previousResult, currentResult)
      ? currentResult.checkedAt
      : entry.lastChangedAt,
    lastResult: currentResult
  }));

  return {
    jobId,
    notify,
    notificationReason,
    result: currentResult
  };
}

export async function runDueJobs(options = {}) {
  const jobs = await listJobRecords();
  const now = Date.now();
  const results = [];
  const skipped = [];
  const force = options.force ?? isCronForceRunEnabled();

  for (const job of jobs) {
    if (!job.enabled) {
      skipped.push({
        jobId: job.id,
        jobName: job.name,
        reason: "disabled"
      });
      continue;
    }

    const lastCheckedMs = job.lastCheckedAt ? new Date(job.lastCheckedAt).getTime() : 0;
    const intervalMs = normalizeIntervalMinutes(job.intervalMinutes) * 60 * 1000;
    const isDue = force || !lastCheckedMs || now - lastCheckedMs >= intervalMs;

    if (!isDue) {
      skipped.push({
        jobId: job.id,
        jobName: job.name,
        reason: "not_due_yet",
        nextEligibleInMs: Math.max(0, intervalMs - (now - lastCheckedMs))
      });
      continue;
    }

    results.push(await runJobNow(job.id));
  }

  return {
    processedAt: new Date().toISOString(),
    notificationMode: getNotificationMode(),
    force,
    totalJobs: jobs.length,
    enabledJobs: jobs.filter((job) => job.enabled).length,
    ranCount: results.length,
    skippedCount: skipped.length,
    results,
    skipped
  };
}

export function listProviders() {
  return providers;
}
