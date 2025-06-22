import { utils } from '../utils.js';

export class ServiceProfileManager {
  constructor(api, dataManager) {
    this.api = api;
    this.dataManager = dataManager;
    this.serviceProfiles = [];
    this.serviceProfileWizardData = {};
  }

  // Service Profile Management
  async loadServiceProfiles() {
    try {
      const response = await this.api.get('/service-profiles');
      this.serviceProfiles = response.serviceProfiles || [];
      return this.serviceProfiles;
    } catch (error) {
      console.error('Failed to load service profiles:', error);
      this.serviceProfiles = [];
      return [];
    }
  }

  async createServiceProfile(profileData) {
    try {
      const response = await this.api.post('/service-profiles', profileData);
      this.serviceProfiles.push(response.serviceProfile);
      utils.showToast('Service profile created successfully!', 'success');
      return response.serviceProfile;
    } catch (error) {
      utils.showToast('Failed to create service profile: ' + error.message, 'error');
      throw error;
    }
  }

  async updateServiceProfile(id, profileData) {
    try {
      const response = await this.api.put(`/service-profiles/${id}`, profileData);
      const index = this.serviceProfiles.findIndex(p => p.id === id);
      if (index !== -1) {
        this.serviceProfiles[index] = response.serviceProfile;
      }
      utils.showToast('Service profile updated successfully!', 'success');
      return response.serviceProfile;
    } catch (error) {
      utils.showToast('Failed to update service profile: ' + error.message, 'error');
      throw error;
    }
  }

  async deleteServiceProfile(id) {
    try {
      // Check dependencies first
      const response = await this.api.get(`/service-profiles/${id}/dependencies`);
      
      if (!response.canDelete) {
        const dependentDeployments = response.dependencies.map(d => d.name).join(', ');
        utils.showToast(`Cannot delete: Used by deployments: ${dependentDeployments}`, 'error');
        return false;
      }
      
      if (!confirm('Are you sure you want to delete this service profile?')) return false;

      await this.api.delete(`/service-profiles/${id}`);
      this.serviceProfiles = this.serviceProfiles.filter(p => p.id !== id);
      utils.showToast('Service profile deleted successfully', 'success');
      return true;
    } catch (error) {
      utils.showToast('Failed to delete service profile: ' + error.message, 'error');
      throw error;
    }
  }

  async duplicateServiceProfile(id) {
    try {
      await this.api.post(`/service-profiles/${id}/duplicate`);
      utils.showToast('Service profile duplicated successfully', 'success');
      await this.loadServiceProfiles();
      return true;
    } catch (error) {
      utils.showToast('Failed to duplicate service profile: ' + error.message, 'error');
      throw error;
    }
  }

  // Modal Methods
  showManageServiceProfilesModal(modal) {
    modal.show('Manage Service Profiles', `
      <div class="service-profile-list">
        ${this.serviceProfiles && this.serviceProfiles.length > 0 ? this.serviceProfiles.map(profile => `
          <div class="service-profile-item">
            <div class="service-profile-info">
              <div class="service-profile-name">${profile.name}</div>
              <div class="service-profile-description">${profile.container_image_url}</div>
              <div class="service-profile-details">
                <span class="profile-detail">Memory: ${profile.memory || '512Mi'}</span>
                <span class="profile-detail">CPU: ${profile.cpu || '1'}</span>
                <span class="profile-detail">Region: ${profile.region || 'us-central1'}</span>
              </div>
            </div>
            <div class="service-profile-actions">
              <button class="btn btn-sm btn-secondary" onclick="window.app.serviceProfileManager.editServiceProfile('${profile.id}')">
                Edit
              </button>
              <button class="btn btn-sm btn-secondary" onclick="window.app.serviceProfileManager.duplicateServiceProfile('${profile.id}')">
                Duplicate
              </button>
              <button class="btn btn-sm btn-error" onclick="window.app.serviceProfileManager.deleteServiceProfile('${profile.id}')">
                Delete
              </button>
            </div>
          </div>
        `).join('') : '<p class="text-gray-500">No service profiles created yet.</p>'}
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="window.app.serviceProfileManager.showCreateServiceProfileModal()">
          Create New Service Profile
        </button>
      </div>
    `);
  }

