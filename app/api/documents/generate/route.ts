import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDocumentType, splitParams } from "@/lib/documents/registry";
import { renderDocx } from "@/lib/documents/renderDocx";
import { renderPdf } from "@/lib/documents/renderPdf";
import {
  CompanyRow,
  EMPLOYEE_DOC_SELECT,
  EmployeeRow,
  mapCompanyRow,
  mapEmployeeRow,
} from "@/lib/documents/mappers";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { employeeId, documentType, format, params } = body as {
    employeeId?: string;
    documentType?: string;
    format?: "pdf" | "docx";
    params?: Record<string, unknown>;
  };

  if (!employeeId || !documentType || (format !== "pdf" && format !== "docx")) {
    return NextResponse.json({ error: "Missing or invalid parameters" }, { status: 400 });
  }

  const definition = getDocumentType(documentType);
  if (!definition) {
    return NextResponse.json({ error: "Unknown document type" }, { status: 400 });
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
    .select("role, employee_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (roleRow?.role !== "rh_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: employeeRow, error: employeeError } = await supabase
    .from("employees")
    .select(EMPLOYEE_DOC_SELECT)
    .eq("id", employeeId)
    .maybeSingle<EmployeeRow>();

  if (employeeError || !employeeRow) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const { data: companyRow } = await supabase
    .from("company_settings")
    .select("*")
    .limit(1)
    .maybeSingle<CompanyRow>();

  if (!companyRow) {
    return NextResponse.json({ error: "Company settings not configured" }, { status: 500 });
  }

  const baseEmployee = mapEmployeeRow(employeeRow);
  const company = mapCompanyRow(companyRow);
  const { employee, params: docParams } = splitParams(definition, baseEmployee, params ?? {});

  let content;
  try {
    content = definition.generate(employee, company, docParams);
  } catch {
    return NextResponse.json({ error: "Failed to generate document content" }, { status: 400 });
  }

  const buffer = format === "docx" ? await renderDocx(content) : await renderPdf(content);
  const mimeType =
    format === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/pdf";
  const filename = `${content.title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9\- ]/g, "")
    .trim()
    .replace(/\s+/g, "_")}.${format}`;

  await supabase.from("generated_documents").insert({
    employee_id: employeeId,
    document_type: documentType,
    format,
    params: params ?? {},
    generated_by: roleRow.employee_id ?? null,
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
