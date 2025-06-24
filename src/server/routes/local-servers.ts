import { Router } from "oak";
import { db } from "../services/database.ts";
import { decrypt } from "../services/encryption.ts";
import { validateRequired, ValidationError } from "../utils/validation.ts";

export const localServerRoutes = new Router();

// Get all local servers for user
localServerRoutes.get("/api/local-servers", async (ctx) => {
  const userId = ctx.state.userId;

  try {
    const servers = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(s:LocalServer)
      OPTIONAL MATCH (s)-[:RUNS]->(c:JSphereConfig)
      RETURN s, c
      ORDER BY s.created_at DESC
    `, { userId });

    const serverList = servers.map((record: any) => {
      const server = record.s.properties;
      const config = record.c?.properties;
      
      return {
        ...server,
        url: `http://localhost:${server.port}`,
        config: config ? { ...config, project_auth_token: undefined } : undefined
      };
    });

    ctx.response.body = { localServers: serverList };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to fetch local servers" };
  }
});

// Link local server
localServerRoutes.post("/api/local-servers", async (ctx) => {
  const userId = ctx.state.userId;
  const body = await ctx.request.body({ type: "json" }).value;

  try {
    // Validation
    if (!validateRequired(body.port)) {
      throw new ValidationError("Port is required", "port");
    }

    const port = parseInt(body.port);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new ValidationError("Invalid port number", "port");
    }

    // Check if any HTTP server is running on the port
    let serverType = 'unknown';
    let isJSphere = false;
    let connectionError = null;
    
    try {
      console.log(`🔍 Checking if HTTP server is running on port ${port}...`);
      
      // First try JSphere health endpoint
      try {
        const jsphereHealthCheck = await fetch(`http://localhost:${port}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000), // 3 second timeout
        });
        
        if (jsphereHealthCheck.ok) {
          const contentType = jsphereHealthCheck.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const healthData = await jsphereHealthCheck.json();
            console.log(`✅ JSphere server detected on port ${port}:`, healthData);
            serverType = 'jsphere';
            isJSphere = true;
          } else {
            console.log(`📡 HTTP server on port ${port} responded to /health but not JSphere format`);
            connectionError = "Server responded but does not appear to be a JSphere instance";
          }
        } else {
          connectionError = `Server responded with status ${jsphereHealthCheck.status}`;
        }
      } catch (jsphereError) {
        console.log(`📡 /health endpoint not available on port ${port}, trying root path...`);
        
        // If not JSphere, try root path to see if any HTTP server is running
        try {
          const rootCheck = await fetch(`http://localhost:${port}/`, {
            method: 'GET',
            signal: AbortSignal.timeout(3000), // 3 second timeout
          });
          
          console.log(`📡 Root path response for port ${port}: ${rootCheck.status} ${rootCheck.statusText}`);
          
          if (rootCheck.ok) {
            const contentType = rootCheck.headers.get('content-type') || '';
            
            if (contentType.includes('text/html')) {
              serverType = 'html';
              console.log(`✅ HTML server detected on port ${port}`);
            } else if (contentType.includes('application/json')) {
              serverType = 'json';
              console.log(`✅ JSON API server detected on port ${port}`);
            } else {
              serverType = 'other';
              console.log(`✅ HTTP server detected on port ${port} (${contentType})`);
            }
          } else {
            connectionError = `HTTP server returned ${rootCheck.status}`;
          }
        } catch (rootError) {
          connectionError = `Cannot connect to server: ${(rootError as Error).message}`;
        }
      }
      
    } catch (error) {
      console.error(`❌ Cannot connect to HTTP server on port ${port}:`, (error as Error).message);
      connectionError = `Cannot connect to server: ${(error as Error).message}`;
    }

    // We'll create the server entry regardless of connection status
    // This allows users to add servers that may be temporarily down

    const serverId = crypto.randomUUID();
    console.log(`🆔 Generated server ID: ${serverId} for port ${port}`);

    // Create local server record
    console.log(`💾 Creating local server record in database...`);
    const result = await db.run(`
      MATCH (u:User {github_id: $userId})
      CREATE (s:LocalServer {
        id: $serverId,
        port: $port,
        status: "connecting",
        last_ping: datetime(),
        created_at: datetime()
      })
      CREATE (u)-[:OWNS]->(s)
      RETURN s
    `, {
      userId,
      serverId,
      port: port.toString(),
    });

    const server = result[0].s.properties;
    console.log(`✅ Local server record created:`, server);

    // Set status based on connection and JSphere detection
    let finalStatus = "idle";
    if (connectionError) {
      finalStatus = "unlinked";
      console.log(`⚠️ Setting server status to 'unlinked' due to connection error: ${connectionError}`);
    } else if (isJSphere) {
      // For JSphere servers, do a more thorough health check
      try {
        console.log(`🔍 Performing JSphere health check for server ${serverId}...`);
        const healthCheck = await fetch(`http://localhost:${port}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000), // 3 second timeout for initial check
        });
        
        console.log(`📡 JSphere health check response: ${healthCheck.status} ${healthCheck.statusText}`);
        
        if (healthCheck.ok) {
          const healthData = await healthCheck.json();
          console.log(`✅ JSphere health check data:`, healthData);
          finalStatus = "idle"; // JSphere server is ready for config
        } else {
          finalStatus = "error";
        }
      } catch (error) {
        finalStatus = "error";
        console.error(`❌ JSphere health check failed for server ${serverId}:`, (error as Error).message);
      }
    } else if (serverType !== 'unknown') {
      // For non-JSphere servers, we already confirmed they respond to HTTP
      console.log(`✅ Non-JSphere HTTP server linked successfully on port ${port} (${serverType})`);
      finalStatus = "idle"; // Ready for potential config loading
    } else {
      finalStatus = "unlinked";
      console.log(`⚠️ Setting server status to 'unlinked' - no server detected`);
    }

    // Update server status based on health check and connection
    console.log(`📝 Updating server status to: ${finalStatus}`);
    await db.run(`
      MATCH (s:LocalServer {id: $serverId})
      SET s.status = $status, s.last_ping = datetime(), s.is_healthy = $isHealthy
      RETURN s
    `, { serverId, status: finalStatus, isHealthy: !connectionError && (isJSphere || serverType !== 'unknown') });

    // Send config if provided
    let config = null;
    if (body.configId) {
      try {
        console.log(`📋 Loading config ${body.configId} to server ${serverId}...`);
        await loadConfigToLocalServer(userId, serverId, body.configId);
        
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
        console.error(`❌ Failed to load config to local server ${serverId}:`, (error as Error).message);
      }
    }

    // Return complete server object
    const localServer = {
      ...server,
      status: finalStatus,
      url: `http://localhost:${port}`,
      config: config
    };

    console.log(`📤 Sending response for server ${serverId}:`, {
      id: localServer.id,
      port: localServer.port,
      status: localServer.status,
      url: localServer.url,
      hasConfig: !!localServer.config
    });

    ctx.response.body = { 
      success: true, 
      localServer: localServer
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      ctx.response.status = 400;
      ctx.response.body = { error: error.message, field: error.field };
    } else {
      ctx.response.status = 500;
      ctx.response.body = { error: "Failed to link local server" };
    }
  }
});

