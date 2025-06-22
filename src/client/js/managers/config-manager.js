import { utils } from '../utils.js';

export class ConfigManager {
  constructor(api, dataManager) {
    this.api = api;
    this.dataManager = dataManager;
    this.configWizardData = {};
    this.workspaceValidationData = {};
  }

  // Config Management
  async createConfig(configData) {
    try {
      const response = await this.api.post('/configs', configData);
      this.dataManager.addConfig(response.config);
      utils.showToast('JSphere config created successfully!', 'success');
      return response.config;
    } catch (error) {
      utils.showToast('Failed to create config: ' + error.message, 'error');
      throw error;
    }
  }

  async deleteConfig(id) {
    if (!confirm('Are you sure you want to delete this configuration?')) return false;

    try {
      await this.api.delete(`/configs/${id}`);
      this.dataManager.removeConfig(id);
      utils.showToast('Configuration deleted successfully', 'success');
      return true;
    } catch (error) {
      utils.showToast('Failed to delete configuration: ' + error.message, 'error');
      throw error;
    }
  }

  // Workspace Management
  async createWorkspace(workspaceData) {
    try {
      const response = await this.api.post('/workspaces', workspaceData);
      this.dataManager.addWorkspace(response.workspace);
      utils.showToast('Workspace created successfully!', 'success');
      return response.workspace;
    } catch (error) {
      utils.showToast('Failed to create workspace: ' + error.message, 'error');
      throw error;
    }
  }

  async deleteWorkspace(id) {
    if (!confirm('Are you sure you want to delete this workspace?')) return false;

    try {
      await this.api.delete(`/workspaces/${id}`);
      this.dataManager.removeWorkspace(id);
      utils.showToast('Workspace deleted successfully', 'success');
      return true;
    } catch (error) {
      utils.showToast('Failed to delete workspace: ' + error.message, 'error');
      throw error;
    }
  }

  async validateWorkspaceCredentials(namespace, token) {
    try {
      const response = await this.api.post('/workspaces/validate-credentials', {
        project_namespace: namespace,
        project_auth_token: token
      });
      return response;
    } catch (error) {
      throw error;
    }
  }

  // Modal Methods
  showManageConfigsModal(modal) {
    const configs = this.dataManager.getConfigs();

    modal.show('Manage JSphere Configs', `
      <div class="config-list">
        ${configs.length > 0 ? configs.map(config => `
          <div class="config-item">
            <div class="config-info">
              <div class="config-name">${config.name}</div>
              <div class="config-description">${config.project_namespace}/${config.project_name} - ${config.project_app_config}</div>
            </div>
            <div class="config-actions">
              <button class="btn btn-sm btn-secondary" onclick="window.app.configManager.editConfig('${config.id}')">
                Edit
              </button>
              <button class="btn btn-sm btn-error" onclick="window.app.configManager.deleteConfig('${config.id}')">
                Delete
              </button>
            </div>
          </div>
        `).join('') : '<p class="text-gray-500">No configurations created yet.</p>'}
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="window.app.configManager.showCreateConfigModal()">
          Create New Config
        </button>
      </div>
    `);
  }

  showManageWorkspacesModal(modal) {
    const workspaces = this.dataManager.getWorkspaces();

    modal.show('Manage Workspaces', `
      <div class="workspace-list">
        ${workspaces && workspaces.length > 0 ? workspaces.map(workspace => `
          <div class="workspace-item">
            <div class="workspace-info">
              <div class="workspace-name">${workspace.name}</div>
              <div class="workspace-description">${workspace.project_namespace}</div>
            </div>
            <div class="workspace-actions">
              <button class="btn btn-sm btn-secondary" onclick="window.app.configManager.editWorkspace('${workspace.id}')">
                Edit
              </button>
              <button class="btn btn-sm btn-error" onclick="window.app.configManager.deleteWorkspace('${workspace.id}')">
                Delete
              </button>
            </div>
          </div>
        `).join('') : '<p class="text-gray-500">No workspaces created yet.</p>'}
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="window.app.configManager.showCreateWorkspaceModal()">
          Create New Workspace
        </button>
      </div>
    `);
  }

  showCreateWorkspaceModal() {
    this.workspaceValidationData = {
      isConnected: false,
      userInfo: null
    };

    if (window.app && window.app.modal) {
      window.app.modal.show('Create Workspace', `
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
          <div class="form-group">
            <button type="button" class="btn btn-secondary" onclick="window.app.configManager.handleValidateWorkspaceCredentials()" 
                    id="validate-workspace-btn">
              Connect & Validate
            </button>
            <div id="workspace-validation-result" class="form-help"></div>
          </div>
          <div id="workspace-user-info" style="display: none;" class="form-group">
            <div class="user-info-card">
              <img id="workspace-user-avatar" src="" alt="" class="user-avatar">
              <div class="user-details">
                <div id="workspace-user-name" class="user-name"></div>
                <div id="workspace-user-username" class="user-username"></div>
                <div id="workspace-projects-count" class="user-projects"></div>
              </div>
            </div>
          </div>
        </form>
      `, {
        primaryButton: {
          text: 'Create Workspace',
          action: 'window.app.configManager.handleCreateWorkspace()',
          disabled: true
        },
        secondaryButton: {
          text: 'Cancel'
        }
      });
    }
  }

