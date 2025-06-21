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

  showDropdown(items, targetElement) {
    console.log('showDropdown called with items:', items);
    console.log('targetElement:', targetElement);
    
    // Remove any existing dropdowns
    const existingDropdowns = document.querySelectorAll('.universal-dropdown');
    existingDropdowns.forEach(dropdown => dropdown.remove());
    
    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'universal-dropdown dropdown-menu';
    dropdown.style.position = 'fixed';
    dropdown.style.zIndex = '1001';
    dropdown.style.opacity = '1';
    dropdown.style.visibility = 'visible';
    dropdown.style.transform = 'translateY(0)';
    dropdown.style.pointerEvents = 'auto';
    
    dropdown.innerHTML = items.map(item => `
      <div class="dropdown-item" onclick="${item.action}(); document.querySelector('.universal-dropdown')?.remove();">
        ${item.label}
      </div>
    `).join('');

    document.body.appendChild(dropdown);
    console.log('Dropdown created and added to body');

    // Position dropdown
    if (targetElement) {
      const rect = targetElement.getBoundingClientRect();
      dropdown.style.top = `${rect.bottom + 8}px`;
      dropdown.style.right = `${window.innerWidth - rect.right}px`;
      console.log('Dropdown positioned at:', dropdown.style.top, dropdown.style.right);
    }

    // Remove on click outside
    setTimeout(() => {
      document.addEventListener('click', function handler(e) {
        if (!dropdown.contains(e.target) && e.target !== targetElement) {
          console.log('Clicking outside dropdown, removing');
          dropdown.remove();
          document.removeEventListener('click', handler);
        }
      });
    }, 0);
  }
}
