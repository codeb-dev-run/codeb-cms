/**
 * 성능 모니터링 API (어드민 전용)
 *
 * QPS 10K 모니터링을 위한 실시간 성능 메트릭 제공
 */

import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { requireAdmin } from '~/lib/auth.server';
import {
  getPerformanceMetrics,
  getTimeSeriesData,
  checkSystemHealth,
  checkAlerts,
} from '~/lib/monitoring/performance-monitor.server';
import { getRealtimeMetrics } from '~/lib/realtime/load-balancer.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'all';

  try {
    switch (type) {
      case 'performance': {
        const metrics = await getPerformanceMetrics();
        const alerts = checkAlerts(metrics);
        return json({ metrics, alerts });
      }

      case 'timeseries': {
        const minutes = parseInt(url.searchParams.get('minutes') || '60', 10);
        const data = await getTimeSeriesData(Math.min(minutes, 1440)); // 최대 24시간
        return json({ data });
      }

      case 'health': {
        const health = await checkSystemHealth();
        return json({ health });
      }

      case 'realtime': {
        const realtime = await getRealtimeMetrics();
        return json({ realtime });
      }

      case 'all':
      default: {
        const [metrics, timeseries, health, realtime] = await Promise.all([
          getPerformanceMetrics(),
          getTimeSeriesData(60),
          checkSystemHealth(),
          getRealtimeMetrics(),
        ]);

        const alerts = checkAlerts(metrics);

        return json({
          metrics,
          timeseries,
          health,
          realtime,
          alerts,
        });
      }
    }
  } catch (error) {
    console.error('[Performance API] Error:', error);
    return json(
      { error: 'Failed to fetch performance metrics' },
      { status: 500 }
    );
  }
}
