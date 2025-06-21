export class Auth {
  constructor(api) {
    this.api = api;
  }

  async getCurrentUser() {
    try {
      const response = await this.api.get('/auth/me');
      return response.user;
    } catch (error) {
      throw new Error('Authentication failed');
    }
  }

  async logout() {
    try {
      await this.api.post('/auth/logout');
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      this.api.setToken(null);
      window.location.reload();
    }
  }

  // Handle GitHub OAuth callback
  async handleGitHubCallback(code) {
    try {
      const response = await this.api.post('/auth/github/callback', { code });
      this.api.setToken(response.token);
      return response.user;
    } catch (error) {
      throw new Error('GitHub authentication failed');
    }
  }

  // Handle GCP OAuth callback
  async handleGCPCallback(code) {
    try {
      const response = await this.api.post('/auth/gcp/callback', { code });
      return response;
    } catch (error) {
      throw new Error('GCP authentication failed');
    }
  }
}