  async handleValidateWorkspaceCredentials() {
    const form = document.getElementById('workspace-form');
    const formData = new FormData(form);
    const namespace = formData.get('project_namespace');
    const token = formData.get('project_auth_token');
    
    if (!namespace || !token) {
      utils.showToast('Please enter both username and token', 'error');
      return;
    }

    const btn = document.getElementById('validate-workspace-btn');
    const result = document.getElementById('workspace-validation-result');
    const userInfo = document.getElementById('workspace-user-info');
    
    btn.textContent = 'Validating...';
    btn.disabled = true;

    try {
      const response = await this.validateWorkspaceCredentials(namespace, token);
      
      this.workspaceValidationData.isConnected = true;
      this.workspaceValidationData.userInfo = response;
      
      result.innerHTML = '<span class="text-success">✓ Credentials validated successfully</span>';
      
      // Show user info
      document.getElementById('workspace-user-avatar').src = response.avatar_url;
      document.getElementById('workspace-user-name').textContent = response.name || response.username;
      document.getElementById('workspace-user-username').textContent = '@' + response.username;
      document.getElementById('workspace-projects-count').textContent = `${response.projects.length} projects found`;
      userInfo.style.display = 'block';
      
      // Enable create button
      const createBtn = document.querySelector('.modal-footer .btn-primary');
      if (createBtn) {
        createBtn.disabled = false;
      }
    } catch (error) {
      result.innerHTML = '<span class="text-error">✗ Validation failed: ' + error.message + '</span>';
      this.workspaceValidationData.isConnected = false;
      userInfo.style.display = 'none';
      
      // Keep create button disabled
      const createBtn = document.querySelector('.modal-footer .btn-primary');
      if (createBtn) {
        createBtn.disabled = true;
      }
    } finally {
      btn.textContent = 'Connect & Validate';
      btn.disabled = false;
    }
  }

  async handleCreateWorkspace() {
    const form = document.getElementById('workspace-form');
    if (!utils.validateForm(form)) return;

    if (!this.workspaceValidationData.isConnected) {
      utils.showToast('Please validate credentials first', 'error');
      return;
    }

    const formData = new FormData(form);
    const workspaceData = {
      name: formData.get('name'),
      project_namespace: formData.get('project_namespace'),
      project_auth_token: formData.get('project_auth_token')
    };

    try {
      await this.createWorkspace(workspaceData);
      
      if (window.app && window.app.modal) {
        window.app.modal.hide();
      }
    } catch (error) {
      // Error already handled in createWorkspace
    }
  }

  showCreateConfigModal() {
    this.configWizardData = {
      step: 1,
      maxSteps: 7,
      config: {
        name: '',
        workspace_id: null,
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
        custom_variables: {}
      },
      validation: {
        isConnected: false,
        userInfo: null,
        projects: [],
        appConfigs: [],
        references: []
      }
    };

    this.showConfigWizardStep();
  }

  showConfigWizardStep() {
    const { step, maxSteps } = this.configWizardData;
    const stepContent = this.getConfigWizardStepContent(step);
    
    if (window.app && window.app.modal) {
      window.app.modal.show(`Create JSphere Config - Step ${step} of ${maxSteps}`, stepContent.html, {
        primaryButton: stepContent.primaryButton,
        secondaryButton: step > 1 ? {
          text: 'Back',
          action: 'window.app.configManager.handleConfigWizardBack()'
        } : {
          text: 'Cancel'
        }
      });
      
      // Set up event listeners after modal is shown
      if (step === 1) {
        this.setupStep1EventListeners();
      }
    }
  }

  getConfigWizardStepContent(step) {
    switch (step) {
      case 1:
        return this.getConfigWizardStep1();
      case 2:
        return this.getConfigWizardStep2();
      case 3:
        return this.getConfigWizardStep3();
      case 4:
        return this.getConfigWizardStep4();
      case 5:
        return this.getConfigWizardStep5();
      case 6:
        return this.getConfigWizardStep6();
      case 7:
        return this.getConfigWizardStep7();
      default:
        return this.getConfigWizardStep1();
    }
  }

  getConfigWizardStep1() {
    const workspaces = this.dataManager.getWorkspaces() || [];
    
    return {
      html: `
        <form id="config-wizard-form">
          <div class="form-group">
            <label class="form-label">Configuration Name *</label>
            <input type="text" class="form-input" name="name" required 
                   value="${this.configWizardData.config.name}"
                   placeholder="my-config">
            <div class="form-help">A unique name for this configuration</div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Credential Source *</label>
            <div class="radio-group">
              <label class="radio-option">
                <input type="radio" name="credential_source" value="workspace" 
                       ${this.configWizardData.config.workspace_id ? 'checked' : ''}>
                <span>Use Workspace Credentials</span>
              </label>
              <label class="radio-option">
                <input type="radio" name="credential_source" value="manual"
                       ${!this.configWizardData.config.workspace_id ? 'checked' : ''}>
                <span>Manual GitHub Credentials</span>
              </label>
            </div>
          </div>

          <div id="workspace-selection" class="form-group" style="display: ${this.configWizardData.config.workspace_id ? 'block' : 'none'}">
            <label class="form-label">Select Workspace *</label>
            <div class="workspace-cards">
              ${workspaces.length > 0 ? workspaces.map(workspace => `
                <div class="workspace-card ${workspace.id === this.configWizardData.config.workspace_id ? 'selected' : ''}" 
                     onclick="window.app.configManager.selectWorkspace('${workspace.id}')">
                  <div class="workspace-card-header">
                    <div class="workspace-avatar">
                      <img src="${workspace.avatar_url || '/assets/icons/logo.svg'}" alt="${workspace.name}" class="workspace-avatar-img">
                    </div>
                    <div class="workspace-info">
                      <div class="workspace-name">${workspace.name}</div>
                      <div class="workspace-namespace">@${workspace.project_namespace}</div>
                    </div>
                    <div class="workspace-check">
                      <span class="check-icon">✓</span>
                    </div>
                  </div>
                  <div class="workspace-card-footer">
                    <span class="workspace-projects">${workspace.project_count || 0} projects</span>
                    <span class="workspace-status">Active</span>
                  </div>
                </div>
              `).join('') : `
                <div class="workspace-empty">
                  <p>No workspaces available</p>
                  <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.configManager.showCreateWorkspaceModal()">
                    Create Workspace
                  </button>
                </div>
              `}
            </div>
            <input type="hidden" name="workspace_id" value="${this.configWizardData.config.workspace_id || ''}">
          </div>
        </form>
        
      `,
      primaryButton: {
        text: 'Next',
        action: 'window.app.configManager.handleConfigWizardNext()'
      }
    };
  }

