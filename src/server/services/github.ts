export class GitHubService {
  private baseUrl = "https://api.github.com";

  async request(endpoint: string, token: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "C11N-App",
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.statusText}`);
    }

    return response.json();
  }

  async getUser(token: string) {
    return this.request("/user", token);
  }

  async getUserRepos(token: string) {
    return this.request("/user/repos?per_page=100", token);
  }

  async getRepoContents(owner: string, repo: string, path: string, token: string) {
    return this.request(`/repos/${owner}/${repo}/contents/${path}`, token);
  }

  async scanAppConfigs(owner: string, repo: string, token: string): Promise<string[]> {
    try {
      const contents = await this.getRepoContents(owner, repo, ".", token);
      
      if (!Array.isArray(contents)) {
        return [];
      }

      return contents
        .filter((file: any) => 
          file.type === "file" && 
          file.name.startsWith("app.") && 
          file.name.endsWith(".json")
        )
        .map((file: any) => file.name.replace(".json", ""));
    } catch (error) {
      console.error("Failed to scan app configs:", error);
      return [];
    }
  }

  async getRepoBranches(owner: string, repo: string, token: string) {
    return this.request(`/repos/${owner}/${repo}/branches`, token);
  }

  async getRepoTags(owner: string, repo: string, token: string) {
    return this.request(`/repos/${owner}/${repo}/tags`, token);
  }
}

export const github = new GitHubService();
