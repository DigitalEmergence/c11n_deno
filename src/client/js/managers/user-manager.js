import { utils } from '../utils.js';

export class UserManager {
  constructor(api, dataManager) {
    this.api = api;
    this.dataManager = dataManager;
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
      this.dataManager.setUser(null);
      this.dataManager.setDeployments([]);
      this.dataManager.setConfigs([]);
      this.dataManager.setLocalServers([]);
      this.dataManager.setWorkspaces([]);
      this.dataManager.setServiceProfiles([]);
      this.dataManager.setGCPProjects([]);
      
      // Clear API token
      this.api.setToken(null);
      
      // Notify listeners of logout
      this.dataManager.notifyListeners('user_logged_out', null);
      
      utils.showToast('Logged out successfully', 'success');
      return true;
    } catch (error) {
      console.error('Logout failed:', error);
      utils.showToast('Logout failed', 'error');
      throw error;
    }
  }

  showAccountInfo(modal) {
    const user = this.dataManager.getUser();
    const isGCPConnected = this.dataManager.isGCPConnectedStatus();

    modal.show('Account Information', `
      <div class="account-info">
        <div class="account-section">
          <h4>GitHub Account</h4>
          <div class="account-details">
            <div class="account-row">
              <img src="${user.github_avatar_url}" alt="${user.github_username}" class="account-avatar">
              <div class="account-text">
                <div class="account-name">${user.github_username}</div>
                <div class="account-email">${user.github_email || 'No email provided'}</div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="account-section">
          <h4>Subscription</h4>
          <div class="account-details">
            <div class="account-row">
              <span class="account-label">Current Plan:</span>
              <span class="account-value plan-${user.plan}">${user.plan.charAt(0).toUpperCase() + user.plan.slice(1)}</span>
            </div>
            ${user.plan === 'pro' ? `
              <div class="account-row">
                <span class="account-label">Billing Status:</span>
                <span class="account-value">${user.billing_status || 'Active'}</span>
              </div>
            ` : ''}
          </div>
        </div>
        
        <div class="account-section">
          <h4>GCP Integration</h4>
          <div class="account-details">
            <div class="account-row">
              <span class="account-label">Status:</span>
              <span class="account-value ${isGCPConnected ? 'text-success' : 'text-warning'}">
                ${isGCPConnected ? '✓ Connected' : '⚠ Not Connected'}
              </span>
            </div>
            ${user.gcp_project_id ? `
              <div class="account-row">
                <span class="account-label">Project ID:</span>
                <span class="account-value">${user.gcp_project_id}</span>
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

  showManagePlan(modal) {
    const user = this.dataManager.getUser();

    if (user.plan === 'free') {
      modal.show('Upgrade to Pro', `
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
          action: 'window.app.userManager.startUpgrade()'
        },
        secondaryButton: {
          text: 'Maybe Later'
        }
      });
    } else {
      modal.show('Manage Pro Plan', `
        <div class="plan-management">
          <div class="current-plan-info">
            <h4>Current Plan: Pro</h4>
            <div class="plan-status">
              <div class="status-item">
                <span class="status-label">Status:</span>
                <span class="status-value text-success">${user.billing_status || 'Active'}</span>
              </div>
              <div class="status-item">
                <span class="status-label">Monthly Cost:</span>
                <span class="status-value">$10.00</span>
              </div>
            </div>
          </div>
          
          <div class="plan-actions">
            <button class="btn btn-secondary" onclick="window.app.userManager.viewBillingHistory()">
              View Billing History
            </button>
            <button class="btn btn-secondary" onclick="window.app.userManager.updatePaymentMethod()">
              Update Payment Method
            </button>
            <button class="btn btn-error" onclick="window.app.userManager.cancelSubscription()">
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
    // Hide current modal first
    if (window.app && window.app.modal) {
      window.app.modal.hide();
    }
    
    // This would typically show billing history
    utils.showToast('Billing history feature coming soon', 'info');
  }

  async updatePaymentMethod() {
    // Hide current modal first
    if (window.app && window.app.modal) {
      window.app.modal.hide();
    }
    
    // This would typically open payment method update
    utils.showToast('Payment method update feature coming soon', 'info');
  }

  async cancelSubscription() {
    // Hide current modal first
    if (window.app && window.app.modal) {
      window.app.modal.hide();
    }
    
    // This would typically handle subscription cancellation
    utils.showToast('Subscription cancellation feature coming soon', 'info');
  }

  toggleUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) {
      dropdown.classList.toggle('hidden');
    }
  }

  // Check if user can perform certain actions based on plan
  canCreateDeployment() {
    const user = this.dataManager.getUser();
    if (!user) return false;

    if (user.plan === 'free') {
      const deployments = this.dataManager.getDeployments();
      const activeDeployments = deployments.filter(d => 
        d.status === 'active' || d.status === 'idle' || d.status === 'creating'
      ).length;
      
      return activeDeployments < 1;
    }
    
    return true; // Pro users have unlimited deployments
  }

  // Get plan limits
  getPlanLimits() {
    const user = this.dataManager.getUser();
    if (!user) return null;

    if (user.plan === 'free') {
      return {
        deployments: 1,
        localServers: -1, // unlimited
        support: 'basic'
      };
    } else {
      return {
        deployments: -1, // unlimited
        localServers: -1, // unlimited
        support: 'priority'
      };
    }
  }

  // Get current usage
  getCurrentUsage() {
    const deployments = this.dataManager.getDeployments();
    const localServers = this.dataManager.getLocalServers();
    
    const activeDeployments = deployments.filter(d => 
      d.status === 'active' || d.status === 'idle' || d.status === 'creating'
    ).length;
    
    const activeLocalServers = localServers.filter(s => s.status === 'active').length;

    return {
      deployments: activeDeployments,
      localServers: activeLocalServers,
      totalDeployments: deployments.length,
      totalLocalServers: localServers.length
    };
  }

  // Check if user has reached plan limits
  hasReachedLimit(resource) {
    const limits = this.getPlanLimits();
    const usage = this.getCurrentUsage();
    
    if (!limits) return false;
    
    if (resource === 'deployments') {
      return limits.deployments !== -1 && usage.deployments >= limits.deployments;
    }
    
    if (resource === 'localServers') {
      return limits.localServers !== -1 && usage.localServers >= limits.localServers;
    }
    
    return false;
  }

  // Get user info
  getUser() {
    return this.dataManager.getUser();
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.dataManager.getUser();
  }

  // Check if user has specific plan
  hasPlan(planName) {
    const user = this.dataManager.getUser();
    return user && user.plan === planName;
  }

  // Check if user is pro
  isPro() {
    return this.hasPlan('pro');
  }

  // Check if user is free
  isFree() {
    return this.hasPlan('free');
  }
}
