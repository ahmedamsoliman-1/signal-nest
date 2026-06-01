import { upsertPushSubscription } from "@/lib/repository";

export const runtime = "nodejs";

export async function POST(request) {
  const body = await request.json();
  const token = String(body.token ?? "").trim();

  if (!token) {
    return Response.json({ error: "Missing token." }, { status: 400 });
  }

  const record = await upsertPushSubscription({
    token,
    enabled: true,
    permission: String(body.permission ?? "granted"),
    userAgent: String(body.userAgent ?? "").trim(),
    platform: String(body.platform ?? "").trim(),
    locale: String(body.locale ?? "").trim()
  });

  return Response.json({
    ok: true,
    subscriptionId: record.id
  });
}
