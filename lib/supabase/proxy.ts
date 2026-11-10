import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Only /admin (the RH panel) requires login. The daily pointage form at "/" is
// intentionally public - team leads found the magic-link email round-trip too
// much friction on their phones, and there's no sensitive data on that form.
const PROTECTED_PREFIXES = ["/admin", "/controle"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const isProtectedPath = PROTECTED_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p));
  if (!isProtectedPath) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    if (request.nextUrl.pathname.startsWith("/controle")) loginUrl.searchParams.set("next", "/controle");
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
