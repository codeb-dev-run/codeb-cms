/**
 * 요청 추적 미들웨어
 *
 * 모든 요청의 메트릭을 수집하여 성능 모니터링에 제공
 */

import { recordRequest, recordRateLimitBlocked } from '~/lib/monitoring/performance-monitor.server';

/**
 * 요청 시작 시 호출
 */
export function startRequestTracking(): { startTime: number } {
  return { startTime: Date.now() };
}

/**
 * 요청 종료 시 호출
 */
export async function endRequestTracking(
  tracking: { startTime: number },
  request: Request,
  statusCode: number
): Promise<void> {
  const latencyMs = Date.now() - tracking.startTime;
  const url = new URL(request.url);

  try {
    await recordRequest(
      url.pathname,
      request.method,
      statusCode,
      latencyMs
    );
  } catch {
    // 메트릭 수집 실패는 무시
  }
}

/**
 * Rate Limit 차단 시 호출
 */
export async function trackRateLimitBlock(): Promise<void> {
  try {
    await recordRateLimitBlocked();
  } catch {
    // 무시
  }
}

/**
 * Remix loader/action에서 사용할 수 있는 래퍼
 *
 * 사용법:
 * ```typescript
 * export async function loader({ request }: LoaderFunctionArgs) {
 *   return withRequestTracking(request, async () => {
 *     // 실제 로직
 *     return json({ data });
 *   });
 * }
 * ```
 */
export async function withRequestTracking<T>(
  request: Request,
  handler: () => Promise<T>
): Promise<T> {
  const tracking = startRequestTracking();

  try {
    const response = await handler();

    // Response 객체에서 status 추출
    let statusCode = 200;
    if (response instanceof Response) {
      statusCode = response.status;
    }

    await endRequestTracking(tracking, request, statusCode);
    return response;
  } catch (error) {
    // 에러 시에도 메트릭 기록
    await endRequestTracking(tracking, request, 500);
    throw error;
  }
}

/**
 * 고빈도 API에서 사용할 수 있는 샘플링 래퍼
 * (10% 샘플링으로 오버헤드 감소)
 */
export async function withSampledTracking<T>(
  request: Request,
  handler: () => Promise<T>,
  sampleRate: number = 0.1
): Promise<T> {
  const shouldSample = Math.random() < sampleRate;

  if (!shouldSample) {
    return handler();
  }

  return withRequestTracking(request, handler);
}
