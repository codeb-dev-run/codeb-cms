/**
 * 성능 모니터링 시스템
 *
 * QPS 10,000+ 환경을 위한 실시간 메트릭 수집:
 * 1. 요청/응답 메트릭
 * 2. 데이터베이스 성능
 * 3. 캐시 히트율
 * 4. Rate Limit 현황
 * 5. 실시간 연결 상태
 */

import { getRedisCluster } from '~/lib/redis/cluster.server';

const redis = getRedisCluster();

// ============================================
// 1. 메트릭 키 정의
// ============================================

const METRIC_KEYS = {
  // 요청 카운터 (분 단위)
  REQUEST_COUNT: (minute: string) => `metrics:requests:${minute}`,
  REQUEST_LATENCY: (minute: string) => `metrics:latency:${minute}`,

  // 에러 카운터
  ERROR_COUNT: (minute: string) => `metrics:errors:${minute}`,
  ERROR_BY_TYPE: (type: string) => `metrics:errors:type:${type}`,

  // 캐시 메트릭
  CACHE_HIT: 'metrics:cache:hits',
  CACHE_MISS: 'metrics:cache:misses',

  // DB 메트릭
  DB_QUERY_COUNT: (minute: string) => `metrics:db:queries:${minute}`,
  DB_SLOW_QUERY: 'metrics:db:slow',

  // Rate Limit
  RATE_LIMIT_BLOCKED: (minute: string) => `metrics:ratelimit:blocked:${minute}`,

  // 실시간 연결
  ACTIVE_CONNECTIONS: 'metrics:connections:active',

  // 경로별 메트릭
  ENDPOINT_STATS: (path: string) => `metrics:endpoint:${path}`,
};

// ============================================
// 2. 메트릭 수집
// ============================================

/**
 * 현재 분 키 생성
 */
function getCurrentMinute(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
}

/**
 * 요청 기록
 */
export async function recordRequest(
  path: string,
  method: string,
  statusCode: number,
  latencyMs: number
): Promise<void> {
  const minute = getCurrentMinute();

  try {
    const pipeline = redis.pipeline();

    // 전체 요청 수
    pipeline.incr(METRIC_KEYS.REQUEST_COUNT(minute));
    pipeline.expire(METRIC_KEYS.REQUEST_COUNT(minute), 3600); // 1시간 보관

    // 레이턴시 기록 (평균 계산용)
    pipeline.lpush(METRIC_KEYS.REQUEST_LATENCY(minute), latencyMs.toString());
    pipeline.ltrim(METRIC_KEYS.REQUEST_LATENCY(minute), 0, 999); // 최대 1000개
    pipeline.expire(METRIC_KEYS.REQUEST_LATENCY(minute), 3600);

    // 에러 카운트
    if (statusCode >= 400) {
      pipeline.incr(METRIC_KEYS.ERROR_COUNT(minute));
      pipeline.expire(METRIC_KEYS.ERROR_COUNT(minute), 3600);

      const errorType = statusCode >= 500 ? '5xx' : '4xx';
      pipeline.incr(METRIC_KEYS.ERROR_BY_TYPE(errorType));
    }

    // 경로별 통계 (상위 50개 경로만)
    const normalizedPath = normalizePath(path);
    pipeline.hincrby(METRIC_KEYS.ENDPOINT_STATS(minute), `${method}:${normalizedPath}:count`, 1);
    pipeline.hincrby(METRIC_KEYS.ENDPOINT_STATS(minute), `${method}:${normalizedPath}:latency`, Math.round(latencyMs));
    pipeline.expire(METRIC_KEYS.ENDPOINT_STATS(minute), 3600);

    await pipeline.exec();
  } catch (error) {
    console.error('[Monitor] Failed to record request:', error);
  }
}

/**
 * 경로 정규화 (동적 세그먼트 제거)
 */
function normalizePath(path: string): string {
  return path
    .replace(/\/[a-z0-9]{24,}/gi, '/:id') // CUID/UUID
    .replace(/\/\d+/g, '/:num') // 숫자
    .replace(/\?.*/g, ''); // 쿼리 스트링 제거
}

/**
 * 캐시 히트 기록
 */
export async function recordCacheHit(): Promise<void> {
  try {
    await redis.incr(METRIC_KEYS.CACHE_HIT);
  } catch {
    // 무시
  }
}

/**
 * 캐시 미스 기록
 */
export async function recordCacheMiss(): Promise<void> {
  try {
    await redis.incr(METRIC_KEYS.CACHE_MISS);
  } catch {
    // 무시
  }
}

