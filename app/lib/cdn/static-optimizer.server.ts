/**
 * CDN 및 Static 최적화 모듈
 *
 * QPS 10,000+ 지원:
 * 1. 정적 자산 캐시 헤더 설정
 * 2. API 응답 캐시 제어
 * 3. ETag 기반 조건부 요청
 * 4. Brotli/Gzip 압축 힌트
 */

import { createHash } from 'crypto';

// ============================================
// 1. 캐시 정책 상수
// ============================================

export const CACHE_POLICIES = {
  // 불변 정적 자산 (해시된 파일명)
  immutable: {
    'Cache-Control': 'public, max-age=31536000, immutable',
    Vary: 'Accept-Encoding',
  },

  // 정적 자산 (이미지, 폰트 등)
  static: {
    'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    Vary: 'Accept-Encoding',
  },

  // HTML 페이지 (ISR 스타일)
  page: {
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    Vary: 'Accept-Encoding, Accept',
  },

  // API 응답 (짧은 캐시)
  api: {
    'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
    Vary: 'Accept-Encoding, Authorization',
  },

  // 실시간 데이터 (캐시 없음)
  realtime: {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  },

  // 개인화된 데이터
  private: {
    'Cache-Control': 'private, max-age=60',
    Vary: 'Accept-Encoding, Authorization, Cookie',
  },

  // 에러 페이지
  error: {
    'Cache-Control': 'no-cache',
  },
} as const;

// ============================================
// 2. 경로 기반 캐시 정책
// ============================================

export function getCachePolicyForPath(pathname: string): Record<string, string> {
  // 정적 자산 (빌드 해시 포함)
  if (pathname.match(/\/_assets\/|\/build\//)) {
    return CACHE_POLICIES.immutable;
  }

  // 이미지
  if (pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i)) {
    return CACHE_POLICIES.static;
  }

  // 폰트
  if (pathname.match(/\.(woff|woff2|ttf|eot)$/i)) {
    return CACHE_POLICIES.immutable;
  }

  // 매니페스트, 서비스 워커
  if (pathname === '/manifest.json') {
    return { 'Cache-Control': 'public, max-age=3600' };
  }
  if (pathname === '/sw.js') {
    return { 'Cache-Control': 'no-cache' };
  }

  // API 엔드포인트
  if (pathname.startsWith('/api/')) {
    // 실시간 데이터
    if (pathname.includes('/realtime') || pathname.includes('/ws')) {
      return CACHE_POLICIES.realtime;
    }
    // 개인화 데이터
    if (pathname.includes('/me') || pathname.includes('/points')) {
      return CACHE_POLICIES.private;
    }
    // 일반 API
    return CACHE_POLICIES.api;
  }

  // 인증 관련
  if (pathname.startsWith('/auth/')) {
    return CACHE_POLICIES.realtime;
  }

  // 관리자 페이지
  if (pathname.startsWith('/admin/')) {
    return CACHE_POLICIES.private;
  }

  // 일반 페이지
  return CACHE_POLICIES.page;
}

// ============================================
// 3. ETag 생성
// ============================================

/**
 * 콘텐츠 기반 ETag 생성
 */
export function generateETag(content: string | Buffer): string {
  const hash = createHash('md5')
    .update(typeof content === 'string' ? content : content.toString())
    .digest('hex')
    .substring(0, 16);

  return `"${hash}"`;
}

/**
 * 약한 ETag 생성 (수정 시간 기반)
 */
export function generateWeakETag(
  lastModified: Date,
  size: number
): string {
  const timestamp = Math.floor(lastModified.getTime() / 1000).toString(36);
  const sizeHex = size.toString(36);
  return `W/"${timestamp}-${sizeHex}"`;
}

/**
 * 조건부 요청 체크
 */
