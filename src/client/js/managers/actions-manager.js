import { utils } from '../utils.js';

export class ActionsManager {
  constructor(api, dataManager) {
    this.api = api;
    this.dataManager = dataManager;
  }

  // Actions Tab Methods
  toggleActionDetails(actionId) {
    const detailsElement = document.getElementById(actionId);
    const headerElement = detailsElement?.previousElementSibling;
    const arrowElement = headerElement?.querySelector('.toggle-arrow');
    
    if (detailsElement) {
      detailsElement.classList.toggle('hidden');
      
      // Rotate arrow
      if (arrowElement) {
        if (detailsElement.classList.contains('hidden')) {
          arrowElement.style.transform = 'rotate(0deg)';
        } else {
          arrowElement.style.transform = 'rotate(180deg)';
        }
      }
      
      // Load configs when opening load config action
      if (actionId.startsWith('loadconfig-') && !detailsElement.classList.contains('hidden')) {
        const serverId = actionId.replace('loadconfig-', '');
        this.loadConfigsForAction(serverId);
      }
    }
  }

  async loadConfigsForAction(serverId) {
    const selectElement = document.getElementById(`config-select-${serverId}`);
    if (!selectElement) return;

    try {
      const configs = this.dataManager.getConfigs();
      
      // Clear existing options except the first one
      selectElement.innerHTML = '<option value="">Choose a configuration...</option>';
      
      // Add config options
      configs.forEach(config => {
        const option = document.createElement('option');
        option.value = config.id;
        option.textContent = `${config.name} - ${config.project_namespace}/${config.project_name}`;
        selectElement.appendChild(option);
      });
      
      // Set up change handler
      selectElement.onchange = () => this.handleConfigSelection(serverId);
      
    } catch (error) {
      console.error('Failed to load configs:', error);
      utils.showToast('Failed to load configurations', 'error');
    }
  }

  async handleConfigSelection(serverId) {
    const selectElement = document.getElementById(`config-select-${serverId}`);
    const previewElement = document.getElementById(`config-preview-${serverId}`);
    const previewJsonElement = document.getElementById(`config-preview-json-${serverId}`);
    const loadButton = document.getElementById(`load-config-btn-${serverId}`);
    
    if (!selectElement || !previewElement || !previewJsonElement || !loadButton) return;
    
    const configId = selectElement.value;
    
    if (configId) {
      try {
        // Fetch config with decrypted tokens for JSphere use
        console.log(`Fetching JSphere config for ID: ${configId}`);
        const response = await this.api.get(`/configs/${configId}/jsphere`);
        const config = response.config;
        
        console.log('Received config from JSphere endpoint:', config);
        console.log('Config project_auth_token:', config.project_auth_token ? '[PRESENT]' : '[MISSING]');
        
        // Build the JSphere config JSON
        const jsphereConfig = this.buildJSphereConfig(config);
        
        console.log('Built JSphere config:', jsphereConfig);
        
        // Show preview
        previewJsonElement.textContent = JSON.stringify(jsphereConfig, null, 2);
        previewElement.classList.remove('hidden');
        loadButton.disabled = false;
      } catch (error) {
        console.error('Failed to fetch config for JSphere:', error);
        previewJsonElement.textContent = 'Error loading configuration';
        previewElement.classList.remove('hidden');
        loadButton.disabled = true;
      }
    } else {
      previewElement.classList.add('hidden');
      loadButton.disabled = true;
    }
  }

  buildJSphereConfig(config) {
    // Clean project name - remove leading period if present
    const cleanProjectName = config.project_name && config.project_name.startsWith('.') ? 
      config.project_name.substring(1) : config.project_name;

    // Build the JSphere configuration in the new flat format
    const jsphereConfig = {
      PROJECT_CONFIG_NAME: config.name,
      PROJECT_HOST: "GitHub",
      PROJECT_NAMESPACE: config.project_namespace,
      PROJECT_NAME: cleanProjectName,
      PROJECT_AUTH_TOKEN: config.project_auth_token || "",
      PROJECT_APP_CONFIG: config.project_app_config,
      PROJECT_REFERENCE: config.project_reference || "",
      SERVER_HTTP_PORT: config.server_http_port || "80",
      SERVER_DEBUG_PORT: config.server_debug_port || "9229",
      PROJECT_PREVIEW_BRANCH: config.project_preview_branch || "",
      PROJECT_PREVIEW_SERVER: config.project_preview_server || "",
      PROJECT_PREVIEW_SERVER_AUTH_TOKEN: config.project_preview_server_auth_token || ""
    };

    // Add custom variables if they exist
    if (config.custom_variables) {
      for (const [name, value] of Object.entries(config.custom_variables)) {
        jsphereConfig[name] = value;
      }
    }

    return jsphereConfig;
  }

  async refreshConfigs(serverId) {
    await this.dataManager.loadConfigs();
    await this.loadConfigsForAction(serverId);
    utils.showToast('Configurations refreshed', 'success');
  }

