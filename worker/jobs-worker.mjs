/**
 * Long-running automation worker for a server you control (VPS, container, PM2/systemd).
 * Every interval it calls the app's secured /api/jobs/run endpoint, which runs due reminders,
 * digests and scheduled conversions and sends queued email.
 *
 * Usage:  APP_URL=https://your-domain CRON_SECRET=... npm run worker
 * Env:    APP_URL (or BETTER_AUTH_URL), CRON_SECRET, WORKER_INTERVAL_SECONDS (default 60)
 */

const appUrl = (process.env.APP_URL || process.env.BETTER_AUTH_URL || "").replace(/\/$/, "");
const secret = process.env.CRON_SECRET;
const intervalMs = Math.max(15, Number(process.env.WORKER_INTERVAL_SECONDS) || 60) * 1000;

if (!appUrl || !secret) {
  console.error("[worker] APP_URL (or BETTER_AUTH_URL) and CRON_SECRET must be set.");
  process.exit(1);
}

let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const res = await fetch(`${appUrl}/api/jobs/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(55_000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[worker] ${new Date().toISOString()} run failed: HTTP ${res.status}`);
    } else if (body.summary?.jobs?.claimed || body.summary?.outbox?.sent) {
      console.log(`[worker] ${new Date().toISOString()} jobs=${body.summary.jobs.claimed} emails=${body.summary.outbox.sent}`);
    }
  } catch (error) {
    console.error(`[worker] ${new Date().toISOString()} request error: ${error instanceof Error ? error.message : error}`);
  } finally {
    running = false;
  }
}

console.log(`[worker] polling ${appUrl}/api/jobs/run every ${intervalMs / 1000}s`);
await tick();
setInterval(tick, intervalMs);
