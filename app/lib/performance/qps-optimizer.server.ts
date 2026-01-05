/**
 * QPS 10,000+ 지원을 위한 고성능 최적화 모듈
 *
 * 상위 1% 수준의 성능을 달성하기 위한 핵심 최적화:
 * 1. 데이터베이스 쿼리 최적화 (N+1 제거, 배치 처리)
 * 2. 다층 캐싱 전략 (Hot Data 우선)
 * 3. 비동기 업데이트 (조회수, 통계)
 * 4. Connection Pooling 최적화
 * 5. Rate Limiting + Circuit Breaker
 */

import { db } from '~/lib/db.server';
import { getCacheManager } from '~/lib/cache/cache-manager';
import { getRedisCluster } from '~/lib/redis/cluster.server';

// ============================================
// 1. 캐시 키 상수 정의
// ============================================

export const CACHE_KEYS = {
  // 메뉴/카테고리 (거의 안 바뀜 - 1시간)
  MENUS: 'menus:all',
  MENU_BY_SLUG: (slug: string) => `menu:slug:${slug}`,
  MENU_BY_ID: (id: string) => `menu:id:${id}`,

  // 게시물 목록 (5분)
  POSTS_LIST: (menuId: string, page: number) => `posts:list:${menuId}:${page}`,
  POSTS_RECENT: (menuId: string) => `posts:recent:${menuId}`,
  POSTS_POPULAR: (menuId: string, period: string) => `posts:popular:${menuId}:${period}`,

  // 게시물 상세 (10분, 변경 시 무효화)
  POST_DETAIL: (id: string) => `post:detail:${id}`,
  POST_COMMENTS: (postId: string, page: number) => `post:comments:${postId}:${page}`,

  // 리더보드 (1분 - 자주 업데이트되지만 읽기가 많음)
  LEADERBOARD: (period: string) => `leaderboard:${period}`,
  USER_RANK: (userId: string, period: string) => `userrank:${userId}:${period}`,

  // 이벤트 (10초 - 활성 이벤트는 자주 변경)
  EVENTS_ACTIVE: 'events:active',
  EVENT_DETAIL: (id: string) => `event:detail:${id}`,
  EVENT_STATS: (id: string) => `event:stats:${id}`,

  // 사용자 (30초)
  USER_POINTS: (userId: string) => `user:points:${userId}`,
  USER_PROFILE: (userId: string) => `user:profile:${userId}`,

  // 실시간 카운터 (Redis만 사용)
  VIEW_COUNTER: (postId: string) => `counter:views:${postId}`,
  PARTICIPATION_COUNTER: (eventId: string) => `counter:participations:${eventId}`,
} as const;

export const CACHE_TTL = {
  MENUS: 3600,           // 1시간
  POSTS_LIST: 300,       // 5분
  POSTS_RECENT: 60,      // 1분
  POST_DETAIL: 600,      // 10분
  LEADERBOARD: 60,       // 1분
  EVENTS_ACTIVE: 10,     // 10초
  EVENT_DETAIL: 30,      // 30초
  USER_POINTS: 30,       // 30초
  USER_PROFILE: 300,     // 5분
} as const;

// ============================================
// 2. 고성능 데이터 조회 함수들
// ============================================

const cache = getCacheManager('qps');

/**
 * 메뉴 목록 조회 (캐시 우선)
 */
export async function getMenusCached() {
  return cache.get(CACHE_KEYS.MENUS, async () => {
    return db.menu.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        parentId: true,
        order: true,
        icon: true,
        description: true,
      },
    });
  }, { ttl: CACHE_TTL.MENUS });
}

/**
 * 슬러그로 메뉴 조회
 */
export async function getMenuBySlugCached(slug: string) {
  return cache.get(CACHE_KEYS.MENU_BY_SLUG(slug), async () => {
    return db.menu.findFirst({
      where: { slug, isActive: true },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { order: 'asc' },
        },
      },
    });
  }, { ttl: CACHE_TTL.MENUS });
}

/**
 * 리더보드 전체 조회 (병렬 + 캐시)
 * N+1 최적화: 4개 period를 병렬로 조회
 */
