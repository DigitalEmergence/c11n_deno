import { Router } from "oak";
import { db } from "../services/database.ts";
import { github } from "../services/github.ts";
import { encrypt, decrypt } from "../services/encryption.ts";
import { validateRequired, validateLength, sanitizeInput, ValidationError } from "../utils/validation.ts";

export const workspaceRoutes = new Router();

// Get all workspaces for user
workspaceRoutes.get("/api/workspaces", async (ctx) => {
  const userId = ctx.state.userId;
  
  try {
    const workspaces = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(w:Workspace)
      RETURN w
      ORDER BY w.created_at DESC
    `, { userId });

    const workspaceList = workspaces.map((record: any) => {
      const workspace = record.w.properties;
      // Don't expose sensitive tokens
      delete workspace.project_auth_token;
      return workspace;
    });

    ctx.response.body = { workspaces: workspaceList };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to fetch workspaces" };
  }
});

// Get single workspace for user
workspaceRoutes.get("/api/workspaces/:id", async (ctx) => {
  const userId = ctx.state.userId;
  const workspaceId = ctx.params.id;
  
  try {
    const workspaces = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(w:Workspace {id: $workspaceId})
      RETURN w
    `, { userId, workspaceId });

    if (workspaces.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Workspace not found" };
      return;
    }

    const workspace = workspaces[0].w.properties;
    // Don't expose sensitive tokens in the response
    delete workspace.project_auth_token;

    ctx.response.body = { workspace };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to fetch workspace" };
  }
});

// Create new workspace
workspaceRoutes.post("/api/workspaces", async (ctx) => {
  const userId = ctx.state.userId;
  const body = await ctx.request.body({ type: "json" }).value;

  try {
    // Validation
    if (!validateRequired(body.name)) {
      throw new ValidationError("Workspace name is required", "name");
    }
    if (!validateLength(body.name, 1, 50)) {
      throw new ValidationError("Workspace name must be 1-50 characters", "name");
    }
    if (!validateRequired(body.project_namespace)) {
      throw new ValidationError("GitHub username is required", "project_namespace");
    }
    if (!validateRequired(body.project_auth_token)) {
      throw new ValidationError("GitHub token is required", "project_auth_token");
    }

    // Validate GitHub credentials
    try {
      const user = await github.getUser(body.project_auth_token);
      
      // Check if the token belongs to the specified namespace (case-insensitive)
      if (user.login.toLowerCase() !== body.project_namespace.toLowerCase()) {
        ctx.response.status = 400;
        ctx.response.body = { 
          error: `Token belongs to '${user.login}', not '${body.project_namespace}'. Please use the correct username.`,
          actualUsername: user.login,
          expectedUsername: body.project_namespace
        };
        return;
      }
    } catch (error) {
      ctx.response.status = 400;
      ctx.response.body = { 
        error: "Invalid GitHub token or username" 
      };
      return;
    }

    // Check for duplicate workspace names
    const existingWorkspaces = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(w:Workspace {name: $name})
      RETURN w
    `, { userId, name: sanitizeInput(body.name) });

    if (existingWorkspaces.length > 0) {
      throw new ValidationError("A workspace with this name already exists", "name");
    }

    const workspaceId = crypto.randomUUID();
    const encryptedToken = encrypt(body.project_auth_token);

    await db.run(`
      MATCH (u:User {github_id: $userId})
      CREATE (w:Workspace {
        id: $workspaceId,
        name: $name,
        project_host: $project_host,
        project_namespace: $project_namespace,
        project_auth_token: $project_auth_token,
        created_at: datetime(),
        updated_at: datetime()
      })
      CREATE (u)-[:OWNS]->(w)
      RETURN w
    `, {
      userId,
      workspaceId,
      name: sanitizeInput(body.name),
      project_host: "GitHub",
      project_namespace: sanitizeInput(body.project_namespace),
      project_auth_token: encryptedToken,
    });

    ctx.response.body = { success: true, workspaceId };
  } catch (error) {
    if (error instanceof ValidationError) {
      ctx.response.status = 400;
      ctx.response.body = { error: error.message, field: error.field };
    } else {
      ctx.response.status = 500;
      ctx.response.body = { error: "Failed to create workspace" };
    }
  }
});

// Update workspace
workspaceRoutes.put("/api/workspaces/:id", async (ctx) => {
  const userId = ctx.state.userId;
  const workspaceId = ctx.params.id;
  const body = await ctx.request.body({ type: "json" }).value;

  try {
    // Check ownership
    const workspaces = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(w:Workspace {id: $workspaceId})
      RETURN w
    `, { userId, workspaceId });

    if (workspaces.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Workspace not found" };
      return;
    }

    const updateFields: any = { updated_at: "datetime()" };
    
    // Validate and update name if provided
    if (body.name) {
      if (!validateLength(body.name, 1, 50)) {
        throw new ValidationError("Workspace name must be 1-50 characters", "name");
      }
      
      // Check for duplicate names (excluding current workspace)
      const existingWorkspaces = await db.run(`
        MATCH (u:User {github_id: $userId})-[:OWNS]->(w:Workspace {name: $name})
        WHERE w.id <> $workspaceId
        RETURN w
      `, { userId, name: sanitizeInput(body.name), workspaceId });

      if (existingWorkspaces.length > 0) {
        throw new ValidationError("A workspace with this name already exists", "name");
      }
      
      updateFields.name = sanitizeInput(body.name);
    }

    // Validate and update GitHub credentials if provided
    if (body.project_namespace && body.project_auth_token) {
      try {
        const user = await github.getUser(body.project_auth_token);
        
        // Check if the token belongs to the specified namespace (case-insensitive)
        if (user.login.toLowerCase() !== body.project_namespace.toLowerCase()) {
          ctx.response.status = 400;
          ctx.response.body = { 
            error: `Token belongs to '${user.login}', not '${body.project_namespace}'. Please use the correct username.`,
            actualUsername: user.login,
            expectedUsername: body.project_namespace
          };
          return;
        }
        
        updateFields.project_namespace = sanitizeInput(body.project_namespace);
        updateFields.project_auth_token = encrypt(body.project_auth_token);
      } catch (error) {
        ctx.response.status = 400;
        ctx.response.body = { 
          error: "Invalid GitHub token or username" 
        };
        return;
      }
    } else if (body.project_auth_token) {
      // Only token provided, validate against existing namespace
      const currentWorkspace = workspaces[0].w.properties;
      try {
        const user = await github.getUser(body.project_auth_token);
        
        if (user.login.toLowerCase() !== currentWorkspace.project_namespace.toLowerCase()) {
          ctx.response.status = 400;
          ctx.response.body = { 
            error: `Token belongs to '${user.login}', not '${currentWorkspace.project_namespace}'. Please use the correct username.`,
            actualUsername: user.login,
            expectedUsername: currentWorkspace.project_namespace
          };
          return;
        }
        
        updateFields.project_auth_token = encrypt(body.project_auth_token);
      } catch (error) {
        ctx.response.status = 400;
        ctx.response.body = { 
          error: "Invalid GitHub token" 
        };
        return;
      }
    }

    const setClause = Object.keys(updateFields)
      .map(key => `w.${key} = $${key}`)
      .join(", ");

    await db.run(`
      MATCH (w:Workspace {id: $workspaceId})
      SET ${setClause}
      RETURN w
    `, { workspaceId, ...updateFields });

    ctx.response.body = { success: true };
  } catch (error) {
    if (error instanceof ValidationError) {
      ctx.response.status = 400;
      ctx.response.body = { error: error.message, field: error.field };
    } else {
      ctx.response.status = 500;
      ctx.response.body = { error: "Failed to update workspace" };
    }
  }
});

