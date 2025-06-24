import { Router } from "oak";
import { db } from "../services/database.ts";
import { decrypt } from "../services/encryption.ts";
import { validateRequired, ValidationError } from "../utils/validation.ts";

export const remoteServerRoutes = new Router();

// Get all remote servers for user
remoteServerRoutes.get("/api/remote-servers", async (ctx) => {
  const userId = ctx.state.userId;

  try {
    const servers = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(s:RemoteServer)
      OPTIONAL MATCH (s)-[:RUNS]->(c:JSphereConfig)
      RETURN s, c
      ORDER BY s.created_at DESC
    `, { userId });

    const serverList = servers.map((record: any) => {
      const server = record.s.properties;
      const config = record.c?.properties;
      
      return {
        ...server,
        config: config ? { ...config, project_auth_token: undefined } : undefined
      };
    });

    ctx.response.body = { remoteServers: serverList };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to fetch remote servers" };
  }
});

// Link remote server
remoteServerRoutes.post("/api/remote-servers", async (ctx) => {
  const userId = ctx.state.userId;
  const body = await ctx.request.body({ type: "json" }).value;

  try {
    // Validation
    if (!validateRequired(body.name)) {
      throw new ValidationError("Server name is required", "name");
    }

    if (!validateRequired(body.url)) {
      throw new ValidationError("Server URL is required", "url");
    }

    // Basic URL validation
    let serverUrl: URL;
    try {
      serverUrl = new URL(body.url);
      if (!['http:', 'https:'].includes(serverUrl.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch (error) {
      throw new ValidationError("Invalid URL format. Please use http:// or https://", "url");
    }

    // Check if remote server is accessible and is a JSphere instance
    let isJSphere = false;
    let connectionError = null;
    
    try {
      console.log(`🔍 Checking if JSphere server is running at ${body.url}...`);
      
      const jsphereHealthCheck = await fetch(`${body.url}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000), // 10 second timeout for remote servers
      });
      
      if (jsphereHealthCheck.ok) {
        const contentType = jsphereHealthCheck.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const healthData = await jsphereHealthCheck.json();
          console.log(`✅ JSphere server detected at ${body.url}:`, healthData);
          isJSphere = true;
        } else {
          console.log(`📡 HTTP server at ${body.url} responded to /health but not JSphere format`);
          connectionError = "Server responded but does not appear to be a JSphere instance";
        }
      } else {
        connectionError = `Server responded with status ${jsphereHealthCheck.status}`;
      }
    } catch (error) {
      console.error(`❌ Cannot connect to server at ${body.url}:`, (error as Error).message);
      connectionError = `Cannot connect to server: ${(error as Error).message}`;
    }

    // We'll create the server entry regardless of connection status
    // This allows users to add servers that may be temporarily down or have auth issues

    const serverId = crypto.randomUUID();
    console.log(`🆔 Generated remote server ID: ${serverId} for ${body.url}`);

    // Create remote server record
    console.log(`💾 Creating remote server record in database...`);
    const result = await db.run(`
      MATCH (u:User {github_id: $userId})
      CREATE (s:RemoteServer {
        id: $serverId,
        name: $name,
        url: $url,
        status: "connecting",
        last_ping: datetime(),
        created_at: datetime()
      })
      CREATE (u)-[:OWNS]->(s)
      RETURN s
    `, {
      userId,
      serverId,
      name: body.name,
      url: body.url,
    });

    const server = result[0].s.properties;
    console.log(`✅ Remote server record created:`, server);

    // Perform initial health check
    let healthStatus = "idle";
    
    try {
      console.log(`🔍 Performing JSphere health check for remote server ${serverId}...`);
      const healthCheck = await fetch(`${body.url}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });
      
      console.log(`📡 JSphere health check response: ${healthCheck.status} ${healthCheck.statusText}`);
      
      if (healthCheck.ok) {
        const healthData = await healthCheck.json();
        console.log(`✅ JSphere health check data:`, healthData);
        healthStatus = "idle";
      } else {
        healthStatus = "error";
      }
    } catch (error) {
      healthStatus = "error";
      console.error(`❌ JSphere health check failed for remote server ${serverId}:`, (error as Error).message);
    }

    // Set status based on connection and JSphere detection
    let finalStatus = "idle";
    if (connectionError) {
      finalStatus = "unlinked";
      console.log(`⚠️ Setting server status to 'unlinked' due to connection error: ${connectionError}`);
    } else if (isJSphere) {
      finalStatus = healthStatus; // Use the health check result
    } else {
      finalStatus = "unlinked";
      console.log(`⚠️ Setting server status to 'unlinked' - not a JSphere instance`);
    }

    // Update server status based on health check and connection
    console.log(`📝 Updating remote server status to: ${finalStatus}`);
    await db.run(`
      MATCH (s:RemoteServer {id: $serverId})
      SET s.status = $status, s.last_ping = datetime(), s.is_healthy = $isHealthy
      RETURN s
    `, { serverId, status: finalStatus, isHealthy: isJSphere && healthStatus !== "error" });

    // Send config if provided
    let config = null;
    if (body.configId) {
      try {
        console.log(`📋 Loading config ${body.configId} to remote server ${serverId}...`);
        await loadConfigToRemoteServer(userId, serverId, body.configId);
        
        // Get the config details for response
        const configResult = await db.run(`
          MATCH (c:JSphereConfig {id: $configId})
          RETURN c
        `, { configId: body.configId });
        
        if (configResult.length > 0) {
          config = configResult[0].c.properties;
          // Remove sensitive data
          delete config.project_auth_token;
          delete config.project_preview_server_auth_token;
          console.log(`✅ Config loaded and retrieved for response:`, { name: config.name, project_name: config.project_name });
        }
      } catch (error) {
        console.error(`❌ Failed to load config to remote server ${serverId}:`, (error as Error).message);
        
        // Don't let config loading errors prevent server creation
        // Just log the error and continue - the server will be created without config
        if (error instanceof ValidationError) {
          console.log(`⚠️ Config loading failed due to validation error: ${error.message}`);
          // For validation errors (like config not found), just set status to idle
          // The server was created successfully, just without the config
        } else if ((error as Error).message.includes('Invalid authentication token')) {
          finalStatus = "unlinked";
          console.log(`🔐 Config loading failed due to auth, setting final status to 'unlinked'`);
        } else if ((error as Error).message.includes('fetch') || (error as Error).message.includes('connect')) {
          finalStatus = "unlinked";
          console.log(`🌐 Config loading failed due to network error, setting final status to 'unlinked'`);
        }
        
        // Important: Don't re-throw the error here - let the server creation succeed
        // The error has been logged and handled appropriately
      }
    }

    // Get the updated server status (in case it was changed during config loading)
    const updatedServerResult = await db.run(`
      MATCH (s:RemoteServer {id: $serverId})
      RETURN s
    `, { serverId });
    
    const updatedServer = updatedServerResult[0]?.s.properties || server;
    const actualStatus = updatedServer.status || finalStatus;

    // Return complete server object
    const remoteServer = {
      ...updatedServer,
      status: actualStatus,
      config: config
    };

    console.log(`📤 Sending response for remote server ${serverId}:`, {
      id: remoteServer.id,
      name: remoteServer.name,
      url: remoteServer.url,
      status: remoteServer.status,
      hasConfig: !!remoteServer.config
    });

    ctx.response.body = { 
      success: true, 
      remoteServer: remoteServer
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      ctx.response.status = 400;
      ctx.response.body = { error: error.message, field: error.field };
    } else {
      ctx.response.status = 500;
      ctx.response.body = { error: "Failed to link remote server" };
    }
  }
});

// Unlink remote server
remoteServerRoutes.delete("/api/remote-servers/:id", async (ctx) => {
  const userId = ctx.state.userId;
  const serverId = ctx.params.id;

  try {
    const result = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(s:RemoteServer {id: $serverId})
      DETACH DELETE s
      RETURN count(s) as deleted
    `, { userId, serverId });

    if (result[0]?.deleted === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Remote server not found" };
      return;
    }

    ctx.response.body = { success: true };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to unlink remote server" };
  }
});

