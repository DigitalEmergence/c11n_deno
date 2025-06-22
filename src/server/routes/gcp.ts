import { Router } from "oak";
import { db } from "../services/database.ts";
import { encrypt, decrypt } from "../services/encryption.ts";

export const gcpRoutes = new Router();

// Complete GCP OAuth scope - includes all functionality
const GCP_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform'             // Complete cloud platform access (deployment, monitoring, logging, IAM)
];

// Initiate GCP OAuth - user clicks "Connect GCP Account"
gcpRoutes.post("/api/auth/gcp", async (ctx) => {
  console.log("🔐 Initiating GCP OAuth flow with complete cloud platform access...");
  
  const gcpAuthUrl = 
    `https://accounts.google.com/o/oauth2/auth?` +
    `client_id=${Deno.env.get("GCP_CLIENT_ID")}&` +
    `redirect_uri=${Deno.env.get("GCP_REDIRECT_URI")}&` +
    `scope=${encodeURIComponent(GCP_OAUTH_SCOPES.join(' '))}&` +
    `response_type=code&` +
    `access_type=offline&` +
    `prompt=consent&` +
    `include_granted_scopes=true`;

  console.log("📋 Requesting cloud platform scope:", GCP_OAUTH_SCOPES.join(', '));
  ctx.response.body = { authUrl: gcpAuthUrl };
});

// GCP OAuth callback - handles the redirect after user approves
gcpRoutes.post("/api/auth/gcp/callback", async (ctx) => {
  const { code } = await ctx.request.body({ type: "json" }).value;
  const userId = ctx.state.userId;

  if (!code) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Authorization code is required" };
    return;
  }

  console.log(`🔄 Processing GCP OAuth callback for user: ${userId}`);

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("GCP_CLIENT_ID")!,
        client_secret: Deno.env.get("GCP_CLIENT_SECRET")!,
        code,
        grant_type: "authorization_code",
        redirect_uri: Deno.env.get("GCP_REDIRECT_URI")!,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.json();
      console.error("❌ Token exchange failed:", error);
      throw new Error(`Token exchange failed: ${error.error_description || error.error}`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in, scope } = tokenData;

    if (!access_token) {
      throw new Error("No access token received from Google");
    }

    console.log("✅ Received access token with scopes:", scope);

    // Verify we have the required scopes
    const grantedScopes = scope ? scope.split(' ') : [];
    const missingScopes = GCP_OAUTH_SCOPES.filter(requiredScope => 
      !grantedScopes.some((grantedScope: string) => grantedScope.includes(requiredScope.split('/').pop() || ''))
    );

    if (missingScopes.length > 0) {
      console.warn("⚠️ Missing some required scopes:", missingScopes);
      // Continue anyway - we can still provide basic functionality
    }

    // Store encrypted tokens
    const encryptedAccessToken = encrypt(access_token);
    const encryptedRefreshToken = refresh_token ? encrypt(refresh_token) : null;
    const expiresAt = new Date(Date.now() + (expires_in * 1000));

    await db.run(`
      MATCH (u:User {github_id: $userId})
      SET u.gcp_access_token = $accessToken,
          u.gcp_refresh_token = $refreshToken,
          u.gcp_token_expires_at = $expiresAt,
          u.gcp_scopes = $scopes,
          u.gcp_connected_at = datetime(),
          u.updated_at = datetime()
      RETURN u
    `, {
      userId,
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      expiresAt: expiresAt.toISOString(),
      scopes: scope || GCP_OAUTH_SCOPES.join(' '),
    });

    console.log(`✅ GCP account connected successfully for user: ${userId}`);
    ctx.response.body = { 
      success: true,
      scopes: grantedScopes,
      message: "GCP account connected successfully"
    };
  } catch (error) {
    console.error("❌ GCP OAuth callback failed:", error);
    ctx.response.status = 500;
    ctx.response.body = { 
      error: "Failed to connect GCP account",
      details: (error as Error).message 
    };
  }
});