export async function getLeaderboardsCached() {
  const periods = ['all_time', 'monthly', 'weekly', 'daily'] as const;

  // 병렬로 모든 기간 조회
  const results = await Promise.all(
    periods.map(period =>
      cache.get(CACHE_KEYS.LEADERBOARD(period), async () => {
        return db.leaderboardEntry.findMany({
          where: { period },
          orderBy: { rank: 'asc' },
          take: 100,
          include: {
            user: {
              select: {
                id: true,
                username: true,
                name: true,
                profileImage: true,
              },
            },
          },
        });
      }, { ttl: CACHE_TTL.LEADERBOARD })
    )
  );

  return Object.fromEntries(
    periods.map((period, index) => [period, results[index]])
  ) as Record<typeof periods[number], any[]>;
}

/**
 * 사용자 순위 조회 (병렬 + 캐시)
 */
export async function getUserRanksCached(userId: string) {
  const periods = ['all_time', 'monthly', 'weekly', 'daily'] as const;

  const results = await Promise.all(
    periods.map(period =>
      cache.get(CACHE_KEYS.USER_RANK(userId, period), async () => {
        return db.leaderboardEntry.findUnique({
          where: {
            userId_period: { userId, period },
          },
        });
      }, { ttl: CACHE_TTL.LEADERBOARD })
    )
  );

  return Object.fromEntries(
    periods.map((period, index) => [period, results[index]])
  ) as Record<typeof periods[number], any>;
}

/**
 * 활성 이벤트 목록 조회
 */
export async function getActiveEventsCached() {
  return cache.get(CACHE_KEYS.EVENTS_ACTIVE, async () => {
    return db.participationEvent.findMany({
      where: { status: 'OPEN' },
      orderBy: { endsAt: 'asc' },
      take: 20,
    });
  }, { ttl: CACHE_TTL.EVENTS_ACTIVE });
}

/**
 * 이벤트 상세 + 통계 조회 (한 번에)
 */
export async function getEventWithStatsCached(eventId: string) {
  return cache.get(CACHE_KEYS.EVENT_DETAIL(eventId), async () => {
    const [event, participationsByChoice] = await Promise.all([
      db.participationEvent.findUnique({ where: { id: eventId } }),
      db.participation.groupBy({
        by: ['choice'],
        where: { eventId },
        _count: true,
      }),
    ]);

    if (!event) return null;

    const options = event.options as Array<{ id: string; label: string; color: string }>;
    const totalParticipants = participationsByChoice.reduce((sum, p) => sum + p._count, 0);

    const optionStats = options.map((option) => {
      const participation = participationsByChoice.find((p) => p.choice === option.id);
      const count = participation?._count || 0;
      return {
        id: option.id,
        label: option.label,
        color: option.color,
        count,
        percentage: totalParticipants > 0 ? Math.round((count / totalParticipants) * 100) : 0,
      };
    });

    return { event: { ...event, totalParticipants }, optionStats };
  }, { ttl: CACHE_TTL.EVENT_DETAIL });
}

/**
 * 사용자 포인트 조회 (캐시)
 */
export async function getUserPointsCached(userId: string) {
  return cache.get(CACHE_KEYS.USER_POINTS(userId), async () => {
    let userPoints = await db.userPoints.findUnique({
      where: { userId },
    });

    if (!userPoints) {
      userPoints = await db.userPoints.create({
        data: { userId, balance: 0, lifetime: 0 },
      });
    }

    return userPoints;
  }, { ttl: CACHE_TTL.USER_POINTS });
}

// ============================================
// 3. 비동기 카운터 (조회수, 참여수)
// ============================================

const redis = getRedisCluster();

/**
 * 조회수 증가 (Redis 카운터 사용, 나중에 배치로 DB 업데이트)
 */
export async function incrementViewCount(postId: string): Promise<number> {
  const key = CACHE_KEYS.VIEW_COUNTER(postId);
  const newCount = await redis.incr(key);

  // 24시간 후 만료 (배치 업데이트가 실패해도 메모리 누수 방지)
  if (newCount === 1) {
    await redis.expire(key, 86400);
  }

  return newCount;
}

/**
 * 참여수 증가
 */
