import { utils } from '../utils.js';

export class LocalServerManager {
  constructor(api, dataManager) {
    this.api = api;
    this.dataManager = dataManager;
  }

  async linkLocalServer(serverData) {
    try {
      console.log('📤 Sending local server link request:', serverData);
      const response = await this.api.post('/local-servers', serverData);
      console.log('📥 Received local server response:', response);
      
      if (!response.localServer) {
        console.error('❌ Invalid server response - missing localServer property');
        throw new Error('Invalid server response');
      }
      
      console.log('✅ Local server object received:', {
        id: response.localServer.id,
        port: response.localServer.port,
        status: response.localServer.status,
        url: response.localServer.url,
        hasConfig: !!response.localServer.config
      });
      
      // Add to data manager - this will trigger UI updates
      console.log('📊 Adding local server to data manager...');
      this.dataManager.addLocalServer(response.localServer);
      console.log('✅ Local server added to data manager successfully');
      
      // Show appropriate message based on server status and config
      if (response.localServer.status === 'unlinked') {
        utils.showToast('Server added but could not connect. Please check the port and ensure a server is running.', 'warning');
      } else if (response.localServer.status === 'error') {
        utils.showToast('Server linked but has connection issues. Check server status.', 'warning');
      } else if (response.localServer.config) {
        utils.showToast('Server linked and configuration loaded successfully!', 'success');
      } else {
        utils.showToast('Server linked successfully. Ready for configuration.', 'success');
      }
      
      return response.localServer;
    } catch (error) {
      console.error('❌ Failed to link local server:', error);
      utils.showToast('Failed to link local server: ' + error.message, 'error');
      throw error;
    }
  }

  async deleteLocalServer(id) {
    if (!confirm('Are you sure you want to unlink this local server?')) return false;

    try {
      await this.api.delete(`/local-servers/${id}`);
      
      // Remove from data manager
      this.dataManager.removeLocalServer(id);
      
      utils.showToast('Local server unlinked successfully', 'success');
      return true;
    } catch (error) {
      utils.showToast('Failed to unlink local server: ' + error.message, 'error');
      throw error;
    }
  }

  async applyConfig(serverId, configId) {
    try {
      await this.api.post(`/local-servers/${serverId}/config`, { configId });
      utils.showToast('Configuration applied successfully', 'success');
      
      // Refresh data to get updated server info
      await this.dataManager.loadData();
      return true;
    } catch (error) {
      utils.showToast('Failed to apply configuration: ' + error.message, 'error');
      throw error;
    }
  }

  async healthCheckServer(serverId) {
    try {
      await this.api.get(`/local-servers/${serverId}/health`);
      return true;
    } catch (error) {
      console.error(`Health check failed for server ${serverId}:`, error);
      return false;
    }
  }

  async healthCheckAllServers() {
    const localServers = this.dataManager.getLocalServers();
    if (!localServers || localServers.length === 0) return;
    
    console.log('🔍 Health checking local servers...');
    
    // Health check all local servers in parallel
    const healthCheckPromises = localServers.map(async (server) => {
      return await this.healthCheckServer(server.id);
    });
    
    await Promise.all(healthCheckPromises);
    console.log('✅ Local server health checks completed');
  }

  // Package Management
  async loadPackageStatus(serverId) {
    try {
      const response = await this.api.get(`/local-servers/${serverId}/packages`);
      return response.packages || [];
    } catch (error) {
      console.error('Failed to load package status:', error);
      throw error;
    }
  }

  async checkoutPackage(serverId, packageName) {
    try {
      await this.api.post(`/local-servers/${serverId}/packages/${packageName}/checkout`);
      utils.showToast(`Package ${packageName} checked out successfully`, 'success');
      return true;
    } catch (error) {
      utils.showToast(`Failed to checkout package: ${error.message}`, 'error');
      throw error;
    }
  }

  async checkinPackage(serverId, packageName) {
    try {
      await this.api.post(`/local-servers/${serverId}/packages/${packageName}/checkin`);
      utils.showToast(`Package ${packageName} checked in successfully`, 'success');
      return true;
    } catch (error) {
      utils.showToast(`Failed to checkin package: ${error.message}`, 'error');
      throw error;
    }
  }

  async createPackage(serverId, packageData) {
    try {
      await this.api.post(`/local-servers/${serverId}/packages`, packageData);
      utils.showToast('Package created successfully', 'success');
      return true;
    } catch (error) {
      utils.showToast('Failed to create package: ' + error.message, 'error');
      throw error;
    }
  }

  async createProject(serverId, projectData) {
    try {
      await this.api.post(`/local-servers/${serverId}/projects`, projectData);
      utils.showToast('Project created successfully', 'success');
      return true;
    } catch (error) {
      utils.showToast('Failed to create project: ' + error.message, 'error');
      throw error;
    }
  }

