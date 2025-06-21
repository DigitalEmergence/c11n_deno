import { Router } from "oak";
import { db } from "../services/database.ts";
import { encrypt, decrypt } from "../services/encryption.ts";
import { validateRequired, validateLength, sanitizeInput, ValidationError } from "../utils/validation.ts";
import { DockerHubService } from "../services/dockerhub.ts";

export const serviceProfileRoutes = new Router();

// Get all service profiles for user
serviceProfileRoutes.get("/api/service-profiles", async (ctx) => {
  const userId = ctx.state.userId;
  
  try {
    const profiles = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(sp:ServiceProfile)
      RETURN sp
      ORDER BY sp.created_at DESC
    `, { userId });

    const profileList = profiles.map((record: any) => {
      const profile = record.sp.properties;
      // Don't expose sensitive tokens
      delete profile.server_auth_token;
      return profile;
    });

    ctx.response.body = { serviceProfiles: profileList };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to fetch service profiles" };
  }
});

// Get single service profile for user
serviceProfileRoutes.get("/api/service-profiles/:id", async (ctx) => {
  const userId = ctx.state.userId;
  const profileId = ctx.params.id;
  
  try {
    const profiles = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(sp:ServiceProfile {id: $profileId})
      RETURN sp
    `, { userId, profileId });

    if (profiles.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Service profile not found" };
      return;
    }

    const profile = profiles[0].sp.properties;
    // Don't expose sensitive tokens in the response
    delete profile.server_auth_token;

    ctx.response.body = { serviceProfile: profile };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to fetch service profile" };
  }
});

// Create new service profile
serviceProfileRoutes.post("/api/service-profiles", async (ctx) => {
  const userId = ctx.state.userId;
  const body = await ctx.request.body({ type: "json" }).value;

  try {
    // Validation
    if (!validateRequired(body.name)) {
      throw new ValidationError("Service profile name is required", "name");
    }
    if (!validateLength(body.name, 1, 50)) {
      throw new ValidationError("Service profile name must be 1-50 characters", "name");
    }
    if (!validateRequired(body.container_image_url)) {
      throw new ValidationError("Container image URL is required", "container_image_url");
    }
    if (!validateRequired(body.server_auth_token)) {
      throw new ValidationError("Server auth token is required", "server_auth_token");
    }
    if (body.billing && !["request-based", "instance-based"].includes(body.billing)) {
      throw new ValidationError("Billing type must be 'request-based' or 'instance-based'", "billing");
    }

    const profileId = crypto.randomUUID();
    const encryptedToken = encrypt(body.server_auth_token);

    console.log("🔧 Creating service profile with billing = 'request-based'");
    console.log("📋 Service profile data:", {
      name: body.name,
      billing: "request-based",
      region: body.region || "us-central1"
    });

    // Process environment variables - convert object to string format for storage
    let envVarsString = `SERVER_HTTP_PORT=${body.container_port || "80"}`;
    if (body.environment_variables && typeof body.environment_variables === 'object') {
      const customEnvVars = Object.entries(body.environment_variables)
        .filter(([key, value]) => key && value && key !== 'SERVER_AUTH_TOKEN') // Exclude system vars
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
      
      if (customEnvVars) {
        envVarsString += '\n' + customEnvVars;
      }
    }

    await db.run(`
      MATCH (u:User {github_id: $userId})
      CREATE (sp:ServiceProfile {
        id: $profileId,
        name: $name,
        container_image_url: $container_image_url,
        container_port: $container_port,
        memory: $memory,
        cpu: $cpu,
        max_instances: $max_instances,
        timeout: $timeout,
        concurrency: $concurrency,
        execution_environment: $execution_environment,
        cpu_boost: $cpu_boost,
        billing: $billing,
        region: $region,
        server_auth_token: $server_auth_token,
        environment_variables: $environment_variables,
        created_at: datetime(),
        updated_at: datetime()
      })
      CREATE (u)-[:OWNS]->(sp)
      RETURN sp
    `, {
      userId,
      profileId,
      name: sanitizeInput(body.name),
      container_image_url: sanitizeInput(body.container_image_url),
      container_port: body.container_port || "80",
      memory: body.memory || "512Mi",
      cpu: body.cpu || "1",
      max_instances: body.max_instances || "100",
      timeout: body.timeout || "300",
      concurrency: body.concurrency || "80",
      execution_environment: body.execution_environment || "gen2",
        cpu_boost: body.cpu_boost !== undefined ? body.cpu_boost : true,
        billing: "request-based", // Always use request-based billing
        region: body.region || "us-central1",
      server_auth_token: encryptedToken,
      environment_variables: envVarsString,
    });

    ctx.response.body = { success: true, profileId };
  } catch (error) {
    if (error instanceof ValidationError) {
      ctx.response.status = 400;
      ctx.response.body = { error: error.message, field: error.field };
    } else {
      ctx.response.status = 500;
      ctx.response.body = { error: "Failed to create service profile" };
    }
  }
});

