export class Modal {
  constructor() {
    this.overlay = document.getElementById('modal-overlay');
    this.content = document.getElementById('modal-content');
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.hide();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hide();
      }
    });
  }

  show(title, body, options = {}) {
    this.content.innerHTML = `
      <div class="modal-header">
        <h2 class="modal-title">${title}</h2>
        <button class="modal-close" onclick="window.app.modal.hide()">×</button>
      </div>
      <div class="modal-body">
        ${body}
      </div>
      ${options.primaryButton || options.secondaryButton ? `
        <div class="modal-footer">
          ${options.secondaryButton ? `
            <button class="btn btn-secondary" onclick="${options.secondaryButton.action || 'window.app.modal.hide()'}">
              ${options.secondaryButton.text || 'Cancel'}
            </button>
          ` : ''}
          ${options.primaryButton ? `
            <button class="btn btn-primary" onclick="${options.primaryButton.action}" ${options.primaryButton.disabled ? 'disabled' : ''}>
              ${options.primaryButton.text || 'Save'}
            </button>
          ` : ''}
        </div>
      ` : ''}
    `;

    this.overlay.classList.remove('hidden');
    this.overlay.classList.add('visible');
  }

  hide() {
    this.overlay.classList.remove('visible');
    this.overlay.classList.add('hidden');
  }

  showDropdown(items, targetElement, onCloseCallback) {
    console.log('showDropdown called with items:', items);
    console.log('targetElement:', targetElement);
    
    // Check if there's already a dropdown open for this target
    const existingDropdowns = document.querySelectorAll('.universal-dropdown-menu, .navbar-dropdown-menu, .gcp-dropdown-menu');
    let hasExistingDropdown = false;
    
    existingDropdowns.forEach(dropdown => {
      // If clicking the same button that opened the dropdown, close it
      if (dropdown.dataset.targetId === targetElement.id || 
          (targetElement.closest('.universal-plus-btn') && dropdown.dataset.isUniversal === 'true')) {
        hasExistingDropdown = true;
        // Use collapsing animation if it's a universal dropdown
        if (dropdown.classList.contains('universal-dropdown-menu')) {
          dropdown.classList.remove('expanding');
          dropdown.classList.add('collapsing');
          setTimeout(() => {
            dropdown.remove();
            if (onCloseCallback) {
              onCloseCallback();
            }
          }, 300);
        } else {
          dropdown.remove();
          if (onCloseCallback) {
            onCloseCallback();
          }
        }
      } else {
        // Close any other open dropdowns with appropriate animation
        if (dropdown.classList.contains('universal-dropdown-menu')) {
          dropdown.classList.remove('expanding');
          dropdown.classList.add('collapsing');
          setTimeout(() => dropdown.remove(), 300);
        } else {
          dropdown.remove();
        }
      }
    });
    
    // If we just closed an existing dropdown from the same target, don't create a new one
    if (hasExistingDropdown) {
      return;
    }
    
    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'universal-dropdown-menu hidden';
    dropdown.style.position = 'fixed';
    dropdown.style.zIndex = '1001';
    
    // Add data attributes for identification
    if (targetElement.id) {
      dropdown.dataset.targetId = targetElement.id;
    }
    if (targetElement.closest('.universal-plus-btn')) {
      dropdown.dataset.isUniversal = 'true';
    }
    
    // Helper function to close dropdown and call callback
    const closeDropdown = () => {
      // Add collapsing animation
      dropdown.classList.remove('expanding');
      dropdown.classList.add('collapsing');
      
      // Remove after animation completes
      setTimeout(() => {
        dropdown.remove();
        if (onCloseCallback) {
          onCloseCallback();
        }
      }, 300);
    };
    
    dropdown.innerHTML = items.map(item => `
      <div class="universal-dropdown-item" onclick="${item.action}(); window.app.modal.closeCurrentDropdown();">
        ${item.label}
      </div>
    `).join('');

    document.body.appendChild(dropdown);
    console.log('Dropdown created and added to body');

    // Store reference for manual closing
    this.currentDropdown = dropdown;
    this.currentDropdownCallback = onCloseCallback;

    // Position dropdown
    if (targetElement) {
      const rect = targetElement.getBoundingClientRect();
      dropdown.style.top = `${rect.bottom + 8}px`;
      dropdown.style.right = `${window.innerWidth - rect.right}px`;
      console.log('Dropdown positioned at:', dropdown.style.top, dropdown.style.right);
    }

    // Trigger expanding animation
    setTimeout(() => {
      dropdown.classList.remove('hidden');
      dropdown.classList.add('expanding');
    }, 10);

    // Remove on click outside
    setTimeout(() => {
      document.addEventListener('click', function handler(e) {
        if (!dropdown.contains(e.target) && e.target !== targetElement) {
          console.log('Clicking outside dropdown, removing');
          closeDropdown();
          document.removeEventListener('click', handler);
        }
      });
    }, 0);
  }

  closeCurrentDropdown() {
    if (this.currentDropdown) {
      this.currentDropdown.remove();
      if (this.currentDropdownCallback) {
        this.currentDropdownCallback();
      }
      this.currentDropdown = null;
      this.currentDropdownCallback = null;
    }
  }
}
