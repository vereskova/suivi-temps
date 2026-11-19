import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { createDraftQuote, isSinaoConfigured, SinaoError, type SinaoQuoteCategory } from "@/lib/sinao/client";

// Смета из конструктора -> черновик devis в Sinao для выбранного клиента. Роли: commercial, commercial_rh, rh_admin.
type Body = {
  organizationId?: number | string;
  clientName?: string;
  title?: string;
  categories?: { label?: string; items?: { label?: string; unit?: string | null; qty?: number; price_ht?: number | null; note?: string | null }[] }[];
};

export async function POST(request: NextRequest) {
  const check = await requireRole(["commercial", "commercial_rh", "rh_admin"]);
  if (!check.ok) return check.response;
  if (!isSinaoConfigured()) return NextResponse.json({ error: "Sinao не подключён (нет ключа API)." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as Body | null;
  const orgId = Number(body?.organizationId);
  const clientName = String(body?.clientName ?? "").trim();
  const title = String(body?.title ?? "").trim().slice(0, 200);
  if (!Number.isFinite(orgId) || orgId <= 0 || !clientName) return NextResponse.json({ error: "Выберите клиента Sinao." }, { status: 400 });
  if (!title) return NextResponse.json({ error: "Укажите название devis." }, { status: 400 });

  const categories: SinaoQuoteCategory[] = (body?.categories ?? [])
    .map((c) => ({
      label: String(c.label ?? "").trim(),
      items: (c.items ?? [])
        .filter((i) => String(i.label ?? "").trim())
        .map((i) => ({
          label: String(i.label).trim(),
          // price_ht - евро за единицу; Sinao ждёт центы, НДС в базисных пунктах (20% = 2000)
          amount: Math.round((Number(i.price_ht) || 0) * 100),
          vatPercent: 2000,
          note: i.note?.trim() || null,
          unite: i.unit?.trim() || null,
          quantite: Number.isFinite(Number(i.qty)) && Number(i.qty) > 0 ? Number(i.qty) : 1,
        })),
    }))
    .filter((c) => c.label && c.items.length > 0);
  if (categories.length === 0) return NextResponse.json({ error: "В смете нет строк для отправки." }, { status: 400 });

  try {
    const r = await createDraftQuote({ clientName, knownOrganizationId: String(orgId), title, categories });
    return NextResponse.json({ quoteId: r.quoteId, stub: r.stub });
  } catch (err) {
    if (err instanceof SinaoError) return NextResponse.json({ error: err.message }, { status: err.status >= 400 && err.status < 600 ? err.status : 502 });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sinao request failed" }, { status: 500 });
  }
}