  getConfigWizardStep2() {
    const { config, validation } = this.configWizardData;
    
    if (config.workspace_id) {
      // Skip credential validation for workspace-based configs
      return this.getConfigWizardStep3();
    }

    return {
      html: `
        <form id="config-wizard-form">
          <div class="form-group">
            <label class="form-label">GitHub Username *</label>
            <input type="text" class="form-input" name="project_namespace" required 
                   value="${config.project_namespace}"
                   placeholder="your-github-username">
            <div class="form-help">Your GitHub username or organization</div>
          </div>
          
          <div class="form-group">
            <label class="form-label">GitHub Token *</label>
            <input type="password" class="form-input" name="project_auth_token" required 
                   value="${config.project_auth_token}"
                   placeholder="ghp_...">
            <div class="form-help">GitHub personal access token with repo access</div>
          </div>
          
          <div class="form-group">
            <button type="button" class="btn btn-secondary" onclick="window.app.configManager.handleValidateGitHubCredentials()" 
                    id="validate-github-btn">
              Validate Credentials
            </button>
            <div id="github-validation-result" class="form-help"></div>
          </div>
          
          <div id="github-user-info" style="display: ${validation.isConnected ? 'block' : 'none'};" class="form-group">
            <div class="user-info-card">
              <img id="github-user-avatar" src="${validation.userInfo?.avatar_url || ''}" alt="" class="user-avatar">
              <div class="user-details">
                <div id="github-user-name" class="user-name">${validation.userInfo?.name || ''}</div>
                <div id="github-user-username" class="user-username">@${validation.userInfo?.username || ''}</div>
              </div>
            </div>
          </div>
        </form>
      `,
      primaryButton: {
        text: 'Next',
        action: 'window.app.configManager.handleConfigWizardNext()',
        disabled: !validation.isConnected
      }
    };
  }

  getConfigWizardStep3() {
    const { validation } = this.configWizardData;
    
    return {
      html: `
        <form id="config-wizard-form">
          <div class="form-group">
            <label class="form-label">GitHub Project *</label>
            <select class="form-select" name="project_name" required onchange="window.app.configManager.handleProjectChange()">
              <option value="">Choose a project...</option>
              ${validation.projects.map(project => 
                `<option value="${project.name}" ${project.name === this.configWizardData.config.project_name ? 'selected' : ''}>
                  ${project.name} ${project.description ? `- ${project.description}` : ''}
                </option>`
              ).join('')}
            </select>
            <div class="form-help">Select the GitHub repository for this configuration</div>
          </div>
          
          ${validation.projects.length === 0 ? `
            <div class="form-group">
              <button type="button" class="btn btn-secondary" onclick="window.app.configManager.loadGitHubProjects()">
                Load Projects
              </button>
            </div>
          ` : ''}
        </form>
      `,
      primaryButton: {
        text: 'Next',
        action: 'window.app.configManager.handleConfigWizardNext()',
        disabled: !this.configWizardData.config.project_name
      }
    };
  }

  getConfigWizardStep4() {
    const { validation } = this.configWizardData;
    
    return {
      html: `
        <form id="config-wizard-form">
          <div class="form-group">
            <label class="form-label">App Configuration File *</label>
            <select class="form-select" name="project_app_config" required onchange="window.app.configManager.handleAppConfigChange()">
              <option value="">Choose an app config...</option>
              ${validation.appConfigs.map(config => 
                `<option value="${config}" ${config === this.configWizardData.config.project_app_config ? 'selected' : ''}>
                  ${config}
                </option>`
              ).join('')}
            </select>
            <div class="form-help">Select the app configuration file to use</div>
          </div>
          
          ${validation.appConfigs.length === 0 ? `
            <div class="form-group">
              <div class="config-empty">
                <p>No app configuration files found in this repository.</p>
                <p>App configs should be named like <code>app.*.json</code> (e.g., <code>app.production.json</code>)</p>
                <button type="button" class="btn btn-secondary" onclick="window.app.configManager.loadAppConfigs()">
                  Retry Loading
                </button>
              </div>
            </div>
          ` : ''}
        </form>
      `,
      primaryButton: {
        text: 'Next',
        action: 'window.app.configManager.handleConfigWizardNext()',
        disabled: !this.configWizardData.config.project_app_config
      }
    };
  }

