export class DataManager {
  constructor(api) {
    this.api = api;
    this.deployments = [];
    this.configs = [];
    this.localServers = [];
    this.remoteServers = [];
    this.workspaces = [];
    this.serviceProfiles = [];
    this.gcpProjects = [];
    this.isGCPConnected = false;
    this.gcpTokenValid = true; // Track if GCP token is valid
    this.user = null;
    
    this.listeners = new Set();
  }

  // Event system for notifying components of data changes
  addListener(callback) {
    this.listeners.add(callback);
  }

  removeListener(callback) {
    this.listeners.delete(callback);
  }

  notifyListeners(eventType, data) {
    this.listeners.forEach(callback => {
      try {
        callback(eventType, data);
      } catch (error) {
        console.error('Error in data listener:', error);
      }
    });
  }

  // Getters for current state
  getDeployments() {
    return this.deployments;
  }

  getConfigs() {
    return this.configs;
  }

  getLocalServers() {
    return this.localServers;
  }

  getRemoteServers() {
    return this.remoteServers;
  }

  getWorkspaces() {
    return this.workspaces;
  }

  getServiceProfiles() {
    return this.serviceProfiles;
  }

  getGCPProjects() {
    return this.gcpProjects;
  }

  getUser() {
    return this.user;
  }

  isGCPConnectedStatus() {
    return this.isGCPConnected;
  }

  isGCPTokenValid() {
    return this.gcpTokenValid;
  }

  needsGCPReconnection() {
    return this.isGCPConnected && !this.gcpTokenValid;
  }

  // Setters that notify listeners
  setUser(user) {
    this.user = user;
    this.isGCPConnected = !!(user?.gcp_access_token && user?.gcp_project_id);
    this.notifyListeners('user_updated', user);
  }

  setDeployments(deployments) {
    this.deployments = deployments;
    this.notifyListeners('deployments_updated', deployments);
  }

  setConfigs(configs) {
    this.configs = configs;
    this.notifyListeners('configs_updated', configs);
  }

  setLocalServers(localServers) {
    this.localServers = localServers;
    this.notifyListeners('local_servers_updated', localServers);
  }

  setRemoteServers(remoteServers) {
    this.remoteServers = remoteServers;
    this.notifyListeners('remote_servers_updated', remoteServers);
  }

  setWorkspaces(workspaces) {
    this.workspaces = workspaces;
    this.notifyListeners('workspaces_updated', workspaces);
  }

  setServiceProfiles(serviceProfiles) {
    this.serviceProfiles = serviceProfiles;
    this.notifyListeners('service_profiles_updated', serviceProfiles);
  }

  setGCPProjects(gcpProjects) {
    this.gcpProjects = gcpProjects;
    this.notifyListeners('gcp_projects_updated', gcpProjects);
  }

  // Main data loading method
  async loadData() {
    try {
      const promises = [
        this.api.get('/deployments'),
        this.api.get('/configs'),
        this.api.get('/local-servers'),
        this.api.get('/remote-servers'),
        this.api.get('/workspaces')
      ];

      const results = await Promise.all(promises);
      
      this.setDeployments(results[0].deployments || []);
      this.setConfigs(results[1].configs || []);
      this.setLocalServers(results[2].localServers || []);
      this.setRemoteServers(results[3].remoteServers || []);
      this.setWorkspaces(results[4].workspaces || []);

      this.notifyListeners('data_loaded', {
        deployments: this.deployments,
        configs: this.configs,
        localServers: this.localServers,
        remoteServers: this.remoteServers,
        workspaces: this.workspaces
      });

      return true;
    } catch (error) {
      console.error('Failed to load data:', error);
      this.notifyListeners('data_load_error', error);
      throw error;
    }
  }

  // Load service profiles separately
  async loadServiceProfiles() {
    try {
      const response = await this.api.get('/service-profiles');
      this.setServiceProfiles(response.serviceProfiles || []);
      return this.serviceProfiles;
    } catch (error) {
      console.error('Failed to load service profiles:', error);
      this.setServiceProfiles([]);
      throw error;
    }
  }