// Update service profile
serviceProfileRoutes.put("/api/service-profiles/:id", async (ctx) => {
  const userId = ctx.state.userId;
  const profileId = ctx.params.id;
  const body = await ctx.request.body({ type: "json" }).value;

  try {
    // Check ownership
    const profiles = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(sp:ServiceProfile {id: $profileId})
      RETURN sp
    `, { userId, profileId });

    if (profiles.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Service profile not found" };
      return;
    }

    const updateFields: any = { updated_at: "datetime()" };
    
    if (body.name) updateFields.name = sanitizeInput(body.name);
    if (body.container_image_url) updateFields.container_image_url = sanitizeInput(body.container_image_url);
    if (body.container_port) updateFields.container_port = body.container_port;
    if (body.memory) updateFields.memory = body.memory;
    if (body.cpu) updateFields.cpu = body.cpu;
    if (body.max_instances) updateFields.max_instances = body.max_instances;
    if (body.timeout) updateFields.timeout = body.timeout;
    if (body.concurrency) updateFields.concurrency = body.concurrency;
    if (body.execution_environment) updateFields.execution_environment = body.execution_environment;
    if (body.cpu_boost !== undefined) updateFields.cpu_boost = body.cpu_boost;
    if (body.billing) {
      if (!["request-based", "instance-based"].includes(body.billing)) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Billing type must be 'request-based' or 'instance-based'", field: "billing" };
        return;
      }
      updateFields.billing = body.billing;
    }
    if (body.region) updateFields.region = body.region;
    if (body.server_auth_token) updateFields.server_auth_token = encrypt(body.server_auth_token);
    
    // Handle environment variables update
    if (body.environment_variables !== undefined) {
      let envVarsString = `SERVER_HTTP_PORT=${body.container_port || updateFields.container_port || "80"}`;
      if (typeof body.environment_variables === 'object') {
        const customEnvVars = Object.entries(body.environment_variables)
          .filter(([key, value]) => key && value && key !== 'SERVER_AUTH_TOKEN') // Exclude system vars
          .map(([key, value]) => `${key}=${value}`)
          .join('\n');
        
        if (customEnvVars) {
          envVarsString += '\n' + customEnvVars;
        }
      }
      updateFields.environment_variables = envVarsString;
    }

    const setClause = Object.keys(updateFields)
      .map(key => `sp.${key} = $${key}`)
      .join(", ");

    await db.run(`
      MATCH (sp:ServiceProfile {id: $profileId})
      SET ${setClause}
      RETURN sp
    `, { profileId, ...updateFields });

    ctx.response.body = { success: true };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to update service profile" };
  }
});

// Delete service profile
serviceProfileRoutes.delete("/api/service-profiles/:id", async (ctx) => {
  const userId = ctx.state.userId;
  const profileId = ctx.params.id;

  try {
    const result = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(sp:ServiceProfile {id: $profileId})
      DETACH DELETE sp
      RETURN count(sp) as deleted
    `, { userId, profileId });

    if (result[0]?.deleted === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Service profile not found" };
      return;
    }

    ctx.response.body = { success: true };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to delete service profile" };
  }
});

// Get available JSphere Docker images from DockerHub
serviceProfileRoutes.get("/api/service-profiles/docker-images", async (ctx) => {
  try {
    const dockerHubService = new DockerHubService();
    const images = await dockerHubService.getJSphereImages();
    
    // Format the images for the frontend with mirror.gcr.io prefix
    const formattedImages = images.map(image => ({
      ...image,
      full_name: `mirror.gcr.io/greenantsolutions/jsphere:${image.name}`
    }));

    ctx.response.body = { images: formattedImages };
  } catch (error) {
    console.error("Failed to fetch Docker images:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to fetch Docker images" };
  }
});

