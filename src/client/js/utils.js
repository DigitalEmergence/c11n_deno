export const utils = {
  // Format date for display
  formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
  },

  // Format timestamp for logs
  formatTimestamp(timestamp) {
    return new Date(timestamp).toLocaleString();
  },

  // Validate form inputs
  validateForm(formElement) {
    const inputs = formElement.querySelectorAll('input[required], select[required]');
    let isValid = true;

    inputs.forEach(input => {
      if (!input.value.trim()) {
        this.showFieldError(input, 'This field is required');
        isValid = false;
      } else {
        this.clearFieldError(input);
      }
    });

    return isValid;
  },

  // Show field error
  showFieldError(field, message) {
    this.clearFieldError(field);
    field.classList.add('error');
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'form-error';
    errorDiv.textContent = message;
    field.parentNode.appendChild(errorDiv);
  },

  // Clear field error
  clearFieldError(field) {
    field.classList.remove('error');
    const errorDiv = field.parentNode.querySelector('.form-error');
    if (errorDiv) {
      errorDiv.remove();
    }
  },

  // Show toast notification
  showToast(message, type = 'info') {
    // Create or get toast container
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    // Add to container instead of body
    toastContainer.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('visible'), 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => {
        toast.remove();
        // Remove container if empty
        if (toastContainer.children.length === 0) {
          toastContainer.remove();
        }
      }, 300);
    }, 3000);
  },

  // Debounce function for search/input
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  // Copy to clipboard
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      this.showToast('Copied to clipboard', 'success');
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      this.showToast('Failed to copy to clipboard', 'error');
    }
  },

  // Generate random string
  generateRandomString(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  // Format file size
  formatFileSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  },

  // Validate deployment name
  validateDeploymentName(name) {
    const regex = /^[a-z0-9-]+$/;
    return regex.test(name) && name.length >= 1 && name.length <= 63;
  },

  // Validate port number
  validatePort(port) {
    const num = parseInt(port);
    return !isNaN(num) && num >= 1 && num <= 65535;
  },

  // Parse URL parameters
  getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const result = {};
    for (const [key, value] of params) {
      result[key] = value;
    }
    return result;
  },

  // Loading state management
  setLoading(element, isLoading) {
    if (isLoading) {
      element.classList.add('loading');
      element.disabled = true;
    } else {
      element.classList.remove('loading');
      element.disabled = false;
    }
  },

  // Sanitize HTML to prevent XSS
  sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
  },

  // Status determination for deployments
  getDeploymentStatus(deployment) {
    if (!deployment.cloud_run_url && deployment.status === 'creating') {
      return 'status-deploying';
    }
    if (deployment.cloud_run_url && !deployment.config) {
      return 'status-idle';
    }
    if (deployment.cloud_run_url && deployment.config) {
      return 'status-active';
    }
    if (deployment.status === 'error' || deployment.status === 'failed') {
      return 'status-error';
    }
    return 'status-idle';
  },

  // Status determination for local servers
  getLocalServerStatus(server) {
    // If server is being health checked initially
    if (server.status === 'connecting') {
      return 'status-connecting';
    }
    // If server is not healthy (can't connect)
    if (server.is_healthy === false || server.status === 'error') {
      return 'status-error';
    }
    // If server is healthy and has config loaded
    if (server.config && server.is_healthy !== false) {
      return 'status-active';
    }
    // If server is healthy but no config loaded
    return 'status-idle';
  },

  // Update server loading state in UI
  updateServerLoadingState(serverId, isLoading, loadingType = 'loading-config') {
    const serverTab = document.querySelector(`[data-id="${serverId}"]`);
    if (!serverTab) return;
    
    const statusIcon = serverTab.querySelector('.server-status-icon');
    if (!statusIcon) return;
    
    if (isLoading) {
      // Show loading spinner
      const spinnerTitle = loadingType === 'connecting' ? 'Checking server health...' : 'Loading configuration...';
      statusIcon.innerHTML = `<div class="loading-spinner" title="${spinnerTitle}"></div>`;
      statusIcon.className = `server-status-icon status-${loadingType}`;
    }
    // Note: The actual status update will happen when refresh() is called
  }
};

// CSS for toast notifications (to be added to main.css)
const toastCSS = `
.toast-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1001;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast {
  position: relative;
  padding: 12px 20px;
  border-radius: 8px;
  color: white;
  font-weight: 500;
  opacity: 0;
  transform: translateX(100%);
  transition: all 0.3s ease;
  min-width: 200px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  pointer-events: auto;
}

.toast.visible {
  opacity: 1;
  transform: translateX(0);
}

.toast-info {
  background: var(--color-primary);
}

.toast-success {
  background: var(--color-success);
}

.toast-error {
  background: var(--color-error);
}

.toast-warning {
  background: var(--color-warning);
}
`;

// Inject toast CSS
const style = document.createElement('style');
style.textContent = toastCSS;
document.head.appendChild(style);