  getConfigWizardStep5() {
    const { validation } = this.configWizardData;
    
    return {
      html: `
        <form id="config-wizard-form">
          <div class="form-group">
            <label class="form-label">HTTP Port</label>
            <input type="number" class="form-input" name="server_http_port" 
                   value="${this.configWizardData.config.server_http_port}"
                   min="1" max="65535">
            <div class="form-help">Port for HTTP server (default: 80)</div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Debug Port</label>
            <input type="number" class="form-input" name="server_debug_port" 
                   value="${this.configWizardData.config.server_debug_port}"
                   min="1" max="65535">
            <div class="form-help">Port for debug server (default: 9229)</div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Project Reference</label>
            <select class="form-select" name="project_reference">
              <option value="">Use default branch</option>
              ${validation.references.branches?.map(branch => 
                `<option value="${branch}" ${branch === this.configWizardData.config.project_reference ? 'selected' : ''}>
                  ${branch} (branch)
                </option>`
              ).join('') || ''}
              ${validation.references.tags?.map(tag => 
                `<option value="${tag}" ${tag === this.configWizardData.config.project_reference ? 'selected' : ''}>
                  ${tag} (tag)
                </option>`
              ).join('') || ''}
            </select>
            <div class="form-help">Specific branch or tag to use</div>
          </div>
          
          ${validation.references.branches?.length === 0 && validation.references.tags?.length === 0 ? `
            <div class="form-group">
              <button type="button" class="btn btn-secondary" onclick="window.app.configManager.loadReferences()">
                Load Branches & Tags
              </button>
            </div>
          ` : ''}
        </form>
      `,
      primaryButton: {
        text: 'Next',
        action: 'window.app.configManager.handleConfigWizardNext()'
      }
    };
  }

  getConfigWizardStep6() {
    return {
      html: `
        <form id="config-wizard-form">
          <div class="form-group">
            <div class="collapsible-section">
              <button type="button" class="collapsible-header" onclick="window.app.configManager.togglePreviewSettings()">
                <span>Preview Settings (Optional)</span>
                <span class="collapsible-arrow">▼</span>
              </button>
              <div id="preview-settings" class="collapsible-content" style="display: none;">
                <div class="form-group">
                  <label class="form-label">Preview Branch</label>
                  <input type="text" class="form-input" name="project_preview_branch" 
                         value="${this.configWizardData.config.project_preview_branch}"
                         placeholder="preview-branch">
                  <div class="form-help">Branch to use for preview deployments</div>
                </div>
                
                <div class="form-group">
                  <label class="form-label">Preview Server</label>
                  <input type="text" class="form-input" name="project_preview_server" 
                         value="${this.configWizardData.config.project_preview_server}"
                         placeholder="preview.example.com">
                  <div class="form-help">Preview server URL</div>
                </div>
                
                <div class="form-group">
                  <label class="form-label">Preview Server Auth Token</label>
                  <input type="password" class="form-input" name="project_preview_server_auth_token" 
                         value="${this.configWizardData.config.project_preview_server_auth_token}"
                         placeholder="preview-token">
                  <div class="form-help">Authentication token for preview server</div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Custom Variables</label>
            
            <!-- Inline Add Variable Form -->
            <div class="inline-variable-form" style="margin-bottom: 15px; padding: 15px; border: 1px solid #e0e0e0; border-radius: 6px; background: #f9f9f9;">
              <div style="display: grid; grid-template-columns: 1fr 1fr auto auto auto; gap: 10px; align-items: end;">
                <div>
                  <input type="text" id="new-var-name" class="form-input" placeholder="variable_name" 
                         style="margin-bottom: 0;">
                  <div class="form-help" style="margin-top: 4px; font-size: 12px;">Variable name</div>
                </div>
                <div>
                  <input type="text" id="new-var-value" class="form-input" placeholder="variable value" 
                         style="margin-bottom: 0;">
                  <div class="form-help" style="margin-top: 4px; font-size: 12px;">Variable value</div>
                </div>
                <div>
                  <label class="checkbox-option" style="margin-bottom: 0; font-size: 14px;">
                    <input type="checkbox" id="new-var-secure">
                    <span>Secure</span>
                  </label>
                </div>
                <button type="button" class="btn btn-primary btn-sm" onclick="window.app.configManager.addInlineVariable()" 
                        style="margin-bottom: 0;">
                  Add
                </button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.configManager.clearInlineForm()" 
                        style="margin-bottom: 0;">
                  Clear
                </button>
              </div>
            </div>
            
            <!-- Variables List -->
            <div id="custom-variables-list">
              ${this.renderCustomVariablesList()}
            </div>
          </div>
        </form>
      `,
      primaryButton: {
        text: 'Next',
        action: 'window.app.configManager.handleConfigWizardNext()'
      }
    };
  }

