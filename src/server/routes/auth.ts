import { Router } from "oak";
import { create, verify } from "djwt";
import { db } from "../services/database.ts";

export const authRoutes = new Router();

// GitHub OAuth config endpoint
authRoutes.get("/api/auth/github/config", (ctx) => {
  ctx.response.body = {
    clientId: Deno.env.get("GITHUB_CLIENT_ID")!,
    redirectUri: Deno.env.get("GITHUB_REDIRECT_URI")!
  };
});

const JWT_SECRET = Deno.env.get("JWT_SECRET")!;
const key = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(JWT_SECRET),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"]
);

// GitHub OAuth callback (GET route for GitHub's redirect)
authRoutes.get("/api/auth/github/callback", async (ctx) => {
  const url = new URL(ctx.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || state !== "github") {
    ctx.response.status = 400;
    ctx.response.body = "Invalid callback parameters";
    return;
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams({
        client_id: Deno.env.get("GITHUB_CLIENT_ID")!,
        client_secret: Deno.env.get("GITHUB_CLIENT_SECRET")!,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();
    
    if (!tokenData.access_token) {
      throw new Error("Failed to get access token");
    }

    // Get user info from GitHub
    const userResponse = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const githubUser = await userResponse.json();

    // Create or update user in database
    const userQuery = `
      MERGE (u:User {github_id: $github_id})
      SET u.github_username = $username,
          u.github_avatar_url = $avatar_url,
          u.email = $email,
          u.plan = COALESCE(u.plan, 'free'),
          u.updated_at = datetime(),
          u.created_at = COALESCE(u.created_at, datetime())
      RETURN u
    `;

    const users = await db.run(userQuery, {
      github_id: githubUser.id.toString(),
      username: githubUser.login,
      avatar_url: githubUser.avatar_url,
      email: githubUser.email,
    });

    const user = users[0].u.properties;

    // Create JWT token
    const jwt = await create(
      { alg: "HS256", typ: "JWT" },
      { 
        userId: user.github_id,
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
      },
      key
    );

    // Redirect to frontend with token
    const frontendUrl = Deno.env.get("FRONTEND_URL") || "http://localhost:8000";
    ctx.response.redirect(`${frontendUrl}?token=${jwt}`);
  } catch (error) {
    console.error("GitHub OAuth error:", error);
    const frontendUrl = Deno.env.get("FRONTEND_URL") || "http://localhost:8000";
    ctx.response.redirect(`${frontendUrl}?error=auth_failed`);
  }
});

// GitHub OAuth callback (POST route for frontend API calls)
authRoutes.post("/api/auth/github/callback", async (ctx) => {
  const { code } = await ctx.request.body({ type: "json" }).value;

  // Exchange code for access token
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: new URLSearchParams({
      client_id: Deno.env.get("GITHUB_CLIENT_ID")!,
      client_secret: Deno.env.get("GITHUB_CLIENT_SECRET")!,
      code,
    }),
  });

  const { access_token } = await tokenResponse.json();

  // Get user info from GitHub
  const userResponse = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const githubUser = await userResponse.json();

  // Create or update user in database
  const userQuery = `
    MERGE (u:User {github_id: $github_id})
    SET u.github_username = $username,
        u.github_avatar_url = $avatar_url,
        u.email = $email,
        u.plan = COALESCE(u.plan, 'free'),
        u.updated_at = datetime(),
        u.created_at = COALESCE(u.created_at, datetime())
    RETURN u
  `;

  const users = await db.run(userQuery, {
    github_id: githubUser.id.toString(),
    username: githubUser.login,
    avatar_url: githubUser.avatar_url,
    email: githubUser.email,
  });

  const user = users[0].u.properties;

  // Create JWT token
  const jwt = await create(
    { alg: "HS256", typ: "JWT" },
    { 
      userId: user.github_id,
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    },
    key
  );

  ctx.response.body = { token: jwt, user };
});

// Get current user
authRoutes.get("/api/auth/me", async (ctx) => {
  const authHeader = ctx.request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    ctx.response.status = 401;
    return;
  }

  try {
    const jwt = authHeader.slice(7);
    const payload = await verify(jwt, key);
    
    const users = await db.run(
      "MATCH (u:User {github_id: $userId}) RETURN u",
      { userId: payload.userId }
    );

    if (users.length === 0) {
      ctx.response.status = 401;
      return;
    }

    ctx.response.body = { user: users[0].u.properties };
  } catch {
    ctx.response.status = 401;
  }
});

// Logout
authRoutes.post("/api/auth/logout", (ctx) => {
  ctx.response.body = { success: true };
});
