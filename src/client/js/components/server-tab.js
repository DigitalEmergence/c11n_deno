export class ServerTabs {
  constructor(deployments, localServers) {
    this.deployments = deployments || [];
    this.localServers = localServers || [];
    this.render();
  }

  update(deployments, localServers) {
    this.deployments = deployments || [];
    this.localServers = localServers || [];
    this.render();
  }

  render() {
    const container = document.getElementById('server-tabs');
    
    if (this.deployments.length === 0 && this.localServers.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No servers connected</h3>
          <p>Link a local server or create a cloud deployment to get started.</p>
        </div>
      `;
      return;
    }

    const tabs = [
      ...this.localServers.map(server => this.createLocalServerTab(server)),
      ...this.deployments.map(deployment => this.createDeploymentTab(deployment))
    ];

    container.innerHTML = tabs.join('');
    this.attachEvents();
  }

  createLocalServerTab(server) {
    const actualStatus = this.getLocalServerStatus(server);
    const hasConfig = !!server.config;
    const statusClass = this.getStatusClass(actualStatus, hasConfig);
    const statusIcon = this.getStatusIcon(actualStatus, hasConfig);
    
    return `
      <div class="server-tab-local" data-type="local" data-id="${server.id}">
        <div class="server-tab-header" onclick="window.app.toggleServerInfo('${server.id}')">
          <div class="server-tab-actions">
            <button class="btn btn-error delete-server-btn" 
                    onclick="event.stopPropagation(); window.app.deleteLocalServer('${server.id}')" 
                    title="Unlink local server">
              <img src="/assets/images/jsphere-error.png" alt="Error JSphere" class="jsphere-logo">
            </button>
          </div>
          <div class="server-tab-info">
            <div class="server-tab-url">${server.url}</div>
            <div class="server-tab-description">
              ${server.config ? `${server.config.project_name} - ${server.config.project_app_config}` : 'No application loaded'}
            </div>
          </div>
          <div class="server-status-icon ${statusClass}">${statusIcon}</div>
        </div>
        <div class="server-info-section hidden" id="info-${server.id}">
          ${this.createLocalServerInfo(server)}
        </div>
      </div>
    `;
  }

  createDeploymentTab(deployment) {
    console.log('🔍 createDeploymentTab called for deployment:', {
      id: deployment.id,
      name: deployment.name,
      status: deployment.status,
      cloud_run_url: deployment.cloud_run_url,
      hasConfig: !!deployment.config
    });
    
    const actualStatus = this.getDeploymentStatus(deployment);
    const hasConfig = !!deployment.config;
    const hasUrl = !!deployment.cloud_run_url;
    const statusClass = this.getStatusClass(actualStatus, hasConfig, hasUrl);
    const statusIcon = this.getStatusIcon(actualStatus, hasConfig, hasUrl);
    
    console.log('🔍 createDeploymentTab computed values:', {
      actualStatus,
      hasConfig,
      hasUrl,
      statusClass
    });
    
    return `
      <div class="server-tab" data-type="deployment" data-id="${deployment.id}">
        <div class="server-tab-header" onclick="window.app.toggleServerInfo('${deployment.id}')">
          <div class="server-tab-actions">
            <button class="btn-error delete-server-btn" 
                    onclick="event.stopPropagation(); window.app.deleteDeployment('${deployment.id}')" 
                    title="Delete deployment">
              <img src="/assets/icons/c11n_cancel_icon.png" alt="Cancel Server" class="jsphere-logo">
            </button>
          </div>
          <div class="server-tab-info">
            <div class="server-tab-url">
              ${deployment.cloud_run_url ? 
                `<a href="${deployment.cloud_run_url}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="cloud-run-link">${deployment.cloud_run_url}</a>` : 
                deployment.name
              }
            </div>
            <div class="server-tab-description">
              ${deployment.config ? `${deployment.config.project_name} - ${deployment.config.project_app_config}` : 'No application loaded'}
              ${deployment.gcp_project_name ? `<br><small class="gcp-project-info">GCP Project: ${deployment.gcp_project_name}</small>` : ''}
            </div>
          </div>
          <div class="server-status-icon ${statusClass}">${statusIcon}</div>
        </div>
        <div class="server-info-section hidden" id="info-${deployment.id}">
          ${this.createDeploymentInfo(deployment)}
        </div>
      </div>
    `;
  }

  createLocalServerInfo(server) {
    return `
      <div class="server-info-tabs">
        <div class="tab-buttons">
          <button class="tab-btn active" onclick="window.app.showTab('${server.id}', 'configuration')">
            Configuration
          </button>
          <button class="tab-btn" onclick="window.app.showTab('${server.id}', 'application')">
            Application
          </button>
        </div>
        <div class="tab-content">
          <div id="tab-${server.id}-configuration" class="tab-pane active">
            ${this.createConfigurationTab(server)}
          </div>
          <div id="tab-${server.id}-application" class="tab-pane hidden">
            ${this.createApplicationTab(server)}
          </div>
        </div>
      </div>
    `;
  }

  createDeploymentInfo(deployment) {
    return `
      <div class="server-info-tabs">
        <div class="tab-buttons">
          <button class="tab-btn active" onclick="window.app.showTab('${deployment.id}', 'configuration')">
            Configuration
          </button>
          <button class="tab-btn" onclick="window.app.showTab('${deployment.id}', 'metrics')">
            Metrics
          </button>
          <button class="tab-btn" onclick="window.app.showTab('${deployment.id}', 'logs')">
            Logs
          </button>
        </div>
        <div class="tab-content">
          <div id="tab-${deployment.id}-configuration" class="tab-pane active">
            ${this.createConfigurationTab(deployment)}
          </div>
          <div id="tab-${deployment.id}-metrics" class="tab-pane hidden">
            <div class="metrics-header">
              <h4>Performance Metrics</h4>
              <div class="metrics-actions">
                  <button class="btn btn-sm btn-secondary" onclick="window.app.loadMetrics('${deployment.id}')">
                    🔄 Refresh Metrics
                  </button>
              </div>
            </div>
            <div id="metrics-${deployment.id}">Loading metrics...</div>
          </div>
          <div id="tab-${deployment.id}-logs" class="tab-pane hidden">
            <div id="logs-${deployment.id}">Loading logs...</div>
          </div>
        </div>
      </div>
    `;
  }

  createConfigurationTab(server) {
    const isDeployment = server.cloud_run_url !== undefined;
    
    if (server.config) {
      return `
        <div class="config-display">
          <h4>Loaded Configuration: ${server.config.name}</h4>
          <div class="config-details">
            <div class="config-row">
              <span class="config-label">Project:</span>
              <span class="config-value">${server.config.project_namespace}/${server.config.project_name}</span>
            </div>
            <div class="config-row">
              <span class="config-label">App Config:</span>
              <span class="config-value">${server.config.project_app_config}</span>
            </div>
            <div class="config-row">
              <span class="config-label">Port:</span>
              <span class="config-value">${server.config.server_http_port}</span>
            </div>
            ${isDeployment && server.cloud_run_url ? `
              <div class="config-row">
                <span class="config-label">Cloud Run URL:</span>
                <span class="config-value">
                  <a href="${server.cloud_run_url}" target="_blank" rel="noopener noreferrer" class="cloud-run-link">
                    ${server.cloud_run_url}
                  </a>
                </span>
              </div>
            ` : ''}
            ${isDeployment && server.gcp_project_name ? `
              <div class="config-row">
                <span class="config-label">GCP Project:</span>
                <span class="config-value">${server.gcp_project_name}</span>
              </div>
            ` : ''}
            ${isDeployment && server.region ? `
              <div class="config-row">
                <span class="config-label">Region:</span>
                <span class="config-value">${server.region}</span>
              </div>
            ` : ''}
          </div>
          <div class="config-actions">
            <button class="btn btn-secondary mt-4" onclick="window.app.changeConfig('${server.id}')">
              Change Configuration
            </button>
            ${isDeployment ? `
              <button class="btn btn-primary mt-4" onclick="window.app.reloadConfig('${server.id}')">
                Reload Current Config
              </button>
            ` : ''}
          </div>
        </div>
      `;
    } else {
      return `
        <div class="config-empty">
          <p>No configuration loaded</p>
          ${isDeployment && server.cloud_run_url ? `
            <div class="config-details mb-4">
              <div class="config-row">
                <span class="config-label">Cloud Run URL:</span>
                <span class="config-value">
                  <a href="${server.cloud_run_url}" target="_blank" rel="noopener noreferrer" class="cloud-run-link">
                    ${server.cloud_run_url}
                  </a>
                </span>
              </div>
            </div>
          ` : ''}
          <button class="btn btn-primary" onclick="window.app.loadConfig('${server.id}')">
            Load Configuration
          </button>
        </div>
      `;
    }
  }

  createApplicationTab(server) {
    if (!server.config) {
      return `
        <div class="application-empty">
          <p class="text-gray-500">Load a configuration first to see application packages.</p>
          <div class="application-actions">
            <button class="btn btn-primary" onclick="window.app.loadConfig('${server.id}')">
              Load Configuration
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div class="application-packages">
        <div class="application-header">
          <h4>Application Packages</h4>
          <div class="application-actions">
            <button class="btn btn-sm btn-secondary" onclick="window.app.createPackage('${server.id}')">
              Create Package
            </button>
            <button class="btn btn-sm btn-secondary" onclick="window.app.createProject('${server.id}')">
              Create Project
            </button>
            <button class="btn btn-sm btn-primary" onclick="window.app.triggerPreview('${server.id}')">
              Trigger Preview
            </button>
            <button class="btn btn-sm btn-secondary" onclick="window.app.refreshPackageStatus('${server.id}')">
              🔄 Refresh
            </button>
          </div>
        </div>
        
        <div id="package-list-${server.id}" class="package-list">
          <div class="package-empty">No packages found</div>
        </div>
        
        <div id="application-footer-${server.id}" class="application-footer" style="display: none;">
          <div class="application-stats">
            <span class="stat-item">
              <strong id="checked-out-count-${server.id}">0</strong> checked out
            </span>
            <span class="stat-item">
              <strong id="available-count-${server.id}">0</strong> available
            </span>
            <span class="stat-item">
              <strong id="total-count-${server.id}">0</strong> total
            </span>
          </div>
        </div>
      </div>
    `;
  }

  getStatusClass(status, hasConfig = false, hasUrl = false) {
    // Enhanced status logic based on deployment state and config
    if (status === 'creating' || status === 'deploying') {
      return 'status-deploying';
    }
    
    if (status === 'loading-config') {
      return 'status-loading-config';
    }
    
    if (status === 'error' || status === 'failed') {
      return 'status-error';
    }
    
    // For deployments: check if URL exists and config is loaded
    if (hasUrl !== undefined) {
      if (hasUrl && hasConfig) {
        return 'status-active';
      } else if (hasUrl && !hasConfig) {
        return 'status-idle';
      } else {
        return 'status-deploying'; // Still deploying if no URL
      }
    }
    
    // Legacy status mapping for local servers
    switch (status) {
      case 'active': return hasConfig ? 'status-active' : 'status-idle';
      case 'idle': return 'status-idle';
      default: return 'status-unlinked';
    }
  }

  getStatusIcon(status, hasConfig = false, hasUrl = false, isLoadingConfig = false) {
    console.log('🔍 getStatusIcon called with:', { status, hasConfig, hasUrl, isLoadingConfig });
    
    // Show spinner for loading states
    if (isLoadingConfig || status === 'loading-config') {
      return '<div class="loading-spinner" title="Loading configuration..."></div>';
    }
    
    if (status === 'creating' || status === 'deploying') {
      return '<div class="loading-spinner" title="Deploying to Cloud Run..."></div>';
    }
    
    if (status === 'error' || status === 'failed') {
      return '<img src="/assets/images/jsphere-error.png" alt="Error JSphere" class="jsphere-logo" title="Deployment error">';
    }
    
    // For deployments: determine icon based on URL and config state
    if (hasUrl !== undefined) {
      if (!hasUrl) {
        // Still deploying if no URL
        console.log('🔍 No URL - showing deploying spinner');
        return '<div class="loading-spinner" title="Deploying to Cloud Run..."></div>';
      } else if (hasUrl && hasConfig) {
        // URL exists and config loaded
        console.log('🔍 URL + Config - showing ACTIVE image');
        return '<img src="/assets/images/jsphere-active.png" alt="Active JSphere" class="jsphere-logo" title="Active with configuration">';
      } else if (hasUrl && !hasConfig) {
        // URL exists but no config
        console.log('🔍 URL but NO Config - showing IDLE image');
        return '<img src="/assets/images/jsphere-idle.png" alt="Idle JSphere" class="jsphere-logo" title="Ready for configuration">';
      }
    }
    
    // Legacy status mapping for local servers and fallback
    console.log('🔍 Using legacy status mapping for status:', status);
    switch (status) {
      case 'active': 
        const activeIcon = hasConfig 
          ? '<img src="/assets/images/jsphere-active.png" alt="Active JSphere" class="jsphere-logo" title="Active with configuration">'
          : '<img src="/assets/images/jsphere-idle.png" alt="Idle JSphere" class="jsphere-logo" title="Ready for configuration">';
        console.log('🔍 Active status - returning:', activeIcon);
        return activeIcon;
      case 'idle': 
        console.log('🔍 Idle status - showing IDLE image');
        return '<img src="/assets/images/jsphere-idle.png" alt="Idle JSphere" class="jsphere-logo" title="Ready for configuration">';
      default: 
        console.log('🔍 Default status - showing unlinked image');
        return '<img src="/assets/images/jsphere-unlinked.webp" alt="Unlinked JSphere" class="jsphere-logo" title="Not connected">';
    }
  }

  // Helper method to determine deployment status using utils
  getDeploymentStatus(deployment) {
    // Use utils for status determination
    if (window.utils && window.utils.getDeploymentStatus) {
      const status = window.utils.getDeploymentStatus(deployment);
      // Convert status class to simple status string
      return status.replace('status-', '');
    }
    
    // Fallback logic if utils not available
    if (deployment.status === 'error' || deployment.status === 'failed') {
      return 'error';
    }
    
    if (deployment.status === 'creating' || !deployment.cloud_run_url) {
      return 'deploying';
    }
    
    if (deployment.cloud_run_url && deployment.config) {
      return 'active';
    }
    
    if (deployment.cloud_run_url && !deployment.config) {
      return 'idle';
    }
    
    return deployment.status || 'deploying';
  }

  // Helper method to determine local server status using utils
  getLocalServerStatus(server) {
    // Use utils for status determination
    if (window.utils && window.utils.getLocalServerStatus) {
      const status = window.utils.getLocalServerStatus(server);
      // Convert status class to simple status string
      return status.replace('status-', '');
    }
    
    // Fallback logic if utils not available
    if (server.config) {
      return 'active';
    }
    
    return server.status || 'idle';
  }

  attachEvents() {
    // Events are handled via onclick attributes for simplicity
  }
}