  async triggerPreview(serverId) {
    try {
      await this.api.post(`/local-servers/${serverId}/preview`);
      utils.showToast('Preview triggered successfully', 'success');
      return true;
    } catch (error) {
      utils.showToast('Failed to trigger preview: ' + error.message, 'error');
      throw error;
    }
  }

  // Modal Methods
  showServerTypeSelectionModal(modal) {
    const modalBody = `
      <p>Choose the type of server you want to link:</p>
      
      <div class="server-type-options">
        <div class="server-type-option" onclick="window.app.showLinkLocalServerModal()">
          <div class="server-type-icon">🖥️</div>
          <div class="server-type-content">
            <h3>Local Server</h3>
            <p>Link a JSphere instance running on your local machine</p>
            <small>Typically used for development and testing</small>
          </div>
        </div>
        
        <div class="server-type-option" onclick="window.app.showLinkRemoteServerModal()">
          <div class="server-type-icon">🌐</div>
          <div class="server-type-content">
            <h3>Remote Server</h3>
            <p>Link a JSphere instance deployed on external hosting platforms</p>
            <small>Heroku, DigitalOcean, AWS, or other hosting providers</small>
          </div>
        </div>
      </div>
    `;
    
    modal.show('Link a Server', modalBody);
  }

  showLinkLocalServerModal(modal) {
    const configs = this.dataManager.getConfigs();

    modal.show('Link Local Server', `
      <form id="local-server-form">
        <div class="form-group">
          <label class="form-label">Port</label>
          <input type="number" class="form-input" name="port" required 
                 value="8000" min="1" max="65535">
          <div class="form-help">Port where your JSphere server is running</div>
        </div>
        <div class="form-group">
          <label class="form-label">JSphere Config (Optional)</label>
          <select class="form-select" name="configId">
            <option value="">Link without config...</option>
            ${configs.map(config => 
              `<option value="${config.id}">${config.name}</option>`
            ).join('')}
          </select>
        </div>
      </form>
    `, {
      primaryButton: {
        text: 'Link Server',
        action: 'window.app.localServerManager.handleLinkLocalServer()'
      },
      secondaryButton: {
        text: 'Cancel'
      }
    });
  }

  async handleLinkLocalServer() {
    const form = document.getElementById('local-server-form');
    if (!utils.validateForm(form)) return;

    const formData = new FormData(form);
    const port = formData.get('port');

    if (!utils.validatePort(port)) {
      utils.showFieldError(form.port, 'Invalid port number');
      return;
    }

    // Get button reference and original text outside try block
    const submitBtn = document.querySelector('.modal-footer .btn-primary');
    const originalText = submitBtn ? submitBtn.textContent : 'Link Server';

    try {
      // Show connecting state in UI
      if (submitBtn) {
        submitBtn.textContent = 'Connecting...';
        submitBtn.disabled = true;
      }

      const serverData = {
        port: port,
        configId: formData.get('configId') || null
      };

      await this.linkLocalServer(serverData);
      
      // Hide modal
      if (window.app && window.app.modal) {
        window.app.modal.hide();
      }
      
      // Trigger health check and refresh
      await this.healthCheckAllServers();
    } catch (error) {
      // Reset button state
      if (submitBtn) {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }
    }
  }

  showChangeConfigModal(serverId, modal) {
    const configs = this.dataManager.getConfigs();

    modal.show('Change Configuration', `
      <form id="change-config-form">
        <div class="form-group">
          <label class="form-label">Select Configuration</label>
          <select class="form-select" name="configId" required>
            <option value="">Choose a configuration...</option>
            ${configs.map(config => 
              `<option value="${config.id}">${config.name}</option>`
            ).join('')}
          </select>
        </div>
      </form>
    `, {
      primaryButton: {
        text: 'Apply Configuration',
        action: `window.app.localServerManager.handleApplyConfig('${serverId}')`
      },
      secondaryButton: {
        text: 'Cancel'
      }
    });
  }

  async handleApplyConfig(serverId) {
    const form = document.getElementById('change-config-form');
    if (!utils.validateForm(form)) return;

    const formData = new FormData(form);
    const configId = formData.get('configId');

    try {
      await this.applyConfig(serverId, configId);
      
      // Hide modal
      if (window.app && window.app.modal) {
        window.app.modal.hide();
      }
    } catch (error) {
      // Error already handled in applyConfig
    }
  }

  showCreatePackageModal(serverId, modal) {
    modal.show('Create Package', `
      <form id="create-package-form">
        <div class="form-group">
          <label class="form-label">Package Name *</label>
          <input type="text" class="form-input" name="name" required placeholder="my-package">
          <div class="form-help">Name for the new package</div>
        </div>
        <div class="form-group">
          <label class="form-label">Package Type</label>
          <select class="form-select" name="type">
            <option value="component">Component</option>
            <option value="service">Service</option>
            <option value="utility">Utility</option>
          </select>
        </div>
      </form>
    `, {
      primaryButton: {
        text: 'Create Package',
        action: `window.app.localServerManager.handleCreatePackage('${serverId}')`
      },
      secondaryButton: {
        text: 'Cancel'
      }
    });
  }

