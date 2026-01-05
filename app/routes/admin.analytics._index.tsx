/**
 * 분석 대시보드 메인 페이지
 */

import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, Link } from '@remix-run/react';
import { db } from '~/lib/db.server';
import { requireAdmin } from '~/lib/auth.server';
import {
  BarChart3,
  Users,
  FileText,
  MessageSquare,
  TrendingUp,
  Calendar,
  Trophy,
  Coins,
  Activity,
  ChevronRight,
} from 'lucide-react';
import { RealTimeMetrics } from '~/components/admin/RealTimeMetrics';
import { cn } from '~/lib/utils';
import { subDays, startOfDay, format } from 'date-fns';
import { ko } from 'date-fns/locale';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const today = startOfDay(new Date());
  const weekAgo = subDays(today, 7);
  const monthAgo = subDays(today, 30);

  // 핵심 지표 조회
  const [
    totalUsers,
    newUsersWeek,
    totalPosts,
    newPostsWeek,
    totalComments,
    newCommentsWeek,
    totalEvents,
    activeEvents,
    totalParticipations,
    participationsWeek,
    pointsDistributed,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: weekAgo } } }),
    db.post.count(),
    db.post.count({ where: { createdAt: { gte: weekAgo } } }),
    db.comment.count(),
    db.comment.count({ where: { createdAt: { gte: weekAgo } } }),
    db.participationEvent.count(),
    db.participationEvent.count({ where: { status: 'OPEN' } }),
    db.participation.count(),
    db.participation.count({ where: { createdAt: { gte: weekAgo } } }),
    db.pointTransaction.aggregate({
      where: { amount: { gt: 0 } },
      _sum: { amount: true },
    }),
  ]);

  // 일별 사용자 가입 추이 (최근 7일)
  const userSignupTrend = await db.$queryRaw<Array<{ date: Date; count: bigint }>>`
    SELECT DATE("createdAt") as date, COUNT(*) as count
    FROM users
    WHERE "createdAt" >= ${weekAgo}
    GROUP BY DATE("createdAt")
    ORDER BY date
  `;

  return json({
    stats: {
      users: { total: totalUsers, new: newUsersWeek },
      posts: { total: totalPosts, new: newPostsWeek },
      comments: { total: totalComments, new: newCommentsWeek },
      events: { total: totalEvents, active: activeEvents },
      participations: { total: totalParticipations, week: participationsWeek },
      points: { distributed: pointsDistributed._sum.amount || 0 },
    },
    userSignupTrend: userSignupTrend.map((d) => ({
      date: format(new Date(d.date), 'MM/dd'),
      count: Number(d.count),
    })),
  });
}