// Load config to remote server
remoteServerRoutes.post("/api/remote-servers/:id/load-config", async (ctx) => {
  const userId = ctx.state.userId;
  const serverId = ctx.params.id;
  const { configId } = await ctx.request.body({ type: "json" }).value;

  try {
    await loadConfigToRemoteServer(userId, serverId, configId);
    ctx.response.body = { success: true };
  } catch (error) {
    if (error instanceof ValidationError) {
      ctx.response.status = 400;
      ctx.response.body = { error: error.message };
    } else {
      ctx.response.status = 500;
      ctx.response.body = { error: "Failed to load config" };
    }
  }
});

// Health check endpoint for remote servers
remoteServerRoutes.get("/api/remote-servers/:id/health", async (ctx) => {
  const userId = ctx.state.userId;
  const serverId = ctx.params.id;

  try {
    // Get server info
    const servers = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(s:RemoteServer {id: $serverId})
      RETURN s
    `, { userId, serverId });

    if (servers.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Remote server not found" };
      return;
    }

    const server = servers[0].s.properties;
    
    // Check if remote server is actually running
    let isHealthy = false;
    let healthError = null;
    
    try {
      const healthCheck = await fetch(`${server.url}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000), // 10 second timeout for remote servers
      });
      
      isHealthy = healthCheck.ok;
      if (!isHealthy) {
        healthError = `Health check returned ${healthCheck.status}`;
      }
    } catch (error) {
      isHealthy = false;
      healthError = (error as Error).message;
    }

    // Update server health status in database
    const newStatus = isHealthy ? "idle" : "error";
    await db.run(`
      MATCH (s:RemoteServer {id: $serverId})
      SET s.last_ping = datetime(), s.status = $status, s.is_healthy = $isHealthy
      RETURN s
    `, { serverId, status: newStatus, isHealthy });

    ctx.response.body = { 
      isHealthy,
      status: newStatus,
      error: healthError
    };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to check server health" };
  }
});