export function checkConditionalRequest(
  request: Request,
  etag: string,
  lastModified?: Date
): { notModified: boolean; headers: Record<string, string> } {
  const headers: Record<string, string> = { ETag: etag };

  if (lastModified) {
    headers['Last-Modified'] = lastModified.toUTCString();
  }

  // If-None-Match 체크
  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch) {
    const tags = ifNoneMatch.split(',').map((t) => t.trim());
    if (tags.includes(etag) || tags.includes('*')) {
      return { notModified: true, headers };
    }
  }

  // If-Modified-Since 체크
  if (lastModified) {
    const ifModifiedSince = request.headers.get('If-Modified-Since');
    if (ifModifiedSince) {
      const clientDate = new Date(ifModifiedSince);
      if (lastModified <= clientDate) {
        return { notModified: true, headers };
      }
    }
  }

  return { notModified: false, headers };
}

/**
 * 304 Not Modified 응답 생성
 */
export function createNotModifiedResponse(
  headers: Record<string, string>
): Response {
  return new Response(null, {
    status: 304,
    headers: {
      ...headers,
      'Content-Length': '0',
    },
  });
}

// ============================================
// 4. 응답 최적화 헬퍼
// ============================================

export interface OptimizedResponseOptions {
  data: unknown;
  request: Request;
  cachePolicy?: keyof typeof CACHE_POLICIES;
  etag?: string;
  lastModified?: Date;
}

/**
 * 최적화된 JSON 응답 생성
 */
export function createOptimizedJsonResponse({
  data,
  request,
  cachePolicy = 'api',
  etag,
  lastModified,
}: OptimizedResponseOptions): Response {
  const jsonString = JSON.stringify(data);
  const responseETag = etag || generateETag(jsonString);

  // 조건부 요청 체크
  const { notModified, headers: conditionalHeaders } = checkConditionalRequest(
    request,
    responseETag,
    lastModified
  );

  if (notModified) {
    return createNotModifiedResponse(conditionalHeaders);
  }

  // 캐시 정책 적용
  const cacheHeaders = CACHE_POLICIES[cachePolicy];

  return new Response(jsonString, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...cacheHeaders,
      ...conditionalHeaders,
    },
  });
}

// ============================================
// 5. 압축 힌트
// ============================================

/**
 * 클라이언트 지원 압축 방식 감지
 */
export function detectCompressionSupport(
  request: Request
): 'br' | 'gzip' | 'deflate' | null {
  const acceptEncoding = request.headers.get('Accept-Encoding') || '';

  if (acceptEncoding.includes('br')) return 'br';
  if (acceptEncoding.includes('gzip')) return 'gzip';
  if (acceptEncoding.includes('deflate')) return 'deflate';

  return null;
}

/**
 * 압축 가능 여부 확인
 */
export function isCompressible(contentType: string): boolean {
  const compressibleTypes = [
    'text/',
    'application/json',
    'application/javascript',
    'application/xml',
    'image/svg+xml',
  ];

  return compressibleTypes.some((type) => contentType.includes(type));
}

// ============================================
// 6. CDN 캐시 키 생성
// ============================================

/**
 * Vary 헤더 기반 캐시 키 생성
 */
export function generateCacheKey(request: Request, vary: string[]): string {
  const url = new URL(request.url);
  const parts = [url.pathname, url.search];

  for (const header of vary) {
    const value = request.headers.get(header);
    if (value) {
      parts.push(`${header}=${value}`);
    }
  }

  return parts.join('|');
}

// ============================================
// 7. Prefetch 힌트
// ============================================

/**
 * Link 헤더로 리소스 프리페치 힌트 추가
 */
export function generatePrefetchHints(
  resources: Array<{ url: string; as: string; crossorigin?: boolean }>
): string {
  return resources
    .map((r) => {
      let hint = `<${r.url}>; rel=preload; as=${r.as}`;
      if (r.crossorigin) {
        hint += '; crossorigin';
      }
      return hint;
    })
    .join(', ');
}

// ============================================
// 8. 보안 헤더
// ============================================

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

/**
 * 모든 표준 헤더 적용
 */
export function applyStandardHeaders(
  headers: Headers,
  pathname: string
): void {
  // 캐시 정책
  const cachePolicy = getCachePolicyForPath(pathname);
  for (const [key, value] of Object.entries(cachePolicy)) {
    headers.set(key, value);
  }

  // 보안 헤더
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
}