  // Load GCP projects when needed
  async loadGCPProjects() {
    // Check if user has GCP access token instead of just isGCPConnected flag
    const user = this.getUser();
    if (!user?.gcp_access_token) {
      console.log('📋 No GCP access token available, cannot load projects');
      this.setGCPProjects([]);
      return [];
    }

    try {
      console.log('📋 Loading GCP projects...');
      const response = await this.api.get('/gcp/projects');
      const projects = response.projects || [];
      console.log(`✅ Loaded ${projects.length} GCP projects`);
      this.setGCPProjects(projects);
      return this.gcpProjects;
    } catch (error) {
      console.error('❌ Failed to load GCP projects:', error);
      this.setGCPProjects([]);
      
      // Provide more specific error information
      if (error.message?.includes('403') || error.message?.includes('Insufficient permissions')) {
        throw new Error('Insufficient permissions to list GCP projects. Please reconnect your GCP account.');
      } else if (error.message?.includes('401') || error.message?.includes('unauthorized')) {
        throw new Error('GCP authentication expired. Please reconnect your GCP account.');
      } else {
        throw new Error(`Failed to load GCP projects: ${error.message}`);
      }
    }
  }

  // Refresh data with sync
  async refresh() {
    try {
      // First sync deployments with GCP if connected
      if (this.isGCPConnected) {
        await this.api.post('/deployments/sync');
      }
      
      // Then refresh all data
      await this.loadData();
      this.notifyListeners('data_refreshed', null);
      return true;
    } catch (error) {
      console.error('Manual refresh failed:', error);
      // Still try to refresh local data even if sync fails
      await this.loadData();
      this.notifyListeners('data_refresh_partial', error);
      throw error;
    }
  }

  // Update individual deployment
  updateDeployment(deploymentId, updates) {
    const deployment = this.deployments.find(d => d.id === deploymentId);
    if (deployment) {
      Object.assign(deployment, updates);
      this.notifyListeners('deployment_updated', { deploymentId, deployment, updates });
    }
  }

  // Update individual local server
  updateLocalServer(serverId, updates) {
    const server = this.localServers.find(s => s.id === serverId);
    if (server) {
      Object.assign(server, updates);
      this.notifyListeners('local_server_updated', { serverId, server, updates });
    }
  }

  // Add new deployment
  addDeployment(deployment) {
    this.deployments.push(deployment);
    
    // If deployment was added successfully and we have GCP connected,
    // ensure the GCP token is marked as valid (successful API call proves it works)
    if (this.isGCPConnected && deployment && !this.isDeploymentFailed(deployment)) {
      this.setGCPTokenValidity(true, 'successful_deployment');
    }
    
    this.notifyListeners('deployment_added', deployment);
  }

  // Helper method to check if deployment is in a failed state
  isDeploymentFailed(deployment) {
    return deployment.status === 'failed' || deployment.status === 'error';
  }

  // Remove deployment
  removeDeployment(deploymentId) {
    const index = this.deployments.findIndex(d => d.id === deploymentId);
    if (index !== -1) {
      const removed = this.deployments.splice(index, 1)[0];
      this.notifyListeners('deployment_removed', removed);
    }
  }

  // Add new local server
  addLocalServer(server) {
    this.localServers.push(server);
    this.notifyListeners('local_server_added', server);
  }

  // Remove local server
  removeLocalServer(serverId) {
    const index = this.localServers.findIndex(s => s.id === serverId);
    if (index !== -1) {
      const removed = this.localServers.splice(index, 1)[0];
      this.notifyListeners('local_server_removed', removed);
    }
  }

  // Add new remote server
  addRemoteServer(server) {
    this.remoteServers.push(server);
    this.notifyListeners('remote_server_added', server);
  }

