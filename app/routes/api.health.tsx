/**
 * 헬스체크 엔드포인트
 * 시스템 상태 및 의존성 체크
 */

import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { db } from '~/lib/db.server';
import { getRedisCluster } from '~/lib/redis/cluster.server';
import os from 'os';
import { performance } from 'perf_hooks';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: CheckResult;
    redis: CheckResult;
    memory: CheckResult;
    disk: CheckResult;
    cpu: CheckResult;
  };
  services?: {
    centrifugo?: CheckResult;
    queue?: CheckResult;
    cache?: CheckResult;
    storage?: CheckResult;
  };
  metrics?: {
    requestsPerMinute: number;
    activeConnections: number;
    queuedJobs: number;
    cacheHitRate: number;
  };
}

interface CheckResult {
  status: 'ok' | 'warning' | 'error';
  message?: string;
  latency?: number;
  details?: any;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const detailed = url.searchParams.get('detailed') === 'true';
  const quick = url.searchParams.get('quick') === 'true';

  // 빠른 체크 (로드 밸런서용)
  if (quick) {
    try {
      // 기본 DB 연결만 체크
      await db.$queryRaw`SELECT 1`;
      return json({ status: 'ok' }, { status: 200 });
    } catch {
      return json({ status: 'error' }, { status: 503 });
    }
  }

  const startTime = performance.now();
  const checks: any = {};
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // 1. 데이터베이스 체크
  checks.database = await checkDatabase();
  if (checks.database.status === 'error') {
    overallStatus = 'unhealthy';
  } else if (checks.database.status === 'warning') {
    overallStatus = 'degraded';
  }

  // 2. Redis 체크
  checks.redis = await checkRedis();
  if (checks.redis.status === 'error') {
    overallStatus = overallStatus === 'healthy' ? 'degraded' : overallStatus;
  }

  // 3. 메모리 체크
  checks.memory = checkMemory();
  if (checks.memory.status === 'error') {
    overallStatus = 'unhealthy';
  } else if (checks.memory.status === 'warning' && overallStatus === 'healthy') {
    overallStatus = 'degraded';
  }

  // 4. 디스크 체크
  checks.disk = await checkDisk();
  if (checks.disk.status === 'warning' && overallStatus === 'healthy') {
    overallStatus = 'degraded';
  }

  // 5. CPU 체크
  checks.cpu = checkCPU();
  if (checks.cpu.status === 'warning' && overallStatus === 'healthy') {
    overallStatus = 'degraded';
  }

  // 상세 정보 (옵션)
  let services = {};
  let metrics = {};

  if (detailed) {
    // 서비스 체크
    services = {
      centrifugo: await checkCentrifugo(),
      queue: await checkQueue(),
      cache: await checkCache(),
      storage: await checkStorage(),
    };

    // 메트릭 수집
    metrics = await collectMetrics();
  }