  showCreateServiceProfileModal() {
    this.serviceProfileWizardData = {
      step: 1,
      name: '',
      container_image_url: '',
      container_port: '80',
      memory: '512Mi',
      cpu: '1',
      max_instances: '100',
      timeout: '300',
      concurrency: '80',
      execution_environment: 'gen2',
      cpu_boost: true,
      region: 'us-central1',
      server_auth_token: '',
      environment_variables: {},
      dockerImages: [],
      isEditMode: false,
      editingId: null
    };
    
    this.showServiceProfileWizardStep(1);
  }

  async editServiceProfile(id) {
    try {
      // Load the existing profile data
      const response = await this.api.get(`/service-profiles/${id}`);
      const profile = response.serviceProfile;
      
      // Initialize wizard data with existing profile data
      this.serviceProfileWizardData = {
        step: 1,
        name: profile.name,
        container_image_url: profile.container_image_url,
        container_port: profile.container_port || '80',
        memory: profile.memory || '512Mi',
        cpu: profile.cpu || '1',
        max_instances: profile.max_instances || '100',
        timeout: profile.timeout || '300',
        concurrency: profile.concurrency || '80',
        execution_environment: profile.execution_environment || 'gen2',
        cpu_boost: profile.cpu_boost !== undefined ? profile.cpu_boost : true,
        region: profile.region || 'us-central1',
        server_auth_token: '', // Don't pre-fill for security
        environment_variables: this.parseEnvironmentVariables(profile.environment_variables),
        dockerImages: [],
        isEditMode: true,
        editingId: id
      };
      
      this.showServiceProfileWizardStep(1);
    } catch (error) {
      utils.showToast('Failed to load service profile: ' + error.message, 'error');
    }
  }

  // Service Profile Wizard Methods
  showServiceProfileWizardStep(step) {
    this.serviceProfileWizardData.step = step;
    
    switch (step) {
      case 1:
        this.showServiceProfileStep1();
        break;
      case 2:
        this.showServiceProfileStep2();
        break;
      case 3:
        this.showServiceProfileStep3();
        break;
      case 4:
        this.showServiceProfileStep4();
        break;
      case 5:
        this.showServiceProfileStep5();
        break;
    }
  }

  showServiceProfileStep1() {
    const title = this.serviceProfileWizardData.isEditMode ? 'Edit Service Profile - Step 1/5' : 'Create Service Profile - Step 1/5';
    
    if (window.app && window.app.modal) {
      window.app.modal.show(title, `
        <div class="wizard-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: 20%"></div>
          </div>
          <div class="step-indicator">Step 1 of 5: Basic Information</div>
        </div>
        
        <form id="service-profile-step1-form">
          <div class="form-group">
            <label class="form-label">Service Profile Name *</label>
            <input type="text" class="form-input" name="name" required 
                   value="${this.serviceProfileWizardData.name}"
                   placeholder="my-service-profile">
            <div class="form-help">A unique name for this service profile</div>
          </div>
        </form>
      `, {
        primaryButton: {
          text: 'Next',
          action: 'window.app.serviceProfileManager.serviceProfileWizardNext()'
        },
        secondaryButton: {
          text: 'Cancel'
        }
      });
    }
  }

