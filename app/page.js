import {
  createMonitorAction,
  deleteMonitorAction,
  runMonitorNowAction,
  toggleMonitorAction
} from "@/app/actions";
import { PushNotificationCard } from "@/components/push-notification-card";
import { BRAND, PROVIDER_SPOTLIGHT } from "@/lib/branding";
import { listJobs } from "@/lib/jobs";
import { providers } from "@/lib/providers";
import { getStorageBackendLabel } from "@/lib/repository";

function formatTimestamp(value) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDuration(value) {
  if (!value && value !== 0) {
    return "n/a";
  }

  if (value < 1000) {
    return `${value} ms`;
  }

  return `${(value / 1000).toFixed(1)} s`;
}

function statusTone(status, isRunning = false) {
  if (isRunning) {
    return "running";
  }

  switch (status) {
    case "available":
      return "success";
    case "not_available":
      return "muted";
    case "error":
      return "danger";
    default:
      return "warning";
  }
}

function Pill({ children, tone = "default" }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function Kpi({ label, value, caption }) {
  return (
    <div className="kpi-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{caption}</small>
    </div>
  );
}

function LogRow({ run }) {
  return (
    <li className="log-row">
      <div className="log-row-top">
        <Pill tone={statusTone(run.status)}>{run.status}</Pill>
        <span>{formatTimestamp(run.startedAt)}</span>
      </div>
      <p>{run.message}</p>
      <div className="log-row-meta">
        <span>{formatDuration(run.durationMs)}</span>
        <span>{run.changed ? "changed" : "same state"}</span>
        <span>{run.notified ? "notified" : "quiet"}</span>
      </div>
    </li>
  );
}

export default async function HomePage() {
  const jobs = await listJobs();
  const liveCount = jobs.filter((job) => job.enabled).length;
  const runningCount = jobs.filter((job) => job.isRunning).length;
  const availableCount = jobs.filter((job) => job.lastResult?.status === "available").length;
  const providerCount = providers.length;
  const backend = getStorageBackendLabel();

  return (
    <main className="shell">
      <section className="hero-surface">
        <div className="hero-left">
          <div className="hero-intro">
            <p className="eyebrow">{BRAND.tagline}</p>
            <h1>{BRAND.name}</h1>
            <p className="hero-text">
              {BRAND.description} It now tracks providers, run history, and storage backends more
              explicitly so we can trust the results and grow this into a proper platform.
            </p>
          </div>

          <div className="hero-kpis">
            <Kpi label="Active monitors" value={String(liveCount)} caption="enabled jobs" />
            <Kpi label="Running now" value={String(runningCount)} caption="live executions" />
            <Kpi label="Available" value={String(availableCount)} caption="ready for pickup" />
            <Kpi label="Backend" value={backend} caption="persistence layer" />
          </div>
        </div>

        <div className="hero-right">
          <div className="spotlight-card">
            <div className="spotlight-head">
              <div>
                <p className="eyebrow">Provider Spotlight</p>
                <h2>{PROVIDER_SPOTLIGHT.title}</h2>
              </div>
              <Pill tone="ink">{providers.length} provider</Pill>
            </div>
            <p className="spotlight-copy">{PROVIDER_SPOTLIGHT.copy}</p>
            <ul className="spotlight-list">
              {PROVIDER_SPOTLIGHT.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="workspace-grid">
        <div className="panel panel-form">
          <div className="panel-head">
            <div>
              <p className="eyebrow">New Monitor</p>
              <h2>Create a watch</h2>
            </div>
            <Pill tone="default">provider adapter</Pill>
          </div>

          <form action={createMonitorAction} className="monitor-form">
            <label className="field">
              <span>Monitor name</span>
              <input name="name" placeholder="Ahmed passport status" required />
            </label>

            <label className="field">
              <span>Provider</span>
              <select name="providerId" defaultValue="cgsudan-passports">
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="field-row">
              <label className="field">
                <span>National ID</span>
                <input
                  name="nationalId"
                  defaultValue={process.env.SIGNALNEST_DEFAULT_NATIONAL_ID ?? ""}
                  placeholder="20664258333"
                  required
                />
              </label>

              <label className="field">
                <span>Check every</span>
                <select name="intervalMinutes" defaultValue="5">
                  <option value="5">5 minutes</option>
                  <option value="10">10 minutes</option>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                </select>
              </label>
            </div>

            <button className="button button-primary" type="submit">
              Create monitor
            </button>
          </form>
        </div>

        <div className="side-stack">
          <PushNotificationCard />

          <div className="panel panel-architecture">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Platform Health</p>
                <h2>What changed</h2>
              </div>
              <Pill tone="success">deployed flow</Pill>
            </div>

            <ul className="check-list">
              <li>Provider checks now wait for the CGSudan lookup to settle before classifying.</li>
              <li>Each job stores run timestamps, duration, current activity state, and recent logs.</li>
              <li>Push alerts can be delivered to registered browsers through Firebase Cloud Messaging.</li>
              <li>Firestore backs jobs, logs, and browser subscriptions when Firebase is configured.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="jobs-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">Live Jobs</p>
            <h2>Monitoring dashboard</h2>
          </div>
          <Pill tone="ink">{jobs.length} configured</Pill>
        </div>

        <div className="job-grid">
          {jobs.map((job) => (
            <article className="job-shell" key={job.id}>
              <div className="job-head">
                <div>
                  <div className="job-title-row">
                    <h3>{job.name}</h3>
                    <Pill tone={job.enabled ? "default" : "warning"}>
                      {job.enabled ? "enabled" : "paused"}
                    </Pill>
                  </div>
                  <p>{job.providerName}</p>
                </div>
                <Pill tone={statusTone(job.lastResult?.status, job.isRunning)}>
                  {job.isRunning ? "running" : job.lastResult?.status ?? "idle"}
                </Pill>
              </div>

              <div className="job-stats">
                <div>
                  <span>National ID</span>
                  <strong>{job.config.nationalId}</strong>
                </div>
                <div>
                  <span>Interval</span>
                  <strong>{job.intervalMinutes} min</strong>
                </div>
                <div>
                  <span>Last checked</span>
                  <strong>{formatTimestamp(job.lastCheckedAt)}</strong>
                </div>
                <div>
                  <span>Last duration</span>
                  <strong>{formatDuration(job.lastDurationMs)}</strong>
                </div>
              </div>

              <div className="result-card">
                <div className="result-card-head">
                  <span>Latest result</span>
                  {job.lastResult?.details?.arrivalDate ? (
                    <Pill tone="success">{job.lastResult.details.arrivalDate}</Pill>
                  ) : null}
                </div>
                <p>{job.lastResult?.message ?? "No result yet. Run this monitor to fetch the first state."}</p>
                {(job.lastResult?.details?.name || job.lastResult?.details?.passportRef) && (
                  <div className="result-extra">
                    {job.lastResult.details.name ? <span>{job.lastResult.details.name}</span> : null}
                    {job.lastResult.details.passportRef ? (
                      <span>Passport ref: {job.lastResult.details.passportRef}</span>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="job-actions">
                <form action={runMonitorNowAction}>
                  <input type="hidden" name="jobId" value={job.id} />
                  <button className="button button-primary" type="submit">
                    Run now
                  </button>
                </form>

                <form action={toggleMonitorAction}>
                  <input type="hidden" name="jobId" value={job.id} />
                  <input type="hidden" name="enabled" value={job.enabled ? "false" : "true"} />
                  <button className="button button-secondary" type="submit">
                    {job.enabled ? "Pause" : "Resume"}
                  </button>
                </form>

                <form action={deleteMonitorAction}>
                  <input type="hidden" name="jobId" value={job.id} />
                  <button className="button button-danger" type="submit">
                    Delete
                  </button>
                </form>
              </div>

              <div className="logs-card">
                <div className="logs-head">
                  <h4>Recent runs</h4>
                  <span>{job.runCount ?? 0} total</span>
                </div>

                {job.recentRuns?.length ? (
                  <ul className="logs-list">
                    {job.recentRuns.map((run) => (
                      <LogRow key={run.id} run={run} />
                    ))}
                  </ul>
                ) : (
                  <p className="empty-copy">No logs yet for this monitor.</p>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