  getConfigWizardStep7() {
    const config = this.buildFinalConfig();
    const mainConfig = config.configurations[config.defaultConfiguration.name];
    const customVars = this.configWizardData.config.custom_variables || {};
    
    return {
      html: `
        <div class="config-review">
          <div class="config-summary">
            <h3 class="config-title">
              <span class="config-icon">⚙️</span>
              ${config.defaultConfiguration.name}
            </h3>
            <p class="config-subtitle">JSphere Configuration Summary</p>
          </div>

          <div class="config-sections">
            <!-- Project Information -->
            <div class="config-section">
              <h4 class="section-title">
                <span class="section-icon">📁</span>
                Project Information
              </h4>
              <div class="config-grid">
                <div class="config-item">
                  <span class="config-label">Repository:</span>
                  <span class="config-value">${mainConfig.PROJECT_NAMESPACE}/${mainConfig.PROJECT_NAME}</span>
                </div>
                <div class="config-item">
                  <span class="config-label">App Config:</span>
                  <span class="config-value">${mainConfig.PROJECT_APP_CONFIG}</span>
                </div>
                ${mainConfig.PROJECT_REFERENCE ? `
                  <div class="config-item">
                    <span class="config-label">Reference:</span>
                    <span class="config-value">${mainConfig.PROJECT_REFERENCE}</span>
                  </div>
                ` : ''}
              </div>
            </div>

            <!-- Server Settings -->
            <div class="config-section">
              <h4 class="section-title">
                <span class="section-icon">🖥️</span>
                Server Settings
              </h4>
              <div class="config-grid">
                <div class="config-item">
                  <span class="config-label">HTTP Port:</span>
                  <span class="config-value">${mainConfig.SERVER_HTTP_PORT}</span>
                </div>
                <div class="config-item">
                  <span class="config-label">Debug Port:</span>
                  <span class="config-value">${mainConfig.SERVER_DEBUG_PORT}</span>
                </div>
              </div>
            </div>

            <!-- Preview Settings -->
            ${mainConfig.PROJECT_PREVIEW_BRANCH || mainConfig.PROJECT_PREVIEW_SERVER ? `
              <div class="config-section">
                <h4 class="section-title">
                  <span class="section-icon">👁️</span>
                  Preview Settings
                </h4>
                <div class="config-grid">
                  ${mainConfig.PROJECT_PREVIEW_BRANCH ? `
                    <div class="config-item">
                      <span class="config-label">Preview Branch:</span>
                      <span class="config-value">${mainConfig.PROJECT_PREVIEW_BRANCH}</span>
                    </div>
                  ` : ''}
                  ${mainConfig.PROJECT_PREVIEW_SERVER ? `
                    <div class="config-item">
                      <span class="config-label">Preview Server:</span>
                      <span class="config-value">${mainConfig.PROJECT_PREVIEW_SERVER}</span>
                    </div>
                  ` : ''}
                </div>
              </div>
            ` : ''}

            <!-- Custom Variables -->
            ${Object.keys(customVars).length > 0 ? `
              <div class="config-section">
                <h4 class="section-title">
                  <span class="section-icon">🔧</span>
                  Custom Variables
                  <span class="variable-count">(${Object.keys(customVars).length})</span>
                </h4>
                <div class="variables-grid">
                  ${Object.entries(customVars).map(([key, varData]) => `
                    <div class="variable-item">
                      <div class="variable-header">
                        <span class="variable-name">${key}</span>
                        ${varData.secure ? '<span class="secure-badge">🔒 Secure</span>' : ''}
                      </div>
                      <div class="variable-value">${varData.secure ? '••••••••' : (varData.value.length > 30 ? varData.value.substring(0, 30) + '...' : varData.value)}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>

          <!-- Raw Configuration (Collapsible) -->
          <div class="config-section">
            <button type="button" class="collapsible-header raw-config-toggle" onclick="window.app.configManager.toggleRawConfig()">
              <span class="section-icon">📄</span>
              <span>Raw Configuration</span>
              <span class="collapsible-arrow">▼</span>
            </button>
            <div id="raw-config" class="collapsible-content" style="display: none;">
              <div class="config-preview">
                <pre><code>${JSON.stringify(config, null, 2)}</code></pre>
              </div>
            </div>
          </div>
        </div>
      `,
      primaryButton: {
        text: 'Create Configuration',
        action: 'window.app.configManager.handleCreateConfig()'
      }
    };
  }

  async editConfig(id) {
    utils.showToast('Edit config feature coming soon', 'info');
  }

  async editWorkspace(id) {
    utils.showToast('Edit workspace feature coming soon', 'info');
  }

  // Get configs
  getConfigs() {
    return this.dataManager.getConfigs();
  }

  // Get workspaces
  getWorkspaces() {
    return this.dataManager.getWorkspaces();
  }

  // Get config by ID
  getConfig(configId) {
    return this.dataManager.getConfigs().find(c => c.id === configId);
  }

  // Get workspace by ID
  getWorkspace(workspaceId) {
    return this.dataManager.getWorkspaces().find(w => w.id === workspaceId);
  }

  // Config Wizard Handler Methods
  async handleConfigWizardNext() {
    const form = document.getElementById('config-wizard-form');
    if (form && !utils.validateForm(form)) return;

    // Save current step data
    await this.saveCurrentStepData();

    // Move to next step or handle special cases
    if (this.configWizardData.step === 2 && this.configWizardData.config.workspace_id) {
      // Skip step 2 for workspace-based configs
      this.configWizardData.step = 3;
      await this.loadWorkspaceData();
    } else {
      this.configWizardData.step++;
    }

    // Load data for next step if needed
    await this.loadStepData();

    this.showConfigWizardStep();
  }

  handleConfigWizardBack() {
    if (this.configWizardData.step > 1) {
      this.configWizardData.step--;
      
      // Skip step 2 for workspace-based configs when going back
      if (this.configWizardData.step === 2 && this.configWizardData.config.workspace_id) {
        this.configWizardData.step = 1;
      }
      
      this.showConfigWizardStep();
    }
  }

  async saveCurrentStepData() {
    const form = document.getElementById('config-wizard-form');
    if (!form) return;

    const formData = new FormData(form);
    
    // Save form data to config object
    for (const [key, value] of formData.entries()) {
      if (key === 'credential_source') {
        if (value === 'workspace') {
          // Keep workspace_id, clear manual credentials
          this.configWizardData.config.project_namespace = '';
          this.configWizardData.config.project_auth_token = '';
        } else {
          // Clear workspace_id, keep manual credentials
          this.configWizardData.config.workspace_id = null;
        }
      } else {
        this.configWizardData.config[key] = value;
      }
    }
  }

  async loadStepData() {
    const { step } = this.configWizardData;
    
    switch (step) {
      case 3:
        // Always load projects automatically in step 3
        await this.loadGitHubProjects();
        break;
      case 4:
        if (this.configWizardData.validation.appConfigs.length === 0) {
          await this.loadAppConfigs();
        }
        break;
      case 5:
        if (this.configWizardData.validation.references.length === 0) {
          await this.loadReferences();
        }
        break;
    }
  }

  async loadWorkspaceData() {
    const workspace = this.getWorkspace(this.configWizardData.config.workspace_id);
    if (workspace) {
      this.configWizardData.config.project_namespace = workspace.project_namespace;
      this.configWizardData.config.project_auth_token = workspace.project_auth_token;
      this.configWizardData.validation.isConnected = true;
      
      // Load GitHub projects for this workspace using the workspace-specific endpoint
      try {
        const response = await this.api.get(`/configs/workspace/${workspace.id}/projects`);
        this.configWizardData.validation.projects = response.projects || [];
      } catch (error) {
        console.error('Failed to load workspace projects:', error);
        utils.showToast('Failed to load workspace projects: ' + error.message, 'error');
      }
    }
  }

  async handleValidateGitHubCredentials() {
    const form = document.getElementById('config-wizard-form');
    const formData = new FormData(form);
    const namespace = formData.get('project_namespace');
    const token = formData.get('project_auth_token');
    
    if (!namespace || !token) {
      utils.showToast('Please enter both username and token', 'error');
      return;
    }

    const btn = document.getElementById('validate-github-btn');
    const result = document.getElementById('github-validation-result');
    const userInfo = document.getElementById('github-user-info');
    
    btn.textContent = 'Validating...';
    btn.disabled = true;

    try {
      const response = await this.api.post('/configs/github/validate', {
        namespace: namespace,
        token: token
      });
      
      this.configWizardData.validation.isConnected = true;
      this.configWizardData.validation.userInfo = response;
      
      result.innerHTML = '<span class="text-success">✓ Credentials validated successfully</span>';
      
      // Show user info
      document.getElementById('github-user-avatar').src = response.avatar_url;
      document.getElementById('github-user-name').textContent = response.name || response.username;
      document.getElementById('github-user-username').textContent = '@' + response.username;
      userInfo.style.display = 'block';
      
      // Enable next button
      const nextBtn = document.querySelector('.modal-footer .btn-primary');
      if (nextBtn) {
        nextBtn.disabled = false;
      }
    } catch (error) {
      result.innerHTML = '<span class="text-error">✗ Validation failed: ' + error.message + '</span>';
      this.configWizardData.validation.isConnected = false;
      userInfo.style.display = 'none';
      
      // Keep next button disabled
      const nextBtn = document.querySelector('.modal-footer .btn-primary');
      if (nextBtn) {
        nextBtn.disabled = true;
      }
    } finally {
      btn.textContent = 'Validate Credentials';
      btn.disabled = false;
    }
  }

  async loadGitHubProjects() {
    try {
      const { workspace_id, project_namespace, project_auth_token } = this.configWizardData.config;
      
      let response;
      if (workspace_id) {
        // Use workspace-specific endpoint
        response = await this.api.get(`/configs/workspace/${workspace_id}/projects`);
      } else {
        // Use manual credentials endpoint
        response = await this.api.get(`/configs/github/projects?namespace=${project_namespace}&token=${project_auth_token}`);
      }
      
      this.configWizardData.validation.projects = response.projects || [];
      
      // Refresh the step to show loaded projects
      this.showConfigWizardStep();
    } catch (error) {
      utils.showToast('Failed to load projects: ' + error.message, 'error');
    }
  }

  async loadAppConfigs() {
    try {
      const { workspace_id, project_namespace, project_auth_token, project_name } = this.configWizardData.config;
      
      let response;
      if (workspace_id) {
        // Use workspace-specific endpoint
        response = await this.api.get(`/configs/workspace/${workspace_id}/app-configs?project=${project_name}`);
      } else {
        // Use manual credentials endpoint
        response = await this.api.get(`/configs/github/app-configs?namespace=${project_namespace}&project=${project_name}&token=${project_auth_token}`);
      }
      
      this.configWizardData.validation.appConfigs = response.appConfigs || [];
      
      // Refresh the step to show loaded app configs
      this.showConfigWizardStep();
    } catch (error) {
      utils.showToast('Failed to load app configs: ' + error.message, 'error');
    }
  }

  async loadReferences() {
    try {
      const { workspace_id, project_namespace, project_auth_token, project_name } = this.configWizardData.config;
      
      let response;
      if (workspace_id) {
        // Use workspace-specific endpoint
        response = await this.api.get(`/configs/workspace/${workspace_id}/references?project=${project_name}`);
      } else {
        // Use manual credentials endpoint
        response = await this.api.get(`/configs/github/references?namespace=${project_namespace}&project=${project_name}&token=${project_auth_token}`);
      }
      
      this.configWizardData.validation.references = response;
      
      // Refresh the step to show loaded references
      this.showConfigWizardStep();
    } catch (error) {
      utils.showToast('Failed to load references: ' + error.message, 'error');
    }
  }

  async handleProjectChange() {
    const select = document.querySelector('select[name="project_name"]');
    if (select) {
      this.configWizardData.config.project_name = select.value;
      // Clear app configs when project changes
      this.configWizardData.validation.appConfigs = [];
      this.configWizardData.validation.references = [];
      this.configWizardData.config.project_app_config = '';
      
      // Enable/disable next button based on selection
      const nextBtn = document.querySelector('.modal-footer .btn-primary');
      if (nextBtn) {
        nextBtn.disabled = !select.value;
      }
      
      // Auto-load app configs when project is selected for better UX
      if (select.value) {
        await this.loadAppConfigs();
      }
    }
  }

  handleAppConfigChange() {
    const select = document.querySelector('select[name="project_app_config"]');
    if (select) {
      this.configWizardData.config.project_app_config = select.value;
      
      // Enable/disable next button based on selection
      const nextBtn = document.querySelector('.modal-footer .btn-primary');
      if (nextBtn) {
        nextBtn.disabled = !select.value;
      }
    }
  }

  togglePreviewSettings() {
    const content = document.getElementById('preview-settings');
    const arrow = document.querySelector('.collapsible-arrow');
    
    if (content.style.display === 'none') {
      content.style.display = 'block';
      arrow.textContent = '▲';
    } else {
      content.style.display = 'none';
      arrow.textContent = '▼';
    }
  }

  toggleRawConfig() {
    const content = document.getElementById('raw-config');
    const arrow = document.querySelector('.raw-config-toggle .collapsible-arrow');
    
    if (content.style.display === 'none') {
      content.style.display = 'block';
      arrow.textContent = '▲';
    } else {
      content.style.display = 'none';
      arrow.textContent = '▼';
    }
  }

  renderCustomVariablesList() {
    const variables = this.configWizardData.config.custom_variables || {};
    
    if (Object.keys(variables).length === 0) {
      return '<div class="custom-variables-empty">No custom variables added</div>';
    }

    return Object.entries(variables).map(([key, value]) => `
      <div class="custom-variable-item">
        <div class="variable-info">
          <span class="variable-name">${key}</span>
          <span class="variable-value">${typeof value === 'string' && value.length > 20 ? value.substring(0, 20) + '...' : value}</span>
        </div>
        <div class="variable-actions">
          <button type="button" class="btn btn-sm btn-secondary" onclick="window.app.configManager.editCustomVariable('${key}')">
            Edit
          </button>
          <button type="button" class="btn btn-sm btn-error" onclick="window.app.configManager.deleteCustomVariable('${key}')">
            Delete
          </button>
        </div>
      </div>
    `).join('');
  }

  showAddVariableModal() {
    if (window.app && window.app.modal) {
      // Store current modal content
      const currentModal = document.getElementById('modal-content').innerHTML;
      
      window.app.modal.show('Add Custom Variable', `
        <form id="add-variable-form">
          <div class="form-group">
            <label class="form-label">Variable Name *</label>
            <input type="text" class="form-input" name="variable_name" required 
                   placeholder="VARIABLE_NAME" pattern="[A-Z_][A-Z0-9_]*">
            <div class="form-help">Use uppercase letters, numbers, and underscores only</div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Variable Value *</label>
            <input type="text" class="form-input" name="variable_value" required 
                   placeholder="variable value">
          </div>
          
          <div class="form-group">
            <label class="checkbox-option">
              <input type="checkbox" name="is_secure">
              <span>Secure variable (will be encrypted)</span>
            </label>
          </div>
        </form>
      `, {
        primaryButton: {
          text: 'Add Variable',
          action: 'window.app.configManager.handleAddCustomVariable()'
        },
        secondaryButton: {
          text: 'Cancel',
          action: 'window.app.configManager.returnToConfigWizard()'
        }
      });
    }
  }

  handleAddCustomVariable() {
    const form = document.getElementById('add-variable-form');
    if (!utils.validateForm(form)) return;

    const formData = new FormData(form);
    const name = formData.get('variable_name');
    const value = formData.get('variable_value');
    const isSecure = formData.get('is_secure');

    // Validate variable name
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
      utils.showToast('Variable name must use uppercase letters, numbers, and underscores only', 'error');
      return;
    }

    // Add to custom variables
    this.configWizardData.config.custom_variables[name] = {
      value: value,
      secure: !!isSecure
    };

    // Return to config wizard
    this.returnToConfigWizard();
  }

  editCustomVariable(name) {
    const variable = this.configWizardData.config.custom_variables[name];
    if (!variable) return;

    if (window.app && window.app.modal) {
      window.app.modal.show('Edit Custom Variable', `
        <form id="edit-variable-form">
          <div class="form-group">
            <label class="form-label">Variable Name *</label>
            <input type="text" class="form-input" name="variable_name" required 
                   value="${name}" pattern="[A-Z_][A-Z0-9_]*">
            <div class="form-help">Use uppercase letters, numbers, and underscores only</div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Variable Value *</label>
            <input type="text" class="form-input" name="variable_value" required 
                   value="${variable.value}">
          </div>
          
          <div class="form-group">
            <label class="checkbox-option">
              <input type="checkbox" name="is_secure" ${variable.secure ? 'checked' : ''}>
              <span>Secure variable (will be encrypted)</span>
            </label>
          </div>
        </form>
      `, {
        primaryButton: {
          text: 'Update Variable',
          action: `window.app.configManager.handleUpdateCustomVariable('${name}')`
        },
        secondaryButton: {
          text: 'Cancel',
          action: 'window.app.configManager.returnToConfigWizard()'
        }
      });
    }
  }

  handleUpdateCustomVariable(oldName) {
    const form = document.getElementById('edit-variable-form');
    if (!utils.validateForm(form)) return;

    const formData = new FormData(form);
    const name = formData.get('variable_name');
    const value = formData.get('variable_value');
    const isSecure = formData.get('is_secure');

    // Validate variable name
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
      utils.showToast('Variable name must use uppercase letters, numbers, and underscores only', 'error');
      return;
    }

    // Remove old variable if name changed
    if (oldName !== name) {
      delete this.configWizardData.config.custom_variables[oldName];
    }

    // Update variable
    this.configWizardData.config.custom_variables[name] = {
      value: value,
      secure: !!isSecure
    };

    // Return to config wizard
    this.returnToConfigWizard();
  }

