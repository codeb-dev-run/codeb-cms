/**
 * 고성능 Rate Limiting 미들웨어
 *
 * QPS 10,000 지원:
 * - Sliding Window 알고리즘
 * - Redis 기반 분산 처리
 * - IP + User 기반 제한
 * - 동적 한도 조정
 */

import { getRedisCluster } from '~/lib/redis/cluster.server';

// ============================================
// 1. Rate Limit 설정
// ============================================

export interface RateLimitConfig {
  windowMs: number;       // 시간 윈도우 (ms)
  maxRequests: number;    // 최대 요청 수
  keyPrefix?: string;     // Redis 키 접두사
  skipIf?: (request: Request) => boolean; // 스킵 조건
  onLimit?: (key: string, count: number) => void; // 제한 시 콜백
}

// 사전 정의된 Rate Limit 규칙
export const RATE_LIMITS = {
  // 일반 API: 분당 100회
  api: {
    windowMs: 60 * 1000,
    maxRequests: 100,
    keyPrefix: 'rl:api',
  },

  // 인증: 5분당 10회 (브루트포스 방지)
  auth: {
    windowMs: 5 * 60 * 1000,
    maxRequests: 10,
    keyPrefix: 'rl:auth',
  },

  // 회원가입: 시간당 5회
  register: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 5,
    keyPrefix: 'rl:register',
  },

  // 이벤트 참여: 초당 5회
  participation: {
    windowMs: 1000,
    maxRequests: 5,
    keyPrefix: 'rl:participation',
  },

  // 게시물 작성: 분당 10회
  post: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    keyPrefix: 'rl:post',
  },

  // 댓글: 분당 30회
  comment: {
    windowMs: 60 * 1000,
    maxRequests: 30,
    keyPrefix: 'rl:comment',
  },

  // 좋아요: 초당 10회
  like: {
    windowMs: 1000,
    maxRequests: 10,
    keyPrefix: 'rl:like',
  },

  // 파일 업로드: 분당 20회
  upload: {
    windowMs: 60 * 1000,
    maxRequests: 20,
    keyPrefix: 'rl:upload',
  },

  // 검색: 분당 60회
  search: {
    windowMs: 60 * 1000,
    maxRequests: 60,
    keyPrefix: 'rl:search',
  },

  // WebSocket 연결: 분당 10회
  websocket: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    keyPrefix: 'rl:ws',
  },
} as const;

// ============================================
// 2. Rate Limit 결과
// ============================================

export interface RateLimitResult {
  allowed: boolean;          // 요청 허용 여부
  remaining: number;         // 남은 요청 수
  total: number;             // 총 허용 요청 수
  resetAt: number;           // 리셋 시간 (Unix timestamp)
  retryAfter?: number;       // 재시도 가능 시간 (초)
}

// ============================================
// 3. Sliding Window Rate Limiter
// ============================================

const redis = getRedisCluster();

/**
 * Sliding Window 알고리즘으로 Rate Limit 체크
 *
 * 장점:
 * - Fixed Window보다 정확한 제한
 * - 버스트 트래픽 방지
 * - Redis 원자적 연산으로 분산 처리
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const { windowMs, maxRequests, keyPrefix = 'rl' } = config;
  const key = `${keyPrefix}:${identifier}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  // Lua 스크립트로 원자적 처리
  const script = `
    -- 만료된 항목 제거
    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])

    -- 현재 카운트 조회
    local count = redis.call('ZCARD', KEYS[1])

    -- 한도 미만이면 추가
    if count < tonumber(ARGV[3]) then
      redis.call('ZADD', KEYS[1], ARGV[2], ARGV[2] .. ':' .. math.random())
      redis.call('PEXPIRE', KEYS[1], ARGV[4])
      return {1, count + 1}
    else
      return {0, count}
    end
  `;

  try {
    const result = await redis.eval(
      script,
      1,
      key,
      windowStart.toString(),
      now.toString(),
      maxRequests.toString(),
      windowMs.toString()
    ) as [number, number];

    const [allowed, count] = result;
    const remaining = Math.max(0, maxRequests - count);
    const resetAt = now + windowMs;

    // 제한된 경우 콜백 호출
    if (!allowed && config.onLimit) {
      config.onLimit(identifier, count);
    }

    return {
      allowed: allowed === 1,
      remaining,
      total: maxRequests,
      resetAt,
      retryAfter: allowed ? undefined : Math.ceil(windowMs / 1000),
    };
  } catch (error) {
    console.error('[RateLimit] Redis error:', error);
    // Redis 에러 시 허용 (fail-open)
    return {
      allowed: true,
      remaining: maxRequests,
      total: maxRequests,
      resetAt: now + windowMs,
    };
  }
}

// ============================================
// 4. IP 추출 유틸리티
// ============================================

/**
 * 요청에서 클라이언트 IP 추출
 */