// Check dependencies for a service profile (what deployments use it)
serviceProfileRoutes.get("/api/service-profiles/:id/dependencies", async (ctx) => {
  const userId = ctx.state.userId;
  const profileId = ctx.params.id;
  
  try {
    const dependencies = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(sp:ServiceProfile {id: $profileId})
      OPTIONAL MATCH (sp)<-[:USES]-(d:Deployment)
      RETURN sp, collect(d) as deployments
    `, { userId, profileId });

    if (dependencies.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Service profile not found" };
      return;
    }

    const deployments = dependencies[0].deployments.map((d: any) => d.properties);
    ctx.response.body = { 
      canDelete: deployments.length === 0,
      dependencies: deployments 
    };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to check dependencies" };
  }
});

// Validate service profile configuration
serviceProfileRoutes.post("/api/service-profiles/validate", async (ctx) => {
  const body = await ctx.request.body({ type: "json" }).value;
  
  try {
    const errors: any[] = [];
    
    // Validate required fields
    if (!validateRequired(body.name)) {
      errors.push({ field: "name", message: "Service profile name is required" });
    }
    if (!validateLength(body.name, 1, 50)) {
      errors.push({ field: "name", message: "Service profile name must be 1-50 characters" });
    }
    if (!validateRequired(body.container_image_url)) {
      errors.push({ field: "container_image_url", message: "Container image URL is required" });
    }
    if (!validateRequired(body.server_auth_token)) {
      errors.push({ field: "server_auth_token", message: "Server auth token is required" });
    }
    
    // Validate container image URL format
    if (body.container_image_url) {
      const dockerHubService = new DockerHubService();
      const isValidImage = await dockerHubService.validateImageUrl(body.container_image_url);
      if (!isValidImage) {
        errors.push({ field: "container_image_url", message: "Invalid container image URL format" });
      }
    }
    
    // Validate memory options
    const validMemoryOptions = ["512Mi", "1GiB", "2GiB", "4GiB", "8GiB", "16GiB", "32GiB"];
    if (body.memory && !validMemoryOptions.includes(body.memory)) {
      errors.push({ field: "memory", message: "Invalid memory option" });
    }
    
    // Validate CPU options
    const validCpuOptions = ["1", "2", "4", "6", "8"];
    if (body.cpu && !validCpuOptions.includes(body.cpu)) {
      errors.push({ field: "cpu", message: "Invalid CPU option" });
    }
    
    // Validate execution environment
    const validExecutionEnvs = ["gen1", "gen2", "default"];
    if (body.execution_environment && !validExecutionEnvs.includes(body.execution_environment)) {
      errors.push({ field: "execution_environment", message: "Invalid execution environment" });
    }
    
    // Validate region
    const validRegions = [
      "us-central1", "us-east1", "us-west1", "europe-west1", "asia-east1", 
      "asia-east2", "asia-northeast1", "asia-southeast1", "australia-southeast1", 
      "southamerica-west1", "europe-north1"
    ];
    if (body.region && !validRegions.includes(body.region)) {
      errors.push({ field: "region", message: "Invalid region" });
    }
    
    // Validate environment variables
    if (body.environment_variables && typeof body.environment_variables === 'object') {
      for (const [key, value] of Object.entries(body.environment_variables)) {
        if (!key || typeof key !== 'string') {
          errors.push({ field: "environment_variables", message: "Environment variable keys must be non-empty strings" });
          break;
        }
        if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
          errors.push({ field: "environment_variables", message: `Invalid environment variable name: ${key}` });
          break;
        }
      }
    }
    
    ctx.response.body = { 
      valid: errors.length === 0,
      errors 
    };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to validate service profile" };
  }
});

// Duplicate service profile
serviceProfileRoutes.post("/api/service-profiles/:id/duplicate", async (ctx) => {
  const userId = ctx.state.userId;
  const profileId = ctx.params.id;
  
  try {
    // Get the original profile
    const profiles = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(sp:ServiceProfile {id: $profileId})
      RETURN sp
    `, { userId, profileId });

    if (profiles.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Service profile not found" };
      return;
    }

    const originalProfile = profiles[0].sp.properties;
    const newProfileId = crypto.randomUUID();
    const newName = `${originalProfile.name} (Copy)`;

    // Create duplicate with new ID and name
    await db.run(`
      MATCH (u:User {github_id: $userId})
      CREATE (sp:ServiceProfile {
        id: $newProfileId,
        name: $newName,
        container_image_url: $container_image_url,
        container_port: $container_port,
        memory: $memory,
        cpu: $cpu,
        max_instances: $max_instances,
        timeout: $timeout,
        concurrency: $concurrency,
        execution_environment: $execution_environment,
        cpu_boost: $cpu_boost,
        billing: $billing,
        region: $region,
        server_auth_token: $server_auth_token,
        environment_variables: $environment_variables,
        created_at: datetime(),
        updated_at: datetime()
      })
      CREATE (u)-[:OWNS]->(sp)
      RETURN sp
    `, {
      userId,
      newProfileId,
      newName,
      container_image_url: originalProfile.container_image_url,
      container_port: originalProfile.container_port,
      memory: originalProfile.memory,
      cpu: originalProfile.cpu,
      max_instances: originalProfile.max_instances,
      timeout: originalProfile.timeout,
      concurrency: originalProfile.concurrency,
      execution_environment: originalProfile.execution_environment,
      cpu_boost: originalProfile.cpu_boost,
      billing: originalProfile.billing,
      region: originalProfile.region,
      server_auth_token: originalProfile.server_auth_token,
      environment_variables: originalProfile.environment_variables,
    });

    ctx.response.body = { success: true, profileId: newProfileId };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to duplicate service profile" };
  }
});
