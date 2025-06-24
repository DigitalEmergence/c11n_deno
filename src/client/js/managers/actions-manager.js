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

  handleConfigSelection(serverId) {
    const selectElement = document.getElementById(`config-select-${serverId}`);
    const previewElement = document.getElementById(`config-preview-${serverId}`);
    const previewJsonElement = document.getElementById(`config-preview-json-${serverId}`);
    const loadButton = document.getElementById(`load-config-btn-${serverId}`);
    
    if (!selectElement || !previewElement || !previewJsonElement || !loadButton) return;
    
    const configId = selectElement.value;
    
    if (configId) {
      const config = this.dataManager.getConfigs().find(c => c.id === configId);
      if (config) {
        // Build the JSphere config JSON
        const jsphereConfig = this.buildJSphereConfig(config);
        
        // Show preview
        previewJsonElement.textContent = JSON.stringify(jsphereConfig, null, 2);
        previewElement.classList.remove('hidden');
        loadButton.disabled = false;
      }
    } else {
      previewElement.classList.add('hidden');
      loadButton.disabled = true;
    }
  }

  buildJSphereConfig(config) {
    // Build the JSphere configuration format similar to config manager
    const jsphereConfig = {
      defaultConfiguration: {
        name: config.name,
        disableCaching: true
      },
      configurations: {
        [config.name]: {
          PROJECT_HOST: "GitHub",
          PROJECT_NAMESPACE: config.project_namespace,
          PROJECT_NAME: config.project_name,
          PROJECT_APP_CONFIG: config.project_app_config,
          PROJECT_REFERENCE: config.project_reference || "",
          SERVER_HTTP_PORT: config.server_http_port || "80",
          SERVER_DEBUG_PORT: config.server_debug_port || "9229",
          PROJECT_PREVIEW_BRANCH: config.project_preview_branch || "",
          PROJECT_PREVIEW_SERVER: config.project_preview_server || "",
          PROJECT_PREVIEW_SERVER_AUTH_TOKEN: config.project_preview_server_auth_token || ""
        }
      }
    };

    // Add custom variables if they exist
    if (config.custom_variables) {
      for (const [name, varData] of Object.entries(config.custom_variables)) {
        jsphereConfig.configurations[config.name][name] = varData.value;
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

    const config = this.dataManager.getConfigs().find(c => c.id === configId);
    if (!config) {
      utils.showToast('Configuration not found', 'error');
      return;
    }

    loadButton.disabled = true;
    loadButton.textContent = 'Loading...';

    try {
      const jsphereConfig = this.buildJSphereConfig(config);
      await this.sendJSphereCommand(serverId, 'loadconfig', jsphereConfig);
      
      utils.showToast('Configuration loaded successfully', 'success');
      
      // Refresh server data to show the loaded config
      await this.dataManager.loadLocalServers();
      await this.dataManager.loadDeployments();
      
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
    // Find the server (local or deployment)
    const localServer = this.dataManager.getLocalServers().find(s => s.id === serverId);
    const deployment = this.dataManager.getDeployments().find(d => d.id === serverId);
    
    if (!localServer && !deployment) {
      throw new Error('Server not found');
    }

    const isDeployment = !!deployment;
    const serverUrl = isDeployment ? deployment.cloud_run_url : localServer.url;
    
    if (!serverUrl) {
      throw new Error('Server URL not available');
    }

    // Build the command URL
    const commandUrl = `${serverUrl}/@cmd/${command}`;
    
    // Prepare headers
    const headers = {
      'Content-Type': 'application/json'
    };

    // Add auth token for deployments
    if (isDeployment) {
      // For deployments, we need the SERVER_AUTH_TOKEN
      // This should be available from the deployment configuration
      const authToken = deployment.server_auth_token || process.env.SERVER_AUTH_TOKEN;
      if (authToken) {
        headers['Authorization'] = `token ${authToken}`;
      }
    }

    // Prepare request options
    const requestOptions = {
      method: data ? 'POST' : 'GET',
      headers
    };

    if (data) {
      requestOptions.body = JSON.stringify(data);
    }

    // Send the command
    const response = await fetch(commandUrl, requestOptions);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
  }
}