  async executeLoadConfig(serverId) {
    const selectElement = document.getElementById(`config-select-${serverId}`);
    const loadButton = document.getElementById(`load-config-btn-${serverId}`);
    
    if (!selectElement || !loadButton) return;
    
    const configId = selectElement.value;
    if (!configId) {
      utils.showToast('Please select a configuration', 'error');
      return;
    }

    loadButton.disabled = true;
    loadButton.textContent = 'Loading...';

    try {
      // Fetch config with decrypted tokens for JSphere use
      console.log(`Loading config for execution, ID: ${configId}`);
      const response = await this.api.get(`/configs/${configId}/jsphere`);
      const config = response.config;
      
      console.log('Config for execution:', config);
      console.log('Config project_auth_token for execution:', config.project_auth_token ? '[PRESENT]' : '[MISSING]');
      
      const jsphereConfig = this.buildJSphereConfig(config);
      
      console.log('=== FINAL JSPHERE CONFIG BEING SENT TO SERVER ===');
      console.log(JSON.stringify(jsphereConfig, null, 2));
      console.log('=== END JSPHERE CONFIG ===');
      
      await this.sendJSphereCommand(serverId, 'loadconfig', jsphereConfig);
      
      utils.showToast('Configuration loaded successfully', 'success');
      
      // Refresh server data to show the loaded config
      await this.dataManager.loadData();
      
    } catch (error) {
      console.error('Failed to load configuration:', error);
      utils.showToast('Failed to load configuration: ' + error.message, 'error');
    } finally {
      loadButton.disabled = false;
      loadButton.textContent = 'Load Configuration';
    }
  }

  async executeCheckout(serverId) {
    const packageInput = document.getElementById(`checkout-package-${serverId}`);
    if (!packageInput) return;

    const packageName = packageInput.value.trim();
    if (!packageName) {
      utils.showToast('Please enter a package name', 'error');
      return;
    }

    try {
      await this.sendJSphereCommand(serverId, 'checkout', { package: packageName });
      utils.showToast(`Package "${packageName}" checked out successfully`, 'success');
      packageInput.value = '';
    } catch (error) {
      console.error('Failed to checkout package:', error);
      utils.showToast('Failed to checkout package: ' + error.message, 'error');
    }
  }

  async executeCreatePackage(serverId) {
    const nameInput = document.getElementById(`createpackage-name-${serverId}`);
    const accountInput = document.getElementById(`createpackage-account-${serverId}`);
    
    if (!nameInput || !accountInput) return;

    const packageName = nameInput.value.trim();
    const githubAccount = accountInput.value.trim();
    
    if (!packageName || !githubAccount) {
      utils.showToast('Please enter both package name and GitHub account', 'error');
      return;
    }

    try {
      await this.sendJSphereCommand(serverId, 'createpackage', {
        name: packageName,
        account: githubAccount
      });
      utils.showToast(`Package "${packageName}" created successfully`, 'success');
      nameInput.value = '';
      accountInput.value = '';
    } catch (error) {
      console.error('Failed to create package:', error);
      utils.showToast('Failed to create package: ' + error.message, 'error');
    }
  }

  async executeCreateProject(serverId) {
    const nameInput = document.getElementById(`createproject-name-${serverId}`);
    const accountInput = document.getElementById(`createproject-account-${serverId}`);
    
    if (!nameInput || !accountInput) return;

    const projectName = nameInput.value.trim();
    const githubAccount = accountInput.value.trim();
    
    if (!projectName || !githubAccount) {
      utils.showToast('Please enter both project name and GitHub account', 'error');
      return;
    }

    try {
      await this.sendJSphereCommand(serverId, 'createproject', {
        name: projectName,
        account: githubAccount
      });
      utils.showToast(`Project "${projectName}" created successfully`, 'success');
      nameInput.value = '';
      accountInput.value = '';
    } catch (error) {
      console.error('Failed to create project:', error);
      utils.showToast('Failed to create project: ' + error.message, 'error');
    }
  }

  async executePreview(serverId) {
    try {
      await this.sendJSphereCommand(serverId, 'preview');
      utils.showToast('Preview triggered successfully', 'success');
    } catch (error) {
      console.error('Failed to trigger preview:', error);
      utils.showToast('Failed to trigger preview: ' + error.message, 'error');
    }
  }

  async sendJSphereCommand(serverId, command, data = null) {
    // Use the local proxy endpoint to avoid CORS issues
    const requestPayload = {
      serverId,
      command,
      data
    };

    console.log(`Sending JSphere command via proxy: ${command} for server: ${serverId}`);
    console.log('Request payload:', requestPayload);

    try {
      const response = await this.api.post('/jsphere-commands', requestPayload);
      console.log(`JSphere command successful: ${command}`);
      return response;
    } catch (error) {
      console.error(`JSphere command failed: ${command}`, error);
      throw error;
    }
  }
}