// Delete workspace
workspaceRoutes.delete("/api/workspaces/:id", async (ctx) => {
  const userId = ctx.state.userId;
  const workspaceId = ctx.params.id;

  try {
    // Check if workspace is being used by any configs
    const usedByConfigs = await db.run(`
      MATCH (w:Workspace {id: $workspaceId})-[:USED_BY]->(c:JSphereConfig)
      RETURN count(c) as configCount
    `, { workspaceId });

    if (usedByConfigs[0]?.configCount > 0) {
      ctx.response.status = 400;
      ctx.response.body = { 
        error: "Cannot delete workspace that is being used by JSphere configs. Please update or delete the configs first." 
      };
      return;
    }

    const result = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(w:Workspace {id: $workspaceId})
      DETACH DELETE w
      RETURN count(w) as deleted
    `, { userId, workspaceId });

    if (result[0]?.deleted === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Workspace not found" };
      return;
    }

    ctx.response.body = { success: true };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to delete workspace" };
  }
});

// Validate workspace credentials
workspaceRoutes.post("/api/workspaces/:id/validate", async (ctx) => {
  const userId = ctx.state.userId;
  const workspaceId = ctx.params.id;

  try {
    // Get workspace
    const workspaces = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(w:Workspace {id: $workspaceId})
      RETURN w
    `, { userId, workspaceId });

    if (workspaces.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Workspace not found" };
      return;
    }

    const workspace = workspaces[0].w.properties;
    const decryptedToken = decrypt(workspace.project_auth_token);

    // Validate token by getting user info
    const user = await github.getUser(decryptedToken);
    
    // Check if the token still belongs to the specified namespace (case-insensitive)
    if (user.login.toLowerCase() !== workspace.project_namespace.toLowerCase()) {
      ctx.response.status = 400;
      ctx.response.body = { 
        error: `Token belongs to '${user.login}', not '${workspace.project_namespace}'. Please update the workspace credentials.`,
        actualUsername: user.login,
        expectedUsername: workspace.project_namespace
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
      error: "Invalid GitHub token or workspace not accessible" 
    };
  }
});

