export class Navbar {
  constructor(user) {
    this.user = user;
    this.eventListenersAttached = false;
    this.render();
  }

  render() {
    const navbar = document.getElementById('navbar');
    navbar.innerHTML = `
      <div class="navbar">
        <a href="/" class="navbar-logo">C11N</a>
        <div class="navbar-actions">
          ${this.user ? this.renderUserSection() : ''}
        </div>
      </div>
    `;

    this.attachEvents();
  }

  renderUserSection() {
    return `
      <div class="user-profile-dropdown dropdown">
        <button class="user-profile-button" onclick="window.app.toggleUserMenu()">
          <img src="${this.user.github_avatar_url}" alt="${this.user.github_username}">
        </button>
        <div id="user-dropdown" class="dropdown-menu hidden">
          <div class="dropdown-item" data-action="account-info">
            Account Info
          </div>
          <div class="dropdown-item" data-action="manage-plan">
            Manage Plan
          </div>
          <div class="dropdown-item" data-action="logout">
            Logout
          </div>
        </div>
      </div>
    `;
  }

  attachEvents() {
    // Only attach events once to prevent duplicates
    if (this.eventListenersAttached) {
      return;
    }

    console.log('Attaching navbar event listeners...');

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.user-profile-dropdown')) {
        const dropdown = document.getElementById('user-dropdown');
        if (dropdown) {
          dropdown.classList.add('hidden');
        }
      }
    });

    // Handle dropdown item clicks with more specific targeting
    document.addEventListener('click', (e) => {
      console.log('Document click detected:', e.target);
      
      // Check if the clicked element is a dropdown item
      if (e.target.classList.contains('dropdown-item') && e.target.hasAttribute('data-action')) {
        const action = e.target.getAttribute('data-action');
        console.log('Dropdown item clicked with action:', action);
        
        // Prevent event bubbling
        e.preventDefault();
        e.stopPropagation();
        
        // Add a small delay to ensure the click is processed
        setTimeout(() => {
          this.handleDropdownAction(action);
        }, 10);
      }
    });

    this.eventListenersAttached = true;
    console.log('Navbar event listeners attached successfully');
  }

  handleDropdownAction(action) {
    console.log('Handling dropdown action:', action);
    
    try {
      switch (action) {
        case 'account-info':
          console.log('Calling showAccountInfo...');
          if (window.app && typeof window.app.showAccountInfo === 'function') {
            window.app.showAccountInfo();
            window.app.toggleUserMenu();
          } else {
            console.error('showAccountInfo function not available');
          }
          break;
          
        case 'manage-plan':
          console.log('Calling showManagePlan...');
          if (window.app && typeof window.app.showManagePlan === 'function') {
            window.app.showManagePlan();
            window.app.toggleUserMenu();
          } else {
            console.error('showManagePlan function not available');
          }
          break;
          
        case 'logout':
          console.log('Calling logout...');
          if (window.app && typeof window.app.logout === 'function') {
            window.app.logout();
          } else {
            console.error('logout function not available');
          }
          break;
          
        default:
          console.error('Unknown dropdown action:', action);
      }
    } catch (error) {
      console.error('Error handling dropdown action:', error);
    }
  }
}