  const response: HealthCheckResult = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.APP_VERSION || '1.0.0',
    checks,
    ...(detailed && { services, metrics }),
  };

  // 응답 시간 추가
  const responseTime = performance.now() - startTime;
  
  return json(response, {
    status: overallStatus === 'unhealthy' ? 503 : 200,
    headers: {
      'X-Response-Time': `${responseTime.toFixed(2)}ms`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

/**
 * 데이터베이스 체크
 */
async function checkDatabase(): Promise<CheckResult> {
  const start = performance.now();
  
  try {
    // 연결 테스트
    await db.$queryRaw`SELECT 1`;
    
    // 연결 풀 상태 체크
    const poolStatus = await db.$queryRaw<Array<{
      total_connections: bigint;
      idle_connections: bigint;
      active_connections: bigint;
    }>>`
      SELECT
        count(*) as total_connections,
        count(*) filter (where state = 'idle') as idle_connections,
        count(*) filter (where state = 'active') as active_connections
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;

    const latency = performance.now() - start;
    const stats = {
      total_connections: Number(poolStatus[0]?.total_connections ?? 0),
      idle_connections: Number(poolStatus[0]?.idle_connections ?? 0),
      active_connections: Number(poolStatus[0]?.active_connections ?? 0),
    };

    // 연결 풀 경고 체크
    if (stats.active_connections > 80) {
      return {
        status: 'warning',
        message: 'High database connection usage',
        latency,
        details: stats,
      };
    }
    
    return {
      status: 'ok',
      latency,
      details: stats,
    };
  } catch (error) {
    return {
      status: 'error',
      message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      latency: performance.now() - start,
    };
  }
}

/**
 * Redis 체크
 */
async function checkRedis(): Promise<CheckResult> {
  const start = performance.now();

  // Redis가 비활성화된 경우
  if (process.env.REDIS_DISABLED === 'true') {
    return {
      status: 'ok',
      message: 'Redis disabled by configuration',
      latency: 0,
    };
  }

  try {
    const redis = getRedisCluster();

    // Ping 테스트 with timeout
    const pingPromise = redis.ping();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Redis ping timeout')), 5000)
    );

    const pong = await Promise.race([pingPromise, timeoutPromise]);

    if (pong !== 'PONG') {
      throw new Error('Invalid Redis response');
    }

    // Redis 정보 가져오기
    const info = await redis.info('stats');
    const latency = performance.now() - start;

    // 메모리 사용량 체크
    const memoryInfo = await redis.info('memory');
    const usedMemory = parseInt(memoryInfo.match(/used_memory:(\d+)/)?.[1] || '0');
    const maxMemory = parseInt(memoryInfo.match(/maxmemory:(\d+)/)?.[1] || '0');

    if (maxMemory > 0 && usedMemory / maxMemory > 0.9) {
      return {
        status: 'warning',
        message: 'High Redis memory usage',
        latency,
        details: { usedMemory, maxMemory },
      };
    }

    return {
      status: 'ok',
      latency,
    };
  } catch (error) {
    return {
      status: 'warning',
      message: `Redis unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`,
      latency: performance.now() - start,
    };
  }
}

/**
 * 메모리 체크
 */
function checkMemory(): CheckResult {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsagePercent = (usedMemory / totalMemory) * 100;
  
  const processMemory = process.memoryUsage();
  const heapUsagePercent = (processMemory.heapUsed / processMemory.heapTotal) * 100;
  
  const details = {
    system: {
      total: totalMemory,
      free: freeMemory,
      used: usedMemory,
      usagePercent: memoryUsagePercent.toFixed(2),
    },
    process: {
      rss: processMemory.rss,
      heapTotal: processMemory.heapTotal,
      heapUsed: processMemory.heapUsed,
      heapUsagePercent: heapUsagePercent.toFixed(2),
      external: processMemory.external,
    },
  };
  
  if (memoryUsagePercent > 90) {
    return {
      status: 'error',
      message: 'Critical memory usage',
      details,
    };
  } else if (memoryUsagePercent > 75 || heapUsagePercent > 85) {
    return {
      status: 'warning',
      message: 'High memory usage',
      details,
    };
  }
  
  return {
    status: 'ok',
    details,
  };
}

/**
 * 디스크 체크
 */
async function checkDisk(): Promise<CheckResult> {
  try {
    // 디스크 사용량 체크 (Unix 시스템)
    const { execSync } = require('child_process');
    const diskUsage = execSync('df -h /').toString();
    const lines = diskUsage.trim().split('\n');
    const dataLine = lines[1].split(/\s+/);
    const usagePercent = parseInt(dataLine[4].replace('%', ''));
    
    const details = {
      filesystem: dataLine[0],
      size: dataLine[1],
      used: dataLine[2],
      available: dataLine[3],
      usagePercent,
      mountPoint: dataLine[5],
    };
    
    if (usagePercent > 90) {
      return {
        status: 'error',
        message: 'Critical disk usage',
        details,
      };
    } else if (usagePercent > 75) {
      return {
        status: 'warning',
        message: 'High disk usage',
        details,
      };
    }
    
    return {
      status: 'ok',
      details,
    };
  } catch (error) {
    return {
      status: 'warning',
      message: 'Unable to check disk usage',
    };
  }
}

/**
 * CPU 체크
 */
function checkCPU(): CheckResult {
  const cpus = os.cpus();
  const loadAverage = os.loadavg();
  const cpuCount = cpus.length;
  
  // 1분 평균 로드를 CPU 수로 나눔
  const loadPerCpu = loadAverage[0] / cpuCount;
  
  const details = {
    cpuCount,
    loadAverage: {
      '1min': loadAverage[0],
      '5min': loadAverage[1],
      '15min': loadAverage[2],
    },
    loadPerCpu: loadPerCpu.toFixed(2),
    model: cpus[0].model,
    speed: cpus[0].speed,
  };
  
  if (loadPerCpu > 2) {
    return {
      status: 'error',
      message: 'Critical CPU load',
      details,
    };
  } else if (loadPerCpu > 1) {
    return {
      status: 'warning',
      message: 'High CPU load',
      details,
    };
  }
  
  return {
    status: 'ok',
    details,
  };
}

/**
 * Centrifugo 체크
 */
async function checkCentrifugo(): Promise<CheckResult> {
  const start = performance.now();

  try {
    // Centrifugo 서버 정보 조회
    const { centrifugo } = await import('~/lib/centrifugo/client.server');
    const info = await centrifugo.info();

    const totalClients = info.nodes.reduce((sum, node) => sum + node.num_clients, 0);
    const totalUsers = info.nodes.reduce((sum, node) => sum + node.num_users, 0);
    const totalChannels = info.nodes.reduce((sum, node) => sum + node.num_channels, 0);

    return {
      status: 'ok',
      latency: performance.now() - start,
      details: {
        nodes: info.nodes.length,
        connectedClients: totalClients,
        connectedUsers: totalUsers,
        activeChannels: totalChannels,
      },
    };
  } catch (error) {
    return {
      status: 'warning',
      message: `Unable to check Centrifugo status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      latency: performance.now() - start,
    };
  }
}

/**
 * 큐 체크
 */
async function checkQueue(): Promise<CheckResult> {
  try {
    const redis = getRedisCluster();
    
    // 큐 크기 체크
    const notificationQueue = await redis.llen('queue:notifications');
    const emailQueue = await redis.llen('queue:emails');
    const jobQueue = await redis.llen('queue:jobs');
    
    const totalQueued = notificationQueue + emailQueue + jobQueue;
    
    const details = {
      notifications: notificationQueue,
      emails: emailQueue,
      jobs: jobQueue,
      total: totalQueued,
    };
    
    if (totalQueued > 10000) {
      return {
        status: 'warning',
        message: 'High queue backlog',
        details,
      };
    }
    
    return {
      status: 'ok',
      details,
    };
  } catch (error) {
    return {
      status: 'warning',
      message: 'Unable to check queue status',
    };
  }
}

/**
 * 캐시 체크
 */
async function checkCache(): Promise<CheckResult> {
  try {
    const redis = getRedisCluster();
    
    // 캐시 통계
    const stats = await redis.info('stats');
    const keyspaceHits = parseInt(stats.match(/keyspace_hits:(\d+)/)?.[1] || '0');
    const keyspaceMisses = parseInt(stats.match(/keyspace_misses:(\d+)/)?.[1] || '0');
    const totalRequests = keyspaceHits + keyspaceMisses;
    const hitRate = totalRequests > 0 ? (keyspaceHits / totalRequests) * 100 : 0;
    
    const details = {
      hits: keyspaceHits,
      misses: keyspaceMisses,
      hitRate: hitRate.toFixed(2) + '%',
    };
    
    if (hitRate < 50 && totalRequests > 1000) {
      return {
        status: 'warning',
        message: 'Low cache hit rate',
        details,
      };
    }
    
    return {
      status: 'ok',
      details,
    };
  } catch (error) {
    return {
      status: 'warning',
      message: 'Unable to check cache status',
    };
  }
}

/**
 * 스토리지 체크
 */
async function checkStorage(): Promise<CheckResult> {
  try {
    // 업로드 디렉토리 체크
    const fs = require('fs').promises;
    const uploadDir = './public/uploads';
    
    const stats = await fs.stat(uploadDir);
    
    if (!stats.isDirectory()) {
      throw new Error('Upload directory not found');
    }
    
    // 디렉토리 쓰기 권한 체크
    const testFile = `${uploadDir}/.healthcheck`;
    await fs.writeFile(testFile, 'test');
    await fs.unlink(testFile);
    
    return {
      status: 'ok',
      message: 'Storage is accessible',
    };
  } catch (error) {
    return {
      status: 'error',
      message: `Storage check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * 메트릭 수집
 */
async function collectMetrics(): Promise<any> {
  try {
    const { getMetricsCollector } = await import('~/lib/monitoring/metrics-collector.server');
    const collector = getMetricsCollector();
    const metricsJson = await collector.getMetricsJSON();
    
    // 주요 메트릭 추출
    const httpRequestsMetric = metricsJson.find(
      (m: any) => m.name === 'codeb_cms_http_requests_total'
    );
    const requestsPerMinute = httpRequestsMetric?.values?.reduce(
      (sum: number, v: any) => sum + v.value, 0
    ) || 0;
    
    const activeConnectionsMetric = metricsJson.find(
      (m: any) => m.name === 'codeb_cms_websocket_connections_active'
    );
    const activeConnections = activeConnectionsMetric?.values?.[0]?.value || 0;
    
    const queueMetrics = metricsJson.filter(
      (m: any) => m.name === 'codeb_cms_queue_size'
    );
    const queuedJobs = queueMetrics.reduce(
      (sum: number, metric: any) => sum + (metric.values?.[0]?.value || 0), 0
    );
    
    const cacheHitRateMetric = metricsJson.find(
      (m: any) => m.name === 'codeb_cms_cache_hit_rate'
    );
    const cacheHitRate = cacheHitRateMetric?.values?.[0]?.value || 0;
    
    return {
      requestsPerMinute: Math.round(requestsPerMinute),
      activeConnections: Math.round(activeConnections),
      queuedJobs: Math.round(queuedJobs),
      cacheHitRate: parseFloat(cacheHitRate.toFixed(2)),
      uptime: collector.getUptime(),
    };
  } catch (error) {
    console.error('Failed to collect metrics:', error);
    return {
      requestsPerMinute: 0,
      activeConnections: 0,
      queuedJobs: 0,
      cacheHitRate: 0,
      uptime: process.uptime(),
    };
  }
}