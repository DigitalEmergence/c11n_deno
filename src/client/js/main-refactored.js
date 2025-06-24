import { API } from './api.js';
import { Auth } from './auth.js';
import { Navbar } from './components/navbar.js';
import { ServerTabs } from './components/server-tab.js';
import { Modal } from './components/modals.js';
import { Billing } from './components/billing.js';
import { Charts } from './components/charts.js';
import { utils } from './utils.js';

// Import all managers
import { DataManager } from './managers/data-manager.js';
import { RealtimeManager } from './managers/realtime-manager.js';
import { GCPManager } from './managers/gcp-manager.js';
import { DeploymentManager } from './managers/deployment-manager.js';
import { LocalServerManager } from './managers/local-server-manager.js';
import { RemoteServerManager } from './managers/remote-server-manager.js';
import { UserManager } from './managers/user-manager.js';
import { ConfigManager } from './managers/config-manager.js';
import { ServiceProfileManager } from './managers/service-profile-manager.js';
import { ActionsManager } from './managers/actions-manager.js';

class C11NApp {
  constructor() {
    // Initialize core services
    this.api = new API();
    this.auth = new Auth(this.api);
    this.modal = new Modal();
    this.billing = new Billing(this.api);
    this.charts = new Charts();
    
    // Initialize managers
    this.dataManager = new DataManager(this.api);
    this.realtimeManager = new RealtimeManager(this.api, this.dataManager);
    this.gcpManager = new GCPManager(this.api, this.dataManager);
    this.deploymentManager = new DeploymentManager(this.api, this.dataManager, this.gcpManager, this.realtimeManager);
    this.localServerManager = new LocalServerManager(this.api, this.dataManager);
    this.remoteServerManager = new RemoteServerManager(this);
    this.userManager = new UserManager(this.api, this.dataManager);
    this.configManager = new ConfigManager(this.api, this.dataManager);
    this.serviceProfileManager = new ServiceProfileManager(this.api, this.dataManager);
    this.actionsManager = new ActionsManager(this.api, this.dataManager);
    
    // UI components
    this.navbar = null;
    this.serverTabs = null;
    
    // Setup data listeners
    this.setupDataListeners();
    
    this.init();
  }

  setupDataListeners() {
    this.dataManager.addListener((eventType, data) => {
      switch (eventType) {
        case 'user_updated':
        case 'gcp_connection_updated':
        case 'gcp_status_changed':
        case 'gcp_token_validity_changed':
          this.renderApp();
          break;
        case 'deployments_updated':
        case 'local_servers_updated':
        case 'remote_servers_updated':
        case 'deployment_added':
        case 'deployment_removed':
        case 'local_server_added':
        case 'local_server_removed':
        case 'remote_server_added':
        case 'remote_server_removed':
          if (this.serverTabs) {
            this.serverTabs.update(
              this.dataManager.getDeployments(), 
              this.dataManager.getLocalServers(),
              this.dataManager.getRemoteServers()
            );
          }
          break;
        case 'deployment_updated':
        case 'deployment_url_updated':
        case 'local_server_updated':
        case 'remote_server_updated':
          // Force a complete re-render for individual updates to ensure UI reflects changes
          if (this.serverTabs) {
            console.log(`🔄 Updating server tabs due to ${eventType}:`, data);
            this.serverTabs.update(
              this.dataManager.getDeployments(), 
              this.dataManager.getLocalServers(),
              this.dataManager.getRemoteServers()
            );
            // Force re-render by creating a new instance if needed
            this.serverTabs.render();
          }
          break;
        case 'user_logged_out':
          console.log('🔄 user_logged_out event received - rendering auth page');
          this.renderAuthPage();
          console.log('✅ Auth page rendered after logout');
          break;
      }
    });
  }

