export class API {
  constructor() {
    this.baseURL = '/api';
    this.token = localStorage.getItem('c11n_token');
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('c11n_token', token);
    } else {
      localStorage.removeItem('c11n_token');
    }
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    if (this.token) {
      config.headers.Authorization = `Bearer ${this.token}`;
    }

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        const error = new Error(errorData.error || 'Request failed');
        error.status = response.status;
        error.response = errorData;
        
        // Only reload on 401 for auth endpoints, not for GCP-related endpoints
        if (response.status === 401 && (endpoint.includes('/auth/') || endpoint === '/user')) {
          this.setToken(null);
          window.location.reload();
          return;
        }
        
        throw error;
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  async get(endpoint) {
    return this.request(endpoint);
  }

  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: data,
    });
  }

  async put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: data,
    });
  }

  async delete(endpoint) {
    return this.request(endpoint, {
      method: 'DELETE',
    });
  }
}