  async handleCreatePackage(serverId) {
    const form = document.getElementById('create-package-form');
    if (!utils.validateForm(form)) return;

    const formData = new FormData(form);
    const packageData = {
      name: formData.get('name'),
      type: formData.get('type')
    };

    try {
      await this.createPackage(serverId, packageData);
      
      // Hide modal
      if (window.app && window.app.modal) {
        window.app.modal.hide();
      }
      
      // Refresh package status
      await this.refreshPackageStatus(serverId);
    } catch (error) {
      // Error already handled in createPackage
    }
  }

  showCreateProjectModal(serverId, modal) {
    modal.show('Create Project', `
      <form id="create-project-form">
        <div class="form-group">
          <label class="form-label">Project Name *</label>
          <input type="text" class="form-input" name="name" required placeholder="my-project">
          <div class="form-help">Name for the new project</div>
        </div>
        <div class="form-group">
          <label class="form-label">Project Template</label>
          <select class="form-select" name="template">
            <option value="basic">Basic Project</option>
            <option value="web-app">Web Application</option>
            <option value="api">API Service</option>
          </select>
        </div>
      </form>
    `, {
      primaryButton: {
        text: 'Create Project',
        action: `window.app.localServerManager.handleCreateProject('${serverId}')`
      },
      secondaryButton: {
        text: 'Cancel'
      }
    });
  }

  async handleCreateProject(serverId) {
    const form = document.getElementById('create-project-form');
    if (!utils.validateForm(form)) return;

    const formData = new FormData(form);
    const projectData = {
      name: formData.get('name'),
      template: formData.get('template')
    };

    try {
      await this.createProject(serverId, projectData);
      
      // Hide modal
      if (window.app && window.app.modal) {
        window.app.modal.hide();
      }
      
      // Refresh package status
      await this.refreshPackageStatus(serverId);
    } catch (error) {
      // Error already handled in createProject
    }
  }

  // Package List Rendering
  renderPackageList(serverId, packages) {
    const container = document.getElementById(`package-list-${serverId}`);
    const footer = document.getElementById(`application-footer-${serverId}`);
    
    if (!container) return;

    if (packages.length === 0) {
      container.innerHTML = '<div class="package-empty">No packages found</div>';
      if (footer) footer.style.display = 'none';
      return;
    }

    const packageHtml = packages.map(pkg => `
      <div class="package-item ${pkg.status}">
        <div class="package-info">
          <div class="package-name">${pkg.name}</div>
          <div class="package-status">${pkg.status}</div>
        </div>
        <div class="package-actions">
          ${pkg.status === 'available' ? `
            <button class="btn btn-sm btn-primary" onclick="window.app.localServerManager.checkoutPackage('${serverId}', '${pkg.name}')">
              Checkout
            </button>
          ` : pkg.status === 'checked-out' ? `
            <button class="btn btn-sm btn-secondary" onclick="window.app.localServerManager.checkinPackage('${serverId}', '${pkg.name}')">
              Check In
            </button>
          ` : ''}
        </div>
      </div>
    `).join('');

    container.innerHTML = packageHtml;

    // Update footer stats
    if (footer) {
      const checkedOut = packages.filter(p => p.status === 'checked-out').length;
      const available = packages.filter(p => p.status === 'available').length;
      const total = packages.length;

      const checkedOutElement = document.getElementById(`checked-out-count-${serverId}`);
      const availableElement = document.getElementById(`available-count-${serverId}`);
      const totalElement = document.getElementById(`total-count-${serverId}`);

      if (checkedOutElement) checkedOutElement.textContent = checkedOut;
      if (availableElement) availableElement.textContent = available;
      if (totalElement) totalElement.textContent = total;
      
      footer.style.display = 'block';
    }
  }

  async refreshPackageStatus(serverId) {
    const container = document.getElementById(`package-list-${serverId}`);
    if (!container) return;

    container.innerHTML = '<div class="package-loading">Loading package status...</div>';
    
    try {
      const packages = await this.loadPackageStatus(serverId);
      this.renderPackageList(serverId, packages);
      utils.showToast('Package status refreshed', 'info');
    } catch (error) {
      container.innerHTML = '<div class="package-error">Failed to load package status</div>';
      console.error('Failed to load package status:', error);
    }
  }

  // Get local server by ID
  getLocalServer(serverId) {
    return this.dataManager.getLocalServers().find(s => s.id === serverId);
  }

  // Get local servers by status
  getLocalServersByStatus(status) {
    return this.dataManager.getLocalServers().filter(s => s.status === status);
  }

  // Get active local servers count
  getActiveLocalServersCount() {
    return this.dataManager.getLocalServers().filter(s => s.status === 'active').length;
  }
}