/**
 * DB 쿼리 기록
 */
export async function recordDbQuery(durationMs: number): Promise<void> {
  const minute = getCurrentMinute();

  try {
    const pipeline = redis.pipeline();
    pipeline.incr(METRIC_KEYS.DB_QUERY_COUNT(minute));
    pipeline.expire(METRIC_KEYS.DB_QUERY_COUNT(minute), 3600);

    // 슬로우 쿼리 (100ms 이상)
    if (durationMs > 100) {
      pipeline.incr(METRIC_KEYS.DB_SLOW_QUERY);
    }

    await pipeline.exec();
  } catch {
    // 무시
  }
}

/**
 * Rate Limit 차단 기록
 */
export async function recordRateLimitBlocked(): Promise<void> {
  const minute = getCurrentMinute();

  try {
    await redis.incr(METRIC_KEYS.RATE_LIMIT_BLOCKED(minute));
    await redis.expire(METRIC_KEYS.RATE_LIMIT_BLOCKED(minute), 3600);
  } catch {
    // 무시
  }
}

/**
 * 활성 연결 수 업데이트
 */
export async function updateActiveConnections(count: number): Promise<void> {
  try {
    await redis.set(METRIC_KEYS.ACTIVE_CONNECTIONS, count.toString());
  } catch {
    // 무시
  }
}

// ============================================
// 3. 메트릭 조회
// ============================================

export interface PerformanceMetrics {
  timestamp: Date;
  requests: {
    total: number;
    perMinute: number;
    errorRate: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
  };
  cache: {
    hitRate: number;
    hits: number;
    misses: number;
  };
  database: {
    queriesPerMinute: number;
    slowQueries: number;
  };
  rateLimit: {
    blockedPerMinute: number;
  };
  realtime: {
    activeConnections: number;
  };
  topEndpoints: Array<{
    path: string;
    method: string;
    count: number;
    avgLatencyMs: number;
  }>;
}

/**
 * 현재 성능 메트릭 조회
 */
export async function getPerformanceMetrics(): Promise<PerformanceMetrics> {
  const minute = getCurrentMinute();
  const prevMinute = getPreviousMinute();

  try {
    const [
      requestCount,
      prevRequestCount,
      errorCount,
      latencies,
      cacheHits,
      cacheMisses,
      dbQueries,
      slowQueries,
      rateLimitBlocked,
      activeConnections,
      endpointStats,
    ] = await Promise.all([
      redis.get(METRIC_KEYS.REQUEST_COUNT(minute)),
      redis.get(METRIC_KEYS.REQUEST_COUNT(prevMinute)),
      redis.get(METRIC_KEYS.ERROR_COUNT(minute)),
      redis.lrange(METRIC_KEYS.REQUEST_LATENCY(minute), 0, -1),
      redis.get(METRIC_KEYS.CACHE_HIT),
      redis.get(METRIC_KEYS.CACHE_MISS),
      redis.get(METRIC_KEYS.DB_QUERY_COUNT(minute)),
      redis.get(METRIC_KEYS.DB_SLOW_QUERY),
      redis.get(METRIC_KEYS.RATE_LIMIT_BLOCKED(minute)),
      redis.get(METRIC_KEYS.ACTIVE_CONNECTIONS),
      redis.hgetall(METRIC_KEYS.ENDPOINT_STATS(minute)),
    ]);

    // 레이턴시 계산
    const latencyNumbers = latencies.map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
    const avgLatency = latencyNumbers.length > 0
      ? latencyNumbers.reduce((a, b) => a + b, 0) / latencyNumbers.length
      : 0;
    const p95Latency = latencyNumbers.length > 0
      ? latencyNumbers[Math.floor(latencyNumbers.length * 0.95)] || 0
      : 0;
    const p99Latency = latencyNumbers.length > 0
      ? latencyNumbers[Math.floor(latencyNumbers.length * 0.99)] || 0
      : 0;

    // 캐시 히트율
    const hits = parseInt(cacheHits || '0', 10);
    const misses = parseInt(cacheMisses || '0', 10);
    const cacheTotal = hits + misses;
    const hitRate = cacheTotal > 0 ? (hits / cacheTotal) * 100 : 0;

    // 에러율
    const totalRequests = parseInt(requestCount || '0', 10);
    const errors = parseInt(errorCount || '0', 10);
    const errorRate = totalRequests > 0 ? (errors / totalRequests) * 100 : 0;

    // 엔드포인트별 통계 파싱
    const topEndpoints = parseEndpointStats(endpointStats || {});

    return {
      timestamp: new Date(),
      requests: {
        total: totalRequests,
        perMinute: parseInt(prevRequestCount || '0', 10), // 이전 분 완전한 데이터
        errorRate: Math.round(errorRate * 100) / 100,
        avgLatencyMs: Math.round(avgLatency * 100) / 100,
        p95LatencyMs: p95Latency,
        p99LatencyMs: p99Latency,
      },
      cache: {
        hitRate: Math.round(hitRate * 100) / 100,
        hits,
        misses,
      },
      database: {
        queriesPerMinute: parseInt(dbQueries || '0', 10),
        slowQueries: parseInt(slowQueries || '0', 10),
      },
      rateLimit: {
        blockedPerMinute: parseInt(rateLimitBlocked || '0', 10),
      },
      realtime: {
        activeConnections: parseInt(activeConnections || '0', 10),
      },
      topEndpoints,
    };
  } catch (error) {
    console.error('[Monitor] Failed to get metrics:', error);
    return getEmptyMetrics();
  }
}