  // Remove remote server
  removeRemoteServer(serverId) {
    const index = this.remoteServers.findIndex(s => s.id === serverId);
    if (index !== -1) {
      const removed = this.remoteServers.splice(index, 1)[0];
      this.notifyListeners('remote_server_removed', removed);
    }
  }

  // Update individual remote server
  updateRemoteServer(serverId, updates) {
    const server = this.remoteServers.find(s => s.id === serverId);
    if (server) {
      Object.assign(server, updates);
      this.notifyListeners('remote_server_updated', { serverId, server, updates });
    }
  }

  // Get remote server by ID
  getRemoteServerById(serverId) {
    return this.remoteServers.find(s => s.id === serverId);
  }

  // Add new config
  addConfig(config) {
    this.configs.push(config);
    this.notifyListeners('config_added', config);
  }

  // Remove config
  removeConfig(configId) {
    const index = this.configs.findIndex(c => c.id === configId);
    if (index !== -1) {
      const removed = this.configs.splice(index, 1)[0];
      this.notifyListeners('config_removed', removed);
    }
  }

  // Add new workspace
  addWorkspace(workspace) {
    this.workspaces.push(workspace);
    this.notifyListeners('workspace_added', workspace);
  }

  // Remove workspace
  removeWorkspace(workspaceId) {
    const index = this.workspaces.findIndex(w => w.id === workspaceId);
    if (index !== -1) {
      const removed = this.workspaces.splice(index, 1)[0];
      this.notifyListeners('workspace_removed', removed);
    }
  }

  // Add new service profile
  addServiceProfile(profile) {
    this.serviceProfiles.push(profile);
    this.notifyListeners('service_profile_added', profile);
  }

  // Remove service profile
  removeServiceProfile(profileId) {
    const index = this.serviceProfiles.findIndex(p => p.id === profileId);
    if (index !== -1) {
      const removed = this.serviceProfiles.splice(index, 1)[0];
      this.notifyListeners('service_profile_removed', removed);
    }
  }

  // Update service profile
  updateServiceProfile(profileId, updates) {
    const profile = this.serviceProfiles.find(p => p.id === profileId);
    if (profile) {
      Object.assign(profile, updates);
      this.notifyListeners('service_profile_updated', { profileId, profile, updates });
    }
  }

  // Validate GCP token and update status
  async validateGCPToken() {
    if (!this.isGCPConnected) {
      this.gcpTokenValid = true; // No token to validate
      return { valid: true, reason: 'not_connected' };
    }

    try {
      console.log('🔍 Validating GCP token...');
      const response = await this.api.get('/gcp/validate-token');
      
      const wasValid = this.gcpTokenValid;
      this.gcpTokenValid = response.valid;
      
      // Notify listeners if status changed
      if (wasValid !== this.gcpTokenValid) {
        console.log(`🔄 GCP token validity changed: ${wasValid} -> ${this.gcpTokenValid}`);
        this.notifyListeners('gcp_token_validity_changed', {
          valid: this.gcpTokenValid,
          reason: response.reason,
          message: response.message
        });
      }
      
      return response;
    } catch (error) {
      console.error('❌ Failed to validate GCP token:', error);
      this.gcpTokenValid = false;
      this.notifyListeners('gcp_token_validity_changed', {
        valid: false,
        reason: 'validation_error',
        message: 'Failed to validate token'
      });
      return { valid: false, reason: 'validation_error', message: error.message };
    }
  }

  // Set GCP token validity (for external updates)
  setGCPTokenValidity(valid, reason = null) {
    const wasValid = this.gcpTokenValid;
    this.gcpTokenValid = valid;
    
    if (wasValid !== valid) {
      console.log(`🔄 GCP token validity updated: ${wasValid} -> ${valid} (${reason})`);
      this.notifyListeners('gcp_token_validity_changed', {
        valid,
        reason,
        message: valid ? 'Token is valid' : 'Token is invalid or expired'
      });
    }
  }
}
