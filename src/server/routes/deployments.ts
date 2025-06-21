import { Router } from "oak";
import { db } from "../services/database.ts";
import { gcp } from "../services/gcp.ts";
import { decrypt } from "../services/encryption.ts";
import { validateDeploymentName, validateRequired, ValidationError } from "../utils/validation.ts";

export const deploymentRoutes = new Router();

// Store for SSE connections
const sseConnections = new Map<string, Set<any>>();

// Helper function to broadcast real-time updates
export function broadcastDeploymentUpdate(userId: string, data: any) {
  const userConnections = sseConnections.get(userId);
  if (userConnections) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    for (const controller of userConnections) {
      try {
        controller.enqueue(new TextEncoder().encode(message));
      } catch (error) {
        console.error('Failed to send SSE message:', error);
        userConnections.delete(controller);
      }
    }
  }
}

// Helper function to generate fallback metrics when GCP is unavailable
function generateFallbackMetrics(deploymentName: string, status: string) {
  const now = new Date();
  const baseValue = Math.abs(deploymentName.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % 100;
  
  return {
    requests: status === 'active' ? baseValue + Math.floor(Math.random() * 50) : 0,
    request_latencies: {
      p50: status === 'active' ? 50 + Math.floor(Math.random() * 30) : 0,
      p90: status === 'active' ? 120 + Math.floor(Math.random() * 50) : 0,
      p95: status === 'active' ? 180 + Math.floor(Math.random() * 70) : 0,
      p99: status === 'active' ? 300 + Math.floor(Math.random() * 100) : 0,
    },
    cpu_utilization: status === 'active' ? 0.1 + Math.random() * 0.3 : 0,
    memory_utilization: status === 'active' ? 0.2 + Math.random() * 0.4 : 0,
    instances: status === 'active' ? 1 : 0,
    billable_time_seconds: status === 'active' ? baseValue * 60 : 0,
    timestamp: now.toISOString(),
    fallback: true,
    fallback_reason: status === 'service-not-found' ? 'Service not found in GCP' : 
                     status === 'api-error' ? 'GCP API error' : 
                     'GCP not connected'
  };
}

// Helper function to generate fallback logs
function generateFallbackLogs(deploymentName: string, status: string) {
  const now = new Date();
  const logs = [];
  
  if (status === 'active') {
    logs.push({
      timestamp: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      severity: 'INFO',
      message: `JSphere server started for deployment: ${deploymentName}`,
      source: 'jsphere-server',
      trace: null,
      labels: { deployment: deploymentName },
      httpRequest: null,
      operation: null,
      sourceLocation: null,
    });
    
    logs.push({
      timestamp: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
      severity: 'INFO',
      message: 'Health check endpoint responding',
      source: 'jsphere-server',
      trace: null,
      labels: { deployment: deploymentName },
      httpRequest: null,
      operation: null,
      sourceLocation: null,
    });
  }
  
  logs.push({
    timestamp: now.toISOString(),
    severity: 'WARNING',
    message: 'Displaying fallback logs - GCP logging unavailable',
    source: 'c11n-platform',
    trace: null,
    labels: { deployment: deploymentName, fallback: 'true' },
    httpRequest: null,
    operation: null,
    sourceLocation: null,
  });
  
  return logs;
}

// Get all deployments for user
deploymentRoutes.get("/api/deployments", async (ctx) => {
  const userId = ctx.state.userId;

  try {
    const deployments = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(d:Deployment)
      OPTIONAL MATCH (d)-[:USES]->(p:ServiceProfile)
      OPTIONAL MATCH (d)-[:RUNS]->(c:JSphereConfig)
      RETURN d, p, c
      ORDER BY d.created_at DESC
    `, { userId });

    const deploymentList = deployments.map(record => {
      const deployment = record.d.properties;
      const profile = record.p?.properties;
      const config = record.c?.properties;
      
      return {
        ...deployment,
        profile,
        config: config ? { ...config, project_auth_token: undefined } : undefined
      };
    });

    ctx.response.body = { deployments: deploymentList };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to fetch deployments" };
  }
});

// Create new deployment
deploymentRoutes.post("/api/deployments", async (ctx) => {
  const userId = ctx.state.userId;
  const body = await ctx.request.body({ type: "json" }).value;

  try {
    // Validation
    if (!validateRequired(body.name)) {
      throw new ValidationError("Deployment name is required", "name");
    }
    if (!validateDeploymentName(body.name)) {
      throw new ValidationError("Invalid deployment name format", "name");
    }
    if (!validateRequired(body.serviceProfileId)) {
      throw new ValidationError("Service profile is required", "serviceProfileId");
    }

    // Get user's info and check deployment limits
    const users = await db.run(`
      MATCH (u:User {github_id: $userId})
      RETURN u
    `, { userId });

    const user = users[0]?.u.properties;
    if (!user?.gcp_access_token || !user?.gcp_project_id) {
      ctx.response.status = 400;
      ctx.response.body = { error: "GCP account not connected" };
      return;
    }

    // Get service profile
    const serviceProfiles = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(sp:ServiceProfile {id: $serviceProfileId})
      RETURN sp
    `, { userId, serviceProfileId: body.serviceProfileId });

    if (serviceProfiles.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Service profile not found" };
      return;
    }

    const serviceProfile = serviceProfiles[0].sp.properties;

    console.log("📝 Deployment Creation: copying billing from service profile");
    console.log("📋 Service profile billing:", serviceProfile.billing);
    console.log("📋 Service profile data:", {
      name: serviceProfile.name,
      billing: serviceProfile.billing,
      region: serviceProfile.region
    });

    // Check deployment limits based on plan
    const deploymentCount = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(d:Deployment)
      WHERE d.status IN ["active", "idle", "creating"]
      RETURN count(d) as count
    `, { userId });

    const currentDeployments = deploymentCount[0]?.count || 0;
    const deploymentLimit = user.plan === "developer" ? 10 : 1;

    if (currentDeployments >= deploymentLimit) {
      ctx.response.status = 400;
      ctx.response.body = { 
        error: `Deployment limit reached. ${user.plan === "developer" ? "Developer" : "Free"} plan allows ${deploymentLimit} deployment${deploymentLimit > 1 ? "s" : ""}.`,
        limit_reached: true,
        current_plan: user.plan || "free"
      };
      return;
    }

    const deploymentId = crypto.randomUUID();

    // Create deployment record using service profile specifications
    await db.run(`
      MATCH (u:User {github_id: $userId}), (sp:ServiceProfile {id: $serviceProfileId})
      CREATE (d:Deployment {
        id: $deploymentId,
        name: $name,
        status: "creating",
        container_image_url: sp.container_image_url,
        container_port: sp.container_port,
        memory: sp.memory,
        cpu: sp.cpu,
        max_instances: sp.max_instances,
        timeout: sp.timeout,
        concurrency: sp.concurrency,
        execution_environment: sp.execution_environment,
        cpu_boost: sp.cpu_boost,
        billing: sp.billing,
        region: sp.region,
        gcp_project_id: $gcp_project_id,
        server_auth_token: sp.server_auth_token,
        environment_variables: sp.environment_variables,
        created_at: datetime(),
        updated_at: datetime()
      })
      CREATE (u)-[:OWNS]->(d)
      CREATE (d)-[:USES]->(sp)
      RETURN d
    `, {
      userId,
      serviceProfileId: body.serviceProfileId,
      deploymentId,
      name: body.name,
      gcp_project_id: user.gcp_project_id,
    });

    // Link config if provided
    if (body.configId) {
      await db.run(`
        MATCH (d:Deployment {id: $deploymentId}), (c:JSphereConfig {id: $configId})
        CREATE (d)-[:RUNS]->(c)
      `, { deploymentId, configId: body.configId });
    }

    // Deploy to GCP asynchronously
    deployToGCP(deploymentId, user);

    ctx.response.body = { success: true, deploymentId };
  } catch (error) {
    if (error instanceof ValidationError) {
      ctx.response.status = 400;
      ctx.response.body = { error: error.message, field: error.field };
    } else {
      ctx.response.status = 500;
      ctx.response.body = { error: "Failed to create deployment" };
    }
  }
});

// Delete deployment
deploymentRoutes.delete("/api/deployments/:id", async (ctx) => {
  const userId = ctx.state.userId;
  const deploymentId = ctx.params.id;

  try {
    // Get deployment info
    const deployments = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(d:Deployment {id: $deploymentId})
      RETURN d, u
    `, { userId, deploymentId });

    if (deployments.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Deployment not found" };
      return;
    }

    const deployment = deployments[0].d.properties;
    const user = deployments[0].u.properties;

    // Delete from GCP if it exists
    if (deployment.cloud_run_service_name && user.gcp_access_token) {
      try {
        const accessToken = decrypt(user.gcp_access_token);
        await gcp.deleteCloudRunService(
          user.gcp_project_id,
          deployment.region,
          deployment.cloud_run_service_name,
          accessToken
        );
      } catch (error) {
        console.error("Failed to delete Cloud Run service:", error);
        // Continue with database deletion even if GCP deletion fails
        // The service might have been manually deleted already
      }
    }

    // Delete from database
    await db.run(`
      MATCH (d:Deployment {id: $deploymentId})
      DETACH DELETE d
    `, { deploymentId });

    ctx.response.body = { success: true };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to delete deployment" };
  }
});