/**
 * 이전 분 키 생성
 */
function getPreviousMinute(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - 1);
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
}

/**
 * 엔드포인트 통계 파싱
 */
function parseEndpointStats(
  stats: Record<string, string>
): Array<{ path: string; method: string; count: number; avgLatencyMs: number }> {
  const endpoints = new Map<string, { count: number; totalLatency: number }>();

  for (const [key, value] of Object.entries(stats)) {
    const parts = key.split(':');
    if (parts.length < 3) continue;

    const method = parts[0];
    const path = parts[1];
    const metric = parts[2];
    const endpointKey = `${method}:${path}`;

    if (!endpoints.has(endpointKey)) {
      endpoints.set(endpointKey, { count: 0, totalLatency: 0 });
    }

    const endpoint = endpoints.get(endpointKey)!;
    if (metric === 'count') {
      endpoint.count = parseInt(value, 10);
    } else if (metric === 'latency') {
      endpoint.totalLatency = parseInt(value, 10);
    }
  }

  return Array.from(endpoints.entries())
    .map(([key, data]) => {
      const [method, path] = key.split(':');
      return {
        method,
        path,
        count: data.count,
        avgLatencyMs: data.count > 0 ? Math.round(data.totalLatency / data.count) : 0,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Top 10
}

/**
 * 빈 메트릭 반환
 */
function getEmptyMetrics(): PerformanceMetrics {
  return {
    timestamp: new Date(),
    requests: {
      total: 0,
      perMinute: 0,
      errorRate: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
    },
    cache: {
      hitRate: 0,
      hits: 0,
      misses: 0,
    },
    database: {
      queriesPerMinute: 0,
      slowQueries: 0,
    },
    rateLimit: {
      blockedPerMinute: 0,
    },
    realtime: {
      activeConnections: 0,
    },
    topEndpoints: [],
  };
}

// ============================================
// 4. 시계열 데이터 조회
// ============================================

export interface TimeSeriesData {
  labels: string[];
  requests: number[];
  latencies: number[];
  errors: number[];
}

/**
 * 최근 N분간 시계열 데이터
 */
export async function getTimeSeriesData(minutes: number = 60): Promise<TimeSeriesData> {
  const keys: string[] = [];
  const now = new Date();

  for (let i = minutes - 1; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60000);
    const minute = `${time.getFullYear()}${String(time.getMonth() + 1).padStart(2, '0')}${String(time.getDate()).padStart(2, '0')}${String(time.getHours()).padStart(2, '0')}${String(time.getMinutes()).padStart(2, '0')}`;
    keys.push(minute);
  }

  try {
    const pipeline = redis.pipeline();

    for (const minute of keys) {
      pipeline.get(METRIC_KEYS.REQUEST_COUNT(minute));
      pipeline.lrange(METRIC_KEYS.REQUEST_LATENCY(minute), 0, 99);
      pipeline.get(METRIC_KEYS.ERROR_COUNT(minute));
    }

    const results = await pipeline.exec();
    if (!results) return getEmptyTimeSeries(keys);

    const labels: string[] = [];
    const requests: number[] = [];
    const latencies: number[] = [];
    const errors: number[] = [];

    for (let i = 0; i < keys.length; i++) {
      const minute = keys[i];
      labels.push(`${minute.slice(8, 10)}:${minute.slice(10, 12)}`);

      const reqResult = results[i * 3];
      const latResult = results[i * 3 + 1];
      const errResult = results[i * 3 + 2];

      requests.push(parseInt((reqResult?.[1] as string) || '0', 10));
      errors.push(parseInt((errResult?.[1] as string) || '0', 10));

      // 평균 레이턴시 계산
      const lats = (latResult?.[1] as string[] || []).map(Number).filter(n => !isNaN(n));
      const avgLat = lats.length > 0 ? lats.reduce((a, b) => a + b, 0) / lats.length : 0;
      latencies.push(Math.round(avgLat));
    }

    return { labels, requests, latencies, errors };
  } catch (error) {
    console.error('[Monitor] Failed to get time series:', error);
    return getEmptyTimeSeries(keys);
  }
}

/**
 * 빈 시계열 데이터
 */
function getEmptyTimeSeries(keys: string[]): TimeSeriesData {
  return {
    labels: keys.map(k => `${k.slice(8, 10)}:${k.slice(10, 12)}`),
    requests: keys.map(() => 0),
    latencies: keys.map(() => 0),
    errors: keys.map(() => 0),
  };
}

// ============================================
// 5. 헬스 체크
// ============================================

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    database: boolean;
    redis: boolean;
    centrifugo: boolean;
  };
  warnings: string[];
}