// List GCP projects - user selects which project to deploy to
gcpRoutes.get("/api/gcp/projects", async (ctx) => {
  const userId = ctx.state.userId;
  
  try {
    console.log(`📋 Fetching GCP projects for user: ${userId}`);
    
    const users = await db.run(
      "MATCH (u:User {github_id: $userId}) RETURN u",
      { userId }
    );

    if (!users[0]?.u.properties.gcp_access_token) {
      ctx.response.status = 400;
      ctx.response.body = { error: "GCP not connected" };
      return;
    }

    const user = users[0].u.properties;
    const accessToken = await getValidAccessToken(user);

    // Use Cloud Resource Manager API to list projects
    const response = await fetch(
      "https://cloudresourcemanager.googleapis.com/v1/projects",
      {
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'C11N/1.0'
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("❌ GCP API error:", response.status, error);
      
      if (response.status === 403) {
        throw new Error("Insufficient permissions to list projects. Please reconnect your GCP account.");
      }
      
      throw new Error(`GCP API error: ${response.statusText}`);
    }

    const data = await response.json();
    const projects = data.projects || [];

    // Filter for active projects and add additional metadata
    const activeProjects = projects
      .filter((project: any) => project.lifecycleState === 'ACTIVE')
      .map((project: any) => ({
        projectId: project.projectId,
        name: project.name,
        projectNumber: project.projectNumber,
        createTime: project.createTime,
        labels: project.labels || {},
      }));

    console.log(`✅ Found ${activeProjects.length} active GCP projects`);
    ctx.response.body = { projects: activeProjects };
  } catch (error) {
    console.error("❌ Failed to fetch GCP projects:", error);
    ctx.response.status = 500;
    ctx.response.body = { 
      error: "Failed to fetch GCP projects",
      details: (error as Error).message 
    };
  }
});

// Select GCP project - user chooses which project to use for deployments
gcpRoutes.post("/api/gcp/select-project", async (ctx) => {
  const { projectId, projectName, projectNumber } = await ctx.request.body({ type: "json" }).value;
  const userId = ctx.state.userId;

  if (!projectId || !projectName) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Project ID and name are required" };
    return;
  }

  console.log(`🎯 Selecting GCP project for user ${userId}: ${projectName} (${projectId})`);

  try {
    // Verify user has GCP connected
    const users = await db.run(
      "MATCH (u:User {github_id: $userId}) RETURN u",
      { userId }
    );

    if (!users[0]?.u.properties.gcp_access_token) {
      ctx.response.status = 400;
      ctx.response.body = { error: "GCP not connected" };
      return;
    }

    // Update user's selected project (no need to verify - user selected from our list)
    await db.run(`
      MATCH (u:User {github_id: $userId})
      SET u.gcp_project_id = $projectId,
          u.gcp_project_name = $projectName,
          u.gcp_project_number = $projectNumber,
          u.updated_at = datetime()
      RETURN u
    `, { 
      userId, 
      projectId, 
      projectName,
      projectNumber: projectNumber || null
    });

    console.log(`✅ GCP project selected successfully: ${projectName} (${projectId})`);
    ctx.response.body = { 
      success: true,
      project: {
        projectId,
        projectName,
        projectNumber
      }
    };
  } catch (error) {
    console.error("❌ Failed to select GCP project:", error);
    ctx.response.status = 500;
    ctx.response.body = { 
      error: "Failed to select project",
      details: (error as Error).message 
    };
  }
});

// Disconnect GCP account
gcpRoutes.post("/api/gcp/disconnect", async (ctx) => {
  const userId = ctx.state.userId;

  console.log(`🔌 Disconnecting GCP account for user: ${userId}`);

  try {
    await db.run(`
      MATCH (u:User {github_id: $userId})
      SET u.gcp_access_token = null,
          u.gcp_refresh_token = null,
          u.gcp_token_expires_at = null,
          u.gcp_scopes = null,
          u.gcp_project_id = null,
          u.gcp_project_name = null,
          u.gcp_project_number = null,
          u.gcp_connected_at = null,
          u.updated_at = datetime()
      RETURN u
    `, { userId });

    console.log(`✅ GCP account disconnected successfully for user: ${userId}`);
    ctx.response.body = { success: true };
  } catch (error) {
    console.error("❌ Failed to disconnect GCP account:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to disconnect GCP account" };
  }
});