// Get GitHub projects for workspace
workspaceRoutes.get("/api/workspaces/:id/github/projects", async (ctx) => {
  const userId = ctx.state.userId;
  const workspaceId = ctx.params.id;

  try {
    // Get workspace
    const workspaces = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(w:Workspace {id: $workspaceId})
      RETURN w
    `, { userId, workspaceId });

    if (workspaces.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Workspace not found" };
      return;
    }

    const workspace = workspaces[0].w.properties;
    const decryptedToken = decrypt(workspace.project_auth_token);

    const repos = await github.getUserRepos(decryptedToken);
    const projectRepos = repos.filter((repo: any) => 
      repo.name.startsWith('.') && repo.owner.login === workspace.project_namespace
    );

    ctx.response.body = { projects: projectRepos };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to fetch GitHub projects" };
  }
});

// Get app configs for a workspace project
workspaceRoutes.get("/api/workspaces/:id/github/app-configs", async (ctx) => {
  const userId = ctx.state.userId;
  const workspaceId = ctx.params.id;
  const project = ctx.request.url.searchParams.get("project");

  if (!project) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Project parameter is required" };
    return;
  }

  try {
    // Get workspace
    const workspaces = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(w:Workspace {id: $workspaceId})
      RETURN w
    `, { userId, workspaceId });

    if (workspaces.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Workspace not found" };
      return;
    }

    const workspace = workspaces[0].w.properties;
    const decryptedToken = decrypt(workspace.project_auth_token);

    const appConfigs = await github.scanAppConfigs(workspace.project_namespace, project, decryptedToken);
    ctx.response.body = { appConfigs };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to fetch app configs" };
  }
});

// Get repository tags/branches for workspace project reference
workspaceRoutes.get("/api/workspaces/:id/github/references", async (ctx) => {
  const userId = ctx.state.userId;
  const workspaceId = ctx.params.id;
  const project = ctx.request.url.searchParams.get("project");

  if (!project) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Project parameter is required" };
    return;
  }

  try {
    // Get workspace
    const workspaces = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(w:Workspace {id: $workspaceId})
      RETURN w
    `, { userId, workspaceId });

    if (workspaces.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Workspace not found" };
      return;
    }

    const workspace = workspaces[0].w.properties;
    const decryptedToken = decrypt(workspace.project_auth_token);

    const [branches, tags] = await Promise.all([
      github.getRepoBranches(workspace.project_namespace, project, decryptedToken),
      github.getRepoTags(workspace.project_namespace, project, decryptedToken)
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

// Validate GitHub credentials before creating workspace
workspaceRoutes.post("/api/workspaces/validate-credentials", async (ctx) => {
  const body = await ctx.request.body({ type: "json" }).value;

  try {
    if (!validateRequired(body.project_namespace)) {
      throw new ValidationError("GitHub username is required", "project_namespace");
    }
    if (!validateRequired(body.project_auth_token)) {
      throw new ValidationError("GitHub token is required", "project_auth_token");
    }

    // Validate GitHub credentials
    const user = await github.getUser(body.project_auth_token);
    
    // Check if the token belongs to the specified namespace (case-insensitive)
    if (user.login.toLowerCase() !== body.project_namespace.toLowerCase()) {
      ctx.response.status = 400;
      ctx.response.body = { 
        error: `Token belongs to '${user.login}', not '${body.project_namespace}'. Please use the correct username.`,
        actualUsername: user.login,
        expectedUsername: body.project_namespace
      };
      return;
    }

    // Get projects for this user
    const repos = await github.getUserRepos(body.project_auth_token);
    const projectRepos = repos.filter((repo: any) => 
      repo.name.startsWith('.') && repo.owner.login === body.project_namespace
    );

    ctx.response.body = { 
      valid: true, 
      username: user.login,
      name: user.name,
      avatar_url: user.avatar_url,
      projects: projectRepos
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      ctx.response.status = 400;
      ctx.response.body = { error: error.message, field: error.field };
    } else {
      ctx.response.status = 400;
      ctx.response.body = { 
        valid: false, 
        error: "Invalid GitHub token or username" 
      };
    }
  }
});
