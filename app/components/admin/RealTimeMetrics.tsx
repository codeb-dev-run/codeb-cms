/**
 * 실시간 메트릭 컴포넌트
 * Centrifugo를 통해 실시간 통계 데이터를 표시
 */

import { useEffect, useState } from 'react';
import { useAdminMetrics } from '~/hooks/useCentrifugo';
import {
  Users,
  Activity,
  Zap,
  TrendingUp,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { cn } from '~/lib/utils';

interface MetricData {
  activeUsers: number;
  activeEvents: number;
  participationsToday: number;
  participationsPerMin: number;
  pointsEarnedToday: number;
  pointsSpentToday: number;
  lastUpdated: string;
}

export function RealTimeMetrics() {
  const { data: liveMetrics, isConnected } = useAdminMetrics();
  const [metrics, setMetrics] = useState<MetricData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 실시간 데이터 업데이트
  useEffect(() => {
    if (liveMetrics) {
      setMetrics(liveMetrics as MetricData);
    }
  }, [liveMetrics]);

  // 초기 데이터 로드 (REST API)
  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch('/api/admin/metrics');
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 연결 상태 및 새로고침 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'w-2 h-2 rounded-full',
              isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
            )}
          />
          <span className="text-sm text-gray-500">
            {isConnected ? '실시간 연결됨' : '연결 대기 중'}
          </span>
        </div>
        <button
          onClick={fetchMetrics}
          disabled={isRefreshing}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <RefreshCw
            className={cn('w-4 h-4 text-gray-500', isRefreshing && 'animate-spin')}
          />
        </button>
      </div>

      {/* 메트릭 그리드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={Users}
          label="접속자"
          value={metrics?.activeUsers ?? '-'}
          color="bg-blue-500"
          live={isConnected}
        />
        <MetricCard
          icon={Activity}
          label="활성 이벤트"
          value={metrics?.activeEvents ?? '-'}
          color="bg-green-500"
        />
        <MetricCard
          icon={Zap}
          label="분당 참여"
          value={metrics?.participationsPerMin ?? '-'}
          suffix="/분"
          color="bg-yellow-500"
          live={isConnected}
        />
        <MetricCard
          icon={TrendingUp}
          label="오늘 참여"
          value={metrics?.participationsToday ?? '-'}
          suffix="건"
          color="bg-purple-500"
        />
      </div>

      {/* 포인트 통계 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">오늘 발행 포인트</span>
            <span className="text-green-500 font-bold">
              +{(metrics?.pointsEarnedToday ?? 0).toLocaleString()}P
            </span>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">오늘 사용 포인트</span>
            <span className="text-red-500 font-bold">
              -{(metrics?.pointsSpentToday ?? 0).toLocaleString()}P
            </span>
          </div>
        </div>
      </div>

      {/* 마지막 업데이트 */}
      {metrics?.lastUpdated && (
        <div className="flex items-center justify-end gap-1 text-xs text-gray-400">
          <Clock className="w-3 h-3" />
          <span>마지막 업데이트: {new Date(metrics.lastUpdated).toLocaleTimeString()}</span>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  suffix = '',
  color,
  live,
}: {
  icon: any;
  label: string;
  value: number | string;
  suffix?: string;
  color: string;
  live?: boolean;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 relative overflow-hidden">
      {live && (
        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      )}
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center mb-3', color)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {typeof value === 'number' ? value.toLocaleString() : value}
        {suffix && <span className="text-sm font-normal text-gray-500">{suffix}</span>}
      </p>
    </div>
  );
}