  async init() {
    // Handle OAuth callbacks and token from redirect
    const params = utils.getUrlParams();
    
    // Handle token from GitHub OAuth redirect
    if (params.token) {
      this.api.setToken(params.token);
      try {
        const user = await this.auth.getCurrentUser();
        this.dataManager.setUser(user);
        this.renderApp();
        await this.dataManager.loadData();
        this.startServices();
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
        const user = await this.auth.getCurrentUser();
        this.dataManager.setUser(user);
        this.renderApp();
        await this.dataManager.loadData();
        this.startServices();
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
        const user = await this.auth.handleGitHubCallback(code);
        this.dataManager.setUser(user);
        this.renderApp();
        await this.dataManager.loadData();
        this.startServices();
      } else if (state === 'gcp') {
        await this.auth.handleGCPCallback(code);
        utils.showToast('GCP account connected successfully!', 'success');
        // Refresh user data
        const user = await this.auth.getCurrentUser();
        this.dataManager.setUser(user);
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

  startServices() {
    this.realtimeManager.startRealTimeUpdates();
    this.realtimeManager.startPolling();
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
    const user = this.dataManager.getUser();
    const isGCPConnected = this.dataManager.isGCPConnectedStatus();
    const needsReconnection = this.dataManager.needsGCPReconnection();

    let gcpButtonHtml;
    if (!isGCPConnected) {
      gcpButtonHtml = `
        <button class="btn btn-secondary" onclick="window.app.connectGCP()">
          Connect GCP
        </button>
      `;
    } else if (needsReconnection) {
      gcpButtonHtml = `
        <button class="btn btn-warning gcp-reconnect-btn" onclick="window.app.reconnectGCP()" title="GCP session expired - click to reconnect">
          ⚠️ Reconnect GCP
        </button>
        <div class="gcp-dropdown">
          <button class="btn btn-icon btn-secondary dropdown-toggle" onclick="window.app.toggleGCPMenu(event)" title="GCP Options">
            <img src="assets/icons/c11n_settings_icon.png" alt="GCP Options" class="settings-icon" id="gcp-settings-icon">
          </button>
          <div class="gcp-dropdown-menu hidden">
            <div class="gcp-dropdown-item" onclick="window.app.disconnectGCP()">
              <i class="fas fa-unlink"></i> Disconnect GCP
            </div>
          </div>
        </div>
      `;
    } else {
      const currentProject = user?.gcp_project_name || 'Unknown Project';
      gcpButtonHtml = `
        <button class="btn btn-success gcp-connected-btn" onclick="window.app.showGCPInfo()" title="Connected to ${currentProject}">
          ✓ GCP Connected
        </button>
        <div class="gcp-dropdown">
          <button class="btn btn-icon btn-secondary dropdown-toggle" onclick="window.app.toggleGCPMenu(event)" title="GCP Options">
            <img src="assets/icons/c11n_settings_icon.png" alt="GCP Options" class="settings-icon" id="gcp-settings-icon">
          </button>
          <div class="gcp-dropdown-menu hidden">
            <div class="gcp-dropdown-item" onclick="window.app.showSelectGCPProjectModal()">
              <i class="fas fa-exchange-alt"></i> Change Project
            </div>
            <div class="gcp-dropdown-item" onclick="window.app.disconnectGCP()">
              <i class="fas fa-unlink"></i> Disconnect GCP
            </div>
          </div>
        </div>
      `;
    }

    document.getElementById('app').innerHTML = `
      <nav id="navbar"></nav>
      <main class="main-page">
        <div class="section_content2">
          <div class="top-bar">
            <div class="top-bar-left">
              <button class="btn btn-icon btn-secondary" onclick="window.app.refresh()" title="Refresh">
                <img src="assets/icons/c11n_refresh_icon.png" alt="Refresh" class="refresh-icon" id="refresh-icon">
              </button>
            </div>
            <div class="top-bar-right">
              ${gcpButtonHtml}
              <button class="universal-plus-btn" onclick="window.app.showUniversalMenu(event)" title="Add new">
                <img src="assets/icons/c11n_plus_icon.png" alt="Add new" class="plus-icon" id="plus-icon">
              </button>
            </div>
          </div>
          <div id="server-tabs" class="server-tabs"></div>
        </div>
      </main>
    `;

    this.navbar = new Navbar(user);
    this.serverTabs = new ServerTabs(
      this.dataManager.getDeployments(), 
      this.dataManager.getLocalServers(),
      this.dataManager.getRemoteServers()
    );
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

  showUniversalMenu(event) {
    const menuItems = [
      { label: 'New Deployment', action: 'window.app.showNewDeploymentModal' },
      { label: 'Link a Server', action: 'window.app.showLinkServerModal' },
      { label: 'Manage Configs', action: 'window.app.showManageConfigsModal' },
      { label: 'Manage Workspaces', action: 'window.app.showManageWorkspacesModal' },
      { label: 'Manage Service Profiles', action: 'window.app.showManageServiceProfilesModal' }
    ];

    // Get the plus icon and rotate it
    const plusIcon = document.getElementById('plus-icon');
    if (plusIcon) {
      plusIcon.classList.add('rotated');
    }

    // Show dropdown and set up close handler
    this.modal.showDropdown(menuItems, event.target, () => {
      // This callback is called when the dropdown is closed
      if (plusIcon) {
        plusIcon.classList.remove('rotated');
      }
    });
  }

  // Delegate to LocalServerManager for server linking coordination
  showLinkServerModal() {
    this.localServerManager.showServerTypeSelectionModal(this.modal);
  }

  // Delegate to respective managers
  showLinkRemoteServerModal() {
    this.modal.hide(); // Close the server type selection modal first
    this.remoteServerManager.showLinkRemoteServerModal(this.modal);
  }

  // Service profile management
  async showManageServiceProfilesModal() {
    await this.serviceProfileManager.loadServiceProfiles();
    this.serviceProfileManager.showManageServiceProfilesModal(this.modal);
  }

  // Refresh method
  async refresh() {
    // Add rotation animation to the refresh icon
    const refreshIcon = document.getElementById('refresh-icon');
    if (refreshIcon) {
      refreshIcon.classList.add('rotating');
    }

    try {
      await this.realtimeManager.refresh();
    } finally {
      // Remove rotation animation after refresh is complete
      if (refreshIcon) {
        refreshIcon.classList.remove('rotating');
      }
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
      this.localServerManager.refreshPackageStatus(serverId);
    }
  }

  async loadMetrics(serverId) {
    const container = document.getElementById(`metrics-${serverId}`);
    if (!container) return;

    container.innerHTML = 'Loading metrics...';
    
    try {
      const metrics = await this.deploymentManager.loadMetrics(serverId);
      // Use charts component to create metrics dashboard
      this.charts.createMetricsDashboard(`metrics-${serverId}`, metrics);
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
      const { logs, warning } = await this.deploymentManager.loadLogs(serverId);
      container.innerHTML = this.deploymentManager.createLogsContainer(serverId, logs, warning);
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

  // Modal methods that are called from UI
  async showNewDeploymentModal() {
    await this.deploymentManager.showNewDeploymentModal(this.modal);
  }

  async showLinkLocalServerModal() {
    this.localServerManager.showLinkLocalServerModal(this.modal);
  }

  async showManageConfigsModal() {
    this.configManager.showManageConfigsModal(this.modal);
  }

  async showManageWorkspacesModal() {
    this.configManager.showManageWorkspacesModal(this.modal);
  }

  // User management methods
  toggleUserMenu() {
    // Check if user dropdown is currently open
    const userDropdown = document.getElementById('user-dropdown');
    const isUserDropdownOpen = userDropdown && !userDropdown.classList.contains('hidden');
    
    // If user dropdown is not open, close other dropdowns first
    if (!isUserDropdownOpen) {
      // Close universal dropdowns
      const universalDropdowns = document.querySelectorAll('.universal-dropdown-menu');
      universalDropdowns.forEach(dropdown => {
        dropdown.classList.remove('expanding');
        dropdown.classList.add('collapsing');
        setTimeout(() => dropdown.remove(), 300);
      });
      
      // Close GCP settings dropdowns and remove rotation
      document.querySelectorAll('.gcp-dropdown-menu').forEach(menu => {
        if (!menu.classList.contains('hidden')) {
          menu.classList.add('hidden');
          const settingsIcon = menu.closest('.gcp-dropdown')?.querySelector('.settings-icon');
          if (settingsIcon) {
            settingsIcon.classList.remove('rotated');
          }
        }
      });
      
      // Remove rotation from plus icon if it's rotated
      const plusIcon = document.getElementById('plus-icon');
      if (plusIcon) {
        plusIcon.classList.remove('rotated');
      }
    }
    
    // Now toggle the user menu
    this.userManager.toggleUserMenu();
  }

  showAccountInfo() {
    this.userManager.showAccountInfo(this.modal);
  }

  showManagePlan() {
    this.userManager.showManagePlan(this.modal);
  }

  async startUpgrade() {
    await this.userManager.startUpgrade();
  }

  async logout() {
    console.log('🚪 Main app logout method called');
    try {
      await this.userManager.logout();
      console.log('✅ Logout completed successfully');
    } catch (error) {
      console.error('❌ Logout failed:', error);
      utils.showToast('Logout failed: ' + error.message, 'error');
    }
  }

  // GCP methods
  async connectGCP() {
    await this.gcpManager.connectGCP();
  }

  async reconnectGCP() {
    await this.gcpManager.reconnectGCP();
  }

  async disconnectGCP() {
    await this.gcpManager.disconnectGCP();
  }

  toggleGCPMenu(event) {
    event.stopPropagation();
    
    const dropdown = event.target.closest('.gcp-dropdown');
    
    // Check if dropdown exists
    if (!dropdown) {
      console.error('GCP dropdown container not found');
      return;
    }
    
    let menu = dropdown.querySelector('.gcp-dropdown-menu');
    const settingsIcon = dropdown.querySelector('.settings-icon');
    
    // If menu doesn't exist, create it dynamically
    if (!menu) {
      console.log('Creating GCP dropdown menu dynamically');
      const user = this.dataManager.getUser();
      const isGCPConnected = this.dataManager.isGCPConnectedStatus();
      
      let menuHTML;
      if (isGCPConnected) {
        menuHTML = `
          <div class="gcp-dropdown-menu hidden">
            <div class="gcp-dropdown-item" onclick="window.app.showSelectGCPProjectModal()">
              <i class="fas fa-exchange-alt"></i> Change Project
            </div>
            <div class="gcp-dropdown-item" onclick="window.app.disconnectGCP()">
              <i class="fas fa-unlink"></i> Disconnect GCP
            </div>
          </div>
        `;
      } else {
        menuHTML = `
          <div class="gcp-dropdown-menu hidden">
            <div class="gcp-dropdown-item" onclick="window.app.disconnectGCP()">
              <i class="fas fa-unlink"></i> Disconnect GCP
            </div>
          </div>
        `;
      }
      
      dropdown.insertAdjacentHTML('beforeend', menuHTML);
      menu = dropdown.querySelector('.gcp-dropdown-menu');
    }
    
    // Check if this GCP dropdown is currently open
    const isGCPDropdownOpen = !menu.classList.contains('hidden');
    
    // If this GCP dropdown is not open, close other dropdowns first
    if (!isGCPDropdownOpen) {
      // Close universal dropdowns
      const universalDropdowns = document.querySelectorAll('.universal-dropdown-menu');
      universalDropdowns.forEach(dropdown => {
        dropdown.classList.remove('expanding');
        dropdown.classList.add('collapsing');
        setTimeout(() => dropdown.remove(), 300);
      });
      
      // Close user dropdown
      const userDropdown = document.getElementById('user-dropdown');
      if (userDropdown && !userDropdown.classList.contains('hidden')) {
        userDropdown.classList.add('hidden');
      }
      
      // Remove rotation from plus icon if it's rotated
      const plusIcon = document.getElementById('plus-icon');
      if (plusIcon) {
        plusIcon.classList.remove('rotated');
      }
    }
    
    // Close other GCP dropdowns
    document.querySelectorAll('.gcp-dropdown-menu').forEach(m => {
      if (m !== menu && !m.classList.contains('hidden')) {
        m.classList.add('hidden');
        // Remove rotation from other settings icons
        const otherIcon = m.closest('.gcp-dropdown')?.querySelector('.settings-icon');
        if (otherIcon) {
          otherIcon.classList.remove('rotated');
        }
      }
    });
    
    // Toggle this dropdown
    menu.classList.toggle('hidden');
    
    // Toggle rotation animation
    if (settingsIcon) {
      if (menu.classList.contains('hidden')) {
        settingsIcon.classList.remove('rotated');
      } else {
        settingsIcon.classList.add('rotated');
      }
    }
    
    // Close dropdown when clicking outside
    const closeHandler = (e) => {
      if (!dropdown.contains(e.target)) {
        if (menu) {
          menu.classList.add('hidden');
        }
        if (settingsIcon) {
          settingsIcon.classList.remove('rotated');
        }
        document.removeEventListener('click', closeHandler);
      }
    };
    
    if (!menu.classList.contains('hidden')) {
      document.addEventListener('click', closeHandler);
    }
  }

  showGCPInfo() {
    const user = this.dataManager.getUser();
    const projectName = user?.gcp_project_name || 'Unknown Project';
    const projectId = user?.gcp_project_id || 'unknown';
    const connectedAt = user?.gcp_connected_at ? new Date(user.gcp_connected_at).toLocaleDateString() : 'Unknown';

    const infoHTML = `
      <div class="gcp-info">
        <div class="gcp-info-header">
          <i class="fas fa-cloud text-success"></i>
          <h3>Google Cloud Platform Connection</h3>
        </div>
        
        <div class="gcp-info-content">
          <div class="info-section">
            <h4>Current Project</h4>
            <div class="project-details">
              <div class="detail-row">
                <strong>Name:</strong> ${projectName}
              </div>
              <div class="detail-row">
                <strong>Project ID:</strong> <code>${projectId}</code>
              </div>
              <div class="detail-row">
                <strong>Connected:</strong> ${connectedAt}
              </div>
            </div>
          </div>
          
          <div class="info-section">
            <h4>Authorized Permissions</h4>
            <ul class="permissions-list">
              <li><i class="fas fa-cloud text-green"></i> Cloud Run service management</li>
              <li><i class="fas fa-chart-line text-blue"></i> Monitoring and metrics (read-only)</li>
              <li><i class="fas fa-file-alt text-orange"></i> Logs access (read-only)</li>
              <li><i class="fas fa-users-cog text-purple"></i> IAM policy management</li>
            </ul>
          </div>
          
          <div class="security-note">
            <i class="fas fa-shield-alt"></i>
            <p><strong>Security:</strong> C11N only has access to the selected project with minimal required permissions.</p>
          </div>
        </div>
      </div>
    `;

    this.modal.show('GCP Connection Details', infoHTML, {
      primaryButton: {
        text: 'Change Project',
        action: 'window.app.showSelectGCPProjectModal()'
      },
      secondaryButton: {
        text: 'Close'
      }
    });
  }

  // Config management methods
  async showCreateConfigModal() {
    this.configManager.showCreateConfigModal(this.modal);
  }

  async createDeployment() {
    await this.deploymentManager.handleCreateDeployment();
  }

  async linkLocalServer() {
    await this.localServerManager.handleLinkLocalServer();
  }

  async deleteDeployment(id) {
    await this.deploymentManager.deleteDeployment(id);
  }

  async deleteLocalServer(id) {
    await this.localServerManager.deleteLocalServer(id);
  }

  async deleteRemoteServer(id) {
    await this.remoteServerManager.deleteRemoteServer(id);
  }

  // Server configuration methods
  async changeConfig(serverId) {
    this.localServerManager.showChangeConfigModal(serverId, this.modal);
  }

  async loadConfig(serverId) {
    this.changeConfig(serverId);
  }

  async applyConfig(serverId) {
    await this.localServerManager.handleApplyConfig(serverId);
  }

  async reloadConfig(serverId) {
    await this.deploymentManager.reloadConfig(serverId);
  }

  // Package management methods
  async checkoutPackage(serverId, packageName) {
    await this.localServerManager.checkoutPackage(serverId, packageName);
  }

  async checkinPackage(serverId, packageName) {
    await this.localServerManager.checkinPackage(serverId, packageName);
  }

  async createPackage(serverId) {
    this.localServerManager.showCreatePackageModal(serverId, this.modal);
  }

  async executeCreatePackage(serverId) {
    await this.localServerManager.handleCreatePackage(serverId);
  }

  async createProject(serverId) {
    this.localServerManager.showCreateProjectModal(serverId, this.modal);
  }

  async executeCreateProject(serverId) {
    await this.localServerManager.handleCreateProject(serverId);
  }

  async triggerPreview(serverId) {
    await this.localServerManager.triggerPreview(serverId);
  }

  async refreshPackageStatus(serverId) {
    await this.localServerManager.refreshPackageStatus(serverId);
  }

  // Download logs functionality
  async downloadLogs(serverId) {
    await this.deploymentManager.downloadLogs(serverId);
  }

  // Service Profile methods
  async showCreateServiceProfileModal() {
    this.serviceProfileManager.showCreateServiceProfileModal(this.modal);
  }

  async editServiceProfile(id) {
    await this.serviceProfileManager.editServiceProfile(id, this.modal);
  }

  async duplicateServiceProfile(id) {
    await this.serviceProfileManager.duplicateServiceProfile(id);
  }

  async deleteServiceProfile(id) {
    await this.serviceProfileManager.deleteServiceProfile(id);
  }

  // Config wizard methods
  configWizardNext() {
    this.configManager.configWizardNext();
  }

  configWizardBack() {
    this.configManager.configWizardBack();
  }

  async onWorkspaceSelectionChange() {
    await this.configManager.onWorkspaceSelectionChange();
  }

  async validateGitHubCredentials() {
    await this.configManager.validateGitHubCredentials();
  }

  async onProjectChange() {
    await this.configManager.onProjectChange();
  }

  togglePreviewSettings() {
    this.configManager.togglePreviewSettings();
  }

  addCustomField() {
    this.configManager.addCustomField();
  }

  removeCustomField(key) {
    this.configManager.removeCustomField(key);
  }

  updateCustomField(input, oldKey, type) {
    this.configManager.updateCustomField(input, oldKey, type);
  }

  async createConfigFromWizard() {
    await this.configManager.createConfigFromWizard();
  }

  // Workspace methods
  async showCreateWorkspaceModal() {
    this.configManager.showCreateWorkspaceModal(this.modal);
  }

  async validateWorkspaceCredentials() {
    await this.configManager.validateWorkspaceCredentials();
  }

  async createWorkspace() {
    await this.configManager.createWorkspace();
  }

  async editWorkspace(id) {
    await this.configManager.editWorkspace(id);
  }

  async deleteWorkspace(id) {
    await this.configManager.deleteWorkspace(id);
  }

  async editConfig(id) {
    await this.configManager.editConfig(id);
  }

  async deleteConfig(id) {
    await this.configManager.deleteConfig(id);
  }

  // Service Profile wizard methods
  serviceProfileWizardNext() {
    this.serviceProfileManager.serviceProfileWizardNext();
  }

  serviceProfileWizardBack() {
    this.serviceProfileManager.serviceProfileWizardBack();
  }

  onImageSelectionChange() {
    this.serviceProfileManager.onImageSelectionChange();
  }

  addServiceProfileEnvVar() {
    this.serviceProfileManager.addServiceProfileEnvVar();
  }

  removeServiceProfileEnvVar(key) {
    this.serviceProfileManager.removeServiceProfileEnvVar(key);
  }

  updateServiceProfileEnvVar(input, oldKey, type) {
    this.serviceProfileManager.updateServiceProfileEnvVar(input, oldKey, type);
  }

  async saveServiceProfile() {
    await this.serviceProfileManager.saveServiceProfile();
  }

  // GCP Project methods
  showSelectGCPProjectModal() {
    this.gcpManager.showSelectGCPProjectModal(this.modal);
  }

  async selectGCPProject() {
    await this.gcpManager.selectGCPProject(this.modal);
  }

  // Actions Tab Methods - Delegate to ActionsManager
  toggleActionDetails(actionId) {
    return this.actionsManager.toggleActionDetails(actionId);
  }

  async loadConfigsForAction(serverId) {
    return await this.actionsManager.loadConfigsForAction(serverId);
  }

  handleConfigSelection(serverId) {
    return this.actionsManager.handleConfigSelection(serverId);
  }

  buildJSphereConfig(config) {
    return this.actionsManager.buildJSphereConfig(config);
  }

  async refreshConfigs(serverId) {
    return await this.actionsManager.refreshConfigs(serverId);
  }

  async executeLoadConfig(serverId) {
    return await this.actionsManager.executeLoadConfig(serverId);
  }

  async executeCheckout(serverId) {
    return await this.actionsManager.executeCheckout(serverId);
  }

  async executeCreatePackage(serverId) {
    return await this.actionsManager.executeCreatePackage(serverId);
  }

  async executeCreateProject(serverId) {
    return await this.actionsManager.executeCreateProject(serverId);
  }

  async executePreview(serverId) {
    return await this.actionsManager.executePreview(serverId);
  }

  async sendJSphereCommand(serverId, command, data = null) {
    return await this.actionsManager.sendJSphereCommand(serverId, command, data);
  }

  // Cleanup method
  cleanup() {
    this.realtimeManager.cleanup();
  }
}

// Make utils available globally
window.utils = utils;

// Initialize app
console.log('🚀 Initializing C11NApp...');
window.app = new C11NApp();
console.log('✅ window.app initialized:', window.app);
console.log('🔍 window.app.logout type:', typeof window.app.logout);