/**
 * 시스템 헬스 체크
 */
export async function checkSystemHealth(): Promise<SystemHealth> {
  const warnings: string[] = [];
  const checks = {
    database: false,
    redis: false,
    centrifugo: false,
  };

  // Redis 체크
  try {
    await redis.ping();
    checks.redis = true;
  } catch {
    warnings.push('Redis 연결 실패');
  }

  // DB 체크 (간접적으로)
  try {
    const { db } = await import('~/lib/db.server');
    await db.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch {
    warnings.push('데이터베이스 연결 실패');
  }

  // Centrifugo 체크
  try {
    const { centrifugo } = await import('~/lib/centrifugo/client.server');
    await centrifugo.info();
    checks.centrifugo = true;
  } catch {
    warnings.push('Centrifugo 연결 실패');
  }

  // 상태 판정
  const healthyCount = Object.values(checks).filter(Boolean).length;
  let status: SystemHealth['status'] = 'healthy';

  if (healthyCount === 0) {
    status = 'unhealthy';
  } else if (healthyCount < 3) {
    status = 'degraded';
  }

  return { status, checks, warnings };
}

// ============================================
// 6. 알림 임계값
// ============================================

export const ALERT_THRESHOLDS = {
  errorRate: 5, // 5% 이상
  avgLatency: 500, // 500ms 이상
  p99Latency: 2000, // 2초 이상
  cacheHitRate: 80, // 80% 미만
  rateLimitBlocked: 100, // 분당 100회 이상
};

/**
 * 알림 필요 여부 확인
 */
export function checkAlerts(metrics: PerformanceMetrics): string[] {
  const alerts: string[] = [];

  if (metrics.requests.errorRate > ALERT_THRESHOLDS.errorRate) {
    alerts.push(`에러율 높음: ${metrics.requests.errorRate}% (임계값: ${ALERT_THRESHOLDS.errorRate}%)`);
  }

  if (metrics.requests.avgLatencyMs > ALERT_THRESHOLDS.avgLatency) {
    alerts.push(`평균 응답시간 느림: ${metrics.requests.avgLatencyMs}ms (임계값: ${ALERT_THRESHOLDS.avgLatency}ms)`);
  }

  if (metrics.requests.p99LatencyMs > ALERT_THRESHOLDS.p99Latency) {
    alerts.push(`P99 응답시간 느림: ${metrics.requests.p99LatencyMs}ms (임계값: ${ALERT_THRESHOLDS.p99Latency}ms)`);
  }

  if (metrics.cache.hitRate < ALERT_THRESHOLDS.cacheHitRate && metrics.cache.hits + metrics.cache.misses > 100) {
    alerts.push(`캐시 히트율 낮음: ${metrics.cache.hitRate}% (임계값: ${ALERT_THRESHOLDS.cacheHitRate}%)`);
  }

  if (metrics.rateLimit.blockedPerMinute > ALERT_THRESHOLDS.rateLimitBlocked) {
    alerts.push(`Rate Limit 차단 많음: ${metrics.rateLimit.blockedPerMinute}회/분 (임계값: ${ALERT_THRESHOLDS.rateLimitBlocked}회)`);
  }

  return alerts;
}
