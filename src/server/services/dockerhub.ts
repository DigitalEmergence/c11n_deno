export class DockerHubService {
  private static readonly DOCKERHUB_API_BASE = 'https://hub.docker.com/v2';
  private static readonly JSPHERE_REPOSITORY = 'greenantsolutions/jsphere';
  private cache: { images: any[], lastFetch: number } | null = null;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  async getJSphereImages(): Promise<any[]> {
    // Check cache first
    if (this.cache && (Date.now() - this.cache.lastFetch) < this.CACHE_DURATION) {
      return this.cache.images;
    }

    try {
      const response = await fetch(
        `${DockerHubService.DOCKERHUB_API_BASE}/repositories/${DockerHubService.JSPHERE_REPOSITORY}/tags?page_size=50&ordering=-last_updated`
      );

      if (!response.ok) {
        throw new Error(`Docker Hub API error: ${response.status}`);
      }

      const data = await response.json();
      const images = data.results?.map((tag: any) => ({
        name: tag.name,
        full_name: `${DockerHubService.JSPHERE_REPOSITORY}:${tag.name}`,
        digest: tag.digest,
        last_updated: tag.last_updated,
        size: tag.full_size,
        architecture: tag.images?.[0]?.architecture || 'amd64'
      })) || [];

      // Update cache
      this.cache = {
        images,
        lastFetch: Date.now()
      };

      return images;
    } catch (error) {
      console.error('Failed to fetch JSphere images from Docker Hub:', error);
      
      // Return cached data if available, otherwise return default images
      if (this.cache) {
        return this.cache.images;
      }

      // Fallback to some default JSphere images
      return [
        {
          name: 'latest',
          full_name: `${DockerHubService.JSPHERE_REPOSITORY}:latest`,
          digest: null,
          last_updated: new Date().toISOString(),
          size: null,
          architecture: 'amd64'
        },
        {
          name: 'stable',
          full_name: `${DockerHubService.JSPHERE_REPOSITORY}:stable`,
          digest: null,
          last_updated: new Date().toISOString(),
          size: null,
          architecture: 'amd64'
        }
      ];
    }
  }

  async validateImageUrl(imageUrl: string): Promise<boolean> {
    try {
      // Basic URL validation
      if (!imageUrl || typeof imageUrl !== 'string') {
        return false;
      }

      // Check if it's a valid Docker image URL format
      const dockerImageRegex = /^([a-zA-Z0-9._-]+\/)?([a-zA-Z0-9._-]+\/)?[a-zA-Z0-9._-]+(:([a-zA-Z0-9._-]+))?(@sha256:[a-f0-9]{64})?$/;
      return dockerImageRegex.test(imageUrl);
    } catch (error) {
      console.error('Error validating image URL:', error);
      return false;
    }
  }

  clearCache(): void {
    this.cache = null;
  }
}
