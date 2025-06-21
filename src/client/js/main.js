import { API } from './api.js';
import { Auth } from './auth.js';
import { Navbar } from './components/navbar.js';
import { ServerTabs } from './components/server-tab.js';
import { Modal } from './components/modals.js';
import { Billing } from './components/billing.js';
import { Charts } from './components/charts.js';
import { utils } from './utils.js';

class C11NApp {
  constructor() {
    this.user = null;
    this.deployments = [];
    this.configs = [];
    this.localServers = [];
    this.gcpProjects = [];
    this.isGCPConnected = false;
    
    this.api = new API();
    this.auth = new Auth(this.api);
    this.modal = new Modal();
    this.billing = new Billing(this.api);
    this.charts = new Charts();
    
    this.init();
  }

  async init() {
    // Handle OAuth callbacks and token from redirect
    const params = utils.getUrlParams();
    
    // Handle token from GitHub OAuth redirect
    if (params.token) {
      this.api.setToken(params.token);
      try {
        this.user = await this.auth.getCurrentUser();
        this.isGCPConnected = !!(this.user.gcp_access_token && this.user.gcp_project_id);
        this.renderApp();
        await this.loadData();
        this.startPolling();
        // Clean up URL
        window.history.replaceState({}, document.title, '/');
        return;
      } catch (error) {
        console.error('Token validation failed:', error);
        this.api.setToken(null);
        this.renderAuthPage();
        return;
      }
    }
    
    // Handle auth error from redirect
    if (params.error) {
      utils.showToast('Authentication failed', 'error');
      // Clean up URL
      window.history.replaceState({}, document.title, '/');
      this.renderAuthPage();
      return;
    }
    
    // Handle OAuth callbacks (for GCP)
    if (params.code) {
      await this.handleOAuthCallback(params);
      return;
    }

    // Check if user is authenticated
    const token = localStorage.getItem('c11n_token');
    if (token) {
      try {
        this.user = await this.auth.getCurrentUser();
        this.isGCPConnected = !!(this.user.gcp_access_token && this.user.gcp_project_id);
        this.renderApp();
        await this.loadData();
        this.startPolling();
      } catch (error) {
        console.error('Auth check failed:', error);
        this.renderAuthPage();
      }
    } else {
      this.renderAuthPage();
    }
  }

  async handleOAuthCallback(params) {
    const state = params.state;
    const code = params.code;

    try {
      if (state === 'github') {
        this.user = await this.auth.handleGitHubCallback(code);
        this.renderApp();
        await this.loadData();
        this.startPolling();
      } else if (state === 'gcp') {
        await this.auth.handleGCPCallback(code);
        utils.showToast('GCP account connected successfully!', 'success');
        // Refresh user data and recalculate GCP connection status
        this.user = await this.auth.getCurrentUser();
        this.isGCPConnected = !!(this.user.gcp_access_token && this.user.gcp_project_id);
        this.renderApp();
      }
    } catch (error) {
      console.error('OAuth callback failed:', error);
      utils.showToast('Authentication failed', 'error');
      this.renderAuthPage();
    }

    // Clean up URL
    window.history.replaceState({}, document.title, '/');
  }

  renderAuthPage() {
    document.getElementById('app').innerHTML = `
      <div class="auth-page">
        <div class="auth-card">
          <h1 class="auth-title">C11N</h1>
          <p class="auth-subtitle">Deploy JSphere applications to the cloud with ease</p>
          <button class="github-login-btn" onclick="window.app.loginWithGitHub()">
            Continue with GitHub
          </button>
        </div>
      </div>
    `;
  }

  renderApp() {
    document.getElementById('app').innerHTML = `
      <nav id="navbar"></nav>
      <main class="main-page">
        <div class="top-bar">
          <div class="top-bar-left">
            <button class="btn btn-icon btn-secondary" onclick="window.app.refresh()" title="Refresh">
              🔄
            </button>
          </div>
          <div class="top-bar-right">
            ${!this.isGCPConnected ? `
              <button class="btn btn-secondary" onclick="window.app.connectGCP()">
                Connect GCP
              </button>
            ` : `
              <button class="btn btn-success" disabled>
                ✓ GCP Connected
              </button>
            `}
            <button class="universal-plus-btn" onclick="window.app.showUniversalMenu(event)" title="Add new">
              +
            </button>
          </div>
        </div>
        <div id="server-tabs" class="server-tabs"></div>
      </main>
    `;

    this.navbar = new Navbar(this.user);
    this.serverTabs = new ServerTabs(this.deployments, this.localServers);
  }

  async loginWithGitHub() {
    try {
      // Get GitHub OAuth config from backend
      const response = await fetch('/api/auth/github/config');
      const config = await response.json();
      
      const authUrl = `https://github.com/login/oauth/authorize?` +
        `client_id=${config.clientId}&` +
        `redirect_uri=${config.redirectUri}&` +
        `scope=user:email repo&` +
        `state=github`;
      
      window.location.href = authUrl;
    } catch (error) {
      console.error('Failed to get GitHub config:', error);
      utils.showToast('Failed to initiate GitHub login', 'error');
    }
  }

