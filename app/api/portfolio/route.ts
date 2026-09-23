import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { portfolios } from "../../../db/schema";
import seed from "../../../db/seed.json";

export const dynamic = "force-dynamic";

async function userId() {
  return (await headers()).get("oai-authenticated-user-id");
}

export async function GET() {
  const id = await userId();
  if (!id) return Response.json({ error: "יש להתחבר לחשבון" }, { status: 401 });
  try {
    const row = await getDb().select().from(portfolios).where(eq(portfolios.userId, id)).get();
    return Response.json({
      portfolio: row ? JSON.parse(row.data) : { items: seed.items, alerts: [] },
      fresh: !row,
      isInitialOwner: false,
      userKey: id,
      updatedAt: row?.updatedAt ?? null,
    });
  } catch {
    return Response.json({ error: "לא ניתן לטעון את התיק כרגע" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const id = await userId();
  if (!id) return Response.json({ error: "יש להתחבר לחשבון" }, { status: 401 });
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 250_000) return Response.json({ error: "הקובץ גדול מדי" }, { status: 413 });
  let data: unknown;
  try { data = await request.json(); } catch { return Response.json({ error: "נתונים לא תקינים" }, { status: 400 }); }
  if (!data || typeof data !== "object" || !Array.isArray((data as { items?: unknown }).items) || !Array.isArray((data as { alerts?: unknown }).alerts)) {
    return Response.json({ error: "מבנה התיק אינו תקין" }, { status: 400 });
  }
  const payload = data as { items: Array<Record<string, unknown>>; alerts: unknown[] };
  if (payload.items.length > 200 || payload.alerts.length > 500 || payload.items.some(x => typeof x.symbol !== "string" || !/^[A-Z0-9.^_-]{1,20}$/.test(x.symbol) || !Number.isFinite(Number(x.qty)) || Number(x.qty) < 0)) {
    return Response.json({ error: "אחד הנתונים אינו תקין" }, { status: 400 });
  }
  const serialized = JSON.stringify({ items: payload.items, alerts: payload.alerts });
  if (serialized.length > 250_000) return Response.json({ error: "התיק גדול מדי" }, { status: 413 });
  try {
    const at = Date.now();
    await getDb().insert(portfolios).values({ userId: id, data: serialized, updatedAt: at }).onConflictDoUpdate({ target: portfolios.userId, set: { data: serialized, updatedAt: at } });
    return Response.json({ ok: true, updatedAt: at });
  } catch {
    return Response.json({ error: "השמירה נכשלה; הנתונים נשארו במכשיר" }, { status: 503 });
  }
}
