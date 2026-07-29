import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderPdf } from "@/lib/documents/renderPdf";
import { buildClientChecklistDoc, buildTeamWorkOrderDoc } from "@/lib/commercial/documents";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { caseId, kind } = body as { caseId?: string; kind?: "client" | "team" };
  if (!caseId || (kind !== "client" && kind !== "team")) {
    return NextResponse.json({ error: "Missing or invalid parameters" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (roleRow?.role !== "commercial" && roleRow?.role !== "rh_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: caseRow, error: caseError } = await supabase
    .from("commercial_cases")
    .select("id, title, desired_start_date, desired_end_date, commercial_clients(name)")
    .eq("id", caseId)
    .maybeSingle<{
      id: string;
      title: string;
      desired_start_date: string | null;
      desired_end_date: string | null;
      commercial_clients: { name: string } | { name: string }[] | null;
    }>();

  if (caseError || !caseRow) {
    return NextResponse.json({ error: "Dossier not found" }, { status: 404 });
  }

  const clientRel = caseRow.commercial_clients;
  const clientName = Array.isArray(clientRel) ? clientRel[0]?.name : clientRel?.name;
  if (!clientName) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const { data: itemRows, error: itemsError } = await supabase
    .from("commercial_case_items")
    .select("category_code, label, status, note, position")
    .eq("case_id", caseId);

  if (itemsError) {
    return NextResponse.json({ error: "Failed to load checklist items" }, { status: 500 });
  }

  const { data: categoryRows, error: categoriesError } = await supabase
    .from("commercial_categories")
    .select("code, label, label_ru, sort_order");

  if (categoriesError) {
    return NextResponse.json({ error: "Failed to load categories" }, { status: 500 });
  }

  const caseInfo = {
    title: caseRow.title,
    clientName,
    desiredStartDate: caseRow.desired_start_date,
    desiredEndDate: caseRow.desired_end_date,
  };
  const categories = (categoryRows ?? []).map((c) => ({
    code: c.code,
    label: c.label,
    labelRu: c.label_ru,
    sortOrder: c.sort_order,
  }));
  const items = (itemRows ?? []).map((i) => ({
    categoryCode: i.category_code,
    label: i.label,
    status: i.status as "active" | "inactive" | "pending",
    note: i.note,
    position: i.position,
  }));

  const content =
    kind === "client"
      ? buildClientChecklistDoc(caseInfo, categories, items)
      : buildTeamWorkOrderDoc(caseInfo, categories, items);

  const buffer = await renderPdf(content);
  const filename = `${content.title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9\- ]/g, "")
    .trim()
    .replace(/\s+/g, "_")}.pdf`;

  await supabase
    .from("commercial_cases")
    .update(
      kind === "client" ? { client_doc_sent_at: new Date().toISOString() } : { team_doc_generated_at: new Date().toISOString() }
    )
    .eq("id", caseId);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
