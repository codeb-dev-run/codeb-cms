/**
 * 내 이벤트 참여 내역 페이지
 */

import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, Link, useSearchParams } from '@remix-run/react';
import { db } from '~/lib/db.server';
import { requireUser } from '~/lib/auth.server';
import { Button } from '~/components/ui/button';
import {
  Trophy,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react';
import { cn } from '~/lib/utils';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

const ITEMS_PER_PAGE = 20;

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const filter = url.searchParams.get('filter') || 'all'; // all, win, lose, pending

  const where: any = { userId: user.id };

  if (filter === 'win') {
    where.isWinner = true;
  } else if (filter === 'lose') {
    where.isWinner = false;
  } else if (filter === 'pending') {
    where.isWinner = null;
  }

  const [participations, totalCount, stats] = await Promise.all([
    db.participation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * ITEMS_PER_PAGE,
      take: ITEMS_PER_PAGE,
      include: {
        event: {
          select: {
            id: true,
            title: true,
            type: true,
            status: true,
            options: true,
            result: true,
            resultAt: true,
            rewardMultiplier: true,
          },
        },
      },
    }),
    db.participation.count({ where }),
    db.participation.aggregate({
      where: { userId: user.id },
      _sum: {
        points: true,
        reward: true,
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  // 승/패/대기 통계
  const [winCount, loseCount, pendingCount] = await Promise.all([
    db.participation.count({ where: { userId: user.id, isWinner: true } }),
    db.participation.count({ where: { userId: user.id, isWinner: false } }),
    db.participation.count({ where: { userId: user.id, isWinner: null } }),
  ]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  return json({
    participations,
    totalCount,
    totalPages,
    currentPage: page,
    stats: {
      totalParticipations: stats._count._all,
      totalSpent: stats._sum.points || 0,
      totalReward: stats._sum.reward || 0,
      winCount,
      loseCount,
      pendingCount,
      winRate: winCount + loseCount > 0
        ? Math.round((winCount / (winCount + loseCount)) * 100)
        : 0,
      netProfit: (stats._sum.reward || 0) - (stats._sum.points || 0),
    },
  });
}

export default function EventHistoryPage() {
  const { participations, totalCount, totalPages, currentPage, stats } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentFilter = searchParams.get('filter') || 'all';

  const filters = [
    { value: 'all', label: '전체', count: stats.totalParticipations },
    { value: 'win', label: '승리', count: stats.winCount },
    { value: 'lose', label: '패배', count: stats.loseCount },
    { value: 'pending', label: '대기', count: stats.pendingCount },
  ];

  const handleFilterChange = (filter: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('filter', filter);
    params.delete('page');
    setSearchParams(params);
  };

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', page.toString());
    setSearchParams(params);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container mx-auto px-4 py-8" style={{ maxWidth: '900px' }}>
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">참여 내역</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              총 {totalCount}건의 참여 기록
            </p>
          </div>
          <Link to="/events">
            <Button variant="outline">
              이벤트 목록
            </Button>
          </Link>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="총 참여"
            value={stats.totalParticipations}
            suffix="회"
            icon={Calendar}
          />
          <StatCard
            label="승률"
            value={stats.winRate}
            suffix="%"
            icon={Trophy}
            highlight={stats.winRate >= 50}
          />
          <StatCard
            label="사용 포인트"
            value={stats.totalSpent.toLocaleString()}
            suffix="P"
            icon={TrendingDown}
            negative
          />
          <StatCard
            label="획득 보상"
            value={stats.totalReward.toLocaleString()}
            suffix="P"
            icon={TrendingUp}
            highlight={stats.totalReward > 0}
          />
        </div>

        {/* 순수익 배너 */}
        <div className={cn(
          'rounded-xl p-4 mb-6 flex items-center justify-between',
          stats.netProfit >= 0
            ? 'bg-green-100 dark:bg-green-900/30'
            : 'bg-red-100 dark:bg-red-900/30'
        )}>
          <span className="font-medium text-gray-700 dark:text-gray-300">순 수익</span>
          <span className={cn(
            'text-2xl font-bold',
            stats.netProfit >= 0 ? 'text-green-600' : 'text-red-600'
          )}>
            {stats.netProfit >= 0 ? '+' : ''}{stats.netProfit.toLocaleString()}P
          </span>
        </div>

        {/* 필터 탭 */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {filters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => handleFilterChange(filter.value)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                currentFilter === filter.value
                  ? 'bg-blue-500 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100'
              )}
            >
              {filter.label} ({filter.count})
            </button>
          ))}
        </div>

        {/* 참여 내역 리스트 */}
        <div className="space-y-3">
          {participations.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center">
              <Calendar className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500 dark:text-gray-400">
                {currentFilter === 'all'
                  ? '아직 참여한 이벤트가 없습니다'
                  : '해당 조건의 참여 기록이 없습니다'}
              </p>
              <Link to="/events">
                <Button className="mt-4">이벤트 참여하기</Button>
              </Link>
            </div>
          ) : (
            participations.map((participation) => (
              <ParticipationItem
                key={participation.id}
                participation={participation}
              />
            ))
          )}
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }

              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handlePageChange(pageNum)}
                >
                  {pageNum}
                </Button>
              );
            })}

            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
  icon: Icon,
  highlight,
  negative,
}: {
  label: string;
  value: number | string;
  suffix: string;
  icon: any;
  highlight?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn(
          'w-4 h-4',
          highlight ? 'text-green-500' : negative ? 'text-red-500' : 'text-gray-400'
        )} />
        <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <p className={cn(
        'text-2xl font-bold',
        highlight ? 'text-green-600' : negative ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'
      )}>
        {value}<span className="text-sm font-normal text-gray-500">{suffix}</span>
      </p>
    </div>
  );
}