  async showServiceProfileStep2() {
    // Load Docker images if not already loaded
    if (this.serviceProfileWizardData.dockerImages.length === 0) {
      try {
        const response = await this.api.get('/service-profiles/docker-images');
        this.serviceProfileWizardData.dockerImages = response.images || [];
      } catch (error) {
        console.error('Failed to load Docker images:', error);
      }
    }

    const title = this.serviceProfileWizardData.isEditMode ? 'Edit Service Profile - Step 2/5' : 'Create Service Profile - Step 2/5';
    const dockerImageOptions = this.serviceProfileWizardData.dockerImages.map(image => 
      `<option value="${image.full_name}" ${this.serviceProfileWizardData.container_image_url === image.full_name ? 'selected' : ''}>
        ${image.name} (${image.full_name})
      </option>`
    ).join('');

    if (window.app && window.app.modal) {
      window.app.modal.show(title, `
        <div class="wizard-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: 40%"></div>
          </div>
          <div class="step-indicator">Step 2 of 5: Container Configuration</div>
        </div>
        
        <form id="service-profile-step2-form">
          <div class="form-group">
            <label class="form-label">Container Image *</label>
            <select class="form-select" name="image_selection" onchange="window.app.serviceProfileManager.onImageSelectionChange()">
              <option value="">Choose an option...</option>
              <optgroup label="JSphere Images">
                ${dockerImageOptions}
              </optgroup>
              <option value="custom" ${!this.serviceProfileWizardData.dockerImages.some(img => img.full_name === this.serviceProfileWizardData.container_image_url) && this.serviceProfileWizardData.container_image_url ? 'selected' : ''}>
                Custom Image URL
              </option>
            </select>
          </div>
          
          <div id="custom-image-input" style="display: ${!this.serviceProfileWizardData.dockerImages.some(img => img.full_name === this.serviceProfileWizardData.container_image_url) && this.serviceProfileWizardData.container_image_url ? 'block' : 'none'};">
            <div class="form-group">
              <label class="form-label">Custom Image URL *</label>
              <input type="text" class="form-input" name="container_image_url" 
                     value="${this.serviceProfileWizardData.container_image_url}"
                     placeholder="gcr.io/project/image:tag">
              <div class="form-help">Enter a custom Docker image URL</div>
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Container Port</label>
            <input type="number" class="form-input" name="container_port" 
                   value="${this.serviceProfileWizardData.container_port}" 
                   min="1" max="65535">
            <div class="form-help">Port that your application listens on (default: 80)</div>
          </div>
        </form>
      `, {
        primaryButton: {
          text: 'Next',
          action: 'window.app.serviceProfileManager.serviceProfileWizardNext()'
        },
        secondaryButton: {
          text: 'Back',
          action: 'window.app.serviceProfileManager.serviceProfileWizardBack()'
        }
      });
    }
  }

  showServiceProfileStep3() {
    const title = this.serviceProfileWizardData.isEditMode ? 'Edit Service Profile - Step 3/5' : 'Create Service Profile - Step 3/5';
    
    if (window.app && window.app.modal) {
      window.app.modal.show(title, `
        <div class="wizard-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: 60%"></div>
          </div>
          <div class="step-indicator">Step 3 of 5: Resource Configuration</div>
        </div>
        
        <form id="service-profile-step3-form">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Memory</label>
              <select class="form-select" name="memory">
                <option value="512Mi" ${this.serviceProfileWizardData.memory === '512Mi' ? 'selected' : ''}>512 MiB</option>
                <option value="1GiB" ${this.serviceProfileWizardData.memory === '1GiB' ? 'selected' : ''}>1 GiB</option>
                <option value="2GiB" ${this.serviceProfileWizardData.memory === '2GiB' ? 'selected' : ''}>2 GiB</option>
                <option value="4GiB" ${this.serviceProfileWizardData.memory === '4GiB' ? 'selected' : ''}>4 GiB</option>
                <option value="8GiB" ${this.serviceProfileWizardData.memory === '8GiB' ? 'selected' : ''}>8 GiB</option>
                <option value="16GiB" ${this.serviceProfileWizardData.memory === '16GiB' ? 'selected' : ''}>16 GiB</option>
                <option value="32GiB" ${this.serviceProfileWizardData.memory === '32GiB' ? 'selected' : ''}>32 GiB</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">CPU</label>
              <select class="form-select" name="cpu">
                <option value="1" ${this.serviceProfileWizardData.cpu === '1' ? 'selected' : ''}>1 vCPU</option>
                <option value="2" ${this.serviceProfileWizardData.cpu === '2' ? 'selected' : ''}>2 vCPU</option>
                <option value="4" ${this.serviceProfileWizardData.cpu === '4' ? 'selected' : ''}>4 vCPU</option>
                <option value="6" ${this.serviceProfileWizardData.cpu === '6' ? 'selected' : ''}>6 vCPU</option>
                <option value="8" ${this.serviceProfileWizardData.cpu === '8' ? 'selected' : ''}>8 vCPU</option>
              </select>
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Max Instances</label>
            <input type="number" class="form-input" name="max_instances" 
                   value="${this.serviceProfileWizardData.max_instances}" 
                   min="1" max="1000">
            <div class="form-help">Maximum number of instances (default: 100)</div>
          </div>
        </form>
      `, {
        primaryButton: {
          text: 'Next',
          action: 'window.app.serviceProfileManager.serviceProfileWizardNext()'
        },
        secondaryButton: {
          text: 'Back',
          action: 'window.app.serviceProfileManager.serviceProfileWizardBack()'
        }
      });
    }
  }

