/**
 * @file system.health.ts
 * @summary MCP `@HealthCheck` — heap usage and process uptime for Studio dashboards.
 * @context Does not call AWS; safe when offline.
 */

import { HealthCheck, HealthCheckInterface, HealthCheckResult } from '@nitrostack/core';

@HealthCheck({ name: 'system', description: 'System resource check', interval: 30 })
export class SystemHealthCheck implements HealthCheckInterface {
  private startTime = Date.now();

  async check(): Promise<HealthCheckResult> {
    const memoryUsage = process.memoryUsage();
    const memoryPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    return {
      status: memoryPercent < 90 ? 'up' : 'degraded',
      message: memoryPercent < 90 ? 'System healthy' : 'High memory usage',
      details: {
        uptime: `${Math.floor((Date.now() - this.startTime) / 1000)}s`,
        pid: process.pid,
        nodeVersion: process.version
      }
    };
  }
}
