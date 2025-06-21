import { Router } from "oak";
import { db } from "../services/database.ts";
import { github } from "../services/github.ts";
import { encrypt, decrypt } from "../services/encryption.ts";
import { validateRequired, validateLength, sanitizeInput, ValidationError } from "../utils/validation.ts";

export const configRoutes = new Router();

// Get all configs for user
configRoutes.get("/api/configs", async (ctx) => {
  const userId = ctx.state.userId;
  
  try {
    const configs = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(c:JSphereConfig)
      RETURN c
      ORDER BY c.created_at DESC
    `, { userId });

    const configList = configs.map((record: any) => {
      const config = record.c.properties;
      // Don't expose sensitive tokens
      delete config.project_auth_token;
      delete config.project_preview_server_auth_token;
      return config;
    });

    ctx.response.body = { configs: configList };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to fetch configs" };
  }
});

// Get single config for user
configRoutes.get("/api/configs/:id", async (ctx) => {
  const userId = ctx.state.userId;
  const configId = ctx.params.id;
  
  try {
    const configs = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(c:JSphereConfig {id: $configId})
      RETURN c
    `, { userId, configId });

    if (configs.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Config not found" };
      return;
    }

    const config = configs[0].c.properties;
    // Don't expose sensitive tokens in the response
    delete config.project_auth_token;
    delete config.project_preview_server_auth_token;

    ctx.response.body = { config };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to fetch config" };
  }
});

// Create new config
configRoutes.post("/api/configs", async (ctx) => {
  const userId = ctx.state.userId;
  const body = await ctx.request.body({ type: "json" }).value;

  try {
    // Validation
    if (!validateRequired(body.name)) {
      throw new ValidationError("Config name is required", "name");
    }
    if (!validateLength(body.name, 1, 50)) {
      throw new ValidationError("Config name must be 1-50 characters", "name");
    }
    if (!validateRequired(body.project_name)) {
      throw new ValidationError("Project name is required", "project_name");
    }
    if (!validateRequired(body.project_app_config)) {
      throw new ValidationError("App config is required", "project_app_config");
    }

    let project_namespace: string;
    let project_auth_token: string;
    let workspaceId: string | null = null;

    // Check if using workspace or manual credentials
    if (body.workspace_id) {
      // Using workspace - get credentials from workspace
      const workspaces = await db.run(`
        MATCH (u:User {github_id: $userId})-[:OWNS]->(w:Workspace {id: $workspaceId})
        RETURN w
      `, { userId, workspaceId: body.workspace_id });

      if (workspaces.length === 0) {
        throw new ValidationError("Workspace not found", "workspace_id");
      }

      const workspace = workspaces[0].w.properties;
      project_namespace = workspace.project_namespace;
      project_auth_token = workspace.project_auth_token; // Already encrypted
      workspaceId = body.workspace_id;
    } else {
      // Manual credentials - validate them
      if (!validateRequired(body.project_namespace)) {
        throw new ValidationError("Project namespace is required", "project_namespace");
      }
      if (!validateRequired(body.project_auth_token)) {
        throw new ValidationError("Project auth token is required", "project_auth_token");
      }

      project_namespace = sanitizeInput(body.project_namespace);
      project_auth_token = encrypt(body.project_auth_token);
    }

    const configId = crypto.randomUUID();
    const encryptedPreviewToken = body.project_preview_server_auth_token ? 
      encrypt(body.project_preview_server_auth_token) : null;

    // Create the config
    await db.run(`
      MATCH (u:User {github_id: $userId})
      CREATE (c:JSphereConfig {
        id: $configId,
        name: $name,
        project_host: $project_host,
        project_namespace: $project_namespace,
        project_auth_token: $project_auth_token,
        project_name: $project_name,
        project_app_config: $project_app_config,
        project_reference: $project_reference,
        server_http_port: $server_http_port,
        server_debug_port: $server_debug_port,
        project_preview_branch: $project_preview_branch,
        project_preview_server: $project_preview_server,
        project_preview_server_auth_token: $project_preview_server_auth_token,
        created_at: datetime(),
        updated_at: datetime()
      })
      CREATE (u)-[:OWNS]->(c)
      RETURN c
    `, {
      userId,
      configId,
      name: sanitizeInput(body.name),
      project_host: "GitHub",
      project_namespace: project_namespace,
      project_auth_token: project_auth_token,
      project_name: sanitizeInput(body.project_name),
      project_app_config: sanitizeInput(body.project_app_config),
      project_reference: body.project_reference || "",
      server_http_port: body.server_http_port || "80",
      server_debug_port: body.server_debug_port || "9229",
      project_preview_branch: body.project_preview_branch || "",
      project_preview_server: body.project_preview_server || "",
      project_preview_server_auth_token: encryptedPreviewToken,
    });

    // If using workspace, create relationship
    if (workspaceId) {
      await db.run(`
        MATCH (w:Workspace {id: $workspaceId}), (c:JSphereConfig {id: $configId})
        CREATE (w)-[:USED_BY]->(c)
      `, { workspaceId, configId });
    }

    ctx.response.body = { success: true, configId };
  } catch (error) {
    if (error instanceof ValidationError) {
      ctx.response.status = 400;
      ctx.response.body = { error: error.message, field: error.field };
    } else {
      ctx.response.status = 500;
      ctx.response.body = { error: "Failed to create config" };
    }
  }
});