  showServiceProfileStep4() {
    const title = this.serviceProfileWizardData.isEditMode ? 'Edit Service Profile - Step 4/5' : 'Create Service Profile - Step 4/5';
    const regions = [
      'us-central1', 'us-east1', 'us-west1', 'europe-west1', 'asia-east1',
      'asia-east2', 'asia-northeast1', 'asia-southeast1', 'australia-southeast1',
      'southamerica-west1', 'europe-north1'
    ];
    
    if (window.app && window.app.modal) {
      window.app.modal.show(title, `
        <div class="wizard-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: 80%"></div>
          </div>
          <div class="step-indicator">Step 4 of 5: Runtime Settings</div>
        </div>
        
        <form id="service-profile-step4-form">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Timeout (seconds)</label>
              <input type="number" class="form-input" name="timeout" 
                     value="${this.serviceProfileWizardData.timeout}" 
                     min="1" max="3600">
            </div>
            <div class="form-group">
              <label class="form-label">Concurrency</label>
              <input type="number" class="form-input" name="concurrency" 
                     value="${this.serviceProfileWizardData.concurrency}" 
                     min="1" max="1000">
            </div>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Execution Environment</label>
              <select class="form-select" name="execution_environment">
                <option value="gen2" ${this.serviceProfileWizardData.execution_environment === 'gen2' ? 'selected' : ''}>Generation 2</option>
                <option value="gen1" ${this.serviceProfileWizardData.execution_environment === 'gen1' ? 'selected' : ''}>Generation 1</option>
                <option value="default" ${this.serviceProfileWizardData.execution_environment === 'default' ? 'selected' : ''}>Default</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Region</label>
              <select class="form-select" name="region">
                ${regions.map(region => 
                  `<option value="${region}" ${this.serviceProfileWizardData.region === region ? 'selected' : ''}>${region}</option>`
                ).join('')}
              </select>
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label">
              <input type="checkbox" name="cpu_boost" ${this.serviceProfileWizardData.cpu_boost ? 'checked' : ''}>
              Enable CPU Boost
            </label>
            <div class="form-help">Allocate additional CPU during startup (recommended)</div>
          </div>
        </form>
      `, {
        primaryButton: {
          text: 'Next',
          action: 'window.app.serviceProfileManager.serviceProfileWizardNext()'
        },
        secondaryButton: {
          text: 'Back',
          action: 'window.app.serviceProfileManager.serviceProfileWizardBack()'
        }
      });
    }
  }