  async connectGCP() {
    try {
      console.log('🔐 Starting GCP connection...');
      const response = await this.api.post('/auth/gcp');
      const authUrl = response.authUrl + '&state=gcp';
      console.log('📋 Auth URL:', authUrl);
      
      // Open OAuth in a popup window
      const popup = window.open(
        authUrl,
        'gcp-oauth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );
      console.log('🪟 Popup opened:', popup);

      // Listen for messages from the popup
      const messageHandler = (event) => {
        console.log('📨 Received message:', event);
        if (event.origin !== window.location.origin) {
          console.log('❌ Origin mismatch:', event.origin, 'vs', window.location.origin);
          return;
        }
        
        if (event.data.type === 'oauth_success') {
          console.log('✅ OAuth success received:', event.data);
          utils.showToast('GCP account connected successfully!', 'success');
          
          // Refresh user data and UI
          this.auth.getCurrentUser().then(user => {
            console.log('👤 Updated user data:', user);
            this.user = user;
            this.isGCPConnected = !!(user.gcp_access_token && user.gcp_project_id);
            console.log('🔗 GCP Connected status:', this.isGCPConnected);
            this.renderApp();
            this.loadData();
          }).catch(error => {
            console.error('❌ Failed to refresh user data:', error);
          });
          window.removeEventListener('message', messageHandler);
        } else if (event.data.type === 'oauth_error') {
          console.error('❌ OAuth error received:', event.data.error);
          utils.showToast('GCP connection failed: ' + event.data.error, 'error');
          window.removeEventListener('message', messageHandler);
        }
      };

      window.addEventListener('message', messageHandler);
      console.log('👂 Message listener added');

      // Check if popup was closed manually
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          console.log('🪟 Popup was closed manually');
          clearInterval(checkClosed);
          window.removeEventListener('message', messageHandler);
        }
      }, 1000);

    } catch (error) {
      console.error('❌ Failed to initiate GCP connection:', error);
      utils.showToast('Failed to initiate GCP connection', 'error');
    }
  }

  async loadData() {
    try {
      const promises = [
        this.api.get('/deployments'),
        this.api.get('/configs'),
        this.api.get('/local-servers'),
        this.api.get('/workspaces')
      ];

      if (this.isGCPConnected) {
        promises.push(this.api.get('/gcp/projects'));
      }

      const results = await Promise.all(promises);
      
      this.deployments = results[0].deployments || [];
      this.configs = results[1].configs || [];
      this.localServers = results[2].localServers || [];
      this.workspaces = results[3].workspaces || [];
      
      if (this.isGCPConnected && results[4]) {
        this.gcpProjects = results[4].projects || [];
      }

      if (this.serverTabs) {
        this.serverTabs.update(this.deployments, this.localServers);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      utils.showToast('Failed to load data', 'error');
    }
  }

  async refresh() {
    try {
      // First sync deployments with GCP if connected
      if (this.isGCPConnected) {
        await this.api.post('/deployments/sync');
      }
      
      // Health check all local servers during refresh
      await this.healthCheckLocalServers();
      
      // Then refresh all data
      await this.loadData();
      utils.showToast('Data refreshed', 'info');
    } catch (error) {
      console.error('Manual refresh failed:', error);
      // Still try to refresh local data even if sync fails
      await this.loadData();
      utils.showToast('Data refreshed (sync failed)', 'warning');
    }
  }

  // Enhanced local server health checking
  async healthCheckLocalServers() {
    if (!this.localServers || this.localServers.length === 0) return;
    
    console.log('🔍 Health checking local servers...');
    
    // Health check all local servers in parallel
    const healthCheckPromises = this.localServers.map(async (server) => {
      try {
        await this.api.get(`/local-servers/${server.id}/health`);
      } catch (error) {
        console.error(`Health check failed for server ${server.id}:`, error);
      }
    });
    
    await Promise.all(healthCheckPromises);
    console.log('✅ Local server health checks completed');
  }

  // Debug method to check GCP connection status
  async checkGCPStatus() {
    try {
      console.log('🔍 Checking GCP connection status...');
      const response = await this.api.get('/gcp/status');
      console.log('📊 GCP Status Response:', response);
      
      // Update local state based on server response
      const wasConnected = this.isGCPConnected;
      this.isGCPConnected = response.connected;
      
      console.log('🔄 GCP Status Update:', {
        wasConnected,
        nowConnected: this.isGCPConnected,
        projectId: response.projectId,
        projectName: response.projectName
      });
      
      // If status changed, re-render the app
      if (wasConnected !== this.isGCPConnected) {
        console.log('🎨 Re-rendering app due to GCP status change');
        this.renderApp();
      }
      
      return response;
    } catch (error) {
      console.error('❌ Failed to check GCP status:', error);
      return null;
    }
  }

  showUniversalMenu(event) {
    const menuItems = [
      { label: 'New Deployment', action: 'window.app.showNewDeploymentModal' },
      { label: 'Link Local Server', action: 'window.app.showLinkLocalServerModal' },
      { label: 'Manage Configs', action: 'window.app.showManageConfigsModal' },
      { label: 'Manage Workspaces', action: 'window.app.showManageWorkspacesModal' },
      { label: 'Manage Service Profiles', action: 'window.app.showManageServiceProfilesModal' }
    ];

    this.modal.showDropdown(menuItems, event.target);
  }

  // Modal methods
  async showNewDeploymentModal() {
    console.log('showNewDeploymentModal called');
    console.log('this.isGCPConnected:', this.isGCPConnected);
    console.log('this.user:', this.user);
    console.log('user.gcp_access_token:', this.user?.gcp_access_token);
    console.log('user.gcp_project_id:', this.user?.gcp_project_id);
    
    // Recalculate GCP connection status from current user data
    this.isGCPConnected = !!(this.user?.gcp_access_token && this.user?.gcp_project_id);
    console.log('Recalculated isGCPConnected:', this.isGCPConnected);
    
    if (!this.user?.gcp_access_token) {
      utils.showToast('Please connect your GCP account first', 'warning');
      return;
    }
    
    if (!this.user?.gcp_project_id) {
      utils.showToast('Please select a GCP project first', 'warning');
      this.showSelectGCPProjectModal();
      return;
    }

    // Check deployment limits for free users
    if (this.user.plan === 'free') {
      const activeDeployments = this.deployments.filter(d => 
        d.status === 'active' || d.status === 'idle' || d.status === 'creating'
      ).length;
      
      if (activeDeployments >= 1) {
        utils.showToast('Free plan allows 1 deployment. Upgrade for more!', 'warning');
        this.showManagePlan();
        return;
      }
    }

    // Load service profiles
    try {
      await this.loadServiceProfiles();
      
      if (!this.serviceProfiles || this.serviceProfiles.length === 0) {
        utils.showToast('No service profiles found. Please create one first.', 'warning');
        this.showManageServiceProfilesModal();
        return;
      }

      this.modal.show('Create New Deployment', `
        <form id="deployment-form">
          <div class="form-group">
            <label class="form-label">Deployment Name *</label>
            <input type="text" class="form-input" name="name" required 
                   placeholder="my-app" pattern="^[a-z0-9-]+$">
            <div class="form-help">Lowercase letters, numbers, and hyphens only</div>
          </div>
          <div class="form-group">
            <label class="form-label">Service Profile *</label>
            <select class="form-select" name="serviceProfileId" required>
              <option value="">Select a service profile...</option>
              ${this.serviceProfiles.map(profile => 
                `<option value="${profile.id}">${profile.name} (${profile.container_image_url})</option>`
              ).join('')}
            </select>
            <div class="form-help">Service profile defines container image, resources, and deployment settings</div>
          </div>
          <div class="form-group">
            <label class="form-label">JSphere Config (Optional)</label>
            <select class="form-select" name="configId">
              <option value="">Deploy without config...</option>
              ${this.configs.map(config => 
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
      utils.showToast('Failed to load service profiles', 'error');
    }
  }

  showLinkLocalServerModal() {
    this.modal.show('Link Local Server', `
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
            ${this.configs.map(config => 
              `<option value="${config.id}">${config.name}</option>`
            ).join('')}
          </select>
        </div>
      </form>
    `, {
      primaryButton: {
        text: 'Link Server',
        action: 'window.app.linkLocalServer()'
      },
      secondaryButton: {
        text: 'Cancel'
      }
    });
  }

  showManageConfigsModal() {
    this.modal.show('Manage JSphere Configs', `
      <div class="config-list">
        ${this.configs.length > 0 ? this.configs.map(config => `
          <div class="config-item">
            <div class="config-info">
              <div class="config-name">${config.name}</div>
              <div class="config-description">${config.project_namespace}/${config.project_name} - ${config.project_app_config}</div>
            </div>
            <div class="config-actions">
              <button class="btn btn-sm btn-secondary" onclick="window.app.editConfig('${config.id}')">
                Edit
              </button>
              <button class="btn btn-sm btn-error" onclick="window.app.deleteConfig('${config.id}')">
                Delete
              </button>
            </div>
          </div>
        `).join('') : '<p class="text-gray-500">No configurations created yet.</p>'}
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="window.app.showCreateConfigModal()">
          Create New Config
        </button>
      </div>
    `);
  }

  showCreateConfigModal() {
    this.configWizardData = {
      step: 1,
      name: '',
      project_host: 'GitHub',
      project_namespace: '',
      project_auth_token: '',
      project_name: '',
      project_app_config: '',
      project_reference: '',
      server_http_port: '80',
      server_debug_port: '9229',
      project_preview_branch: '',
      project_preview_server: '',
      project_preview_server_auth_token: '',
      customFields: {},
      githubProjects: [],
      appConfigs: [],
      references: { branches: [], tags: [] },
      isConnected: false
    };
    
    this.showConfigWizardStep(1);
  }

  showConfigWizardStep(step) {
    this.configWizardData.step = step;
    
    switch (step) {
      case 1:
        this.showConfigStep1();
        break;
      case 2:
        this.showConfigStep2();
        break;
      case 3:
        this.showConfigStep3();
        break;
      case 4:
        this.showConfigStep4();
        break;
      case 5:
        this.showConfigStep5();
        break;
      case 6:
        this.showConfigStep6();
        break;
    }
  }

  showConfigStep1() {
    this.modal.show('Create JSphere Config - Step 1/6: Basic Info', `
      <div class="wizard-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: 16.67%"></div>
        </div>
        <div class="step-indicator">Step 1 of 6: Basic Information</div>
      </div>
      
      <form id="config-step1-form">
        <div class="form-group">
          <label class="form-label">Config Name *</label>
          <input type="text" class="form-input" name="name" required 
                 value="${this.configWizardData.name}"
                 placeholder="my-config">
          <div class="form-help">A unique name for this JSphere configuration</div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Project Host *</label>
          <select class="form-select" name="project_host" required>
            <option value="GitHub" selected>GitHub</option>
          </select>
          <div class="form-help">Currently only GitHub is supported</div>
        </div>
      </form>
    `, {
      primaryButton: {
        text: 'Next',
        action: 'window.app.configWizardNext()'
      },
      secondaryButton: {
        text: 'Cancel'
      }
    });
  }

  showConfigStep2() {
    const workspaceOptions = this.workspaces && this.workspaces.length > 0 ? 
      this.workspaces.map(workspace => 
        `<option value="${workspace.id}">${workspace.name} (${workspace.project_namespace})</option>`
      ).join('') : '';

    this.modal.show('Create JSphere Config - Step 2/6: Choose Workspace', `
      <div class="wizard-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: 33.33%"></div>
        </div>
        <div class="step-indicator">Step 2 of 6: Choose Workspace</div>
      </div>
      
      <form id="config-step2-form">
        <div class="form-group">
          <label class="form-label">Select Workspace *</label>
          <select class="form-select" name="workspace_selection" required onchange="window.app.onWorkspaceSelectionChange()">
            <option value="">Choose an option...</option>
            ${workspaceOptions ? `
              <optgroup label="Existing Workspaces">
                ${workspaceOptions}
              </optgroup>
            ` : ''}
            <option value="manual">Enter GitHub credentials manually</option>
            <option value="create_new">Create new workspace</option>
          </select>
          <div class="form-help">Choose an existing workspace or enter credentials manually</div>
        </div>
        
        <div id="manual-credentials" style="display: none;">
          <div class="form-group">
            <label class="form-label">GitHub Username *</label>
            <input type="text" class="form-input" name="project_namespace" 
                   value="${this.configWizardData.project_namespace}"
                   placeholder="your-github-username">
            <div class="form-help">Your GitHub username (project namespace)</div>
          </div>
          
          <div class="form-group">
            <label class="form-label">GitHub Token *</label>
            <input type="password" class="form-input" name="project_auth_token" 
                   value="${this.configWizardData.project_auth_token}"
                   placeholder="ghp_...">
            <div class="form-help">GitHub personal access token with repo access</div>
          </div>
          
          <div class="form-group">
            <button type="button" class="btn btn-secondary" onclick="window.app.validateGitHubCredentials()" 
                    id="validate-credentials-btn">
              Connect & Validate
            </button>
            <div id="validation-result" class="form-help"></div>
          </div>
        </div>
        
        <div id="workspace-selected" style="display: none;">
          <div class="form-help text-success">✓ Workspace selected successfully</div>
        </div>
      </form>
    `, {
      primaryButton: {
        text: 'Next',
        action: 'window.app.configWizardNext()',
        disabled: !this.configWizardData.isConnected
      },
      secondaryButton: {
        text: 'Back',
        action: 'window.app.configWizardBack()'
      }
    });
  }

  showConfigStep3() {
    const projectOptions = this.configWizardData.githubProjects.map(project => 
      `<option value="${project.name.substring(1)}">${project.name} - ${project.description || 'No description'}</option>`
    ).join('');

    this.modal.show('Create JSphere Config - Step 3/6: Project Selection', `
      <div class="wizard-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: 50%"></div>
        </div>
        <div class="step-indicator">Step 3 of 6: Project Selection</div>
      </div>
      
      <form id="config-step3-form">
        <div class="form-group">
          <label class="form-label">Project *</label>
          <select class="form-select" name="project_name" required onchange="window.app.onProjectChange()">
            <option value="">Select a project...</option>
            ${projectOptions}
          </select>
          <div class="form-help">Choose from your GitHub repositories (starting with ".")</div>
        </div>
      </form>
    `, {
      primaryButton: {
        text: 'Next',
        action: 'window.app.configWizardNext()',
        disabled: !this.configWizardData.project_name
      },
      secondaryButton: {
        text: 'Back',
        action: 'window.app.configWizardBack()'
      }
    });
  }

  showConfigStep4() {
    const appConfigOptions = this.configWizardData.appConfigs.map(config => 
      `<option value="${config}">${config}</option>`
    ).join('');

    this.modal.show('Create JSphere Config - Step 4/6: App Configuration', `
      <div class="wizard-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: 66.67%"></div>
        </div>
        <div class="step-indicator">Step 4 of 6: App Configuration</div>
      </div>
      
      <form id="config-step4-form">
        <div class="form-group">
          <label class="form-label">App Config *</label>
          <select class="form-select" name="project_app_config" required>
            <option value="">Select an app config...</option>
            ${appConfigOptions}
          </select>
          <div class="form-help">Choose from available app.*.json files in the project</div>
        </div>
      </form>
    `, {
      primaryButton: {
        text: 'Next',
        action: 'window.app.configWizardNext()'
      },
      secondaryButton: {
        text: 'Back',
        action: 'window.app.configWizardBack()'
      }
    });
  }

  showConfigStep5() {
    const branchOptions = this.configWizardData.references.branches.map(branch => 
      `<option value="${branch}">${branch}</option>`
    ).join('');
    
    const tagOptions = this.configWizardData.references.tags.map(tag => 
      `<option value="${tag}">${tag}</option>`
    ).join('');

    this.modal.show('Create JSphere Config - Step 5/6: Additional Settings', `
      <div class="wizard-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: 83.33%"></div>
        </div>
        <div class="step-indicator">Step 5 of 6: Additional Settings</div>
      </div>
      
      <form id="config-step5-form">
        <div class="form-group">
          <label class="form-label">Project Reference (Optional)</label>
          <select class="form-select" name="project_reference">
            <option value="">Select a tag or branch...</option>
            <optgroup label="Tags">
              ${tagOptions}
            </optgroup>
            <optgroup label="Branches">
              ${branchOptions}
            </optgroup>
          </select>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Server HTTP Port</label>
            <input type="number" class="form-input" name="server_http_port" 
                   value="${this.configWizardData.server_http_port}" min="1" max="65535">
          </div>
          <div class="form-group">
            <label class="form-label">Server Debug Port</label>
            <input type="number" class="form-input" name="server_debug_port" 
                   value="${this.configWizardData.server_debug_port}" min="1" max="65535">
          </div>
        </div>
        
        <div class="collapsible-section">
          <div class="collapsible-header" onclick="window.app.togglePreviewSettings()">
            <span class="collapsible-title">Preview Settings (Optional)</span>
            <span class="collapsible-arrow" id="preview-arrow">▼</span>
          </div>
          <div class="collapsible-content" id="preview-settings" style="display: none;">
            <div class="form-group">
              <label class="form-label">Preview Branch Name</label>
              <input type="text" class="form-input" name="project_preview_branch" 
                     value="${this.configWizardData.project_preview_branch}"
                     placeholder="main, develop, preview, etc.">
              <div class="form-help">Branch name for preview deployments</div>
            </div>
            
            <div class="form-group">
              <label class="form-label">Project Preview Server</label>
              <input type="text" class="form-input" name="project_preview_server" 
                     value="${this.configWizardData.project_preview_server}"
                     placeholder="preview.example.com">
              <div class="form-help">Preview server URL</div>
            </div>
            
            <div class="form-group">
              <label class="form-label">Project Preview Auth Token</label>
              <input type="password" class="form-input" name="project_preview_server_auth_token" 
                     value="${this.configWizardData.project_preview_server_auth_token}"
                     placeholder="Optional auth token for preview server">
              <div class="form-help">Authentication token for preview server access</div>
            </div>
          </div>
        </div>
      </form>
    `, {
      primaryButton: {
        text: 'Next',
        action: 'window.app.configWizardNext()'
      },
      secondaryButton: {
        text: 'Back',
        action: 'window.app.configWizardBack()'
      }
    });
  }

  showConfigStep6() {
    const customFieldsHtml = Object.entries(this.configWizardData.customFields).map(([key, value]) => `
      <div class="custom-field-row">
        <input type="text" class="form-input" value="${key}" placeholder="Key" onchange="window.app.updateCustomField(this, '${key}', 'key')">
        <input type="text" class="form-input" value="${value}" placeholder="Value" onchange="window.app.updateCustomField(this, '${key}', 'value')">
        <button type="button" class="btn btn-sm btn-error" onclick="window.app.removeCustomField('${key}')">Remove</button>
      </div>
    `).join('');

    this.modal.show('Create JSphere Config - Step 6/6: Custom Fields & Review', `
      <div class="wizard-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: 100%"></div>
        </div>
        <div class="step-indicator">Step 6 of 6: Custom Fields & Review</div>
      </div>
      
      <div class="config-section">
        <h4>Custom Configuration Fields</h4>
        <div id="custom-fields-container">
          ${customFieldsHtml}
        </div>
        <button type="button" class="btn btn-sm btn-secondary" onclick="window.app.addCustomField()">
          Add Custom Field
        </button>
      </div>
      
      <div class="config-section">
        <h4>Configuration Summary</h4>
        <div class="config-summary">
          <div class="summary-item"><strong>Name:</strong> ${this.configWizardData.name}</div>
          <div class="summary-item"><strong>GitHub Username:</strong> ${this.configWizardData.project_namespace}</div>
          <div class="summary-item"><strong>Project:</strong> .${this.configWizardData.project_name}</div>
          <div class="summary-item"><strong>App Config:</strong> ${this.configWizardData.project_app_config}</div>
          <div class="summary-item"><strong>HTTP Port:</strong> ${this.configWizardData.server_http_port}</div>
          <div class="summary-item"><strong>Debug Port:</strong> ${this.configWizardData.server_debug_port}</div>
        </div>
      </div>
    `, {
      primaryButton: {
        text: 'Create Config',
        action: 'window.app.createConfigFromWizard()'
      },
      secondaryButton: {
        text: 'Back',
        action: 'window.app.configWizardBack()'
      }
    });
  }

  // Enhanced linkLocalServer method with health checking
  async linkLocalServer() {
    const form = document.getElementById('local-server-form');
    if (!utils.validateForm(form)) return;

    const formData = new FormData(form);
    const port = formData.get('port');

    if (!utils.validatePort(port)) {
      utils.showFieldError(form.port, 'Invalid port number');
      return;
    }

    try {
      // Show connecting state in UI
      const submitBtn = document.querySelector('.modal-footer .btn-primary');
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Connecting...';
      submitBtn.disabled = true;

      const response = await this.api.post('/local-servers', {
        port: port,
        configId: formData.get('configId') || null
      });
      
      this.modal.hide();
      utils.showToast('Local server linked successfully', 'success');
      
      // Trigger health check and refresh
      await this.healthCheckLocalServers();
      await this.refresh();
    } catch (error) {
      // Reset button state
      const submitBtn = document.querySelector('.modal-footer .btn-primary');
      if (submitBtn) {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }
      utils.showToast('Failed to link local server: ' + error.message, 'error');
    }
  }

  // Toggle preview settings collapsible section
  togglePreviewSettings() {
    const previewSettings = document.getElementById('preview-settings');
    const arrow = document.getElementById('preview-arrow');
    
    if (previewSettings.style.display === 'none') {
      previewSettings.style.display = 'block';
      arrow.textContent = '▲';
    } else {
      previewSettings.style.display = 'none';
      arrow.textContent = '▼';
    }
  }

  // Config wizard navigation methods
  configWizardNext() {
    const currentStep = this.configWizardData.step;
    const form = document.getElementById(`config-step${currentStep}-form`);
    
    if (form && !utils.validateForm(form)) return;
    
    // Save current step data
    this.saveCurrentStepData();
    
    // Move to next step
    this.showConfigWizardStep(currentStep + 1);
  }

  configWizardBack() {
    const currentStep = this.configWizardData.step;
    this.saveCurrentStepData();
    this.showConfigWizardStep(currentStep - 1);
  }

  saveCurrentStepData() {
    const step = this.configWizardData.step;
    const form = document.getElementById(`config-step${step}-form`);
    
    if (!form) return;
    
    const formData = new FormData(form);
    for (const [key, value] of formData.entries()) {
      this.configWizardData[key] = value;
    }
  }

  // Custom fields management
  addCustomField() {
    const key = `custom_field_${Date.now()}`;
    this.configWizardData.customFields[key] = '';
    this.refreshCustomFields();
  }

  removeCustomField(key) {
    delete this.configWizardData.customFields[key];
    this.refreshCustomFields();
  }

  updateCustomField(input, oldKey, type) {
    const value = input.value;
    
    if (type === 'key') {
      // Update key
      const oldValue = this.configWizardData.customFields[oldKey];
      delete this.configWizardData.customFields[oldKey];
      this.configWizardData.customFields[value] = oldValue;
    } else {
      // Update value
      this.configWizardData.customFields[oldKey] = value;
    }
  }

  refreshCustomFields() {
    const container = document.getElementById('custom-fields-container');
    if (!container) return;
    
    const customFieldsHtml = Object.entries(this.configWizardData.customFields).map(([key, value]) => `
      <div class="custom-field-row">
        <input type="text" class="form-input" value="${key}" placeholder="Key" onchange="window.app.updateCustomField(this, '${key}', 'key')">
        <input type="text" class="form-input" value="${value}" placeholder="Value" onchange="window.app.updateCustomField(this, '${key}', 'value')">
        <button type="button" class="btn btn-sm btn-error" onclick="window.app.removeCustomField('${key}')">Remove</button>
      </div>
    `).join('');
    
    container.innerHTML = customFieldsHtml;
  }

  async createConfigFromWizard() {
    // Save final step data
    this.saveCurrentStepData();
    
    try {
      // Prepare config data with custom fields merged in
      const configData = {
        name: this.configWizardData.name,
        project_name: this.configWizardData.project_name,
        project_app_config: this.configWizardData.project_app_config,
        project_reference: this.configWizardData.project_reference,
        server_http_port: this.configWizardData.server_http_port,
        server_debug_port: this.configWizardData.server_debug_port,
        project_preview_branch: this.configWizardData.project_preview_branch,
        project_preview_server: this.configWizardData.project_preview_server,
        project_preview_server_auth_token: this.configWizardData.project_preview_server_auth_token,
        ...this.configWizardData.customFields
      };

      // Add workspace or manual credentials
      if (this.configWizardData.workspace_id) {
        configData.workspace_id = this.configWizardData.workspace_id;
      } else {
        configData.project_namespace = this.configWizardData.project_namespace;
        configData.project_auth_token = this.configWizardData.project_auth_token;
      }

      await this.api.post('/configs', configData);
      
      this.modal.hide();
      utils.showToast('JSphere config created successfully!', 'success');
      await this.loadData();
    } catch (error) {
      utils.showToast('Failed to create config: ' + error.message, 'error');
    }
  }

  startPolling() {
    // Auto-refresh data every 60 seconds with sync and health checks
    setInterval(async () => {
      await this.autoRefreshWithSync();
    }, 60000);
  }

  async autoRefreshWithSync() {
    try {
      // First sync deployments with GCP
      if (this.isGCPConnected) {
        await this.api.post('/deployments/sync');
      }
      
      // Health check local servers
      await this.healthCheckLocalServers();
      
      // Then refresh all data
      await this.loadData();
      
      console.log('🔄 Auto-refresh completed');
    } catch (error) {
      console.error('Auto-refresh failed:', error);
      // Still try to refresh local data even if sync fails
      await this.loadData();
    }
  }

  // User menu methods
  toggleUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) {
      dropdown.classList.toggle('hidden');
    }
  }

  showAccountInfo() {
    this.modal.show('Account Information', `
      <div class="account-info">
        <div class="account-section">
          <h4>GitHub Account</h4>
          <div class="account-details">
            <div class="account-row">
              <img src="${this.user.github_avatar_url}" alt="${this.user.github_username}" class="account-avatar">
              <div class="account-text">
                <div class="account-name">${this.user.github_username}</div>
                <div class="account-email">${this.user.github_email || 'No email provided'}</div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="account-section">
          <h4>Subscription</h4>
          <div class="account-details">
            <div class="account-row">
              <span class="account-label">Current Plan:</span>
              <span class="account-value plan-${this.user.plan}">${this.user.plan.charAt(0).toUpperCase() + this.user.plan.slice(1)}</span>
            </div>
            ${this.user.plan === 'pro' ? `
              <div class="account-row">
                <span class="account-label">Billing Status:</span>
                <span class="account-value">${this.user.billing_status || 'Active'}</span>
              </div>
            ` : ''}
          </div>
        </div>
        
        <div class="account-section">
          <h4>GCP Integration</h4>
          <div class="account-details">
            <div class="account-row">
              <span class="account-label">Status:</span>
              <span class="account-value ${this.isGCPConnected ? 'text-success' : 'text-warning'}">
                ${this.isGCPConnected ? '✓ Connected' : '⚠ Not Connected'}
              </span>
            </div>
            ${this.user.gcp_project_id ? `
              <div class="account-row">
                <span class="account-label">Project ID:</span>
                <span class="account-value">${this.user.gcp_project_id}</span>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `, {
      primaryButton: {
        text: 'Close'
      }
    });
  }

  showManagePlan() {
    if (this.user.plan === 'free') {
      this.modal.show('Upgrade to Pro', `
        <div class="plan-upgrade">
          <div class="plan-comparison">
            <div class="plan-column current-plan">
              <h4>Free Plan</h4>
              <div class="plan-features">
                <div class="feature">✓ 1 Cloud Deployment</div>
                <div class="feature">✓ Unlimited Local Servers</div>
                <div class="feature">✓ Basic Support</div>
              </div>
            </div>
            
            <div class="plan-column pro-plan">
              <h4>Pro Plan - $10/month</h4>
              <div class="plan-features">
                <div class="feature">✓ Unlimited Cloud Deployments</div>
                <div class="feature">✓ Unlimited Local Servers</div>
                <div class="feature">✓ Priority Support</div>
                <div class="feature">✓ Advanced Metrics</div>
                <div class="feature">✓ Custom Domains</div>
              </div>
            </div>
          </div>
          
          <div class="upgrade-benefits">
            <h4>Why Upgrade?</h4>
            <ul>
              <li>Deploy multiple applications simultaneously</li>
              <li>Scale your development workflow</li>
              <li>Get priority support when you need it</li>
              <li>Access advanced monitoring and metrics</li>
            </ul>
          </div>
        </div>
      `, {
        primaryButton: {
          text: 'Upgrade to Pro',
          action: 'window.app.startUpgrade()'
        },
        secondaryButton: {
          text: 'Maybe Later'
        }
      });
    } else {
      this.modal.show('Manage Pro Plan', `
        <div class="plan-management">
          <div class="current-plan-info">
            <h4>Current Plan: Pro</h4>
            <div class="plan-status">
              <div class="status-item">
                <span class="status-label">Status:</span>
                <span class="status-value text-success">${this.user.billing_status || 'Active'}</span>
              </div>
              <div class="status-item">
                <span class="status-label">Monthly Cost:</span>
                <span class="status-value">$10.00</span>
              </div>
            </div>
          </div>
          
          <div class="plan-actions">
            <button class="btn btn-secondary" onclick="window.app.viewBillingHistory()">
              View Billing History
            </button>
            <button class="btn btn-secondary" onclick="window.app.updatePaymentMethod()">
              Update Payment Method
            </button>
            <button class="btn btn-error" onclick="window.app.cancelSubscription()">
              Cancel Subscription
            </button>
          </div>
        </div>
      `, {
        primaryButton: {
          text: 'Close'
        }
      });
    }
  }

  async startUpgrade() {
    try {
      const response = await this.api.post('/billing/create-checkout-session');
      if (response.url) {
        window.location.href = response.url;
      }
    } catch (error) {
      console.error('Failed to start upgrade:', error);
      utils.showToast('Failed to start upgrade process', 'error');
    }
  }

  async viewBillingHistory() {
    this.modal.hide();
    // This would typically show billing history
    utils.showToast('Billing history feature coming soon', 'info');
  }

  async updatePaymentMethod() {
    this.modal.hide();
    // This would typically open payment method update
    utils.showToast('Payment method update feature coming soon', 'info');
  }

  async cancelSubscription() {
    this.modal.hide();
    // This would typically handle subscription cancellation
    utils.showToast('Subscription cancellation feature coming soon', 'info');
  }

  async logout() {
    try {
      // Clear local storage
      localStorage.removeItem('c11n_token');
      
      // Call logout endpoint if available
      try {
        await this.api.post('/auth/logout');
      } catch (error) {
        // Ignore logout endpoint errors, still proceed with local logout
        console.warn('Logout endpoint failed:', error);
      }
      
      // Clear app state
      this.user = null;
      this.deployments = [];
      this.configs = [];
      this.localServers = [];
      this.gcpProjects = [];
      this.isGCPConnected = false;
      
      // Clear API token
      this.api.setToken(null);
      
      // Redirect to auth page
      this.renderAuthPage();
      
      utils.showToast('Logged out successfully', 'success');
    } catch (error) {
      console.error('Logout failed:', error);
      utils.showToast('Logout failed', 'error');
    }
  }

  // Service Profile Management
  async loadServiceProfiles() {
    try {
      const response = await this.api.get('/service-profiles');
      this.serviceProfiles = response.serviceProfiles || [];
    } catch (error) {
      console.error('Failed to load service profiles:', error);
      this.serviceProfiles = [];
    }
  }

  showManageServiceProfilesModal() {
    this.modal.show('Manage Service Profiles', `
      <div class="service-profile-list">
        ${this.serviceProfiles && this.serviceProfiles.length > 0 ? this.serviceProfiles.map(profile => `
          <div class="service-profile-item">
            <div class="service-profile-info">
              <div class="service-profile-name">${profile.name}</div>
              <div class="service-profile-description">${profile.container_image_url}</div>
            </div>
            <div class="service-profile-actions">
              <button class="btn btn-sm btn-secondary" onclick="window.app.editServiceProfile('${profile.id}')">
                Edit
              </button>
              <button class="btn btn-sm btn-error" onclick="window.app.deleteServiceProfile('${profile.id}')">
                Delete
              </button>
            </div>
          </div>
        `).join('') : '<p class="text-gray-500">No service profiles created yet.</p>'}
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="window.app.showCreateServiceProfileModal()">
          Create New Service Profile
        </button>
      </div>
    `);
  }

  showCreateServiceProfileModal() {
    this.modal.show('Create Service Profile', `
      <form id="service-profile-form">
        <div class="form-group">
          <label class="form-label">Profile Name *</label>
          <input type="text" class="form-input" name="name" required placeholder="my-service-profile">
          <div class="form-help">A unique name for this service profile</div>
        </div>
        <div class="form-group">
          <label class="form-label">Container Image URL *</label>
          <input type="text" class="form-input" name="container_image_url" required 
                 placeholder="gcr.io/project/image:tag">
          <div class="form-help">Docker container image URL</div>
        </div>
        <div class="form-group">
          <label class="form-label">CPU Limit</label>
          <input type="text" class="form-input" name="cpu_limit" value="1000m" placeholder="1000m">
          <div class="form-help">CPU limit in millicores</div>
        </div>
        <div class="form-group">
          <label class="form-label">Memory Limit</label>
          <input type="text" class="form-input" name="memory_limit" value="512Mi" placeholder="512Mi">
          <div class="form-help">Memory limit</div>
        </div>
      </form>
    `, {
      primaryButton: {
        text: 'Create Profile',
        action: 'window.app.createServiceProfile()'
      },
      secondaryButton: {
        text: 'Cancel'
      }
    });
  }

  async createServiceProfile() {
    const form = document.getElementById('service-profile-form');
    if (!utils.validateForm(form)) return;

    const formData = new FormData(form);
    const profileData = {
      name: formData.get('name'),
      container_image_url: formData.get('container_image_url'),
      cpu_limit: formData.get('cpu_limit'),
      memory_limit: formData.get('memory_limit')
    };

    try {
      await this.api.post('/service-profiles', profileData);
      this.modal.hide();
      utils.showToast('Service profile created successfully!', 'success');
      await this.loadServiceProfiles();
    } catch (error) {
      utils.showToast('Failed to create service profile: ' + error.message, 'error');
    }
  }

  async editServiceProfile(id) {
    // Implementation for editing service profiles
    utils.showToast('Edit service profile feature coming soon', 'info');
  }

  async deleteServiceProfile(id) {
    if (!confirm('Are you sure you want to delete this service profile?')) return;

    try {
      await this.api.delete(`/service-profiles/${id}`);
      utils.showToast('Service profile deleted successfully', 'success');
      await this.loadServiceProfiles();
      this.showManageServiceProfilesModal();
    } catch (error) {
      utils.showToast('Failed to delete service profile: ' + error.message, 'error');
    }
  }

  // GCP Project Management
  showSelectGCPProjectModal() {
    this.modal.show('Select GCP Project', `
      <form id="gcp-project-form">
        <div class="form-group">
          <label class="form-label">GCP Project *</label>
          <select class="form-select" name="projectId" required>
            <option value="">Select a project...</option>
            ${this.gcpProjects.map(project => 
              `<option value="${project.projectId}">${project.name} (${project.projectId})</option>`
            ).join('')}
          </select>
          <div class="form-help">Choose the GCP project for deployments</div>
        </div>
      </form>
    `, {
      primaryButton: {
        text: 'Select Project',
        action: 'window.app.selectGCPProject()'
      },
      secondaryButton: {
        text: 'Cancel'
      }
    });
  }

  async selectGCPProject() {
    const form = document.getElementById('gcp-project-form');
    if (!utils.validateForm(form)) return;

    const formData = new FormData(form);
    const projectId = formData.get('projectId');

    try {
      await this.api.post('/gcp/select-project', { projectId });
      this.modal.hide();
      utils.showToast('GCP project selected successfully!', 'success');
      
      // Refresh user data
      this.user = await this.auth.getCurrentUser();
      this.isGCPConnected = !!(this.user.gcp_access_token && this.user.gcp_project_id);
      this.renderApp();
    } catch (error) {
      utils.showToast('Failed to select GCP project: ' + error.message, 'error');
    }
  }

  // Deployment Management
  async createDeployment() {
    const form = document.getElementById('deployment-form');
    if (!utils.validateForm(form)) return;

    const formData = new FormData(form);
    const deploymentData = {
      name: formData.get('name'),
      serviceProfileId: formData.get('serviceProfileId'),
      configId: formData.get('configId') || null
    };

    try {
      const response = await this.api.post('/deployments', deploymentData);
      this.modal.hide();
      utils.showToast('Deployment created successfully!', 'success');
      await this.loadData();
    } catch (error) {
      utils.showToast('Failed to create deployment: ' + error.message, 'error');
    }
  }

  async deleteDeployment(id) {
    if (!confirm('Are you sure you want to delete this deployment?')) return;

    try {
      await this.api.delete(`/deployments/${id}`);
      utils.showToast('Deployment deleted successfully', 'success');
      await this.loadData();
    } catch (error) {
      utils.showToast('Failed to delete deployment: ' + error.message, 'error');
    }
  }

  async deleteLocalServer(id) {
    if (!confirm('Are you sure you want to unlink this local server?')) return;

    try {
      await this.api.delete(`/local-servers/${id}`);
      utils.showToast('Local server unlinked successfully', 'success');
      await this.loadData();
    } catch (error) {
      utils.showToast('Failed to unlink local server: ' + error.message, 'error');
    }
  }

  // Workspace Management
  showManageWorkspacesModal() {
    this.modal.show('Manage Workspaces', `
      <div class="workspace-list">
        ${this.workspaces && this.workspaces.length > 0 ? this.workspaces.map(workspace => `
          <div class="workspace-item">
            <div class="workspace-info">
              <div class="workspace-name">${workspace.name}</div>
              <div class="workspace-description">${workspace.project_namespace}</div>
            </div>
            <div class="workspace-actions">
              <button class="btn btn-sm btn-secondary" onclick="window.app.editWorkspace('${workspace.id}')">
                Edit
              </button>
              <button class="btn btn-sm btn-error" onclick="window.app.deleteWorkspace('${workspace.id}')">
                Delete
              </button>
            </div>
          </div>
        `).join('') : '<p class="text-gray-500">No workspaces created yet.</p>'}
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="window.app.showCreateWorkspaceModal()">
          Create New Workspace
        </button>
      </div>
    `);
  }

  showCreateWorkspaceModal() {
    this.modal.show('Create Workspace', `
      <form id="workspace-form">
        <div class="form-group">
          <label class="form-label">Workspace Name *</label>
          <input type="text" class="form-input" name="name" required placeholder="my-workspace">
          <div class="form-help">A unique name for this workspace</div>
        </div>
        <div class="form-group">
          <label class="form-label">GitHub Username *</label>
          <input type="text" class="form-input" name="project_namespace" required 
                 placeholder="your-github-username">
          <div class="form-help">Your GitHub username</div>
        </div>
        <div class="form-group">
          <label class="form-label">GitHub Token *</label>
          <input type="password" class="form-input" name="project_auth_token" required 
                 placeholder="ghp_...">
          <div class="form-help">GitHub personal access token with repo access</div>
        </div>
      </form>
    `, {
      primaryButton: {
        text: 'Create Workspace',
        action: 'window.app.createWorkspace()'
      },
      secondaryButton: {
        text: 'Cancel'
      }
    });
  }

  async createWorkspace() {
    const form = document.getElementById('workspace-form');
    if (!utils.validateForm(form)) return;

    const formData = new FormData(form);
    const workspaceData = {
      name: formData.get('name'),
      project_namespace: formData.get('project_namespace'),
      project_auth_token: formData.get('project_auth_token')
    };

    try {
      await this.api.post('/workspaces', workspaceData);
      this.modal.hide();
      utils.showToast('Workspace created successfully!', 'success');
      await this.loadData();
    } catch (error) {
      utils.showToast('Failed to create workspace: ' + error.message, 'error');
    }
  }

  async editWorkspace(id) {
    utils.showToast('Edit workspace feature coming soon', 'info');
  }

  async deleteWorkspace(id) {
    if (!confirm('Are you sure you want to delete this workspace?')) return;

    try {
      await this.api.delete(`/workspaces/${id}`);
      utils.showToast('Workspace deleted successfully', 'success');
      await this.loadData();
      this.showManageWorkspacesModal();
    } catch (error) {
      utils.showToast('Failed to delete workspace: ' + error.message, 'error');
    }
  }

  // Config Management
  async editConfig(id) {
    utils.showToast('Edit config feature coming soon', 'info');
  }

  async deleteConfig(id) {
    if (!confirm('Are you sure you want to delete this configuration?')) return;

    try {
      await this.api.delete(`/configs/${id}`);
      utils.showToast('Configuration deleted successfully', 'success');
      await this.loadData();
      this.showManageConfigsModal();
    } catch (error) {
      utils.showToast('Failed to delete configuration: ' + error.message, 'error');
    }
  }

  // Config Wizard Helper Methods
  onWorkspaceSelectionChange() {
    const select = document.querySelector('select[name="workspace_selection"]');
    const manualCredentials = document.getElementById('manual-credentials');
    const workspaceSelected = document.getElementById('workspace-selected');
    
    if (select.value === 'manual') {
      manualCredentials.style.display = 'block';
      workspaceSelected.style.display = 'none';
      this.configWizardData.isConnected = false;
    } else if (select.value && select.value !== 'create_new') {
      manualCredentials.style.display = 'none';
      workspaceSelected.style.display = 'block';
      this.configWizardData.workspace_id = select.value;
      this.configWizardData.isConnected = true;
    } else {
      manualCredentials.style.display = 'none';
      workspaceSelected.style.display = 'none';
      this.configWizardData.isConnected = false;
    }
    
    // Update button state
    const nextBtn = document.querySelector('.modal-footer .btn-primary');
    if (nextBtn) {
      nextBtn.disabled = !this.configWizardData.isConnected;
    }
  }

  async validateGitHubCredentials() {
    const form = document.getElementById('config-step2-form');
    const formData = new FormData(form);
    const namespace = formData.get('project_namespace');
    const token = formData.get('project_auth_token');
    
    if (!namespace || !token) {
      utils.showToast('Please enter both username and token', 'error');
      return;
    }

    const btn = document.getElementById('validate-credentials-btn');
    const result = document.getElementById('validation-result');
    
    btn.textContent = 'Validating...';
    btn.disabled = true;

    try {
      const response = await this.api.post('/github/validate', {
        namespace,
        token
      });
      
      this.configWizardData.githubProjects = response.projects || [];
      this.configWizardData.isConnected = true;
      
      result.innerHTML = '<span class="text-success">✓ Credentials validated successfully</span>';
      
      // Update button state
      const nextBtn = document.querySelector('.modal-footer .btn-primary');
      if (nextBtn) {
        nextBtn.disabled = false;
      }
    } catch (error) {
      result.innerHTML = '<span class="text-error">✗ Validation failed: ' + error.message + '</span>';
      this.configWizardData.isConnected = false;
    } finally {
      btn.textContent = 'Connect & Validate';
      btn.disabled = false;
    }
  }

  async onProjectChange() {
    const select = document.querySelector('select[name="project_name"]');
    const projectName = select.value;
    
    if (!projectName) return;
    
    this.configWizardData.project_name = projectName;
    
    try {
      // Load app configs for the selected project
      const response = await this.api.post('/github/app-configs', {
        namespace: this.configWizardData.project_namespace,
        token: this.configWizardData.project_auth_token,
        projectName: '.' + projectName
      });
      
      this.configWizardData.appConfigs = response.appConfigs || [];
      this.configWizardData.references = response.references || { branches: [], tags: [] };
      
      // Update button state
      const nextBtn = document.querySelector('.modal-footer .btn-primary');
      if (nextBtn) {
        nextBtn.disabled = false;
      }
    } catch (error) {
      console.error('Failed to load app configs:', error);
      utils.showToast('Failed to load project details', 'error');
    }
  }

  // Server Tab Interactions
  toggleServerInfo(serverId) {
    const infoSection = document.getElementById(`info-${serverId}`);
    if (infoSection) {
      infoSection.classList.toggle('hidden');
    }
  }

  showTab(serverId, tabName) {
    // Hide all tab panes for this server
    const tabPanes = document.querySelectorAll(`[id^="tab-${serverId}-"]`);
    tabPanes.forEach(pane => {
      pane.classList.add('hidden');
      pane.classList.remove('active');
    });
    
    // Hide all tab buttons for this server
    const tabButtons = document.querySelectorAll(`[onclick*="showTab('${serverId}'"]`);
    tabButtons.forEach(btn => btn.classList.remove('active'));
    
    // Show selected tab pane
    const selectedPane = document.getElementById(`tab-${serverId}-${tabName}`);
    if (selectedPane) {
      selectedPane.classList.remove('hidden');
      selectedPane.classList.add('active');
    }
    
    // Activate selected tab button
    const selectedButton = document.querySelector(`[onclick="window.app.showTab('${serverId}', '${tabName}')"]`);
    if (selectedButton) {
      selectedButton.classList.add('active');
    }
    
    // Load specific tab content
    if (tabName === 'metrics') {
      this.loadMetrics(serverId);
    } else if (tabName === 'logs') {
      this.loadLogs(serverId);
    } else if (tabName === 'application') {
      this.loadPackageStatus(serverId);
    }
  }

  // Server Configuration Management
  async changeConfig(serverId) {
    this.modal.show('Change Configuration', `
      <form id="change-config-form">
        <div class="form-group">
          <label class="form-label">Select Configuration</label>
          <select class="form-select" name="configId" required>
            <option value="">Choose a configuration...</option>
            ${this.configs.map(config => 
              `<option value="${config.id}">${config.name}</option>`
            ).join('')}
          </select>
        </div>
      </form>
    `, {
      primaryButton: {
        text: 'Apply Configuration',
        action: `window.app.applyConfig('${serverId}')`
      },
      secondaryButton: {
        text: 'Cancel'
      }
    });
  }

  async loadConfig(serverId) {
    this.changeConfig(serverId);
  }

  async applyConfig(serverId) {
    const form = document.getElementById('change-config-form');
    if (!utils.validateForm(form)) return;

    const formData = new FormData(form);
    const configId = formData.get('configId');

    try {
      await this.api.post(`/local-servers/${serverId}/config`, { configId });
      this.modal.hide();
      utils.showToast('Configuration applied successfully', 'success');
      await this.loadData();
    } catch (error) {
      utils.showToast('Failed to apply configuration: ' + error.message, 'error');
    }
  }

  async reloadConfig(serverId) {
    try {
      await this.api.post(`/deployments/${serverId}/reload-config`);
      utils.showToast('Configuration reloaded successfully', 'success');
      await this.loadData();
    } catch (error) {
      utils.showToast('Failed to reload configuration: ' + error.message, 'error');
    }
  }

  // Metrics and Logs
  async loadMetrics(serverId) {
    const container = document.getElementById(`metrics-${serverId}`);
    if (!container) return;

    container.innerHTML = 'Loading metrics...';
    
    try {
      const response = await this.api.get(`/deployments/${serverId}/metrics`);
      // Use charts component to create metrics dashboard
      this.charts.createMetricsDashboard(`metrics-${serverId}`, response.metrics || {});
    } catch (error) {
      container.innerHTML = `
        <div class="metrics-error">
          <p>Failed to load metrics</p>
          <button class="btn btn-sm btn-secondary" onclick="window.app.loadMetrics('${serverId}')">
            Retry
          </button>
        </div>
      `;
      console.error('Failed to load metrics:', error);
    }
  }

  async loadLogs(serverId) {
    const container = document.getElementById(`logs-${serverId}`);
    if (!container) return;

    container.innerHTML = 'Loading logs...';
    
    try {
      const response = await this.api.get(`/deployments/${serverId}/logs`);
      const logs = response.logs || [];
      
      if (logs.length === 0) {
        container.innerHTML = '<div class="no-logs">No logs available</div>';
        return;
      }
      
      // Format logs with proper structure
      const logsHtml = logs.map(log => {
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
      
      container.innerHTML = `
        <div class="logs-container">
          <div class="logs-header">
            <div class="logs-info">
              <span class="logs-count">${logs.length} log entries</span>
              ${response.warning ? '<span class="logs-warning">⚠️ ' + response.warning + '</span>' : ''}
            </div>
            <div class="logs-actions">
              <button class="btn btn-sm btn-secondary" onclick="window.app.loadLogs('${serverId}')">
                🔄 Refresh
              </button>
              <button class="btn btn-sm btn-secondary" onclick="window.app.downloadLogs('${serverId}')">
                📥 Download
              </button>
            </div>
          </div>
          <div class="logs-content">
            ${logsHtml}
          </div>
        </div>
      `;
    } catch (error) {
      container.innerHTML = `
        <div class="logs-error">
          <p>Failed to load logs: ${error.message}</p>
          <button class="btn btn-sm btn-secondary" onclick="window.app.loadLogs('${serverId}')">
            🔄 Retry
          </button>
        </div>
      `;
      console.error('Failed to load logs:', error);
    }
  }

  // Package Management
  async loadPackageStatus(serverId) {
    const container = document.getElementById(`package-list-${serverId}`);
    if (!container) return;

    container.innerHTML = '<div class="package-loading">Loading package status...</div>';
    
    try {
      const response = await this.api.get(`/local-servers/${serverId}/packages`);
      this.renderPackageList(serverId, response.packages || []);
    } catch (error) {
      container.innerHTML = '<div class="package-error">Failed to load package status</div>';
      console.error('Failed to load package status:', error);
    }
  }

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
            <button class="btn btn-sm btn-primary" onclick="window.app.checkoutPackage('${serverId}', '${pkg.name}')">
              Checkout
            </button>
          ` : pkg.status === 'checked-out' ? `
            <button class="btn btn-sm btn-secondary" onclick="window.app.checkinPackage('${serverId}', '${pkg.name}')">
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

      document.getElementById(`checked-out-count-${serverId}`).textContent = checkedOut;
      document.getElementById(`available-count-${serverId}`).textContent = available;
      document.getElementById(`total-count-${serverId}`).textContent = total;
      
      footer.style.display = 'block';
    }
  }

  async checkoutPackage(serverId, packageName) {
    try {
      await this.api.post(`/local-servers/${serverId}/packages/${packageName}/checkout`);
      utils.showToast(`Package ${packageName} checked out successfully`, 'success');
      await this.loadPackageStatus(serverId);
    } catch (error) {
      utils.showToast(`Failed to checkout package: ${error.message}`, 'error');
    }
  }

  async checkinPackage(serverId, packageName) {
    try {
      await this.api.post(`/local-servers/${serverId}/packages/${packageName}/checkin`);
      utils.showToast(`Package ${packageName} checked in successfully`, 'success');
      await this.loadPackageStatus(serverId);
    } catch (error) {
      utils.showToast(`Failed to checkin package: ${error.message}`, 'error');
    }
  }

  async createPackage(serverId) {
    this.modal.show('Create Package', `
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
        action: `window.app.executeCreatePackage('${serverId}')`
      },
      secondaryButton: {
        text: 'Cancel'
      }
    });
  }

  async executeCreatePackage(serverId) {
    const form = document.getElementById('create-package-form');
    if (!utils.validateForm(form)) return;

    const formData = new FormData(form);
    const packageData = {
      name: formData.get('name'),
      type: formData.get('type')
    };

    try {
      await this.api.post(`/local-servers/${serverId}/packages`, packageData);
      this.modal.hide();
      utils.showToast('Package created successfully', 'success');
      await this.loadPackageStatus(serverId);
    } catch (error) {
      utils.showToast('Failed to create package: ' + error.message, 'error');
    }
  }

  async createProject(serverId) {
    this.modal.show('Create Project', `
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
        action: `window.app.executeCreateProject('${serverId}')`
      },
      secondaryButton: {
        text: 'Cancel'
      }
    });
  }

  async executeCreateProject(serverId) {
    const form = document.getElementById('create-project-form');
    if (!utils.validateForm(form)) return;

    const formData = new FormData(form);
    const projectData = {
      name: formData.get('name'),
      template: formData.get('template')
    };

    try {
      await this.api.post(`/local-servers/${serverId}/projects`, projectData);
      this.modal.hide();
      utils.showToast('Project created successfully', 'success');
      await this.loadPackageStatus(serverId);
    } catch (error) {
      utils.showToast('Failed to create project: ' + error.message, 'error');
    }
  }

  async triggerPreview(serverId) {
    try {
      await this.api.post(`/local-servers/${serverId}/preview`);
      utils.showToast('Preview triggered successfully', 'success');
    } catch (error) {
      utils.showToast('Failed to trigger preview: ' + error.message, 'error');
    }
  }

  async refreshPackageStatus(serverId) {
    await this.loadPackageStatus(serverId);
    utils.showToast('Package status refreshed', 'info');
  }

  // Helper method to escape HTML
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Download logs functionality
  async downloadLogs(serverId) {
    try {
      const response = await this.api.get(`/deployments/${serverId}/logs`);
      const logs = response.logs || [];
      
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
      a.download = `logs-${serverId}-${new Date().toISOString().split('T')[0]}.txt`;
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
}

// Initialize app
window.app = new C11NApp();
