import { utils } from '../utils.js';

export class DeploymentManager {
  constructor(api, dataManager, gcpManager, realtimeManager = null) {
    this.api = api;
    this.dataManager = dataManager;
    this.gcpManager = gcpManager;
    this.realtimeManager = realtimeManager;
  }

  // Set the realtime manager reference (called from main app)
  setRealtimeManager(realtimeManager) {
    this.realtimeManager = realtimeManager;
  }

  async createDeployment(deploymentData) {
    try {
      const response = await this.api.post('/deployments', deploymentData);
      
      // If we get a response with a deployment, it means the API call succeeded
      if (response.deployment) {
        // Add deployment to data manager regardless of its initial status
        // The deployment might be in 'creating' state initially, which is normal
        this.dataManager.addDeployment(response.deployment);
        
        // Start targeted polling for this deployment if it doesn't have a URL yet
        if (!response.deployment.cloud_run_url && this.realtimeManager) {
          console.log(`🎯 Starting polling for new deployment: ${response.deployment.id}`);
          this.realtimeManager.startDeploymentPolling(response.deployment.id);
        }
        
        // Only check for auth failures if the deployment is explicitly failed with auth errors
        if (this.isDeploymentAuthFailed(response.deployment)) {
          console.warn('🔑 Deployment created but has authentication issues:', response.deployment);
          this.handleGCPAuthError({ message: 'Deployment created but GCP authentication failed' });
          utils.showToast('Deployment created but may have authentication issues. Check logs.', 'warning');
        } else {
          utils.showToast('Deployment created successfully!', 'success');
        }
      } else if (response.success) {
        // Fallback for old API response format
        console.log('✅ Deployment created successfully:', response.deploymentId);
        utils.showToast('Deployment created successfully!', 'success');
        
        // Start targeted polling for this deployment if we have the ID
        if (response.deploymentId && this.realtimeManager) {
          console.log(`🎯 Starting polling for new deployment: ${response.deploymentId}`);
          this.realtimeManager.startDeploymentPolling(response.deploymentId);
        }
      } else {
        throw new Error('No deployment data received from server');
      }
      
      return response.deployment || { id: response.deploymentId };
    } catch (error) {
      console.error('❌ Deployment creation failed:', error);
      
      // Check if this is a GCP-specific error from the backend
      if (error.gcp_error || (error.response && error.response.gcp_error)) {
        console.log('🔧 GCP-specific error detected from backend');
        
        // Enhanced error handling for different types of GCP errors
        if (this.isGCPAPINotEnabledError(error)) {
          this.handleGCPAPINotEnabledError(error);
        } else if (this.isGCPAuthError(error)) {
          console.warn('🔑 GCP authentication error during deployment creation:', error);
          this.handleGCPAuthError(error);
        } else {
          // Generic GCP error - show a helpful message
          utils.showToast('GCP deployment error: ' + error.message, 'error');
        }
      } else if (this.isGCPAPINotEnabledError(error)) {
        this.handleGCPAPINotEnabledError(error);
      } else if (this.isGCPAuthError(error)) {
        console.warn('🔑 GCP authentication error during deployment creation:', error);
        this.handleGCPAuthError(error);
        // Do NOT add deployment to data manager when GCP auth fails
      } else {
        utils.showToast('Failed to create deployment: ' + error.message, 'error');
      }
      throw error;
    }
  }

  async deleteDeployment(id) {
    if (!confirm('Are you sure you want to delete this deployment?')) return false;

    try {
      await this.api.delete(`/deployments/${id}`);
      
      // Remove from data manager
      this.dataManager.removeDeployment(id);
      
      utils.showToast('Deployment deleted successfully', 'success');
      return true;
    } catch (error) {
      utils.showToast('Failed to delete deployment: ' + error.message, 'error');
      throw error;
    }
  }

  async reloadConfig(deploymentId) {
    try {
      await this.api.post(`/deployments/${deploymentId}/reload-config`);
      utils.showToast('Configuration reloaded successfully', 'success');
      
      // Refresh data to get updated deployment info
      await this.dataManager.loadData();
      return true;
    } catch (error) {
      utils.showToast('Failed to reload configuration: ' + error.message, 'error');
      throw error;
    }
  }

  async loadMetrics(deploymentId) {
    try {
      const response = await this.api.get(`/deployments/${deploymentId}/metrics`);
      return response.metrics || {};
    } catch (error) {
      console.error('Failed to load metrics:', error);
      throw error;
    }
  }

  async loadLogs(deploymentId) {
    try {
      const response = await this.api.get(`/deployments/${deploymentId}/logs`);
      return {
        logs: response.logs || [],
        warning: response.warning
      };
    } catch (error) {
      console.error('Failed to load logs:', error);
      throw error;
    }
  }