// Get GCP connection status
gcpRoutes.get("/api/gcp/status", async (ctx) => {
  const userId = ctx.state.userId;

  try {
    const users = await db.run(
      "MATCH (u:User {github_id: $userId}) RETURN u",
      { userId }
    );

    if (!users[0]) {
      ctx.response.status = 404;
      ctx.response.body = { error: "User not found" };
      return;
    }

    const user = users[0].u.properties;
    const isConnected = !!(user.gcp_access_token && user.gcp_project_id);

    ctx.response.body = {
      connected: isConnected,
      projectId: user.gcp_project_id || null,
      projectName: user.gcp_project_name || null,
      projectNumber: user.gcp_project_number || null,
      scopes: user.gcp_scopes || null,
      connectedAt: user.gcp_connected_at || null,
    };
  } catch (error) {
    console.error("❌ Failed to get GCP status:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to get GCP status" };
  }
});

// Test GCP connection
gcpRoutes.post("/api/gcp/test-connection", async (ctx) => {
  const userId = ctx.state.userId;

  try {
    console.log(`🧪 Testing GCP connection for user: ${userId}`);
    
    const users = await db.run(
      "MATCH (u:User {github_id: $userId}) RETURN u",
      { userId }
    );

    if (!users[0]?.u.properties.gcp_access_token) {
      ctx.response.status = 400;
      ctx.response.body = { error: "GCP not connected" };
      return;
    }

    const user = users[0].u.properties;
    const accessToken = await getValidAccessToken(user);

    // Test API access with a lightweight endpoint - just check token validity
    const testResponse = await fetch(
      "https://www.googleapis.com/oauth2/v1/tokeninfo",
      {
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'C11N/1.0'
        },
      }
    );

    const connectionTest = {
      success: testResponse.ok,
      status: testResponse.status,
      statusText: testResponse.statusText,
      timestamp: new Date().toISOString(),
    };

    if (testResponse.ok) {
      console.log("✅ GCP connection test successful");
    } else {
      console.error("❌ GCP connection test failed:", testResponse.status);
    }

    ctx.response.body = { connectionTest };
  } catch (error) {
    console.error("❌ GCP connection test error:", error);
    ctx.response.status = 500;
    ctx.response.body = { 
      error: "Connection test failed",
      details: (error as Error).message 
    };
  }
});


// Get service metrics
gcpRoutes.get("/api/gcp/metrics/:serviceName", async (ctx) => {
  const userId = ctx.state.userId;
  const serviceName = ctx.params.serviceName;

  try {
    console.log(`📊 Fetching metrics for service: ${serviceName}, user: ${userId}`);
    
    const users = await db.run(
      "MATCH (u:User {github_id: $userId}) RETURN u",
      { userId }
    );

    if (!users[0]?.u.properties.gcp_access_token) {
      ctx.response.status = 400;
      ctx.response.body = { error: "GCP not connected" };
      return;
    }

    const user = users[0].u.properties;

    if (!user.gcp_project_id) {
      ctx.response.status = 400;
      ctx.response.body = { error: "No GCP project selected" };
      return;
    }

    const accessToken = await getValidAccessToken(user);
    
    // Import GCP service
    const { gcp } = await import("../services/gcp.ts");
    
    const metrics = await gcp.getServiceMetrics(
      user.gcp_project_id,
      serviceName,
      accessToken
    );

    ctx.response.body = { metrics };
  } catch (error) {
    console.error("❌ Failed to fetch service metrics:", error);
    ctx.response.status = 500;
    ctx.response.body = { 
      error: "Failed to fetch metrics",
      details: (error as Error).message 
    };
  }
});

// Get service logs
gcpRoutes.get("/api/gcp/logs/:serviceName", async (ctx) => {
  const userId = ctx.state.userId;
  const serviceName = ctx.params.serviceName;

  try {
    console.log(`📋 Fetching logs for service: ${serviceName}, user: ${userId}`);
    
    const users = await db.run(
      "MATCH (u:User {github_id: $userId}) RETURN u",
      { userId }
    );

    if (!users[0]?.u.properties.gcp_access_token) {
      ctx.response.status = 400;
      ctx.response.body = { error: "GCP not connected" };
      return;
    }

    const user = users[0].u.properties;

    if (!user.gcp_project_id) {
      ctx.response.status = 400;
      ctx.response.body = { error: "No GCP project selected" };
      return;
    }

    const accessToken = await getValidAccessToken(user);
    
    // Import GCP service
    const { gcp } = await import("../services/gcp.ts");
    
    const logs = await gcp.getServiceLogs(
      user.gcp_project_id,
      serviceName,
      accessToken
    );

    ctx.response.body = { logs };
  } catch (error) {
    console.error("❌ Failed to fetch service logs:", error);
    ctx.response.status = 500;
    ctx.response.body = { 
      error: "Failed to fetch logs",
      details: (error as Error).message 
    };
  }
});

