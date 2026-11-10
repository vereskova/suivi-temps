import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");
  // Только относительные пути внутри сайта (защита от open redirect).
  let next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (next === "/") {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: roleRow } = await supabase.from("user_roles").select("role").eq("auth_user_id", user.id).maybeSingle();
          if (roleRow?.role === "controleur") next = "/controle";
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
