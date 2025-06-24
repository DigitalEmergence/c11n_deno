import { Application } from "oak";
import { oakCors } from "cors";
import { authRoutes } from "./routes/auth.ts";
import { gcpRoutes } from "./routes/gcp.ts";
import { configRoutes } from "./routes/configs.ts";
import { deploymentRoutes } from "./routes/deployments.ts";
import { localServerRoutes } from "./routes/local-servers.ts";
import { remoteServerRoutes } from "./routes/remote-servers.ts";
import { billingRoutes } from "./routes/billing.ts";
import { serviceProfileRoutes } from "./routes/service-profiles.ts";
import { workspaceRoutes } from "./routes/workspaces.ts";
import { authMiddleware } from "./middleware/auth.ts";

const app = new Application();

// Middleware
app.use(oakCors({
  origin: Deno.env.get("FRONTEND_URL") || "http://localhost:8000"
}));

// Static files
app.use(async (ctx, next) => {
  if (ctx.request.url.pathname.startsWith("/api")) {
    await next();
  } else {
    try {
      await ctx.send({
        root: `${Deno.cwd()}/src/client`,
        index: "index.html",
      });
    } catch {
      await next();
    }
  }
});

// API Routes
app.use(authRoutes.routes());
app.use(authRoutes.allowedMethods());

// Public service profile routes (before auth middleware)
app.use(async (ctx, next) => {
  if (ctx.request.url.pathname === "/api/service-profiles/docker-images") {
    try {
      // Fetch JSphere images from DockerHub API
      const response = await fetch("https://hub.docker.com/v2/repositories/greenantsolutions/jsphere/tags/?page_size=50");
      
      if (!response.ok) {
        throw new Error("Failed to fetch from DockerHub");
      }
      
      const data = await response.json();
      
      // Format the images for the frontend
      const images = data.results?.map((tag: any) => ({
        name: tag.name,
        full_name: `mirror.gcr.io/greenantsolutions/jsphere:${tag.name}`,
        digest: tag.digest,
        last_updated: tag.last_updated,
        size: tag.full_size
      })) || [];

      ctx.response.body = { images };
    } catch (error) {
      console.error("Failed to fetch Docker images:", error);
      
      // Fallback to some default images if DockerHub is unavailable
      const fallbackImages = [
        {
          name: "latest",
          full_name: "mirror.gcr.io/greenantsolutions/jsphere:latest",
          digest: null,
          last_updated: new Date().toISOString(),
          size: null
        },
        {
          name: "stable",
          full_name: "mirror.gcr.io/greenantsolutions/jsphere:stable",
          digest: null,
          last_updated: new Date().toISOString(),
          size: null
        }
      ];
      
      ctx.response.body = { images: fallbackImages };
    }
  } else {
    await next();
  }
});

// Protected routes
app.use(authMiddleware);
app.use(gcpRoutes.routes());
app.use(configRoutes.routes());
app.use(deploymentRoutes.routes());
app.use(localServerRoutes.routes());
app.use(remoteServerRoutes.routes());
app.use(remoteServerRoutes.allowedMethods());
app.use(billingRoutes.routes());
app.use(serviceProfileRoutes.routes());
app.use(serviceProfileRoutes.allowedMethods());
app.use(workspaceRoutes.routes());
app.use(workspaceRoutes.allowedMethods());

const port = parseInt(Deno.env.get("PORT") || "8000");
console.log(`🚀 Server running on http://localhost:${port}`);
await app.listen({ port });
