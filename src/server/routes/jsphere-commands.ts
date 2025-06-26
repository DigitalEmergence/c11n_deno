import { Router } from "oak";
import { db } from "../services/database.ts";
import { decrypt } from "../services/encryption.ts";

export const jsphereCommandRoutes = new Router();

// POST /api/jsphere-commands - Proxy JSphere commands to deployments
jsphereCommandRoutes.post("/api/jsphere-commands", async (ctx) => {
  const userId = ctx.state.userId;
  
  try {
    const body = await ctx.request.body({ type: "json" }).value;
    const { serverId, command, data } = body;

    if (!serverId || !command) {
      ctx.response.status = 400;
      ctx.response.body = { error: "serverId and command are required" };
      return;
    }

    if (!userId) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Unauthorized" };
      return;
    }

    // Find the server (local or deployment) - check deployments first since that's the main use case
    let serverUrl: string | null = null;
    let authToken: string | null = null;
    let isDeployment = false;

    // Check deployments first
    const deploymentResult = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(d:Deployment {id: $serverId})
      RETURN d
    `, { userId, serverId });

    if (deploymentResult.length > 0) {
      const deployment = deploymentResult[0].d.properties;
      serverUrl = deployment.cloud_run_url;
      authToken = deployment.server_auth_token;
      isDeployment = true;
    } else {
      // Check local servers
      const localServerResult = await db.run(`
        MATCH (u:User {github_id: $userId})-[:OWNS]->(ls:LocalServer {id: $serverId})
        RETURN ls
      `, { userId, serverId });

      if (localServerResult.length > 0) {
        const localServer = localServerResult[0].ls.properties;
        serverUrl = localServer.url;
        // Local servers typically don't need auth tokens
        authToken = null;
        isDeployment = false;
      }
    }

    if (!serverUrl) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Server not found or access denied" };
      return;
    }

    // Build the command URL
    const commandUrl = `${serverUrl}/@cmd/${command}`;

    // Prepare headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add auth token for deployments (decrypt it first)
    if (isDeployment && authToken) {
      try {
        const decryptedToken = decrypt(authToken);
        headers["Authorization"] = `token ${decryptedToken}`;
      } catch (decryptError) {
        console.error("Failed to decrypt auth token:", decryptError);
        ctx.response.status = 500;
        ctx.response.body = { error: "Failed to decrypt authentication token" };
        return;
      }
    }

    // Prepare request options
    const requestOptions: RequestInit = {
      method: data ? "POST" : "GET",
      headers,
    };

    if (data) {
      requestOptions.body = JSON.stringify(data);
    }

    console.log(`Proxying JSphere command: ${command} to ${commandUrl}`);
    console.log(`Request method: ${requestOptions.method}`);
    console.log(`Has auth token: ${!!authToken}`);
    console.log(`Is deployment: ${isDeployment}`);

    // Send the command to the JSphere server
    const response = await fetch(commandUrl, requestOptions);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`JSphere command failed: ${response.status} - ${errorText}`);
      ctx.response.status = response.status;
      ctx.response.body = { 
        error: `JSphere command failed: ${response.status}`,
        details: errorText
      };
      return;
    }

    // Get the response data - handle both JSON and text responses
    let responseData;
    const contentType = response.headers.get("content-type");
    
    try {
      if (contentType && contentType.includes("application/json")) {
        responseData = await response.json();
      } else {
        // Handle text responses (like "OK")
        const textResponse = await response.text();
        responseData = { message: textResponse, success: true };
      }
    } catch (parseError) {
      // If JSON parsing fails, treat as text
      const textResponse = await response.text();
      responseData = { message: textResponse, success: true };
    }

    console.log(`JSphere command successful: ${command}`);
    console.log(`Response data:`, responseData);
    
    // Return the JSphere server response
    ctx.response.status = 200;
    ctx.response.body = responseData;

  } catch (error) {
    console.error("Error proxying JSphere command:", error);
    ctx.response.status = 500;
    ctx.response.body = { 
      error: "Internal server error",
      details: (error as Error).message
    };
  }
});
