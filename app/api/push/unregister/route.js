import { disablePushSubscription } from "@/lib/repository";

export const runtime = "nodejs";

export async function POST(request) {
  const body = await request.json();
  const token = String(body.token ?? "").trim();

  if (!token) {
    return Response.json({ error: "Missing token." }, { status: 400 });
  }

  await disablePushSubscription(token);
  return Response.json({ ok: true });
}