export function getClientIP(request: Request): string {
  // 프록시/로드밸런서 헤더 확인
  const headers = [
    'cf-connecting-ip',     // Cloudflare
    'x-real-ip',            // Nginx
    'x-forwarded-for',      // 일반 프록시
    'x-client-ip',
    'true-client-ip',       // Akamai
  ];

  for (const header of headers) {
    const value = request.headers.get(header);
    if (value) {
      // X-Forwarded-For는 쉼표로 구분된 목록일 수 있음
      const ip = value.split(',')[0].trim();
      if (isValidIP(ip)) {
        return ip;
      }
    }
  }

  // 기본값
  return '127.0.0.1';
}

function isValidIP(ip: string): boolean {
  // IPv4
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

// ============================================
// 5. Rate Limit 미들웨어
// ============================================

export interface RateLimitMiddlewareOptions {
  type: keyof typeof RATE_LIMITS;
  getUserId?: (request: Request) => string | null;
  getCustomKey?: (request: Request) => string;
  skip?: (request: Request) => boolean;
}

/**
 * Rate Limit 미들웨어 생성
 */
export function createRateLimiter(options: RateLimitMiddlewareOptions) {
  const config = RATE_LIMITS[options.type];

  return async (request: Request): Promise<RateLimitResult & { key: string }> => {
    // 스킵 조건 확인
    if (options.skip?.(request)) {
      return {
        allowed: true,
        remaining: config.maxRequests,
        total: config.maxRequests,
        resetAt: Date.now() + config.windowMs,
        key: 'skipped',
      };
    }

    // 키 생성 (사용자 ID 또는 IP)
    let key: string;
    if (options.getCustomKey) {
      key = options.getCustomKey(request);
    } else {
      const userId = options.getUserId?.(request);
      key = userId || getClientIP(request);
    }

    const result = await checkRateLimit(key, config);
    return { ...result, key };
  };
}

// ============================================
// 6. Response 헤더 설정
// ============================================

/**
 * Rate Limit 헤더를 Response에 추가
 */
export function setRateLimitHeaders(
  headers: Headers,
  result: RateLimitResult
): void {
  headers.set('X-RateLimit-Limit', result.total.toString());
  headers.set('X-RateLimit-Remaining', result.remaining.toString());
  headers.set('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000).toString());

  if (!result.allowed && result.retryAfter) {
    headers.set('Retry-After', result.retryAfter.toString());
  }
}

/**
 * Rate Limit 초과 시 응답 생성
 */
export function createRateLimitResponse(result: RateLimitResult): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
  });
  setRateLimitHeaders(headers, result);

  return new Response(
    JSON.stringify({
      error: 'Too Many Requests',
      message: '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
      retryAfter: result.retryAfter,
    }),
    {
      status: 429,
      headers,
    }
  );
}

// ============================================
// 7. 사용 예시 헬퍼
// ============================================

/**
 * 간편한 Rate Limit 체크
 */
export async function rateLimit(
  request: Request,
  type: keyof typeof RATE_LIMITS,
  userId?: string | null
): Promise<Response | null> {
  const config = RATE_LIMITS[type];
  const key = userId || getClientIP(request);

  const result = await checkRateLimit(key, config);

  if (!result.allowed) {
    return createRateLimitResponse(result);
  }

  return null;
}

// ============================================
// 8. 통계 및 모니터링
// ============================================

interface RateLimitStats {
  totalChecks: number;
  blocked: number;
  blockRate: number;
  topBlockedIPs: Array<{ ip: string; count: number }>;
}

// 메모리 통계 (프로세스 내)
const stats = {
  totalChecks: 0,
  blocked: 0,
  blockedIPs: new Map<string, number>(),
};

/**
 * Rate Limit 통계 기록
 */
export function recordRateLimitStat(
  key: string,
  allowed: boolean
): void {
  stats.totalChecks++;
  if (!allowed) {
    stats.blocked++;
    stats.blockedIPs.set(key, (stats.blockedIPs.get(key) || 0) + 1);
  }
}

/**
 * Rate Limit 통계 조회
 */
export function getRateLimitStats(): RateLimitStats {
  const topBlockedIPs = Array.from(stats.blockedIPs.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ip, count]) => ({ ip, count }));

  return {
    totalChecks: stats.totalChecks,
    blocked: stats.blocked,
    blockRate: stats.totalChecks > 0
      ? stats.blocked / stats.totalChecks
      : 0,
    topBlockedIPs,
  };
}

/**
 * 통계 리셋
 */
export function resetRateLimitStats(): void {
  stats.totalChecks = 0;
  stats.blocked = 0;
  stats.blockedIPs.clear();
}