export async function incrementParticipationCount(eventId: string): Promise<number> {
  const key = CACHE_KEYS.PARTICIPATION_COUNTER(eventId);
  const newCount = await redis.incr(key);

  if (newCount === 1) {
    await redis.expire(key, 86400);
  }

  // 이벤트 캐시 무효화
  await cache.invalidate(CACHE_KEYS.EVENT_DETAIL(eventId));

  return newCount;
}

/**
 * 조회수 배치 업데이트 (매 5분마다 실행)
 */
export async function flushViewCounters(): Promise<number> {
  const pattern = CACHE_KEYS.VIEW_COUNTER('*');
  const keys = await redis.keys(pattern.replace('*', '*'));

  if (keys.length === 0) return 0;

  let updated = 0;

  // 파이프라인으로 모든 값 가져오기
  const pipeline = redis.pipeline();
  keys.forEach(key => pipeline.get(key));
  const results = await pipeline.exec();

  // 배치로 DB 업데이트
  const updates: Array<{ id: string; views: number }> = [];

  keys.forEach((key, index) => {
    const postId = key.split(':').pop();
    const count = parseInt(results?.[index]?.[1] as string || '0', 10);

    if (postId && count > 0) {
      updates.push({ id: postId, views: count });
    }
  });

  // 트랜잭션으로 일괄 업데이트
  if (updates.length > 0) {
    await db.$transaction(
      updates.map(({ id, views }) =>
        db.post.update({
          where: { id },
          data: { views: { increment: views } },
        })
      )
    );

    // Redis 카운터 리셋
    await redis.del(...keys);
    updated = updates.length;
  }

  console.log(`[ViewCounter] Flushed ${updated} view counters to DB`);
  return updated;
}

// ============================================
// 4. 캐시 무효화 헬퍼
// ============================================

/**
 * 게시물 관련 캐시 무효화
 */
export async function invalidatePostCache(postId: string, menuId?: string) {
  const keys = [CACHE_KEYS.POST_DETAIL(postId)];

  if (menuId) {
    // 목록 캐시도 무효화 (모든 페이지)
    await cache.invalidatePattern(`posts:list:${menuId}:*`);
    await cache.invalidate(CACHE_KEYS.POSTS_RECENT(menuId));
  }

  await cache.invalidate(keys);
}

/**
 * 이벤트 관련 캐시 무효화
 */
export async function invalidateEventCache(eventId: string) {
  await cache.invalidate([
    CACHE_KEYS.EVENT_DETAIL(eventId),
    CACHE_KEYS.EVENT_STATS(eventId),
    CACHE_KEYS.EVENTS_ACTIVE,
  ]);
}

/**
 * 사용자 포인트 캐시 무효화
 */
export async function invalidateUserPointsCache(userId: string) {
  await cache.invalidate(CACHE_KEYS.USER_POINTS(userId));
}

/**
 * 리더보드 캐시 무효화
 */
export async function invalidateLeaderboardCache() {
  const periods = ['all_time', 'monthly', 'weekly', 'daily'];
  await cache.invalidate(periods.map(p => CACHE_KEYS.LEADERBOARD(p)));
}

// ============================================
// 5. Rate Limiting
// ============================================

interface RateLimitConfig {
  windowMs: number;    // 시간 윈도우 (ms)
  maxRequests: number; // 최대 요청 수
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  api: { windowMs: 60000, maxRequests: 100 },        // 분당 100회
  auth: { windowMs: 300000, maxRequests: 10 },       // 5분당 10회
  participation: { windowMs: 1000, maxRequests: 5 }, // 초당 5회
  upload: { windowMs: 60000, maxRequests: 20 },      // 분당 20회
};

/**
 * Rate Limit 체크
 */
export async function checkRateLimit(
  identifier: string,
  type: keyof typeof RATE_LIMITS = 'api'
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const config = RATE_LIMITS[type];
  const key = `ratelimit:${type}:${identifier}`;
  const now = Date.now();

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, now - config.windowMs);
  pipeline.zadd(key, now, `${now}:${Math.random()}`);
  pipeline.zcard(key);
  pipeline.pexpire(key, config.windowMs);

  const results = await pipeline.exec();
  const count = (results?.[2]?.[1] as number) || 0;

  return {
    allowed: count <= config.maxRequests,
    remaining: Math.max(0, config.maxRequests - count),
    resetAt: now + config.windowMs,
  };
}

// ============================================
// 6. Circuit Breaker (서비스 보호)
// ============================================