// Ping endpoint for remote servers
remoteServerRoutes.post("/api/remote-servers/:id/ping", async (ctx) => {
  const userId = ctx.state.userId;
  const serverId = ctx.params.id;

  try {
    await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(s:RemoteServer {id: $serverId})
      SET s.last_ping = datetime(), s.status = "active"
      RETURN s
    `, { userId, serverId });

    ctx.response.body = { success: true };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to update ping" };
  }
});

// Helper function to load config to remote server
async function loadConfigToRemoteServer(userId: string, serverId: string, configId: string) {
  // Check ownership of both server and config
  const result = await db.run(`
    MATCH (u:User {github_id: $userId})-[:OWNS]->(s:RemoteServer {id: $serverId})
    MATCH (u)-[:OWNS]->(c:JSphereConfig {id: $configId})
    RETURN s, c
  `, { userId, serverId, configId });

  if (result.length === 0) {
    throw new ValidationError("Remote server or config not found");
  }

  const server = result[0].s.properties;
  const config = result[0].c.properties;

  // Create relationship
  await db.run(`
    MATCH (s:RemoteServer {id: $serverId}), (c:JSphereConfig {id: $configId})
    MERGE (s)-[:RUNS]->(c)
  `, { serverId, configId });

  // Send config to remote JSphere server
  const jsphereConfig = {
    defaultConfiguration: config.name,
    configurations: {
      [config.name]: {
        PROJECT_HOST: config.project_host,
        PROJECT_NAMESPACE: config.project_namespace,
        PROJECT_AUTH_TOKEN: decrypt(config.project_auth_token),
        PROJECT_NAME: config.project_name,
        PROJECT_APP_CONFIG: config.project_app_config,
        PROJECT_REFERENCE: config.project_reference,
        SERVER_HTTP_PORT: config.server_http_port,
        SERVER_DEBUG_PORT: config.server_debug_port,
        PROJECT_PREVIEW_BRANCH: config.project_preview_branch,
        PROJECT_PREVIEW_SERVER: config.project_preview_server,
        PROJECT_PREVIEW_SERVER_AUTH_TOKEN: config.project_preview_server_auth_token ? 
          decrypt(config.project_preview_server_auth_token) : null,
      }
    }
  };

  console.log(`📤 Sending config to remote JSphere server at ${server.url}:`, {
    configName: config.name,
    projectName: config.project_name,
    appConfig: config.project_app_config,
    httpPort: config.server_http_port
  });

  try {
    const response = await fetch(`${server.url}/@cmd/loadconfig`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jsphereConfig)
    });

    console.log(`📡 Remote JSphere config load response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Failed to load config to remote JSphere server: ${response.status} - ${errorText}`);
      
      // Check if it's an authentication error
      if (response.status === 401 || response.status === 403 || errorText.includes('Invalid token') || errorText.includes('Unauthorized')) {
        console.log(`🔐 Authentication error detected, setting server status to 'unlinked'`);
        // Update server status to unlinked due to auth issues
        await db.run(`
          MATCH (s:RemoteServer {id: $serverId})
          SET s.status = "unlinked", s.last_ping = datetime()
        `, { serverId });
        throw new Error("Invalid authentication token");
      }
      
      throw new Error("Failed to load config to remote server");
    }

    const responseData = await response.json();
    console.log(`✅ Config loaded successfully to remote JSphere server:`, responseData);

    // Update server status to active on successful config load
    await db.run(`
      MATCH (s:RemoteServer {id: $serverId})
      SET s.status = "active", s.last_ping = datetime()
    `, { serverId });
  } catch (error) {
    // If it's a network error or connection issue, set status to unlinked
    if ((error as Error).message.includes('fetch') || (error as Error).message.includes('connect')) {
      console.log(`🌐 Network error detected, setting server status to 'unlinked'`);
      await db.run(`
        MATCH (s:RemoteServer {id: $serverId})
        SET s.status = "unlinked", s.last_ping = datetime()
      `, { serverId });
    }
    throw error;
  }
}