export default function AnalyticsDashboard() {
  const { stats, userSignupTrend } = useLoaderData<typeof loader>();

  const analyticsModules = [
    {
      title: '이벤트 분석',
      description: '이벤트별 참여 통계 및 트렌드',
      href: '/admin/analytics/events',
      icon: Trophy,
      color: 'bg-yellow-500',
      stats: `활성 ${stats.events.active}개`,
    },
    {
      title: '사용자 분석',
      description: '사용자 활동 및 참여율',
      href: '/admin/analytics/users',
      icon: Users,
      color: 'bg-blue-500',
      stats: `신규 ${stats.users.new}명`,
      disabled: true,
    },
    {
      title: '콘텐츠 분석',
      description: '게시글, 댓글 통계',
      href: '/admin/analytics/content',
      icon: FileText,
      color: 'bg-green-500',
      stats: `신규 ${stats.posts.new}개`,
      disabled: true,
    },
    {
      title: '포인트 분석',
      description: '포인트 발행 및 소비 현황',
      href: '/admin/analytics/points',
      icon: Coins,
      color: 'bg-purple-500',
      stats: `${(stats.points.distributed / 1000).toFixed(0)}K 발행`,
      disabled: true,
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          분석 대시보드
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          실시간 현황 및 통계 분석
        </p>
      </div>

      {/* 실시간 메트릭 */}
      <section>
        <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-green-500" />
          실시간 현황
        </h2>
        <RealTimeMetrics />
      </section>

      {/* 핵심 지표 */}
      <section>
        <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          주요 지표
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard
            icon={Users}
            label="총 사용자"
            value={stats.users.total}
            change={stats.users.new}
            changeLabel="이번 주"
          />
          <StatCard
            icon={FileText}
            label="총 게시글"
            value={stats.posts.total}
            change={stats.posts.new}
            changeLabel="이번 주"
          />
          <StatCard
            icon={MessageSquare}
            label="총 댓글"
            value={stats.comments.total}
            change={stats.comments.new}
            changeLabel="이번 주"
          />
          <StatCard
            icon={Trophy}
            label="총 이벤트"
            value={stats.events.total}
            change={stats.events.active}
            changeLabel="활성"
            isActiveCount
          />
          <StatCard
            icon={Activity}
            label="총 참여"
            value={stats.participations.total}
            change={stats.participations.week}
            changeLabel="이번 주"
          />
          <StatCard
            icon={Coins}
            label="발행 포인트"
            value={stats.points.distributed}
            suffix="P"
          />
        </div>
      </section>

      {/* 분석 모듈 */}
      <section>
        <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          상세 분석
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {analyticsModules.map((module) => (
            <AnalyticsModuleCard key={module.href} {...module} />
          ))}
        </div>
      </section>

      {/* 사용자 가입 추이 */}
      <section className="bg-white dark:bg-gray-800 rounded-xl p-6">
        <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          최근 7일 사용자 가입 추이
        </h2>
        <div className="h-48 flex items-end gap-2">
          {userSignupTrend.map((day, index) => {
            const maxCount = Math.max(...userSignupTrend.map((d) => d.count), 1);
            const height = (day.count / maxCount) * 160;

            return (
              <div key={index} className="flex-1 flex flex-col items-center">
                <span className="text-xs text-gray-500 mb-1">{day.count}</span>
                <div
                  className="w-full bg-blue-500 rounded-t transition-all"
                  style={{ height: `${height}px`, minHeight: day.count > 0 ? '4px' : '0' }}
                />
                <span className="text-xs text-gray-400 mt-2">{day.date}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  change,
  changeLabel,
  suffix = '',
  isActiveCount,
}: {
  icon: any;
  label: string;
  value: number;
  change?: number;
  changeLabel?: string;
  suffix?: string;
  isActiveCount?: boolean;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-gray-400" />
        <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {value.toLocaleString()}{suffix}
      </p>
      {change !== undefined && changeLabel && (
        <p className={cn(
          'text-xs mt-1',
          isActiveCount ? 'text-blue-500' : 'text-green-500'
        )}>
          {isActiveCount ? '' : '+'}{change.toLocaleString()} {changeLabel}
        </p>
      )}
    </div>
  );
}

function AnalyticsModuleCard({
  title,
  description,
  href,
  icon: Icon,
  color,
  stats,
  disabled,
}: {
  title: string;
  description: string;
  href: string;
  icon: any;
  color: string;
  stats: string;
  disabled?: boolean;
}) {
  const content = (
    <div
      className={cn(
        'bg-white dark:bg-gray-800 rounded-xl p-5 transition-all',
        disabled ? 'opacity-50' : 'hover:shadow-md cursor-pointer'
      )}
    >
      <div className={cn('w-12 h-12 rounded-lg flex items-center justify-center mb-4', color)}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-gray-100">{title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{description}</p>
        </div>
        {!disabled && <ChevronRight className="w-5 h-5 text-gray-400" />}
      </div>
      <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mt-3">{stats}</p>
      {disabled && (
        <span className="inline-block mt-2 text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
          준비 중
        </span>
      )}
    </div>
  );

  if (disabled) {
    return content;
  }

  return <Link to={href}>{content}</Link>;
}
