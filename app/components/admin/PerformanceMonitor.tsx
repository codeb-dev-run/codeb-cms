/**
 * 성능 모니터링 대시보드 컴포넌트
 *
 * QPS 10K 환경 실시간 모니터링:
 * - 요청 처리량 및 레이턴시
 * - 캐시 히트율
 * - 에러율
 * - Rate Limit 상태
 * - 시스템 헬스
 */

import { useEffect, useState } from 'react';
import { useFetcher } from '@remix-run/react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  HardDrive,
  Radio,
  Server,
  TrendingUp,
  Users,
  XCircle,
  Zap,
  RefreshCw,
} from 'lucide-react';
import { cn } from '~/lib/utils';

interface PerformanceMetrics {
  timestamp: string;
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

interface TimeSeriesData {
  labels: string[];
  requests: number[];
  latencies: number[];
  errors: number[];
}

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    database: boolean;
    redis: boolean;
    centrifugo: boolean;
  };
  warnings: string[];
}

interface RealtimeMetrics {
  connectedUsers: number;
  channelCount: number;
  messageRate: number;
  queueSize: number;
  nodeStats: Array<{
    name: string;
    clients: number;
    channels: number;
  }>;
}

interface PerformanceData {
  metrics: PerformanceMetrics;
  timeseries: TimeSeriesData;
  health: SystemHealth;
  realtime: RealtimeMetrics;
  alerts: string[];
}

