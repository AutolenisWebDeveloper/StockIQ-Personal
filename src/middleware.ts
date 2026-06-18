import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Auth gate for the whole app. Runs on the Edge runtime, so it uses `jose`
// (edge-compatible) rather than bcrypt/jsonwebtoken. Password verification and
// token signing live in the Node.js login route (src/app/api/auth/login).
//
// Public paths bypass the gate: the login page/endpoint (otherwise a redirect
// loop) and the health check (Railway probes it without a session cookie).
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/health"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("stockiq_session")?.value;
  if (!token) return NextResponse.redirect(new URL("/login", req.url));

  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET!));
    return NextResponse.next();
  } catch {
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete("stockiq_session");
    return res;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