// Get deployment metrics
deploymentRoutes.get("/api/deployments/:id/metrics", async (ctx) => {
  const userId = ctx.state.userId;
  const deploymentId = ctx.params.id;

  try {
    const deployments = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(d:Deployment {id: $deploymentId})
      RETURN d, u
    `, { userId, deploymentId });

    if (deployments.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Deployment not found" };
      return;
    }

    const deployment = deployments[0].d.properties;
    const user = deployments[0].u.properties;

    // Provide fallback metrics if GCP is not connected or service doesn't exist
    if (!user.gcp_access_token || !deployment.cloud_run_service_name || !user.gcp_project_id) {
      console.log(`⚠️ Providing fallback metrics for deployment: ${deployment.name}`);
      ctx.response.body = { 
        metrics: generateFallbackMetrics(deployment.name, deployment.status)
      };
      return;
    }

    try {
      const accessToken = decrypt(user.gcp_access_token);
      
      // Validate service exists before fetching metrics
      console.log(`🔍 Checking if service exists: ${deployment.cloud_run_service_name} in region: ${deployment.region || 'us-central1'}`);
      
      const serviceExists = await gcp.checkServiceExists(
        user.gcp_project_id,
        deployment.region || 'us-central1',
        deployment.cloud_run_service_name,
        accessToken
      );

      if (!serviceExists) {
        console.log(`⚠️ Service ${deployment.cloud_run_service_name} not found in GCP, providing fallback metrics`);
        ctx.response.body = { 
          metrics: generateFallbackMetrics(deployment.name, 'service-not-found'),
          warning: "Service not found in GCP - using fallback metrics"
        };
        return;
      }

      console.log(`✅ Service ${deployment.cloud_run_service_name} exists, fetching real metrics`);
      const metrics = await gcp.getServiceMetrics(
        user.gcp_project_id,
        deployment.cloud_run_service_name,
        accessToken,
        deployment.region
      );

      ctx.response.body = { metrics };
    } catch (gcp_error) {
      console.error(`❌ GCP metrics error for ${deployment.name}:`, gcp_error);
      // Provide fallback metrics on GCP API errors
      ctx.response.body = { 
        metrics: generateFallbackMetrics(deployment.name, 'api-error'),
        warning: "Using fallback metrics due to GCP API error"
      };
    }
  } catch (error) {
    console.error("Metrics endpoint error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to fetch metrics" };
  }
});

// Get deployment logs
deploymentRoutes.get("/api/deployments/:id/logs", async (ctx) => {
  const userId = ctx.state.userId;
  const deploymentId = ctx.params.id;

  try {
    const deployments = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(d:Deployment {id: $deploymentId})
      RETURN d, u
    `, { userId, deploymentId });

    if (deployments.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Deployment not found" };
      return;
    }

    const deployment = deployments[0].d.properties;
    const user = deployments[0].u.properties;

    // Provide fallback logs if GCP is not connected or service doesn't exist
    if (!user.gcp_access_token || !deployment.cloud_run_service_name || !user.gcp_project_id) {
      console.log(`⚠️ Providing fallback logs for deployment: ${deployment.name}`);
      ctx.response.body = { 
        logs: generateFallbackLogs(deployment.name, deployment.status)
      };
      return;
    }

    try {
      const accessToken = decrypt(user.gcp_access_token);
      
      // Validate service exists before fetching logs
      const serviceExists = await gcp.checkServiceExists(
        user.gcp_project_id,
        deployment.region || 'us-central1',
        deployment.cloud_run_service_name,
        accessToken
      );

      if (!serviceExists) {
        console.log(`⚠️ Service ${deployment.cloud_run_service_name} not found, providing fallback logs`);
        ctx.response.body = { 
          logs: generateFallbackLogs(deployment.name, 'service-not-found')
        };
        return;
      }

      const logs = await gcp.getServiceLogs(
        user.gcp_project_id,
        deployment.cloud_run_service_name,
        accessToken
      );

      ctx.response.body = { logs };
    } catch (gcp_error) {
      console.error(`GCP logs error for ${deployment.name}:`, gcp_error);
      // Provide fallback logs on GCP API errors
      ctx.response.body = { 
        logs: generateFallbackLogs(deployment.name, 'api-error'),
        warning: "Using fallback logs due to GCP API error"
      };
    }
  } catch (error) {
    console.error("Logs endpoint error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to fetch logs" };
  }
});

