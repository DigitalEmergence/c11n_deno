import { utils } from '../utils.js';

export class RealtimeManager {
  constructor(api, dataManager) {
    this.api = api;
    this.dataManager = dataManager;
    this.eventSource = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000;
    this.activePollingIntervals = new Map(); // Track polling intervals for specific deployments
  }

  startRealTimeUpdates() {
    // Use Server-Sent Events for real-time deployment updates
    if (typeof EventSource !== 'undefined') {
      // Validate token before attempting connection
      const token = this.api.token;
      if (!token) {
        console.error('❌ No authentication token available for SSE connection');
        return;
      }

      // Check if token appears to be expired (basic validation)
      if (!this.isTokenValid(token)) {
        console.warn('⚠️ Token appears to be invalid or expired, attempting refresh...');
        this.handleTokenRefresh();
        return;
      }
      
      // Include token as query parameter since EventSource doesn't support custom headers
      const sseUrl = `/api/deployments/events?token=${encodeURIComponent(token)}`;
      
      console.log('📡 Starting SSE connection to', sseUrl.replace(/token=[^&]+/, 'token=***'));
      this.eventSource = new EventSource(sseUrl);
      
      this.eventSource.onopen = (event) => {
        console.log('✅ SSE connection opened:', event);
        this.reconnectAttempts = 0; // Reset on successful connection
      };
      
      this.eventSource.onmessage = (event) => {
        console.log('📨 SSE message received:', event.data);
        try {
          const data = JSON.parse(event.data);
          console.log('📊 Parsed SSE data:', data);
          this.handleRealTimeUpdate(data);
        } catch (error) {
          console.error('❌ Failed to parse SSE data:', error, 'Raw data:', event.data);
        }
      };
      
      this.eventSource.onerror = (error) => {
        console.error('❌ SSE connection error:', error);
        console.log('📊 SSE readyState:', this.eventSource.readyState);
        
        // Close the current connection
        this.eventSource.close();
        this.eventSource = null;
        
        // Check if this might be an authentication error
        // EventSource doesn't provide status codes, but we can infer from the pattern
        if (this.reconnectAttempts === 0) {
          // First failure might be auth-related, try token refresh
          console.log('🔍 First SSE connection failure, checking if auth-related...');
          this.handleTokenRefresh();
          return;
        }
        
        // Attempt to reconnect with exponential backoff
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
          console.log(`🔄 Reconnecting SSE in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          
          setTimeout(() => {
            this.startRealTimeUpdates();
          }, delay);
        } else {
          console.error('❌ Max reconnection attempts reached, giving up on SSE');
          utils.showToast('Real-time updates disconnected. Please refresh the page.', 'warning', 10000);
        }
      };
    } else {
      console.warn('⚠️ Server-Sent Events not supported, falling back to polling');
    }
  }

  handleRealTimeUpdate(data) {
    console.log('📡 Real-time update received:', data);
    
    switch (data.type) {
      case 'deployment_created':
        this.handleDeploymentCreated(data);
        break;
      case 'deployment_status_changed':
        this.handleDeploymentStatusUpdate(data);
        break;
      case 'deployment_url_retrieved':
        this.handleDeploymentUrlUpdate(data);
        break;
      case 'local_server_status_changed':
        this.handleLocalServerStatusUpdate(data);
        break;
      case 'local_server_health_check':
        this.handleLocalServerHealthUpdate(data);
        break;
      default:
        console.log('Unknown update type:', data.type);
    }
  }

  handleDeploymentCreated(data) {
    const { deploymentId, deployment } = data;
    console.log(`📡 Processing deployment creation for ID: ${deploymentId}`);
    
    // Add deployment to data manager
    this.dataManager.addDeployment(deployment);
    
    console.log(`✅ Deployment ${deployment.name} added via real-time update`);
  }

  handleDeploymentStatusUpdate(data) {
    const { deploymentId, status, message } = data;
    
    // Update deployment in data manager
    this.dataManager.updateDeployment(deploymentId, {
      status,
      status_message: message
    });
    
    // Show notification for important status changes
    const deployment = this.dataManager.getDeployments().find(d => d.id === deploymentId);
    if (deployment) {
      if (status === 'active') {
        utils.showToast(`Deployment ${deployment.name} is now active!`, 'success');
      } else if (status === 'error') {
        utils.showToast(`Deployment ${deployment.name} failed: ${message}`, 'error');
      }
    }
  }

  handleDeploymentUrlUpdate(data) {
    const { deploymentId, url } = data;
    console.log(`📡 Processing deployment URL update for ID: ${deploymentId}, URL: ${url}`);
    
    // Update deployment in data manager
    this.dataManager.updateDeployment(deploymentId, {
      cloud_run_url: url,
      status: 'active' // URL retrieval means deployment is active
    });
    
    const deployment = this.dataManager.getDeployments().find(d => d.id === deploymentId);
    if (deployment) {
      console.log(`✅ Deployment ${deployment.name} URL updated successfully: ${url}`);
      
      // Show success notification with clickable URL
      utils.showToast(
        `🚀 Deployment ${deployment.name} is live! <a href="${url}" target="_blank" style="color: white; text-decoration: underline;">Open App</a>`, 
        'success', 
        8000
      );
      
      // Force immediate UI update by triggering a specific event
      console.log(`🔄 Forcing immediate UI update for deployment URL`);
      this.dataManager.notifyListeners('deployment_url_updated', { deploymentId, url, deployment });
    } else {
      console.error(`❌ Deployment not found for ID: ${deploymentId}`);
    }
  }

  handleLocalServerStatusUpdate(data) {
    const { serverId, status, message } = data;
    
    // Update local server in data manager
    this.dataManager.updateLocalServer(serverId, {
      status,
      status_message: message
    });
    
    // Show notification for status changes
    const server = this.dataManager.getLocalServers().find(s => s.id === serverId);
    if (server) {
      if (status === 'active') {
        utils.showToast(`Local server on port ${server.port} is now active!`, 'success');
      } else if (status === 'error') {
        utils.showToast(`Local server on port ${server.port} error: ${message}`, 'error');
      }
    }
  }

  handleLocalServerHealthUpdate(data) {
    const { serverId, isHealthy, status, error } = data;
    
    // Update local server health status in data manager
    this.dataManager.updateLocalServer(serverId, {
      status,
      is_healthy: isHealthy,
      last_ping: new Date().toISOString()
    });
    
    // Only show notifications for health status changes if they're significant
    const server = this.dataManager.getLocalServers().find(s => s.id === serverId);
    if (server && !isHealthy && error) {
      console.warn(`Local server ${server.port} health check failed: ${error}`);
    }
  }

  // Start polling for auto-refresh
  startPolling() {
    // Check for existing deployments without URLs and start polling them
    this.startPollingForExistingDeployments();

    // Auto-refresh data every 10 minutes with sync and health checks
    setInterval(async () => {
      await this.autoRefreshWithSync();
    }, 600000);

    // Validate GCP token every 5 minutes
    setInterval(async () => {
      await this.validateGCPToken();
    }, 300000);
  }

  // Start polling for existing deployments that don't have URLs yet
  startPollingForExistingDeployments() {
    const deployments = this.dataManager.getDeployments();
    const deploymentsWithoutUrls = deployments.filter(d => 
      !d.cloud_run_url && (d.status === 'creating' || d.status === 'deploying')
    );

    if (deploymentsWithoutUrls.length > 0) {
      console.log(`🎯 Starting polling for ${deploymentsWithoutUrls.length} existing deployment(s) without URLs`);
      deploymentsWithoutUrls.forEach(deployment => {
        this.startDeploymentPolling(deployment.id);
      });
    }
  }

  async autoRefreshWithSync() {
    try {
      // First sync deployments with GCP if connected
      if (this.dataManager.isGCPConnectedStatus()) {
        await this.api.post('/deployments/sync');
      }
      
      // Health check local servers
      await this.healthCheckLocalServers();
      
      // Then refresh all data
      await this.dataManager.loadData();
      
      console.log('� Auto-refresh completed');
    } catch (error) {
      console.error('Auto-refresh failed:', error);
      // Still try to refresh local data even if sync fails
      await this.dataManager.loadData();
    }
  }

  async healthCheckLocalServers() {
    const localServers = this.dataManager.getLocalServers();
    if (!localServers || localServers.length === 0) return;
    
    console.log('� Health checking local servers...');
    
    // Health check all local servers in parallel
    const healthCheckPromises = localServers.map(async (server) => {
      try {
        await this.api.get(`/local-servers/${server.id}/health`);
      } catch (error) {
        console.error(`Health check failed for server ${server.id}:`, error);
      }
    });
    
    await Promise.all(healthCheckPromises);
    console.log('✅ Local server health checks completed');
  }

  // Start targeted polling for a specific deployment
  startDeploymentPolling(deploymentId) {
    // Don't start if already polling this deployment
    if (this.activePollingIntervals.has(deploymentId)) {
      console.log(`🔄 Already polling deployment ${deploymentId}`);
      return;
    }

    console.log(`🎯 Starting targeted polling for deployment ${deploymentId}`);
    
    const pollInterval = setInterval(async () => {
      try {
        // Get all deployments and find the specific one
        const response = await this.api.get('/deployments');
        const deployments = response.deployments || [];
        const deployment = deployments.find(d => d.id === deploymentId);
        
        if (deployment && deployment.cloud_run_url) {
          console.log(`🚀 URL retrieved for deployment ${deploymentId}: ${deployment.cloud_run_url}`);
          
          // Update the deployment
          this.dataManager.updateDeployment(deploymentId, {
            cloud_run_url: deployment.cloud_run_url,
            status: deployment.status || 'active'
          });

          // Show success notification
          utils.showToast(
            `🚀 Deployment ${deployment.name} is live! <a href="${deployment.cloud_run_url}" target="_blank" style="color: white; text-decoration: underline;">Open App</a>`, 
            'success', 
            8000
          );

          // Force immediate UI update
          this.dataManager.notifyListeners('deployment_url_updated', { 
            deploymentId, 
            url: deployment.cloud_run_url, 
            deployment 
          });

          // Stop polling this deployment
          this.stopDeploymentPolling(deploymentId);
        } else if (deployment && deployment.status === 'error') {
          console.log(`❌ Deployment ${deploymentId} failed, stopping polling`);
          
          // Update status
          this.dataManager.updateDeployment(deploymentId, {
            status: deployment.status,
            status_message: deployment.status_message
          });

          // Stop polling this deployment
          this.stopDeploymentPolling(deploymentId);
        } else if (!deployment) {
          console.log(`⚠️ Deployment ${deploymentId} not found, stopping polling`);
          this.stopDeploymentPolling(deploymentId);
        }
      } catch (error) {
        console.error(`❌ Failed to poll deployment ${deploymentId}:`, error);
      }
    }, 5000); // Poll every 5 seconds

    this.activePollingIntervals.set(deploymentId, pollInterval);
  }

  // Stop targeted polling for a specific deployment
  stopDeploymentPolling(deploymentId) {
    const interval = this.activePollingIntervals.get(deploymentId);
    if (interval) {
      clearInterval(interval);
      this.activePollingIntervals.delete(deploymentId);
      console.log(`⏹️ Stopped polling deployment ${deploymentId}`);
    }
  }

  // Cleanup method for when app is destroyed
  cleanup() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    // Clear all active polling intervals
    for (const [deploymentId, interval] of this.activePollingIntervals) {
      clearInterval(interval);
      console.log(`🧹 Cleaned up polling for deployment ${deploymentId}`);
    }
    this.activePollingIntervals.clear();
  }

  // Manual refresh method
  async refresh() {
    try {
      await this.dataManager.refresh();
      await this.healthCheckLocalServers();
      utils.showToast('Data refreshed', 'info');
    } catch (error) {
      console.error('Manual refresh failed:', error);
      utils.showToast('Data refreshed (sync failed)', 'warning');
    }
  }

  // Validate GCP token periodically
  async validateGCPToken() {
    if (!this.dataManager.isGCPConnectedStatus()) {
      return; // No GCP connection to validate
    }

    try {
      const result = await this.dataManager.validateGCPToken();
      if (!result.valid && result.reason !== 'not_connected') {
        console.warn('� GCP token validation failed:', result.message);
        // Token validity will be updated by the data manager
        // UI will automatically update due to the listener in main app
      }
    } catch (error) {
      console.error('❌ Failed to validate GCP token:', error);
    }
  }

  // Basic token validation (checks if token exists and is not obviously expired)
  isTokenValid(token) {
    if (!token) return false;
    
    try {
      // Basic JWT structure check
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      
      // Decode payload to check expiration
      const payload = JSON.parse(atob(parts[1]));
      const now = Math.floor(Date.now() / 1000);
      
      // Check if token is expired (with 5 minute buffer)
      if (payload.exp && payload.exp < (now + 300)) {
        console.warn('🔑 Token is expired or expires soon');
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('❌ Token validation error:', error);
      return false;
    }
  }

  // Handle token refresh when SSE connection fails due to auth
  async handleTokenRefresh() {
    console.log('🔄 Attempting to refresh authentication...');
    
    try {
      // Try to refresh the user session
      const response = await fetch('/api/auth/me', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const userData = await response.json();
        if (userData.token) {
          console.log('✅ Token refreshed successfully');
          this.api.setToken(userData.token);
          
          // Retry SSE connection with new token
          setTimeout(() => {
            this.startRealTimeUpdates();
          }, 1000);
          
          return;
        }
      }
      
      console.warn('⚠️ Token refresh failed, user may need to re-authenticate');
      // Could trigger a re-authentication flow here if needed
      
    } catch (error) {
      console.error('❌ Token refresh error:', error);
    }
  }
}
