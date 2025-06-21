import { Context, Next } from "oak";

export async function corsMiddleware(ctx: Context, next: Next) {
  ctx.response.headers.set("Access-Control-Allow-Origin", Deno.env.get("FRONTEND_URL") || "*");
  ctx.response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");

  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 200;
    return;
  }

  await next();
}