import { Context, Next } from "oak";
import { verify } from "djwt";

const JWT_SECRET = Deno.env.get("JWT_SECRET")!;
const key = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(JWT_SECRET),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"]
);

export async function authMiddleware(ctx: Context, next: Next) {
  // Skip auth for public auth endpoints only
  const publicAuthEndpoints = [
    "/api/auth/github/config",
    "/api/auth/github/callback",
    "/api/auth/logout",
    "/api/auth/me"
  ];
  
  if (publicAuthEndpoints.includes(ctx.request.url.pathname)) {
    await next();
    return;
  }

  const authHeader = ctx.request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized" };
    return;
  }

  try {
    const jwt = authHeader.slice(7);
    const payload = await verify(jwt, key);
    ctx.state.userId = payload.userId;
    await next();
  } catch {
    ctx.response.status = 401;
    ctx.response.body = { error: "Invalid token" };
  }
}