// Unlink local server
localServerRoutes.delete("/api/local-servers/:id", async (ctx) => {
  const userId = ctx.state.userId;
  const serverId = ctx.params.id;

  try {
    const result = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(s:LocalServer {id: $serverId})
      DETACH DELETE s
      RETURN count(s) as deleted
    `, { userId, serverId });

    if (result[0]?.deleted === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Local server not found" };
      return;
    }

    ctx.response.body = { success: true };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to unlink local server" };
  }
});

// Load config to local server
localServerRoutes.post("/api/local-servers/:id/load-config", async (ctx) => {
  const userId = ctx.state.userId;
  const serverId = ctx.params.id;
  const { configId } = await ctx.request.body({ type: "json" }).value;

  try {
    await loadConfigToLocalServer(userId, serverId, configId);
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

// Checkout package to local server
localServerRoutes.post("/api/local-servers/:id/checkout", async (ctx) => {
  const userId = ctx.state.userId;
  const serverId = ctx.params.id;
  const { packageName, configName } = await ctx.request.body({ type: "json" }).value;

  try {
    // Get server info
    const servers = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(s:LocalServer {id: $serverId})
      RETURN s
    `, { userId, serverId });

    if (servers.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Local server not found" };
      return;
    }

    const server = servers[0].s.properties;
    
    // Send checkout command to local JSphere server
    const checkoutResponse = await fetch(`http://localhost:${server.port}/@cmd/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        command: `${configName}/${packageName}`
      })
    });

    if (!checkoutResponse.ok) {
      throw new Error("Checkout command failed");
    }

    ctx.response.body = { success: true };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to checkout package" };
  }
});

// Health check endpoint for local servers
localServerRoutes.get("/api/local-servers/:id/health", async (ctx) => {
  const userId = ctx.state.userId;
  const serverId = ctx.params.id;

  try {
    // Get server info
    const servers = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(s:LocalServer {id: $serverId})
      RETURN s
    `, { userId, serverId });

    if (servers.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Local server not found" };
      return;
    }

    const server = servers[0].s.properties;
    
    // Check if local server is actually running
    let isHealthy = false;
    let healthError = null;
    
    try {
      const healthCheck = await fetch(`http://localhost:${server.port}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
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
      MATCH (s:LocalServer {id: $serverId})
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

// Ping endpoint for local servers
localServerRoutes.post("/api/local-servers/:id/ping", async (ctx) => {
  const userId = ctx.state.userId;
  const serverId = ctx.params.id;

  try {
    await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(s:LocalServer {id: $serverId})
      SET s.last_ping = datetime(), s.status = "active"
      RETURN s
    `, { userId, serverId });

    ctx.response.body = { success: true };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to update ping" };
  }
});