  showServiceProfileStep5() {
    const title = this.serviceProfileWizardData.isEditMode ? 'Edit Service Profile - Step 5/5' : 'Create Service Profile - Step 5/5';
    const envVarsHtml = Object.entries(this.serviceProfileWizardData.environment_variables).map(([key, value]) => `
      <div class="env-var-row">
        <input type="text" class="form-input" value="${key}" placeholder="Variable Name" 
               onchange="window.app.serviceProfileManager.updateServiceProfileEnvVar(this, '${key}', 'key')">
        <input type="text" class="form-input" value="${value}" placeholder="Variable Value" 
               onchange="window.app.serviceProfileManager.updateServiceProfileEnvVar(this, '${key}', 'value')">
        <button type="button" class="btn btn-sm btn-error" onclick="window.app.serviceProfileManager.removeServiceProfileEnvVar('${key}')">Remove</button>
      </div>
    `).join('');

    if (window.app && window.app.modal) {
      window.app.modal.show(title, `
        <div class="wizard-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: 100%"></div>
          </div>
          <div class="step-indicator">Step 5 of 5: Environment Variables</div>
        </div>
        
        <form id="service-profile-step5-form">
          <div class="form-group">
            <label class="form-label">Server Auth Token *</label>
            <input type="password" class="form-input" name="server_auth_token" required
                   value="${this.serviceProfileWizardData.server_auth_token}"
                   placeholder="Enter authentication token">
            <div class="form-help">Authentication token for the JSphere server</div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Custom Environment Variables</label>
            <div id="env-vars-container">
              ${envVarsHtml}
            </div>
            <button type="button" class="btn btn-sm btn-secondary" onclick="window.app.serviceProfileManager.addServiceProfileEnvVar()">
              Add Environment Variable
            </button>
            <div class="form-help">Additional environment variables for your application</div>
          </div>
          
          <div class="config-section">
            <h4>Service Profile Summary</h4>
            <div class="config-summary">
              <div class="summary-item"><strong>Name:</strong> ${this.serviceProfileWizardData.name}</div>
              <div class="summary-item"><strong>Image:</strong> ${this.serviceProfileWizardData.container_image_url}</div>
              <div class="summary-item"><strong>Port:</strong> ${this.serviceProfileWizardData.container_port}</div>
              <div class="summary-item"><strong>Memory:</strong> ${this.serviceProfileWizardData.memory}</div>
              <div class="summary-item"><strong>CPU:</strong> ${this.serviceProfileWizardData.cpu}</div>
              <div class="summary-item"><strong>Region:</strong> ${this.serviceProfileWizardData.region}</div>
            </div>
          </div>
        </form>
      `, {
        primaryButton: {
          text: this.serviceProfileWizardData.isEditMode ? 'Update Profile' : 'Create Profile',
          action: 'window.app.serviceProfileManager.saveServiceProfile()'
        },
        secondaryButton: {
          text: 'Back',
          action: 'window.app.serviceProfileManager.serviceProfileWizardBack()'
        }
      });
    }
  }

  // Service Profile Wizard Navigation
  serviceProfileWizardNext() {
    const currentStep = this.serviceProfileWizardData.step;
    const form = document.getElementById(`service-profile-step${currentStep}-form`);
    
    if (form && !utils.validateForm(form)) return;
    
    // Save current step data
    this.saveServiceProfileStepData();
    
    // Move to next step
    this.showServiceProfileWizardStep(currentStep + 1);
  }

  serviceProfileWizardBack() {
    const currentStep = this.serviceProfileWizardData.step;
    this.saveServiceProfileStepData();
    this.showServiceProfileWizardStep(currentStep - 1);
  }

  saveServiceProfileStepData() {
    const step = this.serviceProfileWizardData.step;
    const form = document.getElementById(`service-profile-step${step}-form`);
    
    if (!form) return;
    
    const formData = new FormData(form);
    for (const [key, value] of formData.entries()) {
      if (key === 'cpu_boost') {
        this.serviceProfileWizardData[key] = form.querySelector(`input[name="${key}"]`).checked;
      } else {
        this.serviceProfileWizardData[key] = value;
      }
    }
    
    // Special handling for step 2 - container image URL
    if (step === 2) {
      const imageSelection = form.querySelector('select[name="image_selection"]');
      const customImageInput = form.querySelector('input[name="container_image_url"]');
      
      if (imageSelection && imageSelection.value === 'custom' && customImageInput) {
        this.serviceProfileWizardData.container_image_url = customImageInput.value;
      } else if (imageSelection && imageSelection.value && imageSelection.value !== 'custom') {
        this.serviceProfileWizardData.container_image_url = imageSelection.value;
      }
    }
  }

  // Environment Variables Management
  addServiceProfileEnvVar() {
    const key = `ENV_VAR_${Date.now()}`;
    this.serviceProfileWizardData.environment_variables[key] = '';
    this.refreshServiceProfileEnvVars();
  }

