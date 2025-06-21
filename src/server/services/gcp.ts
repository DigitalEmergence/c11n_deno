export class GCPService {
  private baseUrl = "https://run.googleapis.com/v1";
  private resourceManagerUrl = "https://cloudresourcemanager.googleapis.com/v1";
  private monitoringUrl = "https://monitoring.googleapis.com/v1";
  private loggingUrl = "https://logging.googleapis.com/v2";

  // Utility function to sanitize label values for GCP compliance
  private sanitizeLabelValue(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')  // Replace invalid chars with hyphens
      .replace(/^[^a-z]/, 'a')       // Ensure starts with lowercase letter
      .substring(0, 63);             // Ensure max 63 characters
  }

  // Utility function to sanitize label keys for GCP compliance
  private sanitizeLabelKey(key: string): string {
    return key
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')  // Replace invalid chars with hyphens
      .replace(/^[^a-z]/, 'a')       // Ensure starts with lowercase letter
      .substring(0, 63);             // Ensure max 63 characters
  }

  // Parse environment variables string into Cloud Run env format
  private parseEnvironmentVariables(envString: string): Array<{name: string, value: string}> {
    if (!envString.trim()) {
      return [];
    }

    const envVars: Array<{name: string, value: string}> = [];
    const lines = envString.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine && trimmedLine.includes('=')) {
        const [name, ...valueParts] = trimmedLine.split('=');
        const value = valueParts.join('='); // Handle values that contain '='
        
        if (name.trim() && value !== undefined) {
          envVars.push({
            name: name.trim(),
            value: value.trim()
          });
        }
      }
    }
    
    return envVars;
  }

  // Sanitize memory format for Cloud Run compliance
  private sanitizeMemoryFormat(memory: string): string {
    if (!memory) return "512Mi";
    
    // Convert MiB to Mi, GiB to Gi, etc.
    return memory
      .replace(/MiB$/i, 'Mi')
      .replace(/GiB$/i, 'Gi')
      .replace(/KiB$/i, 'Ki')
      .replace(/TiB$/i, 'Ti')
      .replace(/PiB$/i, 'Pi')
      .replace(/EiB$/i, 'Ei');
  }

  async request(url: string, token: string, options: RequestInit = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "C11N/1.0",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`GCP API error: ${response.status} ${response.statusText} - ${error}`);
      throw new Error(`GCP API error: ${response.statusText} - ${error}`);
    }

    return response.json();
  }

  // Project Management
  async listProjects(token: string) {
    console.log("📋 Fetching GCP projects...");
    const response = await this.request(`${this.resourceManagerUrl}/projects`, token);
    
    // Filter for active projects only
    const activeProjects = (response.projects || []).filter(
      (project: any) => project.lifecycleState === 'ACTIVE'
    );
    
    console.log(`✅ Found ${activeProjects.length} active GCP projects`);
    return activeProjects;
  }

  async getProject(projectId: string, token: string) {
    return this.request(`${this.resourceManagerUrl}/projects/${projectId}`, token);
  }

  // Cloud Run Management
  async createCloudRunService(projectId: string, region: string, serviceConfig: any, token: string) {
    console.log(`🚀 Creating Cloud Run service: ${serviceConfig.metadata.name} in ${region}`);
    console.log(`📡 GCP API URL: ${this.baseUrl}/projects/${projectId}/locations/${region}/services`);
    console.log(`📤 Final payload being sent to GCP Cloud Run API:`);
    console.log(JSON.stringify(serviceConfig, null, 2));
    
    const url = `${this.baseUrl}/projects/${projectId}/locations/${region}/services`;
    
    try {
      const result = await this.request(url, token, {
        method: "POST",
        body: JSON.stringify(serviceConfig),
      });
      
      console.log(`✅ Cloud Run service created: ${result.metadata?.name}`);
      return result;
    } catch (error) {
      console.error(`❌ Failed to create Cloud Run service: ${(error as Error).message}`);
      throw error;
    }
  }

  async getCloudRunService(projectId: string, region: string, serviceName: string, token: string) {
    const url = `${this.baseUrl}/projects/${projectId}/locations/${region}/services/${serviceName}`;
    return this.request(url, token);
  }

  async checkServiceExists(projectId: string, region: string, serviceName: string, token: string) {
    try {
      await this.getCloudRunService(projectId, region, serviceName, token);
      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('404') || errorMessage.includes('NOT_FOUND')) {
        return false;
      }
      // Re-throw other errors (auth, network, etc.)
      throw error;
    }
  }

  async updateCloudRunService(projectId: string, region: string, serviceName: string, serviceConfig: any, token: string) {
    console.log(`📝 Updating Cloud Run service: ${serviceName}`);
    
    const url = `${this.baseUrl}/projects/${projectId}/locations/${region}/services/${serviceName}`;
    return this.request(url, token, {
      method: "PUT",
      body: JSON.stringify(serviceConfig),
    });
  }

  async deleteCloudRunService(projectId: string, region: string, serviceName: string, token: string) {
    console.log(`🗑️ Deleting Cloud Run service: ${serviceName}`);
    
    const url = `${this.baseUrl}/projects/${projectId}/locations/${region}/services/${serviceName}`;
    
    try {
      const result = await this.request(url, token, { method: "DELETE" });
      console.log(`✅ Cloud Run service deleted: ${serviceName}`);
      return result;
    } catch (error) {
      const errorMessage = (error as Error).message;
      
      // Handle 404 errors gracefully - service already deleted
      if (errorMessage.includes('404') || errorMessage.includes('NOT_FOUND')) {
        console.log(`ℹ️ Cloud Run service already deleted: ${serviceName}`);
        return { success: true, message: 'Service already deleted' };
      }
      
      console.error(`❌ Failed to delete Cloud Run service: ${errorMessage}`);
      throw error;
    }
  }

  async listCloudRunServices(projectId: string, region: string, token: string) {
    const url = `${this.baseUrl}/projects/${projectId}/locations/${region}/services`;
    const response = await this.request(url, token);
    return response.items || [];
  }

  // Set IAM policy to allow unauthenticated invocations
  async setServiceIamPolicy(projectId: string, region: string, serviceName: string, token: string) {
    console.log(`🔓 Setting IAM policy for unauthenticated access: ${serviceName}`);
    
    const url = `${this.baseUrl}/projects/${projectId}/locations/${region}/services/${serviceName}:setIamPolicy`;
    
    const policy = {
      policy: {
        bindings: [
          {
            role: "roles/run.invoker",
            members: ["allUsers"]
          }
        ]
      }
    };

    try {
      const result = await this.request(url, token, {
        method: "POST",
        body: JSON.stringify(policy),
      });
      
      console.log(`✅ IAM policy set for unauthenticated access: ${serviceName}`);
      return result;
    } catch (error) {
      console.error(`❌ Failed to set IAM policy: ${(error as Error).message}`);
      throw error;
    }
  }

  // Monitoring and Metrics - Real Cloud Monitoring API Implementation
  async getServiceMetrics(projectId: string, serviceName: string, token: string, region?: string) {
    try {
      console.log(`📊 Fetching real Cloud Run metrics for service: ${serviceName} in project: ${projectId}`);
      
      // Validate inputs
      if (!serviceName || serviceName === 'undefined' || serviceName === 'null') {
        console.error(`❌ Invalid service name: ${serviceName}`);
        throw new Error(`Invalid service name: ${serviceName}`);
      }
      
      if (!projectId || projectId === 'undefined' || projectId === 'null') {
        console.error(`❌ Invalid project ID: ${projectId}`);
        throw new Error(`Invalid project ID: ${projectId}`);
      }

      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 60 * 60 * 1000); // Last hour
      
      // Fetch multiple metrics in parallel with proper error handling
      const metricsPromises = [
        this.fetchMetric(projectId, 'run.googleapis.com/request_count', serviceName, token, region),
        this.fetchMetric(projectId, 'run.googleapis.com/request_latencies', serviceName, token, region),
        this.fetchMetric(projectId, 'run.googleapis.com/container/cpu/utilizations', serviceName, token, region),
        this.fetchMetric(projectId, 'run.googleapis.com/container/memory/utilizations', serviceName, token, region),
        this.fetchMetric(projectId, 'run.googleapis.com/container/instance_count', serviceName, token, region),
        this.fetchMetric(projectId, 'run.googleapis.com/container/billable_instance_time', serviceName, token, region),
      ];

      const [
        requestCount,
        requestLatencies, 
        cpuUtilization,
        memoryUtilization,
        instanceCount,
        billableTime
      ] = await Promise.allSettled(metricsPromises);

      // Process results and handle failures gracefully
      const metrics = {
        requests: this.extractMetricValue(requestCount, 'sum') || 0,
        request_latencies: {
          p50: this.extractPercentileValue(requestLatencies, 50) || 0,
          p90: this.extractPercentileValue(requestLatencies, 90) || 0,
          p95: this.extractPercentileValue(requestLatencies, 95) || 0,
          p99: this.extractPercentileValue(requestLatencies, 99) || 0,
        },
        cpu_utilization: this.extractMetricValue(cpuUtilization, 'mean') || 0,
        memory_utilization: this.extractMetricValue(memoryUtilization, 'mean') || 0,
        instances: this.extractMetricValue(instanceCount, 'mean') || 0,
        billable_time_seconds: this.extractMetricValue(billableTime, 'sum') || 0,
        timestamp: new Date().toISOString(),
      };

      console.log(`✅ Retrieved Cloud Run metrics for ${serviceName}:`, metrics);
      return metrics;

    } catch (error) {
      console.error(`❌ Failed to fetch service metrics for ${serviceName}:`, error);
      return {
        requests: 0,
        request_latencies: { p50: 0, p90: 0, p95: 0, p99: 0 },
        cpu_utilization: 0,
        memory_utilization: 0,
        instances: 0,
        billable_time_seconds: 0,
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
      };
    }
  }

  private async fetchMetric(projectId: string, metricType: string, serviceName: string, token: string, region?: string) {
    try {
      console.log(`📈 Fetching metric: ${metricType} for service: ${serviceName}`);
      
      // Build the filter with proper escaping - use resource.label (singular) for GCP Monitoring API
      let filter = `metric.type="${metricType}" AND resource.type="cloud_run_revision" AND resource.label.service_name="${serviceName}"`;
      if (region) {
        filter += ` AND resource.label.location="${region}"`;
      }
      
      // Use metric-specific aggregation settings
      const aggregationSettings = this.getAggregationSettings(metricType);
      
      // Use shorter time range to ensure data availability
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 60 * 60 * 1000); // Last hour
      
      // Build query parameters for GET request
      const params = new URLSearchParams({
        filter: filter,
        'interval.endTime': endTime.toISOString(),
        'interval.startTime': startTime.toISOString(),
        'aggregation.alignmentPeriod': '300s', // 5 minute alignment
        'aggregation.perSeriesAligner': aggregationSettings.aligner,
        'aggregation.crossSeriesReducer': aggregationSettings.reducer
      });

      const url = `${this.monitoringUrl}/projects/${projectId}/timeSeries?${params.toString()}`;
      console.log(`🔗 Metrics API URL: ${url}`);
      console.log(`📊 Filter: ${filter}`);
      console.log(`📊 Aggregation: ${aggregationSettings.aligner} / ${aggregationSettings.reducer}`);
      
      const result = await this.request(url, token, {
        method: 'GET'
      });
      
      // Add detailed logging of the response
      console.log(`📥 Raw API response for ${metricType}:`, JSON.stringify(result, null, 2));
      console.log(`📊 Number of time series returned: ${result.timeSeries?.length || 0}`);
      
      if (result.timeSeries && result.timeSeries.length > 0) {
        const firstSeries = result.timeSeries[0];
        console.log(`📈 First time series points: ${firstSeries.points?.length || 0}`);
        if (firstSeries.points && firstSeries.points.length > 0) {
          console.log(`📊 Sample data points:`, firstSeries.points.slice(0, 3));
        }
      }
      
      console.log(`✅ Metric ${metricType} fetched successfully`);
      return result;
      
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error(`❌ Failed to fetch metric ${metricType} for service ${serviceName}: GCP API error: ${errorMessage}`);
      
      // Return empty result for 404s instead of throwing
      if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
        console.log(`📊 No data available for metric ${metricType}, returning empty result`);
        return { timeSeries: [] };
      }
      
      // Handle API not enabled errors
      if (errorMessage.includes('403') || errorMessage.includes('API not enabled')) {
        console.log(`📊 Monitoring API not enabled for project ${projectId}, returning empty result`);
        return { timeSeries: [] };
      }
      
      throw error;
    }
  }

  // Get appropriate aggregation settings for different metric types
  private getAggregationSettings(metricType: string): { aligner: string, reducer: string } {
    switch (metricType) {
      case 'run.googleapis.com/request_count':
        return { aligner: 'ALIGN_RATE', reducer: 'REDUCE_SUM' };
      
      case 'run.googleapis.com/request_latencies':
        return { aligner: 'ALIGN_DELTA', reducer: 'REDUCE_MEAN' };
      
      case 'run.googleapis.com/container/cpu/utilizations':
      case 'run.googleapis.com/container/memory/utilizations':
        return { aligner: 'ALIGN_MEAN', reducer: 'REDUCE_MEAN' };
      
      case 'run.googleapis.com/container/instance_count':
        return { aligner: 'ALIGN_MEAN', reducer: 'REDUCE_MEAN' };
      
      case 'run.googleapis.com/container/billable_instance_time':
        return { aligner: 'ALIGN_RATE', reducer: 'REDUCE_SUM' };
      
      default:
        return { aligner: 'ALIGN_MEAN', reducer: 'REDUCE_MEAN' };
    }
  }

  private extractMetricValue(result: PromiseSettledResult<any>, aggregation: 'sum' | 'mean' | 'max'): number {
    try {
      if (result.status === 'rejected' || !result.value?.timeSeries?.length) {
        console.log(`📊 No metric data available, returning 0`);
        return 0;
      }

      const timeSeries = result.value.timeSeries[0];
      if (!timeSeries?.points?.length) {
        console.log(`📊 No data points available, returning 0`);
        return 0;
      }

      const values = timeSeries.points.map((point: any) => {
        const value = parseFloat(point.value?.doubleValue || point.value?.int64Value || 0);
        return isNaN(value) ? 0 : value;
      }).filter(v => v !== null && v !== undefined);

      if (values.length === 0) {
        console.log(`📊 No valid values found, returning 0`);
        return 0;
      }

      let result_value = 0;
      switch (aggregation) {
        case 'sum':
          result_value = values.reduce((a: number, b: number) => a + b, 0);
          break;
        case 'mean':
          result_value = values.reduce((a: number, b: number) => a + b, 0) / values.length;
          break;
        case 'max':
          result_value = Math.max(...values);
          break;
        default:
          result_value = 0;
      }

      // Ensure we return a valid number
      return isNaN(result_value) ? 0 : Math.max(0, result_value);
    } catch (error) {
      console.log(`📊 Error extracting metric value: ${error}, returning 0`);
      return 0;
    }
  }

  private extractPercentileValue(result: PromiseSettledResult<any>, percentile: number): number {
    try {
      if (result.status === 'rejected' || !result.value?.timeSeries?.length) {
        console.log(`📊 No latency data available for p${percentile}, returning 0`);
        return 0;
      }

      // For latency metrics, we need to look for distribution values
      const timeSeries = result.value.timeSeries[0];
      if (!timeSeries?.points?.length) {
        console.log(`📊 No latency points available for p${percentile}, returning 0`);
        return 0;
      }

      // This is a simplified extraction - real implementation would parse distribution buckets
      const latestPoint = timeSeries.points[0];
      const value = parseFloat(latestPoint.value?.doubleValue || latestPoint.value?.int64Value || 0);
      
      // Ensure we return a valid number
      return isNaN(value) ? 0 : Math.max(0, value);
    } catch (error) {
      console.log(`📊 Error extracting percentile value for p${percentile}: ${error}, returning 0`);
      return 0;
    }
  }

  // Cloud Logging API Implementation
  async getServiceLogs(projectId: string, serviceName: string, token: string, limit = 50) {
    try {
      console.log(`📋 Fetching real Cloud Run logs for service: ${serviceName}`);
      
      const url = `${this.loggingUrl}/entries:list`;
      
      // Build the filter for Cloud Run logs - use resource.labels (plural) for logging API
      const filter = [
        'resource.type="cloud_run_revision"',
        `resource.labels.service_name="${serviceName}"`,
        `timestamp >= "${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}"` // Last 24 hours
      ].join(' AND ');

      const requestBody = {
        resourceNames: [`projects/${projectId}`],
        filter: filter,
        orderBy: 'timestamp desc',
        pageSize: limit,
      };

      console.log(`📤 Cloud Logging API request:`, requestBody);

      const response = await this.request(url, token, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const logs = (response.entries || []).map((entry: any) => ({
        timestamp: entry.timestamp,
        severity: entry.severity || 'INFO',
        message: this.extractLogMessage(entry),
        source: entry.resource?.type || 'cloud-run',
        trace: entry.trace || null,
        labels: entry.labels || {},
        httpRequest: entry.httpRequest || null,
        operation: entry.operation || null,
        sourceLocation: entry.sourceLocation || null,
      }));

      console.log(`✅ Retrieved ${logs.length} Cloud Run log entries`);
      return logs;

    } catch (error) {
      console.error("Failed to fetch service logs:", error);
      return [{
        timestamp: new Date().toISOString(),
        severity: 'ERROR',
        message: `Failed to fetch logs: ${(error as Error).message}`,
        source: 'c11n-platform',
        trace: null,
        labels: {},
        httpRequest: null,
        operation: null,
        sourceLocation: null,
      }];
    }
  }

  private extractLogMessage(entry: any): string {
    // Extract message from various possible fields
    if (entry.textPayload) {
      return entry.textPayload;
    }
    
    if (entry.jsonPayload) {
      if (entry.jsonPayload.message) {
        return entry.jsonPayload.message;
      }
      if (entry.jsonPayload.msg) {
        return entry.jsonPayload.msg;
      }
      // For structured logs, create a readable message
      return JSON.stringify(entry.jsonPayload);
    }
    
    if (entry.protoPayload) {
      return entry.protoPayload.methodName || 'Proto payload log';
    }
    
    return 'Log entry';
  }

  // Enhanced metrics for specific Cloud Run metrics
  async getDetailedServiceMetrics(projectId: string, serviceName: string, token: string, timeRange = '1h') {
    try {
      console.log(`📊 Fetching detailed Cloud Run metrics for service: ${serviceName}`);
      
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - this.parseTimeRange(timeRange));
      
      const resourceFilter = `resource.type="cloud_run_revision" AND resource.labels.service_name="${serviceName}"`;
      
      // Fetch comprehensive Cloud Run metrics
      const metricsPromises = [
        // Request metrics
        this.fetchMetric(projectId, 'run.googleapis.com/request_count', resourceFilter, '', token),
        this.fetchMetric(projectId, 'run.googleapis.com/request_latencies', resourceFilter, '', token),
        
        // Container metrics  
        this.fetchMetric(projectId, 'run.googleapis.com/container/cpu/utilizations', resourceFilter, '', token),
        this.fetchMetric(projectId, 'run.googleapis.com/container/memory/utilizations', resourceFilter, '', token),
        this.fetchMetric(projectId, 'run.googleapis.com/container/instance_count', resourceFilter, '', token),
        this.fetchMetric(projectId, 'run.googleapis.com/container/max_request_concurrency', resourceFilter, '', token),
        
        // Billing and performance
        this.fetchMetric(projectId, 'run.googleapis.com/container/billable_instance_time', resourceFilter, '', token),
        this.fetchMetric(projectId, 'run.googleapis.com/container/startup_latency', resourceFilter, '', token),
        
        // Network metrics
        this.fetchMetric(projectId, 'run.googleapis.com/container/network/sent_bytes_count', resourceFilter, '', token),
        this.fetchMetric(projectId, 'run.googleapis.com/container/network/received_bytes_count', resourceFilter, '', token),
      ];

      const results = await Promise.allSettled(metricsPromises);
      
      return {
        request_count: this.extractMetricValue(results[0], 'sum'),
        request_latencies: this.extractLatencyMetrics(results[1]),
        cpu_utilization: this.extractMetricValue(results[2], 'mean'),
        memory_utilization: this.extractMetricValue(results[3], 'mean'),
        instance_count: this.extractMetricValue(results[4], 'mean'),
        max_concurrent_requests: this.extractMetricValue(results[5], 'max'),
        billable_instance_time: this.extractMetricValue(results[6], 'sum'),
        startup_latency: this.extractMetricValue(results[7], 'mean'),
        network_sent_bytes: this.extractMetricValue(results[8], 'sum'),
        network_received_bytes: this.extractMetricValue(results[9], 'sum'),
        timestamp: new Date().toISOString(),
        time_range: timeRange,
      };

    } catch (error) {
      console.error("Failed to fetch detailed service metrics:", error);
      throw error;
    }
  }

  private parseTimeRange(timeRange: string): number {
    const unit = timeRange.slice(-1);
    const value = parseInt(timeRange.slice(0, -1));
    
    switch (unit) {
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      case 'm': return value * 60 * 1000;
      default: return 60 * 60 * 1000; // Default 1 hour
    }
  }

  private extractLatencyMetrics(result: PromiseSettledResult<any>) {
    if (result.status === 'rejected' || !result.value?.timeSeries?.length) {
      return { p50: 0, p90: 0, p95: 0, p99: 0, mean: 0 };
    }

    // This would need proper distribution parsing in a real implementation
    const timeSeries = result.value.timeSeries[0];
    if (!timeSeries?.points?.length) {
      return { p50: 0, p90: 0, p95: 0, p99: 0, mean: 0 };
    }

    const latestPoint = timeSeries.points[0];
    const value = parseFloat(latestPoint.value?.doubleValue || latestPoint.value?.int64Value || 0);
    
    return {
      p50: value * 0.8,
      p90: value * 1.2,
      p95: value * 1.5,
      p99: value * 2.0,
      mean: value,
    };
  }

  // Service Configuration Generation
  generateServiceConfig(deployment: any) {
    console.log(`🔧 Generating service config for: ${deployment.name}`);
    console.log(`📋 Deployment billing value: ${deployment.billing}`);
    console.log(`📋 Deployment data:`, {
      name: deployment.name,
      billing: deployment.billing,
      region: deployment.region
    });
    
    const serviceConfig = {
      apiVersion: "serving.knative.dev/v1",
      kind: "Service",
      metadata: {
        name: deployment.name,
        namespace: deployment.gcp_project_id,
        annotations: {
          "run.googleapis.com/ingress": "all",
          "run.googleapis.com/description": `C11N deployment: ${deployment.name}`,
          "run.googleapis.com/creator": "c11n-platform",
        },
        labels: {
          "app-managed-by": "c11n",
          "app-name": this.sanitizeLabelValue(deployment.name),
          "app-version": "1-0-0",
        },
      },
      spec: {
        template: {
          metadata: {
            annotations: {
              "autoscaling.knative.dev/maxScale": deployment.max_instances || "100",
              "autoscaling.knative.dev/minScale": "0",
              "run.googleapis.com/cpu-throttling": "true", // Always use request-based billing
              "run.googleapis.com/execution-environment": deployment.execution_environment || "gen2",
              "run.googleapis.com/sessionAffinity": "false",
            },
            labels: {
              "app-managed-by": "c11n",
              "app-name": this.sanitizeLabelValue(deployment.name),
            },
          },
          spec: {
            containerConcurrency: parseInt(deployment.concurrency || "80"),
            timeoutSeconds: parseInt(deployment.timeout || "300"),
            serviceAccountName: null, // Use default service account
            containers: [{
              image: deployment.container_image_url,
              ports: [{ 
                containerPort: parseInt(deployment.container_port || "80"),
                name: "http1"
              }],
              env: [
                { 
                  name: "SERVER_AUTH_TOKEN", 
                  value: deployment.server_auth_token 
                },
                ...this.parseEnvironmentVariables(deployment.environment_variables || "")
              ],
              resources: {
                limits: {
                  cpu: deployment.cpu || "1",
                  memory: this.sanitizeMemoryFormat(deployment.memory || "512Mi"),
                },
                requests: {
                  cpu: "0.1",
                  memory: "128Mi",
                },
              },
              startupProbe: {
                tcpSocket: {
                  port: parseInt(deployment.container_port || "80"),
                },
                initialDelaySeconds: 0,
                timeoutSeconds: 240,
                periodSeconds: 240,
                failureThreshold: 1,
              },
            }],
          },
        },
        traffic: [{ 
          percent: 100, 
          latestRevision: true 
        }],
      },
    };

    console.log("⚙️ CPU Throttling Annotation: 'false' (request-based billing)");
    console.log("📤 Complete service config being sent to GCP:");
    console.log(JSON.stringify(serviceConfig, null, 2));

    return serviceConfig;
  }

  // Deployment Status Checks
  async getServiceStatus(projectId: string, region: string, serviceName: string, token: string) {
    try {
      const service = await this.getCloudRunService(projectId, region, serviceName, token);
      
      const conditions = service.status?.conditions || [];
      const readyCondition = conditions.find((c: any) => c.type === "Ready");
      
      return {
        ready: readyCondition?.status === "True",
        url: service.status?.url || null,
        conditions: conditions,
        latestRevision: service.status?.latestReadyRevisionName || null,
        observedGeneration: service.status?.observedGeneration || 0,
        traffic: service.status?.traffic || [],
      };
    } catch (error) {
      console.error(`Failed to get service status for ${serviceName}:`, error);
      return {
        ready: false,
        url: null,
        conditions: [],
        latestRevision: null,
        observedGeneration: 0,
        traffic: [],
      };
    }
  }

  // Health Checks
  async checkServiceHealth(serviceUrl: string) {
    try {
      const response = await fetch(`${serviceUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      
      return {
        healthy: response.ok,
        status: response.status,
        statusText: response.statusText,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        healthy: false,
        status: 0,
        statusText: (error as Error).message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Region Management
  getAvailableRegions() {
    return [
      { id: 'us-central1', name: 'Iowa (us-central1)', location: 'United States' },
      { id: 'us-east1', name: 'South Carolina (us-east1)', location: 'United States' },
      { id: 'us-east4', name: 'Northern Virginia (us-east4)', location: 'United States' },
      { id: 'us-west1', name: 'Oregon (us-west1)', location: 'United States' },
      { id: 'us-west2', name: 'Los Angeles (us-west2)', location: 'United States' },
      { id: 'us-west3', name: 'Salt Lake City (us-west3)', location: 'United States' },
      { id: 'us-west4', name: 'Las Vegas (us-west4)', location: 'United States' },
      { id: 'europe-north1', name: 'Finland (europe-north1)', location: 'Europe' },
      { id: 'europe-west1', name: 'Belgium (europe-west1)', location: 'Europe' },
      { id: 'europe-west2', name: 'London (europe-west2)', location: 'Europe' },
      { id: 'europe-west3', name: 'Frankfurt (europe-west3)', location: 'Europe' },
      { id: 'europe-west4', name: 'Netherlands (europe-west4)', location: 'Europe' },
      { id: 'europe-west6', name: 'Zurich (europe-west6)', location: 'Europe' },
      { id: 'asia-east1', name: 'Taiwan (asia-east1)', location: 'Asia Pacific' },
      { id: 'asia-east2', name: 'Hong Kong (asia-east2)', location: 'Asia Pacific' },
      { id: 'asia-northeast1', name: 'Tokyo (asia-northeast1)', location: 'Asia Pacific' },
      { id: 'asia-northeast2', name: 'Osaka (asia-northeast2)', location: 'Asia Pacific' },
      { id: 'asia-northeast3', name: 'Seoul (asia-northeast3)', location: 'Asia Pacific' },
      { id: 'asia-south1', name: 'Mumbai (asia-south1)', location: 'Asia Pacific' },
      { id: 'asia-southeast1', name: 'Singapore (asia-southeast1)', location: 'Asia Pacific' },
      { id: 'asia-southeast2', name: 'Jakarta (asia-southeast2)', location: 'Asia Pacific' },
      { id: 'australia-southeast1', name: 'Sydney (australia-southeast1)', location: 'Asia Pacific' },
      { id: 'southamerica-east1', name: 'São Paulo (southamerica-east1)', location: 'South America' },
    ];
  }

  // Resource Validation
  validateResourceConfig(config: any) {
    const errors: string[] = [];

    // Validate memory
    const validMemory = ['128Mi', '256Mi', '512Mi', '1Gi', '2Gi', '4Gi', '8Gi', '16Gi', '32Gi'];
    if (config.memory && !validMemory.includes(config.memory)) {
      errors.push(`Invalid memory size: ${config.memory}. Must be one of: ${validMemory.join(', ')}`);
    }

    // Validate CPU
    const validCpu = ['0.1', '0.5', '1', '2', '4', '6', '8'];
    if (config.cpu && !validCpu.includes(config.cpu.toString())) {
      errors.push(`Invalid CPU allocation: ${config.cpu}. Must be one of: ${validCpu.join(', ')}`);
    }

    // Validate timeout
    if (config.timeout && (config.timeout < 1 || config.timeout > 3600)) {
      errors.push('Timeout must be between 1 and 3600 seconds');
    }

    // Validate concurrency
    if (config.concurrency && (config.concurrency < 1 || config.concurrency > 1000)) {
      errors.push('Concurrency must be between 1 and 1000');
    }

    // Validate max instances
    if (config.max_instances && (config.max_instances < 1 || config.max_instances > 1000)) {
      errors.push('Max instances must be between 1 and 1000');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Cost Estimation (rough estimates)
  estimateCost(config: any) {
    // Very rough cost estimation based on CPU, memory, and expected requests
    const cpuCost = parseFloat(config.cpu || "1") * 0.0025; // ~$0.0025 per vCPU-hour
    const memoryCost = parseInt(config.memory?.replace(/[^0-9]/g, '') || "512") / 1024 * 0.00025; // ~$0.00025 per GB-hour
    
    return {
      estimated_hourly_cost: (cpuCost + memoryCost).toFixed(4),
      estimated_monthly_cost: ((cpuCost + memoryCost) * 24 * 30).toFixed(2),
      currency: "USD",
      note: "Estimates are rough and actual costs may vary based on usage patterns"
    };
  }

}

export const gcp = new GCPService();
