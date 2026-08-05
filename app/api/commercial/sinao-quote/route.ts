import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { createDraftQuote, isStubQuoteId, SinaoError, updateDraftQuote } from "@/lib/sinao/client";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const caseId = (body as { caseId?: string } | null)?.caseId;
  if (!caseId) {
    return NextResponse.json({ error: "Missing caseId" }, { status: 400 });
  }

  const check = await requireRole(["commercial", "rh_admin"]);
  if (!check.ok) return check.response;
  const { supabase } = check.ctx;

  const { data: caseRow, error: caseError } = await supabase
    .from("commercial_cases")
    .select("id, title, sinao_quote_id, commercial_clients(id, name, sinao_organization_id)")
    .eq("id", caseId)
    .maybeSingle<{
      id: string;
      title: string;
      sinao_quote_id: string | null;
      commercial_clients:
        | { id: string; name: string; sinao_organization_id: string | null }
        | { id: string; name: string; sinao_organization_id: string | null }[]
        | null;
    }>();

  if (caseError || !caseRow) {
    return NextResponse.json({ error: "Dossier not found" }, { status: 404 });
  }

  const isUpdate = Boolean(caseRow.sinao_quote_id && !isStubQuoteId(caseRow.sinao_quote_id));

  const client = Array.isArray(caseRow.commercial_clients) ? caseRow.commercial_clients[0] : caseRow.commercial_clients;
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const { data: itemRows, error: itemsError } = await supabase
    .from("commercial_case_items")
    .select("category_code, label, status, position, price_ht, vat_rate")
    .eq("case_id", caseId);

  if (itemsError) {
    return NextResponse.json({ error: "Failed to load checklist items" }, { status: 500 });
  }

  const items = itemRows ?? [];
  if (items.some((i) => i.status === "pending")) {
    return NextResponse.json(
      { error: "Il reste des lignes « en question » — clarifiez-les avant de pousser vers Sinao." },
      { status: 400 }
    );
  }

  const { data: categoryRows } = await supabase
    .from("commercial_categories")
    .select("code, label, sort_order")
    .order("sort_order");

  const activeItems = items.filter((i) => i.status === "active").sort((a, b) => a.position - b.position);
  const categories = (categoryRows ?? [])
    .map((c) => ({
      label: c.label,
      items: activeItems
        .filter((i) => i.category_code === c.code)
        .map((i) => ({
          label: i.label,
          // Full transfer of the checklist's own pricing — Sinao computes the
          // line's TTC itself from amount + vat_percent (basis points, so 20% = 2000).
          amount: i.price_ht ?? 0,
          vatPercent: Math.round((i.vat_rate ?? 20) * 100),
        })),
    }))
    .filter((c) => c.items.length > 0);

  if (categories.length === 0) {
    return NextResponse.json({ error: "Aucune ligne active à envoyer." }, { status: 400 });
  }

  try {
    let quoteId: string;
    let nested: boolean;
    let stub: boolean;

    if (isUpdate) {
      const result = await updateDraftQuote({ quoteId: caseRow.sinao_quote_id!, categories });
      quoteId = result.quoteId;
      nested = result.nested;
      stub = false;
    } else {
      const result = await createDraftQuote({
        clientName: client.name,
        knownOrganizationId: client.sinao_organization_id,
        title: caseRow.title,
        categories,
      });
      quoteId = result.quoteId;
      nested = result.nested;
      stub = result.stub;

      if (!stub && !client.sinao_organization_id) {
        await supabase
          .from("commercial_clients")
          .update({ sinao_organization_id: String(result.organizationId) })
          .eq("id", client.id);
      }
    }

    await supabase
      .from("commercial_cases")
      .update({
        sinao_quote_id: quoteId,
        sinao_pushed_at: new Date().toISOString(),
        status: stub ? "ready" : "quoted",
      })
      .eq("id", caseId);

    return NextResponse.json({ quoteId, nested, stub, updated: isUpdate });
  } catch (err) {
    if (err instanceof SinaoError) {
      return NextResponse.json({ error: err.message, sinaoBody: err.body }, { status: err.status >= 400 && err.status < 600 ? err.status : 502 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sinao request failed" }, { status: 500 });
  }
}
