/**
 * 이벤트 분석 페이지
 * 이벤트별 참여 통계 및 트렌드 분석
 */

import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, useSearchParams } from '@remix-run/react';
import { db } from '~/lib/db.server';
import { requireAdmin } from '~/lib/auth.server';
import { Button } from '~/components/ui/button';
import {
  BarChart3,
  TrendingUp,
  Users,
  Trophy,
  Coins,
  Calendar,
  ChevronDown,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import { format, subDays, eachDayOfInterval, startOfDay } from 'date-fns';
import { ko } from 'date-fns/locale';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get('days') || '7', 10);
  const eventType = url.searchParams.get('type') || 'all';

  const startDate = subDays(new Date(), days);

  const typeFilter = eventType !== 'all' ? { type: eventType as any } : {};

  // 기간 내 이벤트 통계
  const [
    totalEvents,
    totalParticipations,
    uniqueParticipants,
    totalPointsSpent,
    totalRewards,
    eventsByType,
    participationsByDay,
    topEvents,
  ] = await Promise.all([
    // 총 이벤트 수
    db.participationEvent.count({
      where: {
        createdAt: { gte: startDate },
        ...typeFilter,
      },
    }),

    // 총 참여 수
    db.participation.count({
      where: {
        createdAt: { gte: startDate },
        event: typeFilter,
      },
    }),

    // 고유 참여자 수
    db.participation.groupBy({
      by: ['userId'],
      where: {
        createdAt: { gte: startDate },
        event: typeFilter,
      },
    }).then((r) => r.length),

    // 총 사용 포인트
    db.participation.aggregate({
      where: {
        createdAt: { gte: startDate },
        event: typeFilter,
      },
      _sum: { points: true },
    }),

    // 총 보상
    db.participation.aggregate({
      where: {
        createdAt: { gte: startDate },
        event: typeFilter,
        isWinner: true,
      },
      _sum: { reward: true },
    }),

    // 이벤트 타입별 통계
    db.participationEvent.groupBy({
      by: ['type'],
      where: {
        createdAt: { gte: startDate },
      },
      _count: true,
    }),

    // 일별 참여 통계
    db.$queryRaw`
      SELECT
        DATE("createdAt") as date,
        COUNT(*) as count
      FROM participations
      WHERE "createdAt" >= ${startDate}
      GROUP BY DATE("createdAt")
      ORDER BY date
    ` as Promise<Array<{ date: Date; count: bigint }>>,

    // 인기 이벤트 TOP 5
    db.participationEvent.findMany({
      where: {
        createdAt: { gte: startDate },
        ...typeFilter,
      },
      orderBy: { totalParticipants: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        totalParticipants: true,
        rewardPool: true,
      },
    }),
  ]);

  // 일별 데이터 정규화 (빈 날짜 채우기)
  const dateRange = eachDayOfInterval({
    start: startDate,
    end: new Date(),
  });

  const participationsByDayMap = new Map(
    (participationsByDay as any[]).map((d) => [
      format(new Date(d.date), 'yyyy-MM-dd'),
      Number(d.count),
    ])
  );

  const dailyData = dateRange.map((date) => ({
    date: format(date, 'MM/dd'),
    count: participationsByDayMap.get(format(date, 'yyyy-MM-dd')) || 0,
  }));

  // 이벤트 타입 레이블
  const typeLabels: Record<string, string> = {
    BINARY: '좋아요/싫어요',
    ODD_EVEN: '홀짝',
    MULTI_CHOICE: '다지선다',
    PREDICTION: '예측',
  };

  const typeStats = eventsByType.map((t) => ({
    type: t.type,
    label: typeLabels[t.type] || t.type,
    count: t._count,
  }));

  return json({
    period: { days, startDate: startDate.toISOString() },
    summary: {
      totalEvents,
      totalParticipations,
      uniqueParticipants,
      avgParticipationsPerEvent: totalEvents > 0
        ? Math.round(totalParticipations / totalEvents)
        : 0,
      totalPointsSpent: totalPointsSpent._sum.points || 0,
      totalRewards: totalRewards._sum.reward || 0,
    },
    typeStats,
    dailyData,
    topEvents,
  });
}

