export class Charts {
  constructor() {
    this.charts = new Map(); // Store chart instances
    this.colors = {
      primary: '#3b82f6',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#06b6d4',
      purple: '#8b5cf6',
      pink: '#ec4899',
      gray: '#6b7280'
    };
  }

  // Create a line chart for metrics over time
  createMetricsChart(containerId, data, options = {}) {
    const canvas = document.createElement('canvas');
    canvas.id = `chart-${containerId}`;
    canvas.style.maxHeight = '300px';
    
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Container ${containerId} not found`);
      return null;
    }
    
    container.innerHTML = '';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    
    const defaultOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            padding: 20
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: '#374151',
          borderWidth: 1,
          cornerRadius: 8,
          displayColors: true,
          callbacks: {
            label: function(context) {
              const label = context.dataset.label || '';
              const value = context.parsed.y;
              const unit = context.dataset.unit || '';
              return `${label}: ${value}${unit}`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            displayFormats: {
              minute: 'HH:mm',
              hour: 'HH:mm',
              day: 'MMM DD'
            }
          },
          grid: {
            color: 'rgba(156, 163, 175, 0.1)'
          },
          ticks: {
            color: '#6b7280'
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(156, 163, 175, 0.1)'
          },
          ticks: {
            color: '#6b7280',
            callback: function(value) {
              const unit = this.chart.data.datasets[0]?.unit || '';
              return value + unit;
            }
          }
        }
      }
    };

    const config = {
      type: 'line',
      data: data,
      options: { ...defaultOptions, ...options }
    };

    const chart = new Chart(ctx, config);
    this.charts.set(containerId, chart);
    
    return chart;
  }

  // Create a doughnut chart for resource utilization
  createUtilizationChart(containerId, data, options = {}) {
    const canvas = document.createElement('canvas');
    canvas.id = `chart-${containerId}`;
    canvas.style.maxHeight = '200px';
    
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Container ${containerId} not found`);
      return null;
    }
    
    container.innerHTML = '';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    
    const defaultOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            padding: 15
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#fff',
          bodyColor: '#fff',
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed;
              return `${label}: ${value}%`;
            }
          }
        }
      }
    };

    const config = {
      type: 'doughnut',
      data: data,
      options: { ...defaultOptions, ...options }
    };

    const chart = new Chart(ctx, config);
    this.charts.set(containerId, chart);
    
    return chart;
  }

  // Create a bar chart for request counts or other discrete metrics
  createBarChart(containerId, data, options = {}) {
    const canvas = document.createElement('canvas');
    canvas.id = `chart-${containerId}`;
    canvas.style.maxHeight = '250px';
    
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Container ${containerId} not found`);
      return null;
    }
    
    container.innerHTML = '';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    
    const defaultOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#fff',
          bodyColor: '#fff'
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(156, 163, 175, 0.1)'
          },
          ticks: {
            color: '#6b7280'
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(156, 163, 175, 0.1)'
          },
          ticks: {
            color: '#6b7280'
          }
        }
      }
    };

    const config = {
      type: 'bar',
      data: data,
      options: { ...defaultOptions, ...options }
    };

    const chart = new Chart(ctx, config);
    this.charts.set(containerId, chart);
    
    return chart;
  }

  // Generate time series data for metrics
  generateTimeSeriesData(metrics, timeRange = '1h') {
    const now = new Date();
    const points = 20; // Number of data points
    const interval = this.getIntervalMs(timeRange) / points;
    
    const timestamps = [];
    for (let i = points - 1; i >= 0; i--) {
      timestamps.push(new Date(now.getTime() - (i * interval)));
    }

    return timestamps;
  }

  // Get interval in milliseconds based on time range
  getIntervalMs(timeRange) {
    const ranges = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    return ranges[timeRange] || ranges['1h'];
  }

  // Create request metrics chart
  createRequestMetricsChart(containerId, metrics) {
    const timestamps = this.generateTimeSeriesData(metrics);
    
    // Generate sample data points (in real implementation, this would come from historical data)
    const requestData = timestamps.map((time, index) => ({
      x: time,
      y: Math.max(0, (metrics.requests || 0) + Math.random() * 50 - 25)
    }));

    const data = {
      datasets: [{
        label: 'Requests',
        data: requestData,
        borderColor: this.colors.primary,
        backgroundColor: this.colors.primary + '20',
        fill: true,
        tension: 0.4,
        unit: ''
      }]
    };

    return this.createMetricsChart(containerId, data, {
      plugins: {
        title: {
          display: true,
          text: 'Request Volume Over Time',
          color: '#374151',
          font: {
            size: 16,
            weight: 'bold'
          }
        }
      }
    });
  }

  // Create latency metrics chart
  createLatencyChart(containerId, metrics) {
    const timestamps = this.generateTimeSeriesData(metrics);
    
    const latencies = metrics.request_latencies || { p50: 0, p90: 0, p95: 0, p99: 0 };
    
    const datasets = [
      {
        label: 'P50',
        data: timestamps.map(time => ({
          x: time,
          y: latencies.p50 + Math.random() * 10 - 5
        })),
        borderColor: this.colors.success,
        backgroundColor: this.colors.success + '20',
        fill: false,
        tension: 0.4,
        unit: 'ms'
      },
      {
        label: 'P90',
        data: timestamps.map(time => ({
          x: time,
          y: latencies.p90 + Math.random() * 15 - 7
        })),
        borderColor: this.colors.warning,
        backgroundColor: this.colors.warning + '20',
        fill: false,
        tension: 0.4,
        unit: 'ms'
      },
      {
        label: 'P95',
        data: timestamps.map(time => ({
          x: time,
          y: latencies.p95 + Math.random() * 20 - 10
        })),
        borderColor: this.colors.error,
        backgroundColor: this.colors.error + '20',
        fill: false,
        tension: 0.4,
        unit: 'ms'
      },
      {
        label: 'P99',
        data: timestamps.map(time => ({
          x: time,
          y: latencies.p99 + Math.random() * 25 - 12
        })),
        borderColor: this.colors.purple,
        backgroundColor: this.colors.purple + '20',
        fill: false,
        tension: 0.4,
        unit: 'ms'
      }
    ];

    const data = { datasets };

    return this.createMetricsChart(containerId, data, {
      plugins: {
        title: {
          display: true,
          text: 'Response Latency Percentiles',
          color: '#374151',
          font: {
            size: 16,
            weight: 'bold'
          }
        }
      }
    });
  }

  // Create resource utilization chart
  createResourceChart(containerId, metrics) {
    const timestamps = this.generateTimeSeriesData(metrics);
    
    const cpuData = timestamps.map(time => ({
      x: time,
      y: Math.max(0, Math.min(100, (metrics.cpu_utilization * 100) + Math.random() * 10 - 5))
    }));

    const memoryData = timestamps.map(time => ({
      x: time,
      y: Math.max(0, Math.min(100, (metrics.memory_utilization * 100) + Math.random() * 8 - 4))
    }));

    const data = {
      datasets: [
        {
          label: 'CPU Usage',
          data: cpuData,
          borderColor: this.colors.primary,
          backgroundColor: this.colors.primary + '20',
          fill: true,
          tension: 0.4,
          unit: '%'
        },
        {
          label: 'Memory Usage',
          data: memoryData,
          borderColor: this.colors.success,
          backgroundColor: this.colors.success + '20',
          fill: true,
          tension: 0.4,
          unit: '%'
        }
      ]
    };

    return this.createMetricsChart(containerId, data, {
      plugins: {
        title: {
          display: true,
          text: 'Resource Utilization',
          color: '#374151',
          font: {
            size: 16,
            weight: 'bold'
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          grid: {
            color: 'rgba(156, 163, 175, 0.1)'
          },
          ticks: {
            color: '#6b7280',
            callback: function(value) {
              return value + '%';
            }
          }
        }
      }
    });
  }

  // Create instance count chart
  createInstanceChart(containerId, metrics) {
    const timestamps = this.generateTimeSeriesData(metrics);
    
    const instanceData = timestamps.map(time => ({
      x: time,
      y: Math.max(0, Math.round((metrics.instances || 0) + Math.random() * 2 - 1))
    }));

    const data = {
      datasets: [{
        label: 'Active Instances',
        data: instanceData,
        borderColor: this.colors.info,
        backgroundColor: this.colors.info + '20',
        fill: true,
        stepped: true,
        unit: ''
      }]
    };

    return this.createMetricsChart(containerId, data, {
      plugins: {
        title: {
          display: true,
          text: 'Active Instances',
          color: '#374151',
          font: {
            size: 16,
            weight: 'bold'
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
            color: '#6b7280'
          }
        }
      }
    });
  }

  // Create cost tracking chart
  createCostChart(containerId, metrics) {
    const timestamps = this.generateTimeSeriesData(metrics);
    
    const costPerHour = (metrics.billable_time_seconds || 0) * 0.0000024;
    const costData = timestamps.map((time, index) => ({
      x: time,
      y: Math.max(0, costPerHour + (Math.random() * costPerHour * 0.2 - costPerHour * 0.1))
    }));

    const data = {
      datasets: [{
        label: 'Estimated Cost',
        data: costData,
        borderColor: this.colors.warning,
        backgroundColor: this.colors.warning + '20',
        fill: true,
        tension: 0.4,
        unit: ' USD'
      }]
    };

    return this.createMetricsChart(containerId, data, {
      plugins: {
        title: {
          display: true,
          text: 'Estimated Hourly Cost',
          color: '#374151',
          font: {
            size: 16,
            weight: 'bold'
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: '#6b7280',
            callback: function(value) {
              return '$' + value.toFixed(4);
            }
          }
        }
      }
    });
  }

  // Update existing chart with new data
  updateChart(containerId, newData) {
    const chart = this.charts.get(containerId);
    if (!chart) {
      console.warn(`Chart ${containerId} not found for update`);
      return;
    }

    chart.data = newData;
    chart.update('none'); // No animation for real-time updates
  }

  // Destroy a chart
  destroyChart(containerId) {
    const chart = this.charts.get(containerId);
    if (chart) {
      chart.destroy();
      this.charts.delete(containerId);
    }
  }

  // Destroy all charts
  destroyAllCharts() {
    this.charts.forEach((chart, id) => {
      chart.destroy();
    });
    this.charts.clear();
  }

  // Create a comprehensive metrics dashboard
  createMetricsDashboard(containerId, metrics) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Container ${containerId} not found`);
      return;
    }

    // Create dashboard layout
    container.innerHTML = `
      <div class="metrics-dashboard">
        <div class="dashboard-header">
          <h3>Cloud Run Metrics Dashboard</h3>
          <div class="dashboard-controls">
            <select class="form-select" id="time-range-${containerId}" onchange="window.app.charts.updateTimeRange('${containerId}', this.value)">
              <option value="1h" selected>Last Hour</option>
              <option value="6h">Last 6 Hours</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
            </select>
            <button class="btn btn-sm btn-secondary" onclick="window.app.charts.refreshDashboard('${containerId}')">
              🔄 Refresh
            </button>
          </div>
        </div>
        
        <div class="dashboard-grid">
          <div class="chart-container">
            <div id="requests-chart-${containerId}" class="chart-wrapper"></div>
          </div>
          
          <div class="chart-container">
            <div id="latency-chart-${containerId}" class="chart-wrapper"></div>
          </div>
          
          <div class="chart-container">
            <div id="resources-chart-${containerId}" class="chart-wrapper"></div>
          </div>
          
          <div class="chart-container">
            <div id="instances-chart-${containerId}" class="chart-wrapper"></div>
          </div>
          
          <div class="chart-container">
            <div id="cost-chart-${containerId}" class="chart-wrapper"></div>
          </div>
        </div>
      </div>
    `;

    // Create individual charts
    this.createRequestMetricsChart(`requests-chart-${containerId}`, metrics);
    this.createLatencyChart(`latency-chart-${containerId}`, metrics);
    this.createResourceChart(`resources-chart-${containerId}`, metrics);
    this.createInstanceChart(`instances-chart-${containerId}`, metrics);
    this.createCostChart(`cost-chart-${containerId}`, metrics);
  }

  // Update time range for dashboard
  updateTimeRange(containerId, timeRange) {
    // In a real implementation, this would fetch new data for the time range
    console.log(`Updating time range to ${timeRange} for ${containerId}`);
    // For now, just refresh with current data
    this.refreshDashboard(containerId);
  }

  // Refresh dashboard with latest data
  refreshDashboard(containerId) {
    // In a real implementation, this would fetch fresh metrics data
    console.log(`Refreshing dashboard ${containerId}`);
    // For now, just log the action
  }
}
