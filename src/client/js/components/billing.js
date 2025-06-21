export class Billing {
  constructor(api) {
    this.api = api;
    this.billingInfo = null;
  }

  async getBillingInfo() {
    try {
      const response = await this.api.get('/billing');
      this.billingInfo = response.billing;
      return this.billingInfo;
    } catch (error) {
      console.error('Failed to fetch billing info:', error);
      throw error;
    }
  }

  async upgradePlan() {
    try {
      const response = await this.api.post('/billing/upgrade');
      
      if (response.client_secret) {
        // Payment requires additional action (like 3D Secure)
        // In a full implementation, you'd integrate Stripe Elements here
        console.log('Payment requires additional authentication');
        return { 
          success: false, 
          requires_action: true, 
          client_secret: response.client_secret 
        };
      }
      
      return response;
    } catch (error) {
      console.error('Failed to upgrade plan:', error);
      throw error;
    }
  }

  async upgradeWithCheckout() {
    try {
      const response = await this.api.post('/billing/checkout');
      window.location.href = response.checkout_url;
    } catch (error) {
      console.error('Failed to create checkout session:', error);
      throw error;
    }
  }

  async downgradePlan() {
    try {
      const response = await this.api.post('/billing/downgrade');
      return response;
    } catch (error) {
      console.error('Failed to downgrade plan:', error);
      throw error;
    }
  }

  async openPortal() {
    try {
      const response = await this.api.post('/billing/portal');
      window.open(response.url, '_blank');
    } catch (error) {
      console.error('Failed to open billing portal:', error);
      throw error;
    }
  }

  renderManagePlanModal() {
    return `
      <div id="billing-info" class="billing-info-container">
        <div class="loading-spinner">Loading billing information...</div>
      </div>
      
      <div class="plan-comparison">
        <h3 class="comparison-title">Choose Your Plan</h3>
        <div class="plan-options">
          <div class="plan-card free-plan">
            <div class="plan-header">
              <h4>Free Plan</h4>
              <div class="plan-price">
                <span class="currency">$</span>
                <span class="amount">0</span>
                <span class="period">/month</span>
              </div>
            </div>
            <ul class="plan-features">
              <li><span class="check">✓</span> 1 cloud deployment</li>
              <li><span class="check">✓</span> Unlimited local servers</li>
              <li><span class="check">✓</span> Unlimited JSphere configs</li>
              <li><span class="check">✓</span> Community support</li>
              <li><span class="cross">✗</span> Metrics and logs</li>
            </ul>
            <div class="plan-action">
              <button class="btn btn-secondary" disabled>Current Plan</button>
            </div>
          </div>
          
          <div class="plan-card developer-plan featured">
            <div class="plan-badge">Most Popular</div>
            <div class="plan-header">
              <h4>Developer Plan</h4>
              <div class="plan-price">
                <span class="currency">$</span>
                <span class="amount">10</span>
                <span class="period">/month</span>
              </div>
            </div>
            <ul class="plan-features">
              <li><span class="check">✓</span> Everything in Free</li>
              <li><span class="check">✓</span> Up to 10 cloud deployments</li>
              <li><span class="check">✓</span> Real-time metrics</li>
              <li><span class="check">✓</span> Application logs</li>
              <li><span class="check">✓</span> Priority support</li>
            </ul>
            <div class="plan-action">
              <button class="btn btn-primary" onclick="window.app.handlePlanUpgrade()">
                Upgrade Now
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="billing-faq">
        <h4>Frequently Asked Questions</h4>
        <div class="faq-item">
          <div class="faq-question">Can I change plans anytime?</div>
          <div class="faq-answer">Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.</div>
        </div>
        <div class="faq-item">
          <div class="faq-question">What happens to my deployments if I downgrade?</div>
          <div class="faq-answer">If you downgrade to the free plan, excess deployments will be deleted (free plan allows 1 deployment).</div>
        </div>
        <div class="faq-item">
          <div class="faq-question">Do you offer refunds?</div>
          <div class="faq-answer">We offer prorated refunds for downgrades within the billing cycle.</div>
        </div>
      </div>
    `;
  }

  async loadBillingInfo() {
    try {
      const billing = await this.getBillingInfo();
      const container = document.getElementById('billing-info');
      
      if (container) {
        container.innerHTML = this.renderCurrentPlanInfo(billing);
        this.updatePlanCards(billing);
      }
    } catch (error) {
      const container = document.getElementById('billing-info');
      if (container) {
        container.innerHTML = `
          <div class="error-state">
            <span class="error-icon">⚠️</span>
            <p>Failed to load billing information</p>
            <button class="btn btn-secondary btn-sm" onclick="window.app.billing.loadBillingInfo()">
              Retry
            </button>
          </div>
        `;
      }
    }
  }

  renderCurrentPlanInfo(billing) {
    const usagePercentage = billing.deployments_limit > 0 
      ? (billing.deployments_count / billing.deployments_limit) * 100 
      : 0;

    return `
      <div class="current-plan-info">
        <div class="plan-status">
          <div class="plan-details">
            <h4>Current Plan: <span class="plan-name ${billing.plan}">${billing.plan.charAt(0).toUpperCase() + billing.plan.slice(1)}</span></h4>
            ${billing.subscription ? `
              <div class="subscription-info">
                <span class="subscription-status ${billing.subscription.status}">
                  ${billing.subscription.status === 'active' ? '✓ Active' : '⚠️ ' + billing.subscription.status}
                </span>
                ${billing.subscription.cancel_at_period_end ? `
                  <span class="cancellation-notice">
                    ⚠️ Will cancel at end of billing period
                  </span>
                ` : ''}
              </div>
            ` : ''}
          </div>
          ${billing.plan === 'developer' ? `
            <button class="btn btn-secondary btn-sm" onclick="window.app.openBillingPortal()">
              Manage Billing
            </button>
          ` : ''}
        </div>
        
        <div class="usage-section">
          <div class="usage-header">
            <h5>Usage</h5>
            <span class="usage-numbers">
              ${billing.deployments_count} / ${billing.deployments_limit || '∞'} deployments
            </span>
          </div>
          
          ${billing.deployments_limit > 0 ? `
            <div class="usage-bar">
              <div class="usage-progress" style="width: ${Math.min(usagePercentage, 100)}%"></div>
            </div>
            ${usagePercentage >= 80 ? `
              <div class="usage-warning">
                <span class="warning-icon">⚠️</span>
                You're approaching your deployment limit. Consider upgrading for more capacity.
              </div>
            ` : ''}
          ` : `
            <div class="usage-unlimited">
              <span class="unlimited-icon">∞</span>
              No deployment limit on current plan
            </div>
          `}
        </div>
        
        <div class="plan-actions">
          ${billing.plan === 'free' ? `
            <button class="btn btn-primary" onclick="window.app.handlePlanUpgrade()">
              <span class="btn-icon">🚀</span>
              Upgrade to Developer
            </button>
          ` : `
            <div class="developer-actions">
              ${!billing.subscription?.cancel_at_period_end ? `
                <button class="btn btn-secondary" onclick="window.app.handlePlanDowngrade()">
                  Downgrade to Free
                </button>
              ` : `
                <button class="btn btn-primary" onclick="window.app.resumeSubscription()">
                  Resume Subscription
                </button>
              `}
            </div>
          `}
        </div>
      </div>
    `;
  }

  updatePlanCards(billing) {
    // Update free plan card
    const freePlanCard = document.querySelector('.free-plan');
    const freePlanButton = freePlanCard?.querySelector('.plan-action button');
    if (freePlanButton) {
      if (billing.plan === 'free') {
        freePlanButton.textContent = 'Current Plan';
        freePlanButton.disabled = true;
        freePlanButton.className = 'btn btn-secondary';
        freePlanCard.classList.add('current-plan');
      } else {
        freePlanButton.textContent = 'Downgrade';
        freePlanButton.disabled = false;
        freePlanButton.className = 'btn btn-secondary';
        freePlanButton.onclick = () => window.app.handlePlanDowngrade();
      }
    }

    // Update developer plan card
    const developerPlanCard = document.querySelector('.developer-plan');
    const developerPlanButton = developerPlanCard?.querySelector('.plan-action button');
    if (developerPlanButton) {
      if (billing.plan === 'developer') {
        developerPlanButton.textContent = 'Current Plan';
        developerPlanButton.disabled = true;
        developerPlanButton.className = 'btn btn-secondary';
        developerPlanCard.classList.add('current-plan');
      } else {
        developerPlanButton.textContent = 'Upgrade Now';
        developerPlanButton.disabled = false;
        developerPlanButton.className = 'btn btn-primary';
        developerPlanButton.onclick = () => window.app.handlePlanUpgrade();
      }
    }
  }

  renderBillingHistory() {
    // Placeholder for billing history - would fetch from Stripe
    return `
      <div class="billing-history">
        <h4>Billing History</h4>
        <div class="history-placeholder">
          <p>No billing history available. Use the "Manage Billing" button to view detailed billing information in Stripe.</p>
          <button class="btn btn-secondary" onclick="window.app.openBillingPortal()">
            View Full Billing History
          </button>
        </div>
      </div>
    `;
  }

  renderPaymentMethods() {
    // Placeholder for payment methods - would integrate with Stripe Elements
    return `
      <div class="payment-methods">
        <h4>Payment Methods</h4>
        <div class="payment-placeholder">
          <p>Manage your payment methods through our secure billing portal.</p>
          <button class="btn btn-secondary" onclick="window.app.openBillingPortal()">
            Manage Payment Methods
          </button>
        </div>
      </div>
    `;
  }

  // Handle plan upgrade with options
  async handleUpgradeOptions() {
    const modal = `
      <div class="upgrade-options">
        <h3>Choose Upgrade Method</h3>
        <div class="upgrade-methods">
          <div class="upgrade-method">
            <h4>Quick Checkout</h4>
            <p>Redirects to Stripe Checkout for immediate setup</p>
            <button class="btn btn-primary" onclick="window.app.billing.upgradeWithCheckout()">
              Use Stripe Checkout
            </button>
          </div>
          <div class="upgrade-method">
            <h4>Direct Subscription</h4>
            <p>Creates subscription directly (may require payment confirmation)</p>
            <button class="btn btn-secondary" onclick="window.app.billing.upgradePlan()">
              Create Subscription
            </button>
          </div>
        </div>
      </div>
    `;
    
    return modal;
  }

  // Format currency
  formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }

  // Format date
  formatDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  // Get plan color class
  getPlanColorClass(plan) {
    switch (plan) {
      case 'free': return 'plan-free';
      case 'developer': return 'plan-developer';
      default: return 'plan-unknown';
    }
  }

  // Show upgrade success message
  showUpgradeSuccess() {
    return `
      <div class="upgrade-success">
        <div class="success-icon">🎉</div>
        <h3>Welcome to Developer Plan!</h3>
        <p>You can now create up to 10 cloud deployments and access advanced features.</p>
        <button class="btn btn-primary" onclick="window.app.modal.hide(); window.app.refresh();">
          Start Deploying
        </button>
      </div>
    `;
  }

  // Show downgrade confirmation
  showDowngradeConfirmation() {
    return `
      <div class="downgrade-confirmation">
        <div class="warning-icon">⚠️</div>
        <h3>Confirm Downgrade</h3>
        <p><strong>This action will:</strong></p>
        <ul class="downgrade-effects">
          <li>Cancel your Developer plan subscription</li>
          <li>Delete excess cloud deployments (keep only 1)</li>
          <li>Remove access to metrics and logs</li>
          <li>Limit you to 1 cloud deployment + unlimited local servers</li>
        </ul>
        <p>Are you sure you want to continue?</p>
        <div class="confirmation-actions">
          <button class="btn btn-secondary" onclick="window.app.modal.hide()">
            Cancel
          </button>
          <button class="btn btn-error" onclick="window.app.confirmDowngrade()">
            Yes, Downgrade
          </button>
        </div>
      </div>
    `;
  }
}
