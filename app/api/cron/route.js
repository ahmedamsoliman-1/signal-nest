import { runDueJobs } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return true;
  }

  const auth = request.headers.get("authorization");
  return auth === `Bearer ${expected}`;
}

async function executeCron(request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runDueJobs();
  return Response.json({
    ok: true,
    processedAt: results.processedAt,
    notificationMode: results.notificationMode,
    ran: results.results.length,
    results: results.results
  });
}

export async function GET(request) {
  return executeCron(request);
}

export async function POST(request) {
  return executeCron(request);
}