// Server-Sent Events endpoint for real-time updates
deploymentRoutes.get("/api/deployments/events", async (ctx) => {
  let userId = ctx.state.userId;

  // If no userId from middleware (auth failed), try to get token from query parameter
  if (!userId) {
    const token = ctx.request.url.searchParams.get('token');
    if (token) {
      try {
        // Import JWT utility to verify token
        const { verifyJWT } = await import("../utils/jwt.ts");
        const payload = await verifyJWT(token);
        userId = payload.userId;
        console.log(`📡 SSE authentication via query parameter for user: ${userId}`);
      } catch (error) {
        console.error('❌ SSE token verification failed:', error);
        ctx.response.status = 401;
        ctx.response.body = { error: "Invalid token" };
        return;
      }
    } else {
      console.error('❌ SSE connection attempted without authentication');
      ctx.response.status = 401;
      ctx.response.body = { error: "Authentication required" };
      return;
    }
  }

  // Set SSE headers
  ctx.response.headers.set("Content-Type", "text/event-stream");
  ctx.response.headers.set("Cache-Control", "no-cache");
  ctx.response.headers.set("Connection", "keep-alive");
  ctx.response.headers.set("Access-Control-Allow-Origin", "*");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Cache-Control");

  // Create a readable stream for SSE
  const body = new ReadableStream({
    start(controller) {
      // Store connection for this user
      if (!sseConnections.has(userId)) {
        sseConnections.set(userId, new Set());
      }
      sseConnections.get(userId)!.add(controller);

      // Send initial connection message
      const initialMessage = `data: ${JSON.stringify({
        type: 'connection_established',
        timestamp: new Date().toISOString()
      })}\n\n`;
      controller.enqueue(new TextEncoder().encode(initialMessage));

      console.log(`📡 SSE connection established for user: ${userId}`);
    },
    cancel() {
      // Remove connection when client disconnects
      const userConnections = sseConnections.get(userId);
      if (userConnections) {
        userConnections.delete(controller);
        if (userConnections.size === 0) {
          sseConnections.delete(userId);
        }
      }
      console.log(`📡 SSE connection closed for user: ${userId}`);
    }
  });

  ctx.response.body = body;
});