  async downloadLogs(deploymentId) {
    try {
      const { logs } = await this.loadLogs(deploymentId);
      
      if (logs.length === 0) {
        utils.showToast('No logs to download', 'warning');
        return;
      }
      
      // Format logs as text
      const logText = logs.map(log => {
        const timestamp = new Date(log.timestamp).toISOString();
        const severity = log.severity || 'INFO';
        const message = log.message || 'No message';
        const source = log.source || 'unknown';
        
        let logLine = `[${timestamp}] ${severity} [${source}] ${message}`;
        
        // Add labels if present
        if (log.labels && Object.keys(log.labels).length > 0) {
          const labels = Object.entries(log.labels)
            .map(([key, value]) => `${key}=${value}`)
            .join(' ');
          logLine += ` | Labels: ${labels}`;
        }
        
        return logLine;
      }).join('\n');
      
      // Create and download file
      const blob = new Blob([logText], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs-${deploymentId}-${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      utils.showToast('Logs downloaded successfully', 'success');
    } catch (error) {
      console.error('Failed to download logs:', error);
      utils.showToast('Failed to download logs: ' + error.message, 'error');
    }
  }

  showNewDeploymentModal(modal) {
    console.log('showNewDeploymentModal called');
    
    // Validate GCP connection
    if (!this.gcpManager.validateGCPForDeployment()) {
      return;
    }

    // Check deployment limits for free users
    const user = this.dataManager.getUser();
    if (user.plan === 'free') {
      const deployments = this.dataManager.getDeployments();
      const activeDeployments = deployments.filter(d => 
        d.status === 'active' || d.status === 'idle' || d.status === 'creating'
      ).length;
      
      if (activeDeployments >= 1) {
        utils.showToast('Free plan allows 1 deployment. Upgrade for more!', 'warning');
        // Trigger plan management modal
        if (window.app && window.app.userManager) {
          window.app.userManager.showManagePlan(modal);
        }
        return;
      }
    }

    // Load service profiles and show modal
    this.loadServiceProfilesAndShowModal(modal);
  }

  async loadServiceProfilesAndShowModal(modal) {
    try {
      await this.dataManager.loadServiceProfiles();
      const serviceProfiles = this.dataManager.getServiceProfiles();
      
      console.log('Service profiles loaded:', serviceProfiles);
      
      // Filter out any null/undefined profiles and ensure they have required properties
      const validServiceProfiles = (serviceProfiles || []).filter(profile => {
        if (!profile) {
          console.warn('Found null/undefined service profile');
          return false;
        }
        if (!profile.id) {
          console.warn('Found service profile without id:', profile);
          return false;
        }
        if (!profile.name) {
          console.warn('Found service profile without name:', profile);
          return false;
        }
        return true;
      });
      
      if (validServiceProfiles.length === 0) {
        utils.showToast('No valid service profiles found. Please create one first.', 'warning');
        // Trigger service profile management modal
        if (window.app && window.app.serviceProfileManager) {
          window.app.serviceProfileManager.showManageServiceProfilesModal(modal);
        }
        return;
      }

      // Load GCP projects for project selection
      await this.dataManager.loadGCPProjects();
      const gcpProjects = this.dataManager.getGCPProjects();
      
      if (!gcpProjects || gcpProjects.length === 0) {
        utils.showToast('No GCP projects available. Please check your GCP connection.', 'warning');
        return;
      }

      const configs = this.dataManager.getConfigs() || [];

      modal.show('Create New Deployment', `
        <form id="deployment-form">
          <div class="form-group">
            <label class="form-label">Deployment Name *</label>
            <input type="text" class="form-input" name="name" required 
                   placeholder="my-app" pattern="^[a-z0-9\\-]+$">
            <div class="form-help">Lowercase letters, numbers, and hyphens only</div>
          </div>
          
          <div class="form-group">
            <label class="form-label">GCP Project *</label>
            <select class="form-select" name="projectId" required>
              <option value="">Select a GCP project...</option>
              ${gcpProjects.map(project => {
                const user = this.dataManager.getUser();
                const isDefault = user?.gcp_project_id === project.projectId;
                return `<option value="${project.projectId}" ${isDefault ? 'selected' : ''}>${project.name} (${project.projectId})${isDefault ? ' - Default' : ''}</option>`;
              }).join('')}
            </select>
            <div class="form-help">Choose which GCP project to deploy to. Your default project is pre-selected.</div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Service Profile *</label>
            <select class="form-select" name="serviceProfileId" required>
              <option value="">Select a service profile...</option>
              ${validServiceProfiles.map(profile => 
                `<option value="${profile.id}">${profile.name} (${profile.container_image_url || 'No image'})</option>`
              ).join('')}
            </select>
            <div class="form-help">Service profile defines container image, resources, and deployment settings</div>
          </div>
          
          <div class="form-group">
            <label class="form-label">JSphere Config (Optional)</label>
            <select class="form-select" name="configId">
              <option value="">Deploy without config...</option>
              ${configs.map(config => 
                `<option value="${config.id}">${config.name}</option>`
              ).join('')}
            </select>
            <div class="form-help">JSphere configuration will be automatically loaded if selected</div>
          </div>
        </form>
      `, {
        primaryButton: {
          text: 'Deploy',
          action: 'window.app.createDeployment()'
        },
        secondaryButton: {
          text: 'Cancel'
        }
      });
    } catch (error) {
      console.error('Failed to load service profiles:', error);
      utils.showToast('Failed to load service profiles: ' + error.message, 'error');
    }
  }

  async handleCreateDeployment() {
    const form = document.getElementById('deployment-form');
    if (!utils.validateForm(form)) return;

    const formData = new FormData(form);
    const deploymentData = {
      name: formData.get('name'),
      projectId: formData.get('projectId'),
      serviceProfileId: formData.get('serviceProfileId'),
      configId: formData.get('configId') || null
    };

    try {
      await this.createDeployment(deploymentData);
      
      // Hide modal
      if (window.app && window.app.modal) {
        window.app.modal.hide();
      }
    } catch (error) {
      // Error already handled in createDeployment
    }
  }

  // Helper method to escape HTML for log display
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Format logs for display
  formatLogsForDisplay(logs) {
    if (logs.length === 0) {
      return '<div class="no-logs">No logs available</div>';
    }
    
    return logs.map(log => {
      const timestamp = new Date(log.timestamp).toLocaleString();
      const severity = log.severity || 'INFO';
      const message = log.message || 'No message';
      const source = log.source || 'unknown';
      
      return `
        <div class="log-entry log-${severity.toLowerCase()}">
          <div class="log-header">
            <span class="log-timestamp">${timestamp}</span>
            <span class="log-severity log-severity-${severity.toLowerCase()}">${severity}</span>
            <span class="log-source">${source}</span>
          </div>
          <div class="log-message">${this.escapeHtml(message)}</div>
          ${log.labels && Object.keys(log.labels).length > 0 ? `
            <div class="log-labels">
              ${Object.entries(log.labels).map(([key, value]) => 
                `<span class="log-label">${key}: ${value}</span>`
              ).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  // Create logs container HTML
  createLogsContainer(deploymentId, logs, warning) {
    return `
      <div class="logs-container">
        <div class="logs-header">
          <div class="logs-info">
            <span class="logs-count">${logs.length} log entries</span>
            ${warning ? '<span class="logs-warning">⚠️ ' + warning + '</span>' : ''}
          </div>
          <div class="logs-actions">
            <button class="btn btn-sm btn-secondary" onclick="window.app.deploymentManager.refreshLogs('${deploymentId}')">
              🔄 Refresh
            </button>
            <button class="btn btn-sm btn-secondary" onclick="window.app.deploymentManager.downloadLogs('${deploymentId}')">
              📥 Download
            </button>
          </div>
        </div>
        <div class="logs-content">
          ${this.formatLogsForDisplay(logs)}
        </div>
      </div>
    `;
  }

  // Refresh logs for a specific deployment
  async refreshLogs(deploymentId) {
    const container = document.getElementById(`logs-${deploymentId}`);
    if (!container) return;

    container.innerHTML = 'Loading logs...';
    
    try {
      const { logs, warning } = await this.loadLogs(deploymentId);
      container.innerHTML = this.createLogsContainer(deploymentId, logs, warning);
    } catch (error) {
      container.innerHTML = `
        <div class="logs-error">
          <p>Failed to load logs: ${error.message}</p>
          <button class="btn btn-sm btn-secondary" onclick="window.app.deploymentManager.refreshLogs('${deploymentId}')">
            🔄 Retry
          </button>
        </div>
      `;
    }
  }

  // Get deployment by ID
  getDeployment(deploymentId) {
    return this.dataManager.getDeployments().find(d => d.id === deploymentId);
  }

  // Get deployments by status
  getDeploymentsByStatus(status) {
    return this.dataManager.getDeployments().filter(d => d.status === status);
  }

  // Get active deployments count
  getActiveDeploymentsCount() {
    return this.dataManager.getDeployments().filter(d => 
      d.status === 'active' || d.status === 'idle' || d.status === 'creating'
    ).length;
  }

  // Check if error is a GCP authentication error
  isGCPAuthError(error) {
    if (!error || !error.message) return false;
    
    const message = error.message.toLowerCase();
    return message.includes('unauthorized') || 
           message.includes('unauthenticated') || 
           message.includes('invalid authentication') ||
           message.includes('access token') ||
           (error.status === 401);
  }

  // Check if deployment failed due to authentication issues
  isDeploymentAuthFailed(deployment) {
    if (!deployment) return false;
    
    // Check if deployment status indicates auth failure
    if (deployment.status === 'failed' || deployment.status === 'error') {
      // Check if error message indicates auth issues
      const errorMessage = (deployment.error_message || '').toLowerCase();
      return errorMessage.includes('unauthorized') || 
             errorMessage.includes('unauthenticated') || 
             errorMessage.includes('invalid authentication') ||
             errorMessage.includes('access token') ||
             errorMessage.includes('permission denied') ||
             errorMessage.includes('authentication failed');
    }
    
    return false;
  }

  // Check if error is a GCP API not enabled error
  isGCPAPINotEnabledError(error) {
    if (!error || !error.message) return false;
    
    const message = error.message.toLowerCase();
    return message.includes('gcp api not enabled') || 
           message.includes('has not been used') || 
           message.includes('is disabled') ||
           message.includes('enable it by visiting');
  }

  // Handle GCP API not enabled errors
  handleGCPAPINotEnabledError(error) {
    console.warn('🔧 GCP API not enabled error detected:', error.message);
    
    // Extract the project-specific activation URL and project info from the backend error
    const enableUrlMatch = error.message.match(/Enable URL:\s*(https:\/\/[^\s]+)/);
    const projectMatch = error.message.match(/Project:\s*([^()]+)(?:\s*\(([^)]+)\))?/i);
    
    const activationUrl = enableUrlMatch ? enableUrlMatch[1] : null;
    let projectName = 'your project';
    let projectId = '';
    
    if (projectMatch) {
      const fullMatch = projectMatch[1].trim();
      const projectIdMatch = projectMatch[2];
      
      if (projectIdMatch) {
        // Format: "Project Name (project-id)"
        projectName = fullMatch;
        projectId = projectIdMatch;
      } else {
        // Format: "project-id" only
        projectName = fullMatch;
        projectId = fullMatch;
      }
    }
    
    // Show detailed modal with instructions
    if (window.app && window.app.modal) {
      window.app.modal.show('GCP API Not Enabled', `
        <div class="api-error-container">
          <div class="error-icon">⚠️</div>
          <h3>Cloud Run API Not Enabled</h3>
          <p>The Cloud Run Admin API needs to be enabled for project <strong>${projectName}</strong> before you can deploy.</p>
          
          <div class="error-details">
            <h4>What you need to do:</h4>
            <ol>
              <li>Click the "Enable API" button below to open the Google Cloud Console</li>
              <li>Sign in with your Google account if prompted</li>
              <li>Click the "Enable" button on the API page</li>
              <li>Wait a few minutes for the API to be activated</li>
              <li>Return here and try deploying again</li>
            </ol>
          </div>
          
          ${activationUrl ? `
            <div class="action-buttons">
              <a href="${activationUrl}" target="_blank" class="btn btn-primary">
                🚀 Enable Cloud Run API for ${projectName}
              </a>
            </div>
          ` : `
            <div class="action-buttons">
              <a href="https://console.cloud.google.com/apis/library/run.googleapis.com?project=${projectId}" target="_blank" class="btn btn-primary">
                🚀 Enable Cloud Run API for ${projectName}
              </a>
            </div>
          `}
          
          <div class="error-note">
            <strong>Note:</strong> If you just enabled the API, please wait a few minutes for the changes to take effect before trying again.
          </div>
        </div>
      `, {
        primaryButton: {
          text: 'I\'ve Enabled the API',
          action: 'window.app.modal.hide()'
        },
        secondaryButton: {
          text: 'Cancel'
        }
      });
    }
    
    // Also show a persistent toast message
    utils.showToast(
      'Cloud Run API needs to be enabled. Check the modal for instructions.', 
      'error',
      10000
    );
  }

  // Handle GCP authentication errors
  handleGCPAuthError(error) {
    console.warn('🔑 GCP authentication error detected:', error.message);
    
    // Mark token as invalid in data manager
    this.dataManager.setGCPTokenValidity(false, 'auth_error');
    
    // Show user-friendly message with reconnection option
    utils.showToast(
      'Your GCP session has expired. Please click "Reconnect GCP" to continue deploying.', 
      'warning',
      7000
    );
    
    // The UI will automatically update to show the reconnect button
    // due to the token validity change triggering a listener
  }
}