// Validate GCP token - check if current token is valid
gcpRoutes.get("/api/gcp/validate-token", async (ctx) => {
  const userId = ctx.state.userId;

  try {
    console.log(`🔍 Validating GCP token for user: ${userId}`);
    
    const users = await db.run(
      "MATCH (u:User {github_id: $userId}) RETURN u",
      { userId }
    );

    if (!users[0]?.u.properties.gcp_access_token) {
      ctx.response.body = { 
        valid: false, 
        reason: "not_connected",
        message: "GCP not connected" 
      };
      return;
    }

    const user = users[0].u.properties;
    
    try {
      const accessToken = await getValidAccessToken(user);
      
      // Test token with a lightweight API call
      const testResponse = await fetch(
        "https://www.googleapis.com/oauth2/v1/tokeninfo",
        {
          headers: { 
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'C11N/1.0'
          },
        }
      );

      if (testResponse.ok) {
        console.log("✅ GCP token is valid");
        ctx.response.body = { 
          valid: true,
          message: "Token is valid"
        };
      } else {
        console.log("❌ GCP token is invalid:", testResponse.status);
        ctx.response.body = { 
          valid: false,
          reason: "invalid_token",
          message: "Token is invalid or expired",
          status: testResponse.status
        };
      }
    } catch (tokenError) {
      console.log("❌ Token validation failed:", tokenError);
      ctx.response.body = { 
        valid: false,
        reason: "token_error",
        message: "Failed to validate token - reconnection required",
        details: (tokenError as Error).message
      };
    }
  } catch (error) {
    console.error("❌ Token validation error:", error);
    ctx.response.status = 500;
    ctx.response.body = { 
      valid: false,
      reason: "validation_error",
      message: "Failed to validate token",
      details: (error as Error).message 
    };
  }
});

// Helper function to get valid access token (handles refresh if needed)
async function getValidAccessToken(user: any): Promise<string> {
  const accessToken = decrypt(user.gcp_access_token);
  const refreshToken = user.gcp_refresh_token ? decrypt(user.gcp_refresh_token) : null;
  const expiresAt = user.gcp_token_expires_at ? new Date(user.gcp_token_expires_at) : null;

  // Check if token is expired or will expire in the next 5 minutes
  const fiveMinutesFromNow = new Date(Date.now() + (5 * 60 * 1000));
  
  if (expiresAt && expiresAt <= fiveMinutesFromNow && refreshToken) {
    try {
      console.log("🔄 Refreshing GCP access token...");
      
      const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: Deno.env.get("GCP_CLIENT_ID")!,
          client_secret: Deno.env.get("GCP_CLIENT_SECRET")!,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (refreshResponse.ok) {
        const { access_token, expires_in } = await refreshResponse.json();
        const newExpiresAt = new Date(Date.now() + (expires_in * 1000));

        // Update user with new token
        await db.run(`
          MATCH (u:User {gcp_access_token: $oldToken})
          SET u.gcp_access_token = $newToken,
              u.gcp_token_expires_at = $expiresAt,
              u.updated_at = datetime()
        `, {
          oldToken: user.gcp_access_token,
          newToken: encrypt(access_token),
          expiresAt: newExpiresAt.toISOString(),
        });

        console.log("✅ GCP access token refreshed successfully");
        return access_token;
      } else {
        const error = await refreshResponse.text();
        console.error("❌ Failed to refresh GCP token:", error);
        throw new Error("Failed to refresh access token. Please reconnect your GCP account.");
      }
    } catch (error) {
      console.error("❌ Error refreshing GCP token:", error);
      throw new Error("Token refresh failed. Please reconnect your GCP account.");
    }
  }

  return accessToken;
}
