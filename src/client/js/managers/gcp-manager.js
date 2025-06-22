import { utils } from '../utils.js';

export class GCPManager {
  constructor(api, dataManager) {
    this.api = api;
    this.dataManager = dataManager;
  }

  async connectGCP() {
    try {
      console.log('🔐 Starting secure GCP connection with granular permissions...');
      
      // Show security information modal before connecting
      if (window.app && window.app.modal) {
        const securityInfo = this.getSecurityInfoHTML();
        window.app.modal.show('Connect to Google Cloud Platform', securityInfo, {
          primaryButton: {
            text: 'Continue to Google',
            action: 'window.app.gcpManager.proceedWithGCPConnection()'
          },
          secondaryButton: {
            text: 'Cancel'
          }
        });
      } else {
        // Fallback if modal not available
        await this.proceedWithGCPConnection();
      }

    } catch (error) {
      console.error('❌ Failed to initiate GCP connection:', error);
      utils.showToast('Failed to initiate GCP connection', 'error');
    }
  }

  getSecurityInfoHTML() {
    return `
      <div class="security-info">
        <div class="security-header">
          <i class="fas fa-shield-alt"></i>
          <h3>Secure Cloud Platform Authorization</h3>
        </div>
        
        <div class="security-content">
          <p>C11N will request <strong>Cloud Platform permissions</strong> for complete deployment functionality:</p>
          
          <div class="permissions-list">
            <div class="permission-item">
              <i class="fas fa-eye text-blue"></i>
              <div>
                <strong>Read Project Information</strong>
                <small>View your GCP projects to let you choose which one to use</small>
              </div>
            </div>
            
            <div class="permission-item">
              <i class="fas fa-cloud text-green"></i>
              <div>
                <strong>Cloud Run Management</strong>
                <small>Deploy, create, and update Cloud Run services in your selected project</small>
              </div>
            </div>
            
            <div class="permission-item">
              <i class="fas fa-chart-line text-purple"></i>
              <div>
                <strong>Monitoring & Metrics</strong>
                <small>View performance metrics and logs for your deployed services</small>
              </div>
            </div>
          </div>
          
          <div class="security-note">
            <i class="fas fa-info-circle"></i>
            <p><strong>Complete Functionality:</strong> This single authorization provides all features including deployment, monitoring, and logging capabilities.</p>
          </div>
          
          <div class="security-note">
            <i class="fas fa-lock"></i>
            <p><strong>Project-Specific:</strong> After connecting, you'll select which specific project C11N can access. No cross-project permissions.</p>
          </div>
        </div>
      </div>
    `;
  }

