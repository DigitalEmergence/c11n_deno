class RemoteServerManager {
    constructor(app) {
        this.app = app;
        this.remoteServers = [];
    }

    async linkRemoteServer(serverData) {
        try {
            console.log('🔗 Linking remote server:', serverData);
            
            const response = await fetch('/api/remote-servers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('c11n_token')}`
                },
                body: JSON.stringify(serverData)
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to link remote server');
            }

            const data = await response.json();

            console.log('✅ Remote server linked successfully:', data.remoteServer);
            
            // Add to local data
            this.app.dataManager.addRemoteServer(data.remoteServer);
            
            // Show appropriate notification based on server status
            if (data.remoteServer.status === 'unlinked') {
                console.log('⚠️ Server added but is unlinked - showing warning');
                utils.showToast('Server added but could not connect. Please check the URL and ensure JSphere is running.', 'warning');
            }
            
            return data.remoteServer;
        } catch (error) {
            console.error('❌ Failed to link remote server:', error);
            throw error;
        }
    }

    async deleteRemoteServer(serverId) {
        try {
            console.log('🗑️ Deleting remote server:', serverId);
            
            const response = await fetch(`/api/remote-servers/${serverId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('c11n_token')}`
                }
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to delete remote server');
            }

            console.log('✅ Remote server deleted successfully');
            
            // Remove from local data
            this.app.dataManager.removeRemoteServer(serverId);
            
            // Refresh UI
            this.app.renderServerTabs();
            
        } catch (error) {
            console.error('❌ Failed to delete remote server:', error);
            throw error;
        }
    }

    async applyConfig(serverId, configId) {
        try {
            console.log('📋 Applying config to remote server:', { serverId, configId });
            
            const response = await fetch(`/api/remote-servers/${serverId}/load-config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('c11n_token')}`
                },
                body: JSON.stringify({ configId })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to load config');
            }

            console.log('✅ Config applied to remote server successfully');
            
            // Refresh server data
            await this.app.dataManager.loadData();
            this.app.renderServerTabs();
            
            return data;
        } catch (error) {
            console.error('❌ Failed to apply config to remote server:', error);
            throw error;
        }
    }

    async healthCheckServer(serverId) {
        try {
            console.log('🔍 Health checking remote server:', serverId);
            
            const response = await fetch(`/api/remote-servers/${serverId}/health`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('c11n_token')}`
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to check server health');
            }

            console.log('📊 Remote server health check result:', data);
            
            // Update server status in local data
            const server = this.app.dataManager.getRemoteServerById(serverId);
            if (server) {
                server.status = data.status;
                server.is_healthy = data.isHealthy;
                server.last_ping = new Date().toISOString();
            }
            
            // Refresh UI
            this.app.renderServerTabs();
            
            return data;
        } catch (error) {
            console.error('❌ Failed to health check remote server:', error);
            throw error;
        }
    }

    showLinkRemoteServerModal(modal) {
        console.log('📱 Showing link remote server modal');
        
        const configs = this.app.dataManager.getConfigs();
        
        const configOptions = configs.map(config => 
            `<option value="${config.id}">${config.name} (${config.project_name})</option>`
        ).join('');

        const modalBody = `
            <form id="linkRemoteServerForm">
                <div class="form-group">
                    <label for="serverName">Server Name:</label>
                    <input type="text" id="serverName" name="serverName" required 
                           placeholder="e.g., Production Heroku, Staging DO">
                    <small>A friendly name to identify this remote server</small>
                </div>
                
                <div class="form-group">
                    <label for="serverUrl">Server URL:</label>
                    <input type="url" id="serverUrl" name="serverUrl" required 
                           placeholder="https://your-jsphere-app.herokuapp.com">
                    <small>Full URL to your deployed JSphere instance</small>
                </div>
                
                <div class="form-group">
                    <label for="configId">JSphere Config (Optional):</label>
                    <select id="configId" name="configId">
                        <option value="">Select a config to load immediately...</option>
                        ${configOptions}
                    </select>
                    <small>You can load a config later if you prefer</small>
                </div>
                
                <div class="form-actions">
                    <button type="button" class="btn-secondary" onclick="window.app.modal.hide()">Cancel</button>
                    <button type="submit" class="btn-primary">Link Remote Server</button>
                </div>
            </form>
        `;

        modal.show('Link Remote Server', modalBody);

        // Handle form submission
        document.getElementById('linkRemoteServerForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const serverData = {
                name: formData.get('serverName'),
                url: formData.get('serverUrl'),
                configId: formData.get('configId') || undefined
            };

            // Get button reference and original text outside try block
            const submitBtn = e.target.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;

            try {
                // Show loading state
                submitBtn.textContent = 'Linking...';
                submitBtn.disabled = true;

                const result = await this.linkRemoteServer(serverData);
                
                // Close modal on success
                modal.hide();
                
                // Show success notification only if server is properly linked
                if (result.status !== 'unlinked') {
                    utils.showToast('Remote server linked successfully!', 'success');
                }
                
            } catch (error) {
                console.error('Failed to link remote server:', error);
                utils.showToast(error.message, 'error');
                
                // Reset button state
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    // Get remote server actions for the actions tab
    getRemoteServerActions(server) {
        const configs = this.app.dataManager.getConfigs();
        
        return [
            {
                name: 'Load Configuration',
                description: 'Load a JSphere configuration to this remote server',
                action: () => this.showLoadConfigModal(server, configs)
            }
        ];
    }

    showLoadConfigModal(server, configs) {
        const modal = this.app.modal;
        
        const configOptions = configs.map(config => 
            `<option value="${config.id}" ${server.config?.id === config.id ? 'selected' : ''}>
                ${config.name} (${config.project_name})
            </option>`
        ).join('');

        const modalBody = `
            <p>Load a JSphere configuration to <strong>${server.name}</strong></p>
            <p class="server-url">Server: <a href="${server.url}" target="_blank">${server.url}</a></p>
            
            <form id="loadConfigForm">
                <div class="form-group">
                    <label for="configSelect">Select Configuration:</label>
                    <select id="configSelect" name="configId" required>
                        <option value="">Choose a configuration...</option>
                        ${configOptions}
                    </select>
                </div>
                
                <div class="form-actions">
                    <button type="button" class="btn-secondary" onclick="window.app.modal.hide()">Cancel</button>
                    <button type="submit" class="btn-primary">Load Configuration</button>
                </div>
            </form>
        `;

        modal.show('Load Configuration', modalBody);

        // Handle form submission
        document.getElementById('loadConfigForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const configId = formData.get('configId');

            try {
                // Show loading state
                const submitBtn = e.target.querySelector('button[type="submit"]');
                const originalText = submitBtn.textContent;
                submitBtn.textContent = 'Loading...';
                submitBtn.disabled = true;

                await this.applyConfig(server.id, configId);
                
                // Close modal on success
                modal.hide();
                
                // Show success notification
                utils.showToast('Configuration loaded successfully!', 'success');
                
            } catch (error) {
                console.error('Failed to load config:', error);
                utils.showToast(error.message, 'error');
                
                // Reset button state
                const submitBtn = e.target.querySelector('button[type="submit"]');
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        });
    }
}

// Export for use in other modules
export { RemoteServerManager };