// Sync deployments with GCP Cloud Run services
deploymentRoutes.post("/api/deployments/sync", async (ctx) => {
  const userId = ctx.state.userId;

  try {
    console.log(`🔄 Starting deployment sync for user: ${userId}`);

    // Get user's GCP info
    const users = await db.run(`
      MATCH (u:User {github_id: $userId})
      RETURN u
    `, { userId });

    const user = users[0]?.u.properties;
    if (!user?.gcp_access_token || !user?.gcp_project_id) {
      ctx.response.status = 400;
      ctx.response.body = { error: "GCP account not connected" };
      return;
    }

    // Get all user's deployments
    const deployments = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(d:Deployment)
      WHERE d.cloud_run_service_name IS NOT NULL
      RETURN d
    `, { userId });

    const accessToken = decrypt(user.gcp_access_token);
    let syncResults = {
      checked: 0,
      updated: 0,
      removed: 0,
      errors: 0
    };

    // Group deployments by region for efficient API calls
    const deploymentsByRegion = new Map();
    for (const record of deployments) {
      const deployment = record.d.properties;
      const region = deployment.region;
      
      if (!deploymentsByRegion.has(region)) {
        deploymentsByRegion.set(region, []);
      }
      deploymentsByRegion.get(region).push(deployment);
    }

    // Check each region
    for (const [region, regionDeployments] of deploymentsByRegion) {
      try {
        console.log(`📡 Checking region ${region} with ${regionDeployments.length} deployments`);
        
        // Get all Cloud Run services in this region
        const cloudRunServices = await gcp.listCloudRunServices(
          user.gcp_project_id,
          region,
          accessToken
        );

        const serviceNames = new Set(cloudRunServices.map((service: any) => service.metadata?.name));

        // Check each deployment in this region
        for (const deployment of regionDeployments) {
          syncResults.checked++;
          
          const serviceName = deployment.cloud_run_service_name;
          
          if (serviceNames.has(serviceName)) {
            // Service exists, check if URL needs updating
            const cloudRunService = cloudRunServices.find((s: any) => s.metadata?.name === serviceName);
            const currentUrl = cloudRunService?.status?.url;
            
            if (currentUrl && currentUrl !== deployment.cloud_run_url) {
              console.log(`🔄 Updating URL for deployment ${deployment.name}: ${currentUrl}`);
              
              await db.run(`
                MATCH (d:Deployment {id: $deploymentId})
                SET d.cloud_run_url = $url, d.updated_at = datetime()
              `, {
                deploymentId: deployment.id,
                url: currentUrl
              });
              
              syncResults.updated++;
            }
          } else {
            // Service doesn't exist in GCP, remove from database
            console.log(`🗑️ Removing orphaned deployment: ${deployment.name}`);
            
            await db.run(`
              MATCH (d:Deployment {id: $deploymentId})
              DETACH DELETE d
            `, { deploymentId: deployment.id });
            
            syncResults.removed++;
          }
        }
      } catch (regionError) {
        console.error(`❌ Error syncing region ${region}:`, regionError);
        syncResults.errors++;
      }
    }

    console.log(`✅ Sync completed:`, syncResults);
    ctx.response.body = { 
      success: true, 
      syncResults,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error("❌ Deployment sync failed:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to sync deployments" };
  }
});


// Load config to deployment
deploymentRoutes.post("/api/deployments/:id/load-config", async (ctx) => {
  const userId = ctx.state.userId;
  const deploymentId = ctx.params.id;
  const { configId } = await ctx.request.body({ type: "json" }).value;

  try {
    // Check ownership of both deployment and config
    const result = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(d:Deployment {id: $deploymentId})
      MATCH (u)-[:OWNS]->(c:JSphereConfig {id: $configId})
      RETURN d, c
    `, { userId, deploymentId, configId });

    if (result.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Deployment or config not found" };
      return;
    }

    const deployment = result[0].d.properties;
    const config = result[0].c.properties;

    // Create relationship
    await db.run(`
      MATCH (d:Deployment {id: $deploymentId}), (c:JSphereConfig {id: $configId})
      MERGE (d)-[:RUNS]->(c)
    `, { deploymentId, configId });

    // Send config to Cloud Run service if it's active
    if (deployment.cloud_run_url) {
      console.log(`🔄 Manual config loading requested for deployment: ${deployment.name}`);
      
      const configResult = await sendConfigToInstance(
        deployment.cloud_run_url,
        config,
        decrypt(deployment.server_auth_token),
        deployment.name
      );

      if (configResult.success) {
        console.log(`✅ Manual config load successful, updating deployment status to active`);
        // Update deployment status
        await db.run(`
          MATCH (d:Deployment {id: $deploymentId})
          SET d.status = "active", d.updated_at = datetime()
        `, { deploymentId });
      } else {
        console.log(`⚠️ Manual config load failed: ${configResult.error}`);
        ctx.response.status = 500;
        ctx.response.body = { 
          error: "Failed to load config to Cloud Run instance", 
          details: configResult.error 
        };
        return;
      }
    } else {
      console.log(`⚠️ No Cloud Run URL available for deployment: ${deployment.name}`);
      ctx.response.status = 400;
      ctx.response.body = { error: "Deployment does not have a Cloud Run URL" };
      return;
    }

    ctx.response.body = { success: true };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to load config" };
  }
});