  async proceedWithGCPConnection() {
    try {
      // Hide modal if it's open
      if (window.app && window.app.modal) {
        window.app.modal.hide();
      }

      console.log('🔐 Proceeding with GCP OAuth...');
      const response = await this.api.post('/auth/gcp');
      const authUrl = response.authUrl + '&state=gcp';
      console.log('📋 Auth URL with granular scopes:', authUrl);
      
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
          utils.showToast('GCP account connected with secure permissions!', 'success');
          
          // Refresh user data and show project selection
          this.refreshUserData().then(() => {
            // Auto-show project selection after successful connection
            setTimeout(() => {
              this.showProjectSelectionAfterConnection();
            }, 1000);
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
      console.error('❌ Failed to proceed with GCP connection:', error);
      utils.showToast('Failed to connect to GCP', 'error');
    }
  }

  async showProjectSelectionAfterConnection() {
    try {
      console.log('🎯 Auto-showing project selection after connection...');
      
      // Load projects first
      await this.loadGCPProjects();
      
      // Show project selection modal
      if (window.app && window.app.modal) {
        this.showSelectGCPProjectModal(window.app.modal);
      }
    } catch (error) {
      console.error('❌ Failed to show project selection:', error);
      utils.showToast('Please select a GCP project from the settings', 'info');
    }
  }

  // Reconnect GCP - same as connect but with different messaging
  async reconnectGCP() {
    try {
      console.log('🔄 Starting GCP reconnection...');
      const response = await this.api.post('/auth/gcp');
      const authUrl = response.authUrl + '&state=gcp';
      console.log('📋 Reconnect Auth URL:', authUrl);
      
      // Open OAuth in a popup window
      const popup = window.open(
        authUrl,
        'gcp-oauth-reconnect',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );
      console.log('🪟 Reconnect popup opened:', popup);

      // Listen for messages from the popup
      const messageHandler = (event) => {
        console.log('📨 Received reconnect message:', event);
        if (event.origin !== window.location.origin) {
          console.log('❌ Origin mismatch:', event.origin, 'vs', window.location.origin);
          return;
        }
        
        if (event.data.type === 'oauth_success') {
          console.log('✅ OAuth reconnection success:', event.data);
          utils.showToast('GCP account reconnected successfully!', 'success');
          
          // Reset token validity and refresh user data
          this.dataManager.setGCPTokenValidity(true, 'reconnected');
          this.refreshUserData();
          window.removeEventListener('message', messageHandler);
        } else if (event.data.type === 'oauth_error') {
          console.error('❌ OAuth reconnection error:', event.data.error);
          utils.showToast('GCP reconnection failed: ' + event.data.error, 'error');
          window.removeEventListener('message', messageHandler);
        }
      };

      window.addEventListener('message', messageHandler);
      console.log('👂 Reconnect message listener added');

      // Check if popup was closed manually
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          console.log('🪟 Reconnect popup was closed manually');
          clearInterval(checkClosed);
          window.removeEventListener('message', messageHandler);
        }
      }, 1000);

    } catch (error) {
      console.error('❌ Failed to initiate GCP reconnection:', error);
      utils.showToast('Failed to initiate GCP reconnection', 'error');
    }
  }

  async refreshUserData() {
    try {
      // Import auth here to avoid circular dependency
      const { Auth } = await import('../auth.js');
      const auth = new Auth(this.api);
      
      const user = await auth.getCurrentUser();
      console.log('👤 Updated user data:', user);
      this.dataManager.setUser(user);
      console.log('🔗 GCP Connected status:', this.dataManager.isGCPConnectedStatus());
      
      // Notify that user data was updated
      this.dataManager.notifyListeners('gcp_connection_updated', user);
    } catch (error) {
      console.error('❌ Failed to refresh user data:', error);
    }
  }

  // Debug method to check GCP connection status
  async checkGCPStatus() {
    try {
      console.log('🔍 Checking GCP connection status...');
      const response = await this.api.get('/gcp/status');
      console.log('📊 GCP Status Response:', response);
      
      // Update local state based on server response
      const user = this.dataManager.getUser();
      const wasConnected = this.dataManager.isGCPConnectedStatus();
      
      // Update user data with latest GCP info
      if (user) {
        const updatedUser = {
          ...user,
          gcp_access_token: response.connected ? user.gcp_access_token : null,
          gcp_project_id: response.projectId || user.gcp_project_id
        };
        this.dataManager.setUser(updatedUser);
      }
      
      console.log('🔄 GCP Status Update:', {
        wasConnected,
        nowConnected: this.dataManager.isGCPConnectedStatus(),
        projectId: response.projectId,
        projectName: response.projectName
      });
      
      // If status changed, notify listeners
      if (wasConnected !== this.dataManager.isGCPConnectedStatus()) {
        console.log('🎨 GCP status changed, notifying listeners');
        this.dataManager.notifyListeners('gcp_status_changed', {
          connected: this.dataManager.isGCPConnectedStatus(),
          projectId: response.projectId,
          projectName: response.projectName
        });
      }
      
      return response;
    } catch (error) {
      console.error('❌ Failed to check GCP status:', error);
      return null;
    }
  }

  async loadGCPProjects() {
    return await this.dataManager.loadGCPProjects();
  }

  async selectGCPProject(projectId, projectName, projectNumber) {
    try {
      await this.api.post('/gcp/select-project', { 
        projectId, 
        projectName, 
        projectNumber 
      });
      utils.showToast('Default GCP project set successfully!', 'success');
      
      // Refresh user data to get updated project info
      await this.refreshUserData();
      
      return true;
    } catch (error) {
      utils.showToast('Failed to set default GCP project: ' + error.message, 'error');
      throw error;
    }
  }

  showSelectGCPProjectModal(modal) {
    const gcpProjects = this.dataManager.getGCPProjects();
    
    if (!gcpProjects || gcpProjects.length === 0) {
      modal.show('No GCP Projects Found', `
        <div class="no-projects-info">
          <div class="warning-header">
            <i class="fas fa-exclamation-triangle text-warning"></i>
            <h3>No Projects Available</h3>
          </div>
          
          <div class="no-projects-content">
            <p>We couldn't find any active GCP projects in your account. This could be because:</p>
            
            <ul class="possible-causes">
              <li><i class="fas fa-project-diagram"></i> You don't have any GCP projects yet</li>
              <li><i class="fas fa-lock"></i> Your account doesn't have permission to view projects</li>
              <li><i class="fas fa-pause-circle"></i> Your projects are not in an active state</li>
            </ul>
            
            <div class="next-steps">
              <h4>What to do next:</h4>
              <ol>
                <li>Visit the <a href="https://console.cloud.google.com" target="_blank">Google Cloud Console</a></li>
                <li>Create a new project or ensure you have access to existing projects</li>
                <li>Return here and try connecting again</li>
              </ol>
            </div>
            
            <div class="security-note">
              <i class="fas fa-info-circle"></i>
              <p><strong>Note:</strong> Your GCP account is connected successfully. You just need to select a project to continue with deployments.</p>
            </div>
          </div>
        </div>
      `, {
        primaryButton: {
          text: 'Open Google Cloud Console',
          action: 'window.open("https://console.cloud.google.com", "_blank")'
        },
        secondaryButton: {
          text: 'Close'
        }
      });
      return;
    }
    
    modal.show('Set Default GCP Project', `
      <div class="project-selection-info">
        <div class="default-project-explanation">
          <i class="fas fa-star text-yellow"></i>
          <h3>Choose Your Default Project</h3>
          <p>This will be your <strong>default project</strong> for quick deployments. You can still choose different projects when creating individual deployments.</p>
        </div>
        
        <div class="security-note">
          <i class="fas fa-shield-alt"></i>
          <p><strong>Flexible Access:</strong> C11N can access any of your GCP projects. Setting a default just makes deployment faster.</p>
        </div>
        
        <form id="gcp-project-form">
          <div class="form-group">
            <label class="form-label">Choose Your Default GCP Project *</label>
            <select class="form-select" name="projectId" required>
              <option value="">Select a project...</option>
              ${gcpProjects.map(project => 
                `<option value="${project.projectId}" data-name="${project.name}" data-number="${project.projectNumber || ''}">${project.name} (${project.projectId})</option>`
              ).join('')}
            </select>
            <div class="form-help">
              <i class="fas fa-info-circle"></i>
              This will be pre-selected when creating deployments, but you can always choose a different project
            </div>
          </div>
          
          <div class="project-permissions-info">
            <h4>What C11N can do across your GCP projects:</h4>
            <ul class="permissions-summary">
              <li><i class="fas fa-cloud text-green"></i> Deploy and manage Cloud Run services</li>
              <li><i class="fas fa-chart-line text-blue"></i> View metrics and logs for your deployments</li>
              <li><i class="fas fa-users-cog text-purple"></i> Configure public access for your services</li>
              <li><i class="fas fa-eye text-orange"></i> Read basic project information</li>
            </ul>
          </div>
          
          <div class="optional-note">
            <i class="fas fa-lightbulb"></i>
            <p><strong>Optional Step:</strong> You can skip this and choose projects individually during deployment, but setting a default makes the process faster.</p>
          </div>
        </form>
      </div>
    `, {
      primaryButton: {
        text: 'Set as Default',
        action: 'window.app.gcpManager.handleSelectGCPProject()'
      },
      secondaryButton: {
        text: 'Skip for Now'
      }
    });
  }

  async handleSelectGCPProject() {
    const form = document.getElementById('gcp-project-form');
    if (!utils.validateForm(form)) return;

    const formData = new FormData(form);
    const projectId = formData.get('projectId');
    
    // Get the selected option to extract project name and number
    const selectElement = form.querySelector('select[name="projectId"]');
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    const projectName = selectedOption.getAttribute('data-name');
    const projectNumber = selectedOption.getAttribute('data-number');

    try {
      await this.selectGCPProject(projectId, projectName, projectNumber);
      // Hide modal - assuming modal is accessible globally
      if (window.app && window.app.modal) {
        window.app.modal.hide();
      }
    } catch (error) {
      // Error already handled in selectGCPProject
    }
  }

  // Check if GCP is required for an operation
  isGCPRequired() {
    return this.dataManager.isGCPConnectedStatus();
  }

  // Get current GCP project info
  getCurrentGCPProject() {
    const user = this.dataManager.getUser();
    if (!user || !this.dataManager.isGCPConnectedStatus()) {
      return null;
    }
    
    return {
      projectId: user.gcp_project_id,
      hasToken: !!user.gcp_access_token
    };
  }

  // Validate GCP connection for deployment operations
  validateGCPForDeployment() {
    const user = this.dataManager.getUser();
    
    if (!user?.gcp_access_token) {
      utils.showToast('Please connect your GCP account first', 'warning');
      return false;
    }
    
    if (!user?.gcp_project_id) {
      utils.showToast('Please select a GCP project first', 'warning');
      return false;
    }
    
    // Check if GCP token is expired/invalid
    if (this.dataManager.needsGCPReconnection()) {
      utils.showToast('Your GCP session has expired. Please click "Reconnect GCP" to continue.', 'warning');
      return false;
    }
    
    return true;
  }


  // Disconnect GCP account
  async disconnectGCP() {
    try {
      console.log('� Disconnecting GCP account...');
      
      // Show confirmation modal
      if (window.app && window.app.modal) {
        const confirmationHTML = this.getDisconnectConfirmationHTML();
        window.app.modal.show('Disconnect Google Cloud Platform', confirmationHTML, {
          primaryButton: {
            text: 'Disconnect',
            action: 'window.app.gcpManager.confirmDisconnectGCP()',
            className: 'btn-danger'
          },
          secondaryButton: {
            text: 'Cancel'
          }
        });
      } else {
        // Fallback - direct disconnect
        await this.confirmDisconnectGCP();
      }
    } catch (error) {
      console.error('❌ Failed to initiate GCP disconnection:', error);
      utils.showToast('Failed to disconnect GCP account', 'error');
    }
  }

  getDisconnectConfirmationHTML() {
    const user = this.dataManager.getUser();
    const projectName = user?.gcp_project_name || 'Unknown Project';
    const projectId = user?.gcp_project_id || 'unknown';

    return `
      <div class="disconnect-confirmation">
        <div class="warning-header">
          <i class="fas fa-exclamation-triangle text-warning"></i>
          <h3>Confirm Disconnection</h3>
        </div>
        
        <div class="disconnect-content">
          <p>You are about to disconnect your Google Cloud Platform account from C11N.</p>
          
          <div class="current-connection-info">
            <h4>Current Connection:</h4>
            <div class="connection-details">
              <div class="detail-item">
                <strong>Project:</strong> ${projectName}
              </div>
              <div class="detail-item">
                <strong>Project ID:</strong> <code>${projectId}</code>
              </div>
            </div>
          </div>
          
          <div class="disconnect-consequences">
            <h4>What happens when you disconnect:</h4>
            <ul class="consequences-list">
              <li><i class="fas fa-times text-error"></i> You won't be able to deploy new services to GCP</li>
              <li><i class="fas fa-times text-error"></i> Existing deployments will continue running but won't be manageable from C11N</li>
              <li><i class="fas fa-times text-error"></i> You won't see metrics or logs for your Cloud Run services</li>
              <li><i class="fas fa-check text-success"></i> Your deployed services will remain active in GCP</li>
              <li><i class="fas fa-check text-success"></i> You can reconnect at any time</li>
            </ul>
          </div>
          
          <div class="security-note">
            <i class="fas fa-shield-alt"></i>
            <p><strong>Security:</strong> Disconnecting will revoke C11N's access to your GCP account and remove all stored credentials.</p>
          </div>
        </div>
      </div>
    `;
  }

  async confirmDisconnectGCP() {
    try {
      // Hide modal if it's open
      if (window.app && window.app.modal) {
        window.app.modal.hide();
      }

      console.log('🔌 Confirming GCP disconnection...');
      
      await this.api.post('/gcp/disconnect');
      
      console.log('✅ GCP account disconnected successfully');
      utils.showToast('GCP account disconnected successfully', 'success');
      
      // Refresh user data to reflect disconnection
      await this.refreshUserData();
      
      // Notify listeners about the disconnection
      this.dataManager.notifyListeners('gcp_disconnected', {
        disconnected: true,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ Failed to disconnect GCP account:', error);
      utils.showToast('Failed to disconnect GCP account: ' + error.message, 'error');
    }
  }
}