  deleteCustomVariable(name) {
    if (confirm(`Are you sure you want to delete the variable "${name}"?`)) {
      delete this.configWizardData.config.custom_variables[name];
      
      // Refresh the variables list
      const listContainer = document.getElementById('custom-variables-list');
      if (listContainer) {
        listContainer.innerHTML = this.renderCustomVariablesList();
      }
    }
  }

  // New inline variable management methods
  addInlineVariable() {
    const nameInput = document.getElementById('new-var-name');
    const valueInput = document.getElementById('new-var-value');
    const secureCheckbox = document.getElementById('new-var-secure');
    
    const name = nameInput.value.trim();
    const value = valueInput.value.trim();
    const isSecure = secureCheckbox.checked;
    
    if (!name || !value) {
      utils.showToast('Please enter both variable name and value', 'error');
      return;
    }
    
    // More flexible variable name validation - allow letters, numbers, underscores
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      utils.showToast('Variable name must start with a letter or underscore, and contain only letters, numbers, and underscores', 'error');
      return;
    }
    
    // Check if variable already exists
    if (this.configWizardData.config.custom_variables[name]) {
      utils.showToast('Variable with this name already exists', 'error');
      return;
    }
    
    // Add the variable
    this.configWizardData.config.custom_variables[name] = {
      value: value,
      secure: isSecure
    };
    