function ParticipationItem({ participation }: { participation: any }) {
  const event = participation.event;
  const options = event.options as Array<{ id: string; label: string; color: string }>;
  const selectedOption = options.find((o) => o.id === participation.choice);
  const correctOption = event.result ? options.find((o) => o.id === event.result) : null;

  const getResultIcon = () => {
    if (participation.isWinner === null) {
      return <Clock className="w-5 h-5 text-gray-400" />;
    }
    return participation.isWinner
      ? <Check className="w-5 h-5 text-green-500" />
      : <X className="w-5 h-5 text-red-500" />;
  };

  const getResultText = () => {
    if (participation.isWinner === null) {
      return <span className="text-gray-500">대기중</span>;
    }
    return participation.isWinner
      ? <span className="text-green-600 font-bold">+{participation.reward?.toLocaleString()}P</span>
      : <span className="text-red-600">-{participation.points.toLocaleString()}P</span>;
  };

  return (
    <Link
      to={`/events/${event.id}`}
      className="block bg-white dark:bg-gray-800 rounded-xl p-4 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* 이벤트 제목 */}
          <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
            {event.title}
          </h3>

          {/* 내 선택 */}
          <div className="flex items-center gap-2 mt-2">
            <div
              className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: selectedOption?.color || '#6B7280' }}
            >
              {selectedOption?.label.charAt(0)}
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {selectedOption?.label || '알 수 없음'}
            </span>
            {participation.points > 0 && (
              <span className="text-sm text-gray-500">
                ({participation.points.toLocaleString()}P 베팅)
              </span>
            )}
          </div>

          {/* 정답 표시 (종료된 경우) */}
          {correctOption && (
            <div className="flex items-center gap-2 mt-1">
              <Trophy className="w-4 h-4 text-yellow-500" />
              <span className="text-sm text-gray-500">
                정답: {correctOption.label}
              </span>
            </div>
          )}

          {/* 참여 일시 */}
          <p className="text-xs text-gray-400 mt-2">
            {format(new Date(participation.createdAt), 'yyyy.MM.dd HH:mm', { locale: ko })}
          </p>
        </div>

        {/* 결과 */}
        <div className="flex flex-col items-end gap-1">
          {getResultIcon()}
          <div className="text-sm">
            {getResultText()}
          </div>
        </div>
      </div>
    </Link>
  );
}