export default function EventAnalyticsPage() {
  const { period, summary, typeStats, dailyData, topEvents } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const currentDays = parseInt(searchParams.get('days') || '7', 10);
  const currentType = searchParams.get('type') || 'all';

  const handlePeriodChange = (days: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('days', days.toString());
    setSearchParams(params);
  };

  const handleTypeChange = (type: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('type', type);
    setSearchParams(params);
  };

  // 차트 최대값 계산
  const maxCount = Math.max(...dailyData.map((d) => d.count), 1);

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            이벤트 분석
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {format(new Date(period.startDate), 'yyyy.MM.dd', { locale: ko })} ~ 현재
          </p>
        </div>

        {/* 필터 */}
        <div className="flex gap-2">
          {/* 기간 선택 */}
          <select
            value={currentDays}
            onChange={(e) => handlePeriodChange(parseInt(e.target.value))}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
          >
            <option value="7">최근 7일</option>
            <option value="14">최근 14일</option>
            <option value="30">최근 30일</option>
            <option value="90">최근 90일</option>
          </select>

          {/* 타입 선택 */}
          <select
            value={currentType}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
          >
            <option value="all">모든 타입</option>
            <option value="BINARY">좋아요/싫어요</option>
            <option value="ODD_EVEN">홀짝</option>
            <option value="MULTI_CHOICE">다지선다</option>
            <option value="PREDICTION">예측</option>
          </select>
        </div>
      </div>

      {/* 요약 통계 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <SummaryCard
          icon={BarChart3}
          label="총 이벤트"
          value={summary.totalEvents}
          suffix="개"
        />
        <SummaryCard
          icon={Users}
          label="총 참여"
          value={summary.totalParticipations}
          suffix="건"
        />
        <SummaryCard
          icon={TrendingUp}
          label="고유 참여자"
          value={summary.uniqueParticipants}
          suffix="명"
        />
        <SummaryCard
          icon={Trophy}
          label="이벤트당 평균"
          value={summary.avgParticipationsPerEvent}
          suffix="명"
        />
        <SummaryCard
          icon={Coins}
          label="사용 포인트"
          value={summary.totalPointsSpent}
          suffix="P"
          negative
        />
        <SummaryCard
          icon={Coins}
          label="지급 보상"
          value={summary.totalRewards}
          suffix="P"
          positive
        />
      </div>

      {/* 차트 섹션 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 일별 참여 추이 */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl p-6">
          <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            일별 참여 추이
          </h2>

          {/* 간단한 바 차트 */}
          <div className="h-64 flex items-end gap-1">
            {dailyData.map((day, index) => (
              <div
                key={index}
                className="flex-1 flex flex-col items-center"
              >
                <div className="w-full flex justify-center mb-1">
                  <span className="text-xs text-gray-500">{day.count}</span>
                </div>
                <div
                  className="w-full bg-blue-500 rounded-t transition-all duration-300"
                  style={{
                    height: `${(day.count / maxCount) * 200}px`,
                    minHeight: day.count > 0 ? '4px' : '0',
                  }}
                />
                <span className="text-xs text-gray-400 mt-2 -rotate-45 origin-left">
                  {day.date}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 이벤트 타입별 분포 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
          <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4">
            타입별 분포
          </h2>

          <div className="space-y-4">
            {typeStats.length === 0 ? (
              <p className="text-gray-500 text-center py-8">데이터 없음</p>
            ) : (
              typeStats.map((stat) => {
                const total = typeStats.reduce((sum, s) => sum + s.count, 0);
                const percentage = total > 0 ? (stat.count / total) * 100 : 0;

                return (
                  <div key={stat.type}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {stat.label}
                      </span>
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {stat.count}개 ({percentage.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 인기 이벤트 TOP 5 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
        <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-500" />
          인기 이벤트 TOP 5
        </h2>

        {topEvents.length === 0 ? (
          <p className="text-gray-500 text-center py-8">데이터 없음</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">순위</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">이벤트</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">타입</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">참여자</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">보상풀</th>
                </tr>
              </thead>
              <tbody>
                {topEvents.map((event, index) => (
                  <tr
                    key={event.id}
                    className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <td className="py-3 px-4">
                      <span
                        className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold',
                          index === 0 && 'bg-yellow-100 text-yellow-600',
                          index === 1 && 'bg-gray-100 text-gray-600',
                          index === 2 && 'bg-amber-100 text-amber-600',
                          index > 2 && 'bg-gray-50 text-gray-500'
                        )}
                      >
                        {index + 1}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">
                      {event.title}
                    </td>
                    <td className="py-3 px-4">
                      <TypeBadge type={event.type} />
                    </td>
                    <td className="py-3 px-4 text-right font-bold">
                      {event.totalParticipants.toLocaleString()}명
                    </td>
                    <td className="py-3 px-4 text-right text-gray-600 dark:text-gray-400">
                      {event.rewardPool.toLocaleString()}P
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  suffix,
  positive,
  negative,
}: {
  icon: any;
  label: string;
  value: number;
  suffix: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon
          className={cn(
            'w-4 h-4',
            positive && 'text-green-500',
            negative && 'text-red-500',
            !positive && !negative && 'text-gray-400'
          )}
        />
        <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <p
        className={cn(
          'text-xl font-bold',
          positive && 'text-green-600',
          negative && 'text-red-600',
          !positive && !negative && 'text-gray-900 dark:text-gray-100'
        )}
      >
        {value.toLocaleString()}
        <span className="text-sm font-normal text-gray-500">{suffix}</span>
      </p>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; color: string }> = {
    BINARY: { label: '좋/싫', color: 'bg-pink-100 text-pink-700' },
    ODD_EVEN: { label: '홀짝', color: 'bg-blue-100 text-blue-700' },
    MULTI_CHOICE: { label: '선다', color: 'bg-purple-100 text-purple-700' },
    PREDICTION: { label: '예측', color: 'bg-amber-100 text-amber-700' },
  };

  const { label, color } = config[type] || { label: type, color: 'bg-gray-100 text-gray-700' };

  return (
    <span className={cn('px-2 py-1 rounded text-xs font-medium', color)}>
      {label}
    </span>
  );
}
