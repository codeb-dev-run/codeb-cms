/**
 * 성능 모니터링 페이지 (어드민)
 *
 * QPS 10,000+ 환경을 위한 실시간 성능 대시보드
 */

import { type LoaderFunctionArgs } from '@remix-run/node';
import { requireAdmin } from '~/lib/auth.server';
import { PerformanceMonitor } from '~/components/admin/PerformanceMonitor';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  return null;
}

export default function AdminPerformancePage() {
  return (
    <div className="p-4 md:p-6">
      <PerformanceMonitor />
    </div>
  );
}