  removeServiceProfileEnvVar(key) {
    delete this.serviceProfileWizardData.environment_variables[key];
    this.refreshServiceProfileEnvVars();
  }

  updateServiceProfileEnvVar(input, oldKey, type) {
    const value = input.value;
    
    if (type === 'key') {
      const oldValue = this.serviceProfileWizardData.environment_variables[oldKey];
      delete this.serviceProfileWizardData.environment_variables[oldKey];
      this.serviceProfileWizardData.environment_variables[value] = oldValue;
    } else {
      this.serviceProfileWizardData.environment_variables[oldKey] = value;
    }
  }

  refreshServiceProfileEnvVars() {
    const container = document.getElementById('env-vars-container');
    if (!container) return;
    
    const envVarsHtml = Object.entries(this.serviceProfileWizardData.environment_variables).map(([key, value]) => `
      <div class="env-var-row">
        <input type="text" class="form-input" value="${key}" placeholder="Variable Name" 
               onchange="window.app.serviceProfileManager.updateServiceProfileEnvVar(this, '${key}', 'key')">
        <input type="text" class="form-input" value="${value}" placeholder="Variable Value" 
               onchange="window.app.serviceProfileManager.updateServiceProfileEnvVar(this, '${key}', 'value')">
        <button type="button" class="btn btn-sm btn-error" onclick="window.app.serviceProfileManager.removeServiceProfileEnvVar('${key}')">Remove</button>
      </div>
    `).join('');
    
    container.innerHTML = envVarsHtml;
  }

  // Image Selection Handler
  onImageSelectionChange() {
    const select = document.querySelector('select[name="image_selection"]');
    const customInput = document.getElementById('custom-image-input');
    const imageUrlInput = document.querySelector('input[name="container_image_url"]');
    
    if (select.value === 'custom') {
      customInput.style.display = 'block';
      imageUrlInput.required = true;
    } else if (select.value) {
      customInput.style.display = 'none';
      imageUrlInput.required = false;
      this.serviceProfileWizardData.container_image_url = select.value;
    } else {
      customInput.style.display = 'none';
      imageUrlInput.required = false;
    }
  }

  // Save Service Profile
  async saveServiceProfile() {
    // Save final step data
    this.saveServiceProfileStepData();
    
    try {
      const profileData = {
        name: this.serviceProfileWizardData.name,
        container_image_url: this.serviceProfileWizardData.container_image_url,
        container_port: this.serviceProfileWizardData.container_port,
        memory: this.serviceProfileWizardData.memory,
        cpu: this.serviceProfileWizardData.cpu,
        max_instances: this.serviceProfileWizardData.max_instances,
        timeout: this.serviceProfileWizardData.timeout,
        concurrency: this.serviceProfileWizardData.concurrency,
        execution_environment: this.serviceProfileWizardData.execution_environment,
        cpu_boost: this.serviceProfileWizardData.cpu_boost,
        region: this.serviceProfileWizardData.region,
        server_auth_token: this.serviceProfileWizardData.server_auth_token,
        environment_variables: this.serviceProfileWizardData.environment_variables
      };

      if (this.serviceProfileWizardData.isEditMode) {
        await this.updateServiceProfile(this.serviceProfileWizardData.editingId, profileData);
      } else {
        await this.createServiceProfile(profileData);
      }
      
      if (window.app && window.app.modal) {
        window.app.modal.hide();
      }
    } catch (error) {
      // Error already handled in create/update methods
    }
  }

  // Helper method to parse environment variables from string format
  parseEnvironmentVariables(envVarsString) {
    const envVars = {};
    if (!envVarsString) return envVars;
    
    const lines = envVarsString.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=');
        if (key && key !== 'SERVER_HTTP_PORT') { // Exclude system variables
          envVars[key] = value;
        }
      }
    }
    
    return envVars;
  }

  // Get service profiles
  getServiceProfiles() {
    return this.serviceProfiles;
  }

  // Get service profile by ID
  getServiceProfile(profileId) {
    return this.serviceProfiles.find(p => p.id === profileId);
  }
}
