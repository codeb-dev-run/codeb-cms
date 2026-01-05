/**
 * 완전한 메트릭 수집 시스템
 * Prometheus 호환 메트릭 수집기
 */
import { register, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { performance } from 'perf_hooks';
import { getRedisCluster } from '../redis/cluster.server';

// 기본 시스템 메트릭 수집 활성화 (한 번만 실행)
if (!register.getSingleMetric('codeb_cms_process_cpu_user_seconds_total')) {
  collectDefaultMetrics({
    prefix: 'codeb_cms_',
    timeout: 10000,
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
  });
}

// HTTP 요청 메트릭
export const httpRequestsTotal = new Counter({
  name: 'codeb_cms_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

export const httpRequestDuration = new Histogram({
  name: 'codeb_cms_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

// 데이터베이스 메트릭
export const databaseConnectionsActive = new Gauge({
  name: 'codeb_cms_database_connections_active',
  help: 'Number of active database connections',
});

export const databaseConnectionsIdle = new Gauge({
  name: 'codeb_cms_database_connections_idle',
  help: 'Number of idle database connections',
});

export const databaseQueryDuration = new Histogram({
  name: 'codeb_cms_database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['query_type', 'table', 'operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2],
});

export const databaseQueriesTotal = new Counter({
  name: 'codeb_cms_database_queries_total',
  help: 'Total number of database queries',
  labelNames: ['query_type', 'table', 'operation', 'status'],
});

// Redis/캐시 메트릭
export const cacheOperationsTotal = new Counter({
  name: 'codeb_cms_cache_operations_total',
  help: 'Total number of cache operations',
  labelNames: ['operation', 'result', 'key_type'],
});

export const cacheHitRate = new Gauge({
  name: 'codeb_cms_cache_hit_rate',
  help: 'Cache hit rate percentage',
});

export const cacheResponseTime = new Histogram({
  name: 'codeb_cms_cache_response_time_seconds',
  help: 'Cache response time in seconds',
  labelNames: ['operation', 'key_type'],
  buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1],
});

// WebSocket/실시간 메트릭
export const websocketConnectionsActive = new Gauge({
  name: 'codeb_cms_websocket_connections_active',
  help: 'Number of active WebSocket connections',
});

export const websocketMessagesTotal = new Counter({
  name: 'codeb_cms_websocket_messages_total',
  help: 'Total number of WebSocket messages',
  labelNames: ['direction', 'event_type'],
});

// 사용자 세션 메트릭
export const activeUsers = new Gauge({
  name: 'codeb_cms_active_users',
  help: 'Number of active users',
});

export const sessionDuration = new Histogram({
  name: 'codeb_cms_session_duration_seconds',
  help: 'User session duration in seconds',
  buckets: [60, 300, 900, 1800, 3600, 7200, 14400, 28800, 86400],
});

// 콘텐츠 메트릭
export const postsTotal = new Gauge({
  name: 'codeb_cms_posts_total',
  help: 'Total number of posts',
  labelNames: ['status', 'category'],
});

export const commentsTotal = new Gauge({
  name: 'codeb_cms_comments_total',
  help: 'Total number of comments',
});

export const pageViews = new Counter({
  name: 'codeb_cms_page_views_total',
  help: 'Total number of page views',
  labelNames: ['page_type', 'category'],
});

// 큐/작업 메트릭
export const queueSize = new Gauge({
  name: 'codeb_cms_queue_size',
  help: 'Number of jobs in queue',
  labelNames: ['queue_name'],
});

export const queueJobsProcessed = new Counter({
  name: 'codeb_cms_queue_jobs_processed_total',
  help: 'Total number of processed queue jobs',
  labelNames: ['queue_name', 'status'],
});

export const queueJobDuration = new Histogram({
  name: 'codeb_cms_queue_job_duration_seconds',
  help: 'Queue job processing duration in seconds',
  labelNames: ['queue_name', 'job_type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
});

// 파일 업로드 메트릭
export const fileUploadsTotal = new Counter({
  name: 'codeb_cms_file_uploads_total',
  help: 'Total number of file uploads',
  labelNames: ['file_type', 'status'],
});

export const fileUploadSize = new Histogram({
  name: 'codeb_cms_file_upload_size_bytes',
  help: 'File upload size in bytes',
  labelNames: ['file_type'],
  buckets: [1024, 10240, 102400, 1048576, 10485760, 104857600],
});

// 보안 메트릭
export const authAttemptsTotal = new Counter({
  name: 'codeb_cms_auth_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['method', 'result'],
});

export const securityEventsTotal = new Counter({
  name: 'codeb_cms_security_events_total',
  help: 'Total number of security events',
  labelNames: ['event_type', 'severity'],
});

export const rateLimitHits = new Counter({
  name: 'codeb_cms_rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['endpoint', 'limit_type'],
});

/**
 * 메트릭 수집기 클래스
 */
export class MetricsCollector {
  private redis = getRedisCluster();
  private startTime = Date.now();

  /**
   * HTTP 요청 메트릭 기록
   */
  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    duration: number
  ) {
    httpRequestsTotal.inc({ method, route, status_code: statusCode.toString() });
    httpRequestDuration.observe(
      { method, route, status_code: statusCode.toString() },
      duration / 1000
    );
  }

  /**
   * 데이터베이스 쿼리 메트릭 기록
   */
  recordDatabaseQuery(
    queryType: string,
    table: string,
    operation: string,
    duration: number,
    status: 'success' | 'error'
  ) {
    databaseQueriesTotal.inc({ query_type: queryType, table, operation, status });
    databaseQueryDuration.observe(
      { query_type: queryType, table, operation },
      duration / 1000
    );
  }

  /**
   * 캐시 작업 메트릭 기록
   */
  recordCacheOperation(
    operation: 'get' | 'set' | 'del' | 'exists',
    result: 'hit' | 'miss' | 'success' | 'error',
    keyType: string,
    duration: number
  ) {
    cacheOperationsTotal.inc({ operation, result, key_type: keyType });
    cacheResponseTime.observe(
      { operation, key_type: keyType },
      duration / 1000
    );
  }

  /**
   * WebSocket 메트릭 기록
   */
  recordWebSocketMessage(direction: 'in' | 'out', eventType: string) {
    websocketMessagesTotal.inc({ direction, event_type: eventType });
  }

  /**
   * 페이지 조회 메트릭 기록
   */
  recordPageView(pageType: string, category?: string) {
    pageViews.inc({ page_type: pageType, category: category || 'none' });
  }

  /**
   * 파일 업로드 메트릭 기록
   */
  recordFileUpload(fileType: string, size: number, status: 'success' | 'error') {
    fileUploadsTotal.inc({ file_type: fileType, status });
    if (status === 'success') {
      fileUploadSize.observe({ file_type: fileType }, size);
    }
  }

  /**
   * 인증 시도 메트릭 기록
   */
  recordAuthAttempt(method: string, result: 'success' | 'failure') {
    authAttemptsTotal.inc({ method, result });
  }

  /**
   * 보안 이벤트 메트릭 기록
   */
  recordSecurityEvent(eventType: string, severity: 'low' | 'medium' | 'high' | 'critical') {
    securityEventsTotal.inc({ event_type: eventType, severity });
  }

  /**
   * 비즈니스 메트릭 업데이트
   */
  async updateBusinessMetrics() {
    try {
      const { db } = await import('~/lib/db.server');
      
      // 게시글 통계
      const postStats = await db.$queryRaw`
        SELECT 
          is_published::text as status,
          m.name as category,
          COUNT(*) as count
        FROM posts p
        JOIN menus m ON p.menu_id = m.id
        GROUP BY is_published, m.name
      ` as Array<{ status: string; category: string; count: bigint }>;
      
      postStats.forEach(stat => {
        postsTotal.set(
          { status: stat.status, category: stat.category },
          Number(stat.count)
        );
      });

      // 댓글 통계
      const commentCount = await db.$queryRaw`
        SELECT COUNT(*) as count FROM comments
      ` as Array<{ count: bigint }>;
      
      commentsTotal.set(Number(commentCount[0]?.count || 0));

      // 활성 사용자 수
      const activeUserCount = await this.redis.scard('active:users');
      activeUsers.set(activeUserCount);

      // WebSocket 연결 수
      const wsConnections = await this.redis.scard('websocket:connections');
      websocketConnectionsActive.set(wsConnections);

      // 큐 크기 업데이트
      const queueNames = ['notifications', 'emails', 'jobs', 'images'];
      for (const queueName of queueNames) {
        const size = await this.redis.llen(`queue:${queueName}`);
        queueSize.set({ queue_name: queueName }, size);
      }

      // 캐시 히트율 계산
      const cacheStats = await this.redis.info('stats');
      const hits = parseInt(cacheStats.match(/keyspace_hits:(\d+)/)?.[1] || '0');
      const misses = parseInt(cacheStats.match(/keyspace_misses:(\d+)/)?.[1] || '0');
      const total = hits + misses;
      const hitRatePercent = total > 0 ? (hits / total) * 100 : 0;
      cacheHitRate.set(hitRatePercent);

    } catch (error) {
      console.error('Failed to update business metrics:', error);
    }
  }

  /**
   * 시스템 메트릭 업데이트
   */
  async updateSystemMetrics() {
    try {
      const { db } = await import('~/lib/db.server');
      
      // 데이터베이스 연결 통계
      const connectionStats = await db.$queryRaw`
        SELECT 
          count(*) filter (where state = 'active') as active,
          count(*) filter (where state = 'idle') as idle
        FROM pg_stat_activity
        WHERE datname = current_database()
      ` as Array<{ active: bigint; idle: bigint }>;
      
      if (connectionStats[0]) {
        databaseConnectionsActive.set(Number(connectionStats[0].active));
        databaseConnectionsIdle.set(Number(connectionStats[0].idle));
      }

    } catch (error) {
      console.error('Failed to update system metrics:', error);
    }
  }

  /**
   * 모든 메트릭을 JSON 형태로 반환
   */
  async getMetricsJSON() {
    return await register.getMetricsAsJSON();
  }

  /**
   * Prometheus 형식 메트릭 반환
   */
  async getPrometheusMetrics() {
    return await register.metrics();
  }

  /**
   * 메트릭 초기화
   */
  resetMetrics() {
    register.clear();
  }

  /**
   * 시스템 업타임 반환
   */
  getUptime() {
    return (Date.now() - this.startTime) / 1000;
  }
}

// 전역 메트릭 수집기 인스턴스
let metricsCollector: MetricsCollector | null = null;

/**
 * 메트릭 수집기 인스턴스 가져오기
 */
export function getMetricsCollector(): MetricsCollector {
  if (!metricsCollector) {
    metricsCollector = new MetricsCollector();
  }
  return metricsCollector;
}

/**
 * 메트릭 업데이트 스케줄러
 */
export function startMetricsScheduler() {
  const collector = getMetricsCollector();
  
  // 비즈니스 메트릭 업데이트 (30초마다)
  setInterval(() => {
    collector.updateBusinessMetrics().catch(console.error);
  }, 30000);
  
  // 시스템 메트릭 업데이트 (10초마다)
  setInterval(() => {
    collector.updateSystemMetrics().catch(console.error);
  }, 10000);
}

/**
 * Express 미들웨어: HTTP 요청 메트릭 자동 수집
 */
export function createMetricsMiddleware() {
  const collector = getMetricsCollector();
  
  return (req: any, res: any, next: any) => {
    const start = performance.now();
    
    res.on('finish', () => {
      const duration = performance.now() - start;
      const route = req.route?.path || req.path || 'unknown';
      
      collector.recordHttpRequest(
        req.method,
        route,
        res.statusCode,
        duration
      );
    });
    
    next();
  };
}

export default getMetricsCollector;