    // Clear the form
    this.clearInlineForm();
    
    // Refresh the variables list
    const listContainer = document.getElementById('custom-variables-list');
    if (listContainer) {
      listContainer.innerHTML = this.renderCustomVariablesList();
    }
    
    utils.showToast('Variable added successfully', 'success');
  }
  
  clearInlineForm() {
    const nameInput = document.getElementById('new-var-name');
    const valueInput = document.getElementById('new-var-value');
    const secureCheckbox = document.getElementById('new-var-secure');
    
    if (nameInput) nameInput.value = '';
    if (valueInput) valueInput.value = '';
    if (secureCheckbox) secureCheckbox.checked = false;
  }

  returnToConfigWizard() {
    this.showConfigWizardStep();
  }

  buildFinalConfig() {
    const { config } = this.configWizardData;
    
    // Remove the leading period from project name for the final config
    const projectName = config.project_name.startsWith('.') ? 
      config.project_name.substring(1) : config.project_name;
    
    // Build the configuration object in the required format
    const finalConfig = {
      defaultConfiguration: {
        name: config.name,
        disableCaching: true
      },
      configurations: {
        [config.name]: {
          PROJECT_HOST: "GitHub",
          PROJECT_NAMESPACE: config.project_namespace,
          PROJECT_NAME: projectName,
          PROJECT_APP_CONFIG: config.project_app_config,
          PROJECT_REFERENCE: config.project_reference || "",
          SERVER_HTTP_PORT: config.server_http_port || "80",
          SERVER_DEBUG_PORT: config.server_debug_port || "9229",
          PROJECT_PREVIEW_BRANCH: config.project_preview_branch || "",
          PROJECT_PREVIEW_SERVER: config.project_preview_server || "",
          PROJECT_PREVIEW_SERVER_AUTH_TOKEN: config.project_preview_server_auth_token || "",
          ...this.buildCustomVariables()
        }
      }
    };

    return finalConfig;
  }

  buildCustomVariables() {
    const variables = {};
    const customVars = this.configWizardData.config.custom_variables || {};
    
    for (const [name, varData] of Object.entries(customVars)) {
      variables[name] = varData.value;
    }
    
    return variables;
  }

  async handleCreateConfig() {
    try {
      const configData = {
        name: this.configWizardData.config.name,
        workspace_id: this.configWizardData.config.workspace_id,
        project_namespace: this.configWizardData.config.project_namespace,
        project_auth_token: this.configWizardData.config.project_auth_token,
        project_name: this.configWizardData.config.project_name,
        project_app_config: this.configWizardData.config.project_app_config,
        project_reference: this.configWizardData.config.project_reference,
        server_http_port: this.configWizardData.config.server_http_port,
        server_debug_port: this.configWizardData.config.server_debug_port,
        project_preview_branch: this.configWizardData.config.project_preview_branch,
        project_preview_server: this.configWizardData.config.project_preview_server,
        project_preview_server_auth_token: this.configWizardData.config.project_preview_server_auth_token,
        custom_variables: this.configWizardData.config.custom_variables
      };

      await this.createConfig(configData);
      
      // Hide modal
      if (window.app && window.app.modal) {
        window.app.modal.hide();
      }
      
      // Reset wizard data
      this.configWizardData = {};
    } catch (error) {
      // Error already handled in createConfig
    }
  }

  // Event listener setup for step 1
  setupStep1EventListeners() {
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
      const radios = document.querySelectorAll('input[name="credential_source"]');
      const workspaceDiv = document.getElementById('workspace-selection');
      
      if (radios && workspaceDiv) {
        radios.forEach(radio => {
          radio.addEventListener('change', (e) => {
            workspaceDiv.style.display = e.target.value === 'workspace' ? 'block' : 'none';
          });
        });
      }
    }, 100);
  }

  // Workspace selection handler
  selectWorkspace(workspaceId) {
    // Update the selected workspace
    this.configWizardData.config.workspace_id = workspaceId;
    
    // Update hidden input
    const hiddenInput = document.querySelector('input[name="workspace_id"]');
    if (hiddenInput) {
      hiddenInput.value = workspaceId;
    }
    
    // Update visual selection
    const cards = document.querySelectorAll('.workspace-card');
    cards.forEach(card => {
      card.classList.remove('selected');
    });
    
    const selectedCard = document.querySelector(`.workspace-card[onclick*="${workspaceId}"]`);
    if (selectedCard) {
      selectedCard.classList.add('selected');
    }
  }
}
