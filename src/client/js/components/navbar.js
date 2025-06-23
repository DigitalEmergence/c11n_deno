export class Navbar {
  // Static flag to track if global event listeners are attached
  static globalEventListenersAttached = false;
  constructor(user) {
    this.user = user;
    this.render();
  }

  render() {
    console.log('🎨 Navbar.render() called with user:', this.user);
    const navbar = document.getElementById('navbar');
    if (!navbar) {
      console.error('❌ CRITICAL: navbar element not found!');
      return;
    }
    
    console.log('📝 Rendering navbar HTML...');
    navbar.innerHTML = `
      <div class="navbar">
        <div class="section_content">
          <a href="/" class="navbar-logo">C11N</a>
          <div class="navbar-actions">
            ${this.user ? this.renderUserSection() : ''}
          </div>
        </div>
      </div>
    `;
    
    console.log('✅ Navbar HTML rendered');
    console.log('🔍 Checking window.app availability:', typeof window.app);
    
    this.attachEvents();
  }

  renderUserSection() {
    console.log('👤 renderUserSection() called for user:', this.user?.github_username);
    const userSectionHTML = `
      <div class="user-profile-dropdown navbar-dropdown">
        <button class="user-profile-button" onclick="console.log('👤 User menu button clicked'); window.app.toggleUserMenu()">
          <img src="${this.user.github_avatar_url}" alt="${this.user.github_username}">
        </button>
        <div id="user-dropdown" class="navbar-dropdown-menu hidden">
          <div class="navbar-dropdown-item" data-action="account-info" onclick="console.log('📋 Account info clicked')">
            Account Info
          </div>
          <div class="navbar-dropdown-item" data-action="manage-plan" onclick="console.log('💳 Manage plan clicked')">
            Manage Plan
          </div>
          <div class="navbar-dropdown-item logout-item" onclick="console.log('🚪 LOGOUT BUTTON CLICKED - Direct onclick triggered'); if(window.app && window.app.logout) { console.log('✅ Calling window.app.logout()'); window.app.logout(); } else { console.error('❌ window.app.logout not available:', window.app); } document.getElementById('user-dropdown').classList.add('hidden'); event.stopPropagation();" style="cursor: pointer; user-select: none;">
            <span style="pointer-events: none; display: block; width: 100%; height: 100%;">Logout</span>
          </div>
        </div>
      </div>
    `;
    console.log('✅ User section HTML generated');
    return userSectionHTML;
  }

  attachEvents() {
    // Only attach global events once across all navbar instances
    if (Navbar.globalEventListenersAttached) {
      return;
    }

    console.log('🔧 Attaching navbar event listeners...');

    // Close dropdown when clicking outside - make this more robust
    this.outsideClickHandler = (e) => {
      // Only handle user dropdown closing here - let other systems handle their own dropdowns
      if (!e.target.closest('.user-profile-dropdown')) {
        const dropdown = document.getElementById('user-dropdown');
        if (dropdown && !dropdown.classList.contains('hidden')) {
          dropdown.classList.add('hidden');
        }
      }
    };
    document.addEventListener('click', this.outsideClickHandler);

    // Handle navbar dropdown item clicks with immediate execution (no setTimeout)
    // Make this more robust by checking for the dropdown's existence
    this.dropdownClickHandler = (e) => {
      // Check if this is a NAVBAR dropdown item click (not GCP dropdown)
      if (e.target.classList.contains('navbar-dropdown-item') && e.target.hasAttribute('data-action')) {
        console.log('🎯 NAVBAR dropdown item clicked:', e.target.textContent.trim());
        
        const action = e.target.getAttribute('data-action');
        console.log('🎯 NAVBAR dropdown action detected:', action);
        
        // Prevent event bubbling immediately
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Execute action immediately without setTimeout to avoid timing issues
        this.handleDropdownAction(action);
      }
    };
    document.addEventListener('click', this.dropdownClickHandler, true); // Use capture phase

    // Add a more robust user menu toggle handler that doesn't rely on global coordination
    this.userMenuToggleHandler = (e) => {
      if (e.target.closest('.user-profile-button')) {
        console.log('👤 User profile button clicked directly');
        e.preventDefault();
        e.stopPropagation();
        
        // Toggle the dropdown directly here as a fallback
        const dropdown = document.getElementById('user-dropdown');
        if (dropdown) {
          dropdown.classList.toggle('hidden');
          console.log('👤 User dropdown toggled directly, hidden:', dropdown.classList.contains('hidden'));
        }
      }
    };
    document.addEventListener('click', this.userMenuToggleHandler, true);

    Navbar.globalEventListenersAttached = true;
    console.log('✅ Navbar event listeners attached successfully');
  }

  // Static method to clean up global event listeners if needed
  static cleanup() {
    if (Navbar.globalEventListenersAttached) {
      // Note: We can't easily remove the specific handlers without storing references
      // This is a limitation of the current approach, but the flag prevents duplicates
      Navbar.globalEventListenersAttached = false;
    }
  }

  handleDropdownAction(action) {
    console.log('� Handling dropdown action:', action);
    
    try {
      // Close the dropdown first
      const dropdown = document.getElementById('user-dropdown');
      if (dropdown) {
        dropdown.classList.add('hidden');
        console.log('✅ Dropdown closed');
      }
      
      switch (action) {
        case 'account-info':
          console.log('📋 Calling showAccountInfo...');
          if (window.app && typeof window.app.showAccountInfo === 'function') {
            window.app.showAccountInfo();
          } else {
            console.error('❌ showAccountInfo function not available');
          }
          break;
          
        case 'manage-plan':
          console.log('💳 Calling showManagePlan...');
          if (window.app && typeof window.app.showManagePlan === 'function') {
            window.app.showManagePlan();
          } else {
            console.error('❌ showManagePlan function not available');
          }
          break;
          
        case 'logout':
          console.log('� LOGOUT ACTION TRIGGERED - calling window.app.logout()');
          if (window.app && typeof window.app.logout === 'function') {
            console.log('✅ window.app.logout function exists, calling it now...');
            // Call logout immediately without setTimeout to avoid any interference
            window.app.logout();
          } else {
            console.error('❌ CRITICAL: window.app.logout function not available!');
            console.error('window.app:', window.app);
            console.error('typeof window.app.logout:', typeof window.app?.logout);
          }
          break;
          
        default:
          console.error('❌ Unknown dropdown action:', action);
      }
    } catch (error) {
      console.error('❌ Error handling dropdown action:', error);
      console.error('Stack trace:', error.stack);
    }
  }
}