// Helper function to load config to local server
async function loadConfigToLocalServer(userId: string, serverId: string, configId: string) {
  // Check ownership of both server and config
  const result = await db.run(`
    MATCH (u:User {github_id: $userId})-[:OWNS]->(s:LocalServer {id: $serverId})
    MATCH (u)-[:OWNS]->(c:JSphereConfig {id: $configId})
    RETURN s, c
  `, { userId, serverId, configId });

  if (result.length === 0) {
    throw new ValidationError("Local server or config not found");
  }

  const server = result[0].s.properties;
  const config = result[0].c.properties;

  // Create relationship
  await db.run(`
    MATCH (s:LocalServer {id: $serverId}), (c:JSphereConfig {id: $configId})
    MERGE (s)-[:RUNS]->(c)
  `, { serverId, configId });

  // Send config to local JSphere server
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

  console.log(`📤 Sending config to JSphere server on port ${server.port}:`, {
    configName: config.name,
    projectName: config.project_name,
    appConfig: config.project_app_config,
    httpPort: config.server_http_port
  });

  const response = await fetch(`http://localhost:${server.port}/@cmd/loadconfig`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(jsphereConfig)
  });

  console.log(`📡 JSphere config load response: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Failed to load config to JSphere server: ${response.status} - ${errorText}`);
    throw new Error("Failed to load config to local server");
  }

  const responseData = await response.json();
  console.log(`✅ Config loaded successfully to JSphere server:`, responseData);

  // Update server status
  await db.run(`
    MATCH (s:LocalServer {id: $serverId})
    SET s.status = "active", s.last_ping = datetime()
  `, { serverId });
}

// Get package status from app config
localServerRoutes.get("/api/local-servers/:id/packages", async (ctx) => {
  const userId = ctx.state.userId;
  const serverId = ctx.params.id;

  try {
    // Get server and its config
    const result = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(s:LocalServer {id: $serverId})
      OPTIONAL MATCH (s)-[:RUNS]->(c:JSphereConfig)
      RETURN s, c
    `, { userId, serverId });

    if (result.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Local server not found" };
      return;
    }

    const server = result[0].s.properties;
    const config = result[0].c?.properties;

    if (!config) {
      ctx.response.body = { packages: [] };
      return;
    }

    // Fetch app config from GitHub to get package definitions
    const appConfigUrl = `https://api.github.com/repos/${config.project_namespace}/${config.project_name}/contents/${config.project_app_config}`;
    const appConfigResponse = await fetch(appConfigUrl, {
      headers: {
        'Authorization': `token ${decrypt(config.project_auth_token)}`,
        'Accept': 'application/vnd.github.v3.raw'
      }
    });

    if (!appConfigResponse.ok) {
      throw new Error("Failed to fetch app config");
    }

    const appConfigContent = await appConfigResponse.text();
    const appConfig = JSON.parse(appConfigContent);

    // Get package status from JSphere server
    let packageStatuses: { [key: string]: string } = {};
    try {
      const statusResponse = await fetch(`http://localhost:${server.port}/@cmd/status`, {
        method: 'POST',
        headers: {
          'Authorization': `token ${server.server_auth_token || 'default'}`,
          'Content-Type': 'application/json',
        }
      });

      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        packageStatuses = statusData.packages || {};
      }
    } catch (error) {
      console.error("Failed to get package status from JSphere:", error);
    }

    // Combine app config packages with status
    const packages = Object.entries(appConfig.packages || {}).map(([name, packageConfig]: [string, any]) => {
      const status = packageStatuses[name] || 'not-checked-out';
      return {
        name,
        reference: packageConfig.reference || 'main',
        alias: packageConfig.alias || null,
        status,
        description: `Package ${name}${packageConfig.alias ? ` (${packageConfig.alias})` : ''} on ${packageConfig.reference || 'main'}`
      };
    });

    ctx.response.body = { packages };
  } catch (error) {
    console.error("Failed to get package status:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to get package status" };
  }
});
