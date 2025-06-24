export class ServerTabs {
  constructor(deployments, localServers, remoteServers) {
    this.deployments = deployments || [];
    this.localServers = localServers || [];
    this.remoteServers = remoteServers || [];
    this.render();
  }

  update(deployments, localServers, remoteServers) {
    this.deployments = deployments || [];
    this.localServers = localServers || [];
    this.remoteServers = remoteServers || [];
    this.render();
  }

  render() {
    const container = document.getElementById('server-tabs');
    
    if (this.deployments.length === 0 && this.localServers.length === 0 && this.remoteServers.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No servers connected</h3>
          <p>Link a local server, remote server, or create a cloud deployment to get started.</p>
        </div>
      `;
      return;
    }

    const tabs = [
      ...this.localServers.map(server => this.createLocalServerTab(server)),
      ...this.remoteServers.map(server => this.createRemoteServerTab(server)),
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
            <button class="btn-error delete-server-btn" 
                    onclick="event.stopPropagation(); window.app.deleteLocalServer('${server.id}')" 
                    title="Unlink local server">
              <img src="/assets/icons/c11n_cancel_icon.png" alt="Cancel Server" class="delete-icon">
            </button>
          </div>
          <div class="server-tab-info">
            <div class="server-tab-url">
              <a href="${server.url}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="local-server-link">${server.url}</a>
            </div>
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

  createRemoteServerTab(server) {
    const actualStatus = this.getRemoteServerStatus(server);
    const hasConfig = !!server.config;
    const statusClass = this.getStatusClass(actualStatus, hasConfig);
    const statusIcon = this.getStatusIcon(actualStatus, hasConfig);
    
    return `
      <div class="server-tab-remote" data-type="remote" data-id="${server.id}">
        <div class="server-tab-header" onclick="window.app.toggleServerInfo('${server.id}')">
          <div class="server-tab-actions">
            <button class="btn-error delete-server-btn" 
                    onclick="event.stopPropagation(); window.app.deleteRemoteServer('${server.id}')" 
                    title="Unlink remote server">
              <img src="/assets/icons/c11n_cancel_icon.png" alt="Cancel Server" class="delete-icon">
            </button>
          </div>
          <div class="server-tab-info">
            <div class="server-tab-url">
              <a href="${server.url}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" class="remote-server-link">${server.url}</a>
            </div>
            <div class="server-tab-description">
              ${server.config ? `${server.config.project_name} - ${server.config.project_app_config}` : 'No application loaded'}
              <br><small class="remote-server-info">Remote Server</small>
            </div>
          </div>
          <div class="server-status-icon ${statusClass}">${statusIcon}</div>
        </div>
        <div class="server-info-section hidden" id="info-${server.id}">
          ${this.createRemoteServerInfo(server)}
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
              <img src="/assets/icons/c11n_cancel_icon.png" alt="Cancel Server" class="delete-icon">
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
          <button class="tab-btn active" onclick="window.app.showTab('${server.id}', 'actions')">
            Actions
          </button>
          <button class="tab-btn" onclick="window.app.showTab('${server.id}', 'application')">
            Application
          </button>
        </div>
        <div class="tab-content">
          <div id="tab-${server.id}-actions" class="tab-pane active">
            ${this.createActionsTab(server)}
          </div>
          <div id="tab-${server.id}-application" class="tab-pane hidden">
            ${this.createApplicationTab(server)}
          </div>
        </div>
      </div>
    `;
  }

  createRemoteServerInfo(server) {
    return `
      <div class="server-info-tabs">
        <div class="tab-buttons">
          <button class="tab-btn active" onclick="window.app.showTab('${server.id}', 'actions')">
            Actions
          </button>
        </div>
        <div class="tab-content">
          <div id="tab-${server.id}-actions" class="tab-pane active">
            ${this.createActionsTab(server)}
          </div>
        </div>
      </div>
    `;
  }

  createDeploymentInfo(deployment) {
    return `
      <div class="server-info-tabs">
        <div class="tab-buttons">
          <button class="tab-btn active" onclick="window.app.showTab('${deployment.id}', 'actions')">
            Actions
          </button>
          <button class="tab-btn" onclick="window.app.showTab('${deployment.id}', 'metrics')">
            Metrics
          </button>
          <button class="tab-btn" onclick="window.app.showTab('${deployment.id}', 'logs')">
            Logs
          </button>
        </div>
        <div class="tab-content">
          <div id="tab-${deployment.id}-actions" class="tab-pane active">
            ${this.createActionsTab(deployment)}
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

  createActionsTab(server) {
    const isDeployment = server.cloud_run_url !== undefined;
    const isRemoteServer = server.url && !server.cloud_run_url && !server.port; // Remote servers have URL but no port or cloud_run_url
    const isLocalServer = server.port !== undefined; // Local servers have port
    
    return `
      <div class="actions-container">
        <div class="actions-header">
          <h4>JSphere Commands</h4>
          <p class="actions-description">Execute commands on the JSphere server</p>
        </div>
        
        <div class="actions-list">
          ${this.createLoadConfigAction(server)}
          ${isLocalServer ? this.createLocalServerActions(server) : ''}
        </div>
      </div>
    `;
  }

  createLoadConfigAction(server) {
    const isDeployment = server.cloud_run_url !== undefined;
    
    return `
      <div class="action-item">
        <div class="action-header" onclick="window.app.toggleActionDetails('loadconfig-${server.id}')">
          <div class="action-info">
            <h5 class="action-title">Load Configuration</h5>
            <p class="action-description">Load a JSphere configuration onto the server</p>
          </div>
          <div class="action-toggle">
            <span class="toggle-arrow">▼</span>
          </div>
        </div>
        <div class="action-details hidden" id="loadconfig-${server.id}">
          <div class="action-form">
            <div class="form-group">
              <label class="form-label">Select Configuration:</label>
              <select class="form-select" id="config-select-${server.id}">
                <option value="">Choose a configuration...</option>
              </select>
              <div class="form-help">Select from your saved JSphere configurations</div>
            </div>
            
            <div class="config-preview hidden" id="config-preview-${server.id}">
              <h6>Configuration Preview:</h6>
              <div class="config-preview-content">
                <pre id="config-preview-json-${server.id}"></pre>
              </div>
            </div>
            
            <div class="action-buttons">
              <button class="btn btn-primary" onclick="window.app.executeLoadConfig('${server.id}')" 
                      id="load-config-btn-${server.id}" disabled>
                Load Configuration
              </button>
              <button class="btn btn-secondary" onclick="window.app.refreshConfigs('${server.id}')">
                🔄 Refresh Configs
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  createLocalServerActions(server) {
    return `
      <div class="action-item">
        <div class="action-header" onclick="window.app.toggleActionDetails('checkout-${server.id}')">
          <div class="action-info">
            <h5 class="action-title">Checkout Package</h5>
            <p class="action-description">Check out a package locally on the server</p>
          </div>
          <div class="action-toggle">
            <span class="toggle-arrow">▼</span>
          </div>
        </div>
        <div class="action-details hidden" id="checkout-${server.id}">
          <div class="action-form">
            <div class="form-group">
              <label class="form-label">Package Name:</label>
              <input type="text" class="form-input" id="checkout-package-${server.id}" 
                     placeholder="package-name">
              <div class="form-help">Name of the package to check out</div>
            </div>
            <div class="action-buttons">
              <button class="btn btn-primary" onclick="window.app.executeCheckout('${server.id}')">
                Checkout Package
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="action-item">
        <div class="action-header" onclick="window.app.toggleActionDetails('createpackage-${server.id}')">
          <div class="action-info">
            <h5 class="action-title">Create Package</h5>
            <p class="action-description">Create a new package repository and check it out</p>
          </div>
          <div class="action-toggle">
            <span class="toggle-arrow">▼</span>
          </div>
        </div>
        <div class="action-details hidden" id="createpackage-${server.id}">
          <div class="action-form">
            <div class="form-group">
              <label class="form-label">Package Name:</label>
              <input type="text" class="form-input" id="createpackage-name-${server.id}" 
                     placeholder="my-package">
              <div class="form-help">Name for the new package</div>
            </div>
            <div class="form-group">
              <label class="form-label">GitHub Account:</label>
              <input type="text" class="form-input" id="createpackage-account-${server.id}" 
                     placeholder="github-username">
              <div class="form-help">GitHub username or organization</div>
            </div>
            <div class="action-buttons">
              <button class="btn btn-primary" onclick="window.app.executeCreatePackage('${server.id}')">
                Create Package
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="action-item">
        <div class="action-header" onclick="window.app.toggleActionDetails('createproject-${server.id}')">
          <div class="action-info">
            <h5 class="action-title">Create Project</h5>
            <p class="action-description">Create a new project repository with connected package</p>
          </div>
          <div class="action-toggle">
            <span class="toggle-arrow">▼</span>
          </div>
        </div>
        <div class="action-details hidden" id="createproject-${server.id}">
          <div class="action-form">
            <div class="form-group">
              <label class="form-label">Project Name:</label>
              <input type="text" class="form-input" id="createproject-name-${server.id}" 
                     placeholder="my-project">
              <div class="form-help">Name for the new project</div>
            </div>
            <div class="form-group">
              <label class="form-label">GitHub Account:</label>
              <input type="text" class="form-input" id="createproject-account-${server.id}" 
                     placeholder="github-username">
              <div class="form-help">GitHub username or organization</div>
            </div>
            <div class="action-buttons">
              <button class="btn btn-primary" onclick="window.app.executeCreateProject('${server.id}')">
                Create Project
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="action-item">
        <div class="action-header" onclick="window.app.toggleActionDetails('preview-${server.id}')">
          <div class="action-info">
            <h5 class="action-title">Trigger Preview</h5>
            <p class="action-description">Execute git commands sequence for preview</p>
          </div>
          <div class="action-toggle">
            <span class="toggle-arrow">▼</span>
          </div>
        </div>
        <div class="action-details hidden" id="preview-${server.id}">
          <div class="action-form">
            <div class="action-buttons">
              <button class="btn btn-primary" onclick="window.app.executePreview('${server.id}')">
                Trigger Preview
              </button>
            </div>
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
    console.log('🔍 getStatusClass called with:', { status, hasConfig, hasUrl });
    
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
    
    // For deployments: respect the actual status first
    if (hasUrl !== undefined) {
      // If no URL yet, still deploying
      if (!hasUrl) {
        return 'status-deploying';
      }
      
      // If we have a URL, respect the actual status
      if (status === 'idle') {
        console.log('🔍 Status is idle - returning status-idle');
        return 'status-idle';
      }
      
      if (status === 'active' && hasConfig) {
        console.log('🔍 Status is active with config - returning status-active');
        return 'status-active';
      }
      
      // Default for deployments with URL but unclear status
      if (hasConfig) {
        console.log('🔍 Has config but unclear status - defaulting to status-active');
        return 'status-active';
      } else {
        console.log('🔍 No config - defaulting to status-idle');
        return 'status-idle';
      }
    }
    
    // Legacy status mapping for local servers
    switch (status) {
      case 'active': return hasConfig ? 'status-active' : 'status-idle';
      case 'idle': return 'status-idle';
      case 'unlinked': return 'status-unlinked';
      default: return 'status-unlinked';
    }
  }

  getStatusIcon(status, hasConfig = false, hasUrl = false, isLoadingConfig = false) {
    console.log('🔍 getStatusIcon called with:', { status, hasConfig, hasUrl, isLoadingConfig });
    
    // Only show spinner for explicit loading config state
    if (isLoadingConfig || status === 'loading-config') {
      return '<div class="loading-spinner" title="Loading configuration..."></div>';
    }
    
    // Only show spinner for deployment creation (not local servers)
    if (hasUrl !== undefined && (status === 'creating' || status === 'deploying')) {
      return '<div class="loading-spinner" title="Deploying to Cloud Run..."></div>';
    }
    
    if (status === 'error' || status === 'failed') {
      return '<img src="/assets/images/jsphere-error.png" alt="Error JSphere" class="jsphere-logo" title="Server error">';
    }
    
    if (status === 'unlinked') {
      return '<img src="/assets/images/jsphere-unlinked.webp" alt="Unlinked JSphere" class="jsphere-logo" title="Authentication failed - server unlinked">';
    }
    
    // For deployments: respect the actual status first
    if (hasUrl !== undefined) {
      if (!hasUrl && (status === 'creating' || status === 'deploying')) {
        // Still deploying if no URL
        console.log('🔍 No URL + deploying - showing deploying spinner');
        return '<div class="loading-spinner" title="Deploying to Cloud Run..."></div>';
      }
      
      // Respect the actual status
      if (status === 'idle') {
        console.log('🔍 Status is idle - showing IDLE image');
        return '<img src="/assets/images/jsphere-idle.png" alt="Idle JSphere" class="jsphere-logo" title="Ready for configuration">';
      }
      
      if (status === 'active' && hasConfig) {
        console.log('🔍 Status is active with config - showing ACTIVE image');
        return '<img src="/assets/images/jsphere-active.png" alt="Active JSphere" class="jsphere-logo" title="Active with configuration">';
      }
      
      // Default logic for unclear status
      if (hasConfig) {
        console.log('🔍 Has config but unclear status - showing ACTIVE image');
        return '<img src="/assets/images/jsphere-active.png" alt="Active JSphere" class="jsphere-logo" title="Active with configuration">';
      } else {
        console.log('🔍 No config - showing IDLE image');
        return '<img src="/assets/images/jsphere-idle.png" alt="Idle JSphere" class="jsphere-logo" title="Ready for configuration">';
      }
    }
    
    // For local servers - never show loading spinners, always show JSphere images
    console.log('🔍 Local server status mapping for status:', status);
    switch (status) {
      case 'connecting':
        // Even for connecting, show idle image for local servers (instant connection)
        console.log('🔍 Connecting status - showing IDLE image for local server');
        return '<img src="/assets/images/jsphere-idle.png" alt="Idle JSphere" class="jsphere-logo" title="Connecting to local server">';
      case 'active': 
        // For local servers, active means config is loaded
        if (hasConfig) {
          console.log('🔍 Active status with config - showing ACTIVE image');
          return '<img src="/assets/images/jsphere-active.png" alt="Active JSphere" class="jsphere-logo" title="Active with configuration">';
        } else {
          console.log('🔍 Active status without config - showing IDLE image');
          return '<img src="/assets/images/jsphere-idle.png" alt="Idle JSphere" class="jsphere-logo" title="Ready for configuration">';
        }
      case 'idle': 
        console.log('🔍 Idle status - showing IDLE image');
        return '<img src="/assets/images/jsphere-idle.png" alt="Idle JSphere" class="jsphere-logo" title="Ready for configuration">';
      case 'error':
        console.log('🔍 Error status - showing ERROR image');
        return '<img src="/assets/images/jsphere-error.png" alt="Error JSphere" class="jsphere-logo" title="Server error">';
      default: 
        console.log('🔍 Default status - showing IDLE image for local server');
        return '<img src="/assets/images/jsphere-idle.png" alt="Idle JSphere" class="jsphere-logo" title="Local server">';
    }
  }

  // Helper method to determine deployment status using utils
  getDeploymentStatus(deployment) {
    console.log('🔍 getDeploymentStatus called with deployment:', {
      id: deployment.id,
      status: deployment.status,
      hasConfig: !!deployment.config,
      hasUrl: !!deployment.cloud_run_url
    });
    
    // Use utils for status determination
    if (window.utils && window.utils.getDeploymentStatus) {
      const status = window.utils.getDeploymentStatus(deployment);
      console.log('🔍 utils.getDeploymentStatus returned:', status);
      // Convert status class to simple status string
      const simpleStatus = status.replace('status-', '');
      console.log('🔍 Converted to simple status:', simpleStatus);
      return simpleStatus;
    }
    
    console.log('🔍 Utils not available, using fallback logic');
    
    // Fallback logic if utils not available
    if (deployment.status === 'error' || deployment.status === 'failed') {
      return 'error';
    }
    
    if (deployment.status === 'creating' || !deployment.cloud_run_url) {
      return 'deploying';
    }
    
    // Respect server status for idle
    if (deployment.status === 'idle') {
      console.log('🔍 Fallback: Server status is idle');
      return 'idle';
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

  // Helper method to determine remote server status using utils
  getRemoteServerStatus(server) {
    // Use utils for status determination
    if (window.utils && window.utils.getRemoteServerStatus) {
      const status = window.utils.getRemoteServerStatus(server);
      // Convert status class to simple status string
      return status.replace('status-', '');
    }
    
    // Fallback logic if utils not available - same as local server
    if (server.config) {
      return 'active';
    }
    
    return server.status || 'idle';
  }

  attachEvents() {
    // Events are handled via onclick attributes for simplicity
  }
}