export function PerformanceMonitor() {
  const fetcher = useFetcher<PerformanceData>();
  const [autoRefresh, setAutoRefresh] = useState(true);

  // 초기 로드 및 자동 새로고침
  useEffect(() => {
    fetcher.load('/api/admin/performance?type=all');
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetcher.load('/api/admin/performance?type=all');
    }, 5000); // 5초마다 갱신

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const data = fetcher.data;
  const isLoading = fetcher.state === 'loading';

  if (!data) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const { metrics, timeseries, health, realtime, alerts } = data;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-blue-500" />
          <h2 className="text-xl font-bold">성능 모니터링</h2>
          <span className="text-sm text-gray-500">QPS 10K</span>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            자동 새로고침
          </label>

          <button
            onClick={() => fetcher.load('/api/admin/performance?type=all')}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            새로고침
          </button>
        </div>
      </div>

      {/* 알림 */}
      {alerts && alerts.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-medium mb-2">
            <AlertTriangle className="h-5 w-5" />
            성능 경고
          </div>
          <ul className="space-y-1">
            {alerts.map((alert, i) => (
              <li key={i} className="text-sm text-red-700 dark:text-red-300">
                {alert}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 시스템 헬스 */}
      <SystemHealthCard health={health} />

      {/* 주요 메트릭 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={<Zap className="h-5 w-5" />}
          label="요청/분"
          value={metrics.requests.perMinute.toLocaleString()}
          subValue={`총 ${metrics.requests.total.toLocaleString()}`}
          trend={metrics.requests.perMinute > 100 ? 'up' : 'neutral'}
          color="blue"
        />

        <MetricCard
          icon={<Clock className="h-5 w-5" />}
          label="평균 응답시간"
          value={`${metrics.requests.avgLatencyMs}ms`}
          subValue={`P99: ${metrics.requests.p99LatencyMs}ms`}
          trend={metrics.requests.avgLatencyMs < 200 ? 'good' : metrics.requests.avgLatencyMs < 500 ? 'warning' : 'bad'}
          color="green"
        />

        <MetricCard
          icon={<Database className="h-5 w-5" />}
          label="캐시 히트율"
          value={`${metrics.cache.hitRate}%`}
          subValue={`${metrics.cache.hits}H / ${metrics.cache.misses}M`}
          trend={metrics.cache.hitRate >= 80 ? 'good' : 'warning'}
          color="purple"
        />

        <MetricCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="에러율"
          value={`${metrics.requests.errorRate}%`}
          subValue={`차단: ${metrics.rateLimit.blockedPerMinute}/분`}
          trend={metrics.requests.errorRate < 1 ? 'good' : metrics.requests.errorRate < 5 ? 'warning' : 'bad'}
          color="red"
        />
      </div>

      {/* 실시간 메트릭 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RealtimeMetricsCard realtime={realtime} />
        <DatabaseMetricsCard database={metrics.database} />
      </div>

      {/* 시계열 그래프 */}
      <TimeSeriesChart data={timeseries} />

      {/* 인기 엔드포인트 */}
      <TopEndpointsTable endpoints={metrics.topEndpoints} />
    </div>
  );
}

// ============================================
// 서브 컴포넌트들
// ============================================

function MetricCard({
  icon,
  label,
  value,
  subValue,
  trend,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  trend: 'up' | 'good' | 'warning' | 'bad' | 'neutral';
  color: 'blue' | 'green' | 'purple' | 'red';
}) {
  const colorClasses = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
  };

  const trendClasses = {
    up: 'text-blue-500',
    good: 'text-green-500',
    warning: 'text-yellow-500',
    bad: 'text-red-500',
    neutral: 'text-gray-500',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <div className={cn("p-2 rounded-lg", colorClasses[color])}>
          {icon}
        </div>
        <TrendingUp className={cn("h-4 w-4", trendClasses[trend])} />
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
      {subValue && (
        <div className="text-xs text-gray-400 mt-1">{subValue}</div>
      )}
    </div>
  );
}

function SystemHealthCard({ health }: { health: SystemHealth }) {
  const statusConfig = {
    healthy: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20', label: '정상' },
    degraded: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-900/20', label: '경고' },
    unhealthy: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20', label: '장애' },
  };

  const config = statusConfig[health.status];
  const Icon = config.icon;

  return (
    <div className={cn("rounded-lg p-4 border", config.bg)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon className={cn("h-6 w-6", config.color)} />
          <div>
            <div className="font-semibold">시스템 상태: {config.label}</div>
            {health.warnings.length > 0 && (
              <div className="text-sm text-gray-500">
                {health.warnings.join(', ')}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ServiceStatus name="DB" isHealthy={health.checks.database} />
          <ServiceStatus name="Redis" isHealthy={health.checks.redis} />
          <ServiceStatus name="WS" isHealthy={health.checks.centrifugo} />
        </div>
      </div>
    </div>
  );
}

function ServiceStatus({ name, isHealthy }: { name: string; isHealthy: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn(
        "w-2 h-2 rounded-full",
        isHealthy ? "bg-green-500" : "bg-red-500"
      )} />
      <span className="text-sm font-medium">{name}</span>
    </div>
  );
}

function RealtimeMetricsCard({ realtime }: { realtime: RealtimeMetrics }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-4">
        <Radio className="h-5 w-5 text-purple-500" />
        <h3 className="font-semibold">실시간 연결</h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-2xl font-bold">{realtime.connectedUsers}</div>
          <div className="text-sm text-gray-500">접속자</div>
        </div>
        <div>
          <div className="text-2xl font-bold">{realtime.channelCount}</div>
          <div className="text-sm text-gray-500">채널</div>
        </div>
        <div>
          <div className="text-2xl font-bold">{realtime.messageRate}/s</div>
          <div className="text-sm text-gray-500">메시지</div>
        </div>
        <div>
          <div className="text-2xl font-bold">{realtime.queueSize}</div>
          <div className="text-sm text-gray-500">대기열</div>
        </div>
      </div>

      {realtime.nodeStats.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-500 mb-2">노드 상태</div>
          <div className="space-y-2">
            {realtime.nodeStats.map((node, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-gray-400" />
                  {node.name}
                </span>
                <span>{node.clients} clients</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DatabaseMetricsCard({ database }: { database: PerformanceMetrics['database'] }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-4">
        <HardDrive className="h-5 w-5 text-blue-500" />
        <h3 className="font-semibold">데이터베이스</h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-2xl font-bold">{database.queriesPerMinute}</div>
          <div className="text-sm text-gray-500">쿼리/분</div>
        </div>
        <div>
          <div className={cn(
            "text-2xl font-bold",
            database.slowQueries > 10 ? "text-red-500" : database.slowQueries > 0 ? "text-yellow-500" : "text-green-500"
          )}>
            {database.slowQueries}
          </div>
          <div className="text-sm text-gray-500">슬로우 쿼리</div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="text-sm text-gray-500">
          슬로우 쿼리: 100ms 이상 소요된 쿼리
        </div>
      </div>
    </div>
  );
}

function TimeSeriesChart({ data }: { data: TimeSeriesData }) {
  // 간단한 ASCII 스타일 바 차트
  const maxRequest = Math.max(...data.requests, 1);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-5 w-5 text-green-500" />
        <h3 className="font-semibold">요청 추이 (최근 1시간)</h3>
      </div>

      <div className="h-40 flex items-end gap-0.5">
        {data.requests.slice(-60).map((count, i) => {
          const height = (count / maxRequest) * 100;
          const hasError = data.errors[i] > 0;

          return (
            <div
              key={i}
              className="flex-1 group relative"
            >
              <div
                className={cn(
                  "w-full rounded-t transition-all",
                  hasError ? "bg-red-400" : "bg-blue-400 hover:bg-blue-500"
                )}
                style={{ height: `${Math.max(height, 2)}%` }}
              />

              {/* 툴팁 */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                  {data.labels[i]}: {count}req, {data.latencies[i]}ms
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between mt-2 text-xs text-gray-500">
        <span>{data.labels[0]}</span>
        <span>{data.labels[Math.floor(data.labels.length / 2)]}</span>
        <span>{data.labels[data.labels.length - 1]}</span>
      </div>
    </div>
  );
}

function TopEndpointsTable({ endpoints }: { endpoints: PerformanceMetrics['topEndpoints'] }) {
  if (endpoints.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-5 w-5 text-orange-500" />
        <h3 className="font-semibold">인기 엔드포인트</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm text-gray-500 border-b border-gray-200 dark:border-gray-700">
              <th className="pb-2 font-medium">엔드포인트</th>
              <th className="pb-2 font-medium text-right">요청수</th>
              <th className="pb-2 font-medium text-right">평균 응답</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {endpoints.map((endpoint, i) => (
              <tr key={i} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                <td className="py-2">
                  <span className={cn(
                    "inline-block px-1.5 py-0.5 rounded text-xs font-medium mr-2",
                    endpoint.method === 'GET' ? "bg-green-100 text-green-700" :
                    endpoint.method === 'POST' ? "bg-blue-100 text-blue-700" :
                    endpoint.method === 'PUT' ? "bg-yellow-100 text-yellow-700" :
                    "bg-red-100 text-red-700"
                  )}>
                    {endpoint.method}
                  </span>
                  <span className="font-mono">{endpoint.path}</span>
                </td>
                <td className="py-2 text-right font-medium">
                  {endpoint.count.toLocaleString()}
                </td>
                <td className={cn(
                  "py-2 text-right font-medium",
                  endpoint.avgLatencyMs > 500 ? "text-red-500" :
                  endpoint.avgLatencyMs > 200 ? "text-yellow-500" :
                  "text-green-500"
                )}>
                  {endpoint.avgLatencyMs}ms
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default PerformanceMonitor;