// Update config
configRoutes.put("/api/configs/:id", async (ctx) => {
  const userId = ctx.state.userId;
  const configId = ctx.params.id;
  const body = await ctx.request.body({ type: "json" }).value;

  try {
    // Check ownership
    const configs = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(c:JSphereConfig {id: $configId})
      RETURN c
    `, { userId, configId });

    if (configs.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Config not found" };
      return;
    }

    const updateFields: any = { updated_at: "datetime()" };
    
    if (body.name) updateFields.name = sanitizeInput(body.name);
    if (body.project_auth_token) updateFields.project_auth_token = encrypt(body.project_auth_token);
    if (body.project_app_config) updateFields.project_app_config = sanitizeInput(body.project_app_config);
    if (body.project_reference !== undefined) updateFields.project_reference = body.project_reference;
    if (body.server_http_port) updateFields.server_http_port = body.server_http_port;
    if (body.server_debug_port) updateFields.server_debug_port = body.server_debug_port;
    if (body.project_preview_branch !== undefined) updateFields.project_preview_branch = body.project_preview_branch;
    if (body.project_preview_server !== undefined) updateFields.project_preview_server = body.project_preview_server;
    if (body.project_preview_server_auth_token !== undefined) {
      updateFields.project_preview_server_auth_token = body.project_preview_server_auth_token ? 
        encrypt(body.project_preview_server_auth_token) : null;
    }

    const setClause = Object.keys(updateFields)
      .map(key => `c.${key} = $${key}`)
      .join(", ");

    await db.run(`
      MATCH (c:JSphereConfig {id: $configId})
      SET ${setClause}
      RETURN c
    `, { configId, ...updateFields });

    ctx.response.body = { success: true };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to update config" };
  }
});

// Delete config
configRoutes.delete("/api/configs/:id", async (ctx) => {
  const userId = ctx.state.userId;
  const configId = ctx.params.id;

  try {
    const result = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(c:JSphereConfig {id: $configId})
      DETACH DELETE c
      RETURN count(c) as deleted
    `, { userId, configId });

    if (result[0]?.deleted === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Config not found" };
      return;
    }

    ctx.response.body = { success: true };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to delete config" };
  }
});

// Get GitHub projects for config
configRoutes.get("/api/configs/github/projects", async (ctx) => {
  const userId = ctx.state.userId;
  const namespace = ctx.request.url.searchParams.get("namespace");
  const token = ctx.request.url.searchParams.get("token");

  if (!namespace || !token) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Namespace and token are required" };
    return;
  }

  try {
    const repos = await github.getUserRepos(token);
    const projectRepos = repos.filter((repo: any) => 
      repo.name.startsWith('.') && repo.owner.login === namespace
    );

    ctx.response.body = { projects: projectRepos };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to fetch GitHub projects" };
  }
});

// Get app configs for a project
configRoutes.get("/api/configs/github/app-configs", async (ctx) => {
  const userId = ctx.state.userId;
  const namespace = ctx.request.url.searchParams.get("namespace");
  const project = ctx.request.url.searchParams.get("project");
  const token = ctx.request.url.searchParams.get("token");

  if (!namespace || !project || !token) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Namespace, project, and token are required" };
    return;
  }

  try {
    const appConfigs = await github.scanAppConfigs(namespace, `.${project}`, token);
    ctx.response.body = { appConfigs };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to fetch app configs" };
  }
});

// Validate GitHub credentials
configRoutes.post("/api/configs/github/validate", async (ctx) => {
  const userId = ctx.state.userId;
  const body = await ctx.request.body({ type: "json" }).value;

  if (!body.token || !body.namespace) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Token and namespace are required" };
    return;
  }

  try {
    // Validate token by getting user info
    const user = await github.getUser(body.token);
    
    // Check if the token belongs to the specified namespace (case-insensitive)
    if (user.login.toLowerCase() !== body.namespace.toLowerCase()) {
      ctx.response.status = 400;
      ctx.response.body = { 
        error: `Token belongs to '${user.login}', not '${body.namespace}'. Please use the correct username.`,
        actualUsername: user.login,
        expectedUsername: body.namespace
      };
      return;
    }

    ctx.response.body = { 
      valid: true, 
      username: user.login,
      name: user.name,
      avatar_url: user.avatar_url
    };
  } catch (error) {
    ctx.response.status = 400;
    ctx.response.body = { 
      valid: false, 
      error: "Invalid GitHub token or username" 
    };
  }
});

// Get repository tags/branches for project reference
configRoutes.get("/api/configs/github/references", async (ctx) => {
  const userId = ctx.state.userId;
  const namespace = ctx.request.url.searchParams.get("namespace");
  const project = ctx.request.url.searchParams.get("project");
  const token = ctx.request.url.searchParams.get("token");

  if (!namespace || !project || !token) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Namespace, project, and token are required" };
    return;
  }

  try {
    const [branches, tags] = await Promise.all([
      github.getRepoBranches(namespace, `.${project}`, token),
      github.getRepoTags(namespace, `.${project}`, token)
    ]);

    ctx.response.body = { 
      branches: branches.map((b: any) => b.name),
      tags: tags.map((t: any) => t.name)
    };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to fetch repository references" };
  }
});