// Helper function to send config to Cloud Run instance with detailed logging
async function sendConfigToInstance(deploymentUrl: string, config: any, authToken: string, deploymentName: string) {
  const requestPayload = {
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

  console.log('🚀 SENDING CONFIG TO CLOUD RUN INSTANCE');
  console.log('📍 URL:', `${deploymentUrl}/@cmd/loadconfig`);
  console.log('🏷️ Deployment:', deploymentName);
  console.log('⚙️ Config Name:', config.name);
  console.log('🔑 Auth Token:', authToken.substring(0, 10) + '...');
  console.log('📦 Request Payload:', JSON.stringify(requestPayload, null, 2));
  console.log('⏰ Timestamp:', new Date().toISOString());

  const startTime = Date.now();

  try {
    const response = await fetch(`${deploymentUrl}/@cmd/loadconfig`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload)
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log('📥 RESPONSE FROM CLOUD RUN INSTANCE');
    console.log('📊 Status:', response.status, response.statusText);
    console.log('🔗 Response URL:', response.url);
    console.log('⏱️ Duration:', duration + 'ms');
    console.log('📋 Response Headers:', Object.fromEntries(response.headers.entries()));
    
    if (response.ok) {
      const responseText = await response.text();
      console.log('✅ Response Body:', responseText);
      console.log('🎉 CONFIG LOADED SUCCESSFULLY');
      return { success: true, response: responseText };
    } else {
      const errorText = await response.text();
      console.log('❌ Error Response Body:', errorText);
      console.log('💥 CONFIG LOADING FAILED');
      return { success: false, error: errorText, status: response.status };
    }

  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log('💥 HTTP REQUEST FAILED');
    console.log('⏱️ Duration:', duration + 'ms');
    console.log('❌ Error:', (error as Error).message);
    console.log('🔍 Error Details:', error);
    
    return { success: false, error: (error as Error).message };
  }
}

// Helper function to deploy to GCP
async function deployToGCP(deploymentId: string, user: any) {
  try {
    const deployments = await db.run(`
      MATCH (d:Deployment {id: $deploymentId})
      OPTIONAL MATCH (d)-[:RUNS]->(c:JSphereConfig)
      RETURN d, c
    `, { deploymentId });

    const deployment = deployments[0]?.d.properties;
    const config = deployments[0]?.c?.properties;
    if (!deployment) return;

    const accessToken = decrypt(user.gcp_access_token);
    
    // Decrypt the server auth token for use in the deployment
    const decryptedServerAuthToken = decrypt(deployment.server_auth_token);
    
    const serviceConfig = gcp.generateServiceConfig({
      ...deployment,
      server_auth_token: decryptedServerAuthToken,
      gcp_project_id: user.gcp_project_id,
    });

    console.log(`🚀 Starting deployment for: ${deployment.name}`);
    
    const result = await gcp.createCloudRunService(
      user.gcp_project_id,
      deployment.region,
      serviceConfig,
      accessToken
    );

    // Set IAM policy to allow unauthenticated invocations
    await gcp.setServiceIamPolicy(
      user.gcp_project_id,
      deployment.region,
      deployment.name,
      accessToken
    );

    console.log(`🔍 Polling for Cloud Run service URL...`);
    
    // Poll for service URL with retries
    let cloudRunUrl = "";
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes with 10-second intervals
    
    while (attempts < maxAttempts && !cloudRunUrl) {
      attempts++;
      console.log(`📡 Attempt ${attempts}/${maxAttempts} - Checking service status...`);
      
      try {
        const status = await gcp.getServiceStatus(
          user.gcp_project_id,
          deployment.region,
          deployment.name,
          accessToken
        );
        
        if (status.ready && status.url) {
          cloudRunUrl = status.url;
          console.log(`✅ Service URL retrieved: ${cloudRunUrl}`);
          break;
        } else {
          console.log(`⏳ Service not ready yet, waiting 10 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      } catch (statusError) {
        console.log(`⚠️ Error checking status: ${(statusError as Error).message}`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    if (!cloudRunUrl) {
      console.log(`❌ Failed to retrieve service URL after ${maxAttempts} attempts`);
      // Fallback to the URL from initial result
      cloudRunUrl = result.status?.url || "";
    }

    // Update deployment with Cloud Run info
    await db.run(`
      MATCH (d:Deployment {id: $deploymentId})
      SET d.status = "idle",
          d.cloud_run_url = $url,
          d.cloud_run_service_name = $serviceName,
          d.updated_at = datetime()
    `, {
      deploymentId,
      url: cloudRunUrl,
      serviceName: deployment.name,
    });

    console.log(`📝 Updated deployment record with URL: ${cloudRunUrl}`);

    // Broadcast real-time update for URL retrieval
    console.log(`📡 Broadcasting deployment URL update to user: ${user.github_id}`);
    broadcastDeploymentUpdate(user.github_id, {
      type: 'deployment_url_retrieved',
      deploymentId,
      url: cloudRunUrl,
      timestamp: new Date().toISOString()
    });

    // If config is linked, automatically load it to the JSphere instance
    if (config && cloudRunUrl) {
      console.log(`🔧 Loading config ${config.name} to deployment ${deployment.name}`);
      
      const configResult = await sendConfigToInstance(
        cloudRunUrl, 
        config, 
        decryptedServerAuthToken, 
        deployment.name
      );

      if (configResult.success) {
        console.log(`✅ Config loaded successfully, updating deployment status to active`);
        // Update status to active since config was loaded
        await db.run(`
          MATCH (d:Deployment {id: $deploymentId})
          SET d.status = "active", d.updated_at = datetime()
        `, { deploymentId });
      } else {
        console.log(`⚠️ Config loading failed, keeping deployment as idle`);
      }
    }

  } catch (error) {
    console.error("💥 Deployment failed:", error);
    
    // Update deployment status to error
    await db.run(`
      MATCH (d:Deployment {id: $deploymentId})
      SET d.status = "error", d.updated_at = datetime()
    `, { deploymentId });
  }
}