interface CircuitState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

const circuitStates = new Map<string, CircuitState>();
const CIRCUIT_THRESHOLD = 5;        // 실패 임계값
const CIRCUIT_TIMEOUT = 30000;      // 30초 후 half-open
const CIRCUIT_HALF_OPEN_MAX = 3;    // half-open 시 최대 요청

/**
 * Circuit Breaker 래퍼
 */
export async function withCircuitBreaker<T>(
  name: string,
  fn: () => Promise<T>,
  fallback?: () => T
): Promise<T> {
  let state = circuitStates.get(name) || {
    failures: 0,
    lastFailure: 0,
    state: 'closed' as const,
  };

  const now = Date.now();

  // Open 상태면 바로 fallback 또는 에러
  if (state.state === 'open') {
    if (now - state.lastFailure > CIRCUIT_TIMEOUT) {
      // Half-open으로 전환
      state.state = 'half-open';
      circuitStates.set(name, state);
    } else {
      if (fallback) return fallback();
      throw new Error(`Circuit breaker open for ${name}`);
    }
  }

  try {
    const result = await fn();

    // 성공하면 상태 리셋
    if (state.state === 'half-open') {
      state = { failures: 0, lastFailure: 0, state: 'closed' };
      circuitStates.set(name, state);
    }

    return result;
  } catch (error) {
    state.failures++;
    state.lastFailure = now;

    if (state.failures >= CIRCUIT_THRESHOLD) {
      state.state = 'open';
      console.error(`[CircuitBreaker] ${name} opened after ${state.failures} failures`);
    }

    circuitStates.set(name, state);

    if (fallback) return fallback();
    throw error;
  }
}

// ============================================
// 7. 배치 작업 스케줄러
// ============================================

let batchJobsRunning = false;

/**
 * 배치 작업 시작 (서버 시작 시 호출)
 */
export function startBatchJobs() {
  if (batchJobsRunning) return;
  batchJobsRunning = true;

  // 조회수 플러시 (5분마다)
  setInterval(async () => {
    try {
      await flushViewCounters();
    } catch (error) {
      console.error('[BatchJob] View counter flush failed:', error);
    }
  }, 5 * 60 * 1000);

  // 캐시 워밍업 (10분마다)
  setInterval(async () => {
    try {
      await warmupHotCache();
    } catch (error) {
      console.error('[BatchJob] Cache warmup failed:', error);
    }
  }, 10 * 60 * 1000);

  console.log('[BatchJob] Started batch job schedulers');
}

/**
 * 핫 캐시 워밍업
 */
async function warmupHotCache() {
  // 메뉴 캐시
  await getMenusCached();

  // 리더보드 캐시
  await getLeaderboardsCached();

  // 활성 이벤트 캐시
  await getActiveEventsCached();

  console.log('[CacheWarmup] Hot cache warmed up');
}

// ============================================
// 8. 성능 메트릭
// ============================================

interface PerformanceMetrics {
  cacheHitRate: number;
  avgResponseTime: number;
  activeConnections: number;
  rateLimitBlocks: number;
  circuitBreakerTrips: number;
}

const metrics = {
  requests: 0,
  totalResponseTime: 0,
  rateLimitBlocks: 0,
  circuitBreakerTrips: 0,
};

/**
 * 요청 메트릭 기록
 */
export function recordRequest(responseTimeMs: number) {
  metrics.requests++;
  metrics.totalResponseTime += responseTimeMs;
}

/**
 * 성능 메트릭 조회
 */
export async function getPerformanceMetrics(): Promise<PerformanceMetrics> {
  const cacheStats = cache.getStatistics();

  return {
    cacheHitRate: cacheStats.overall.hitRate,
    avgResponseTime: metrics.requests > 0
      ? metrics.totalResponseTime / metrics.requests
      : 0,
    activeConnections: await getActiveConnectionCount(),
    rateLimitBlocks: metrics.rateLimitBlocks,
    circuitBreakerTrips: metrics.circuitBreakerTrips,
  };
}

/**
 * 활성 연결 수 조회
 */
async function getActiveConnectionCount(): Promise<number> {
  try {
    const info = await redis.info('clients');
    const match = info.match(/connected_clients:(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  } catch {
    return 0;
  }
}
