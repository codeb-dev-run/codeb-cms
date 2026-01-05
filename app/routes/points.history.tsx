/**
 * 포인트 거래 내역 페이지
 */

import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, Link, useSearchParams } from '@remix-run/react';
import { db } from '~/lib/db.server';
import { requireUser } from '~/lib/auth.server';
import { getUserPoints } from '~/lib/points/point.server';
import { Button } from '~/components/ui/button';
import {
  Coins,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Gift,
  Calendar,
  Trophy,
  Sparkles,
  Settings,
  Filter,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ko } from 'date-fns/locale';

const ITEMS_PER_PAGE = 30;

const TYPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  EARN_SIGNUP: { label: '회원가입 보너스', icon: Gift, color: 'text-purple-500' },
  EARN_CHECK_IN: { label: '출석 체크', icon: Calendar, color: 'text-blue-500' },
  EARN_WIN: { label: '이벤트 승리', icon: Trophy, color: 'text-yellow-500' },
  EARN_PREDICTION: { label: '예측 성공', icon: Sparkles, color: 'text-amber-500' },
  EARN_BONUS: { label: '보너스', icon: Gift, color: 'text-green-500' },
  SPEND_EVENT: { label: '이벤트 참여', icon: TrendingDown, color: 'text-red-500' },
  SPEND_BET: { label: '베팅', icon: Coins, color: 'text-orange-500' },
  ADMIN_ADJUST: { label: '관리자 조정', icon: Settings, color: 'text-gray-500' },
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const userPoints = await getUserPoints(user.id);

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const filter = url.searchParams.get('filter') || 'all'; // all, earn, spend
  const month = url.searchParams.get('month'); // YYYY-MM format

  const where: any = {
    userPoints: { userId: user.id },
  };

  if (filter === 'earn') {
    where.amount = { gt: 0 };
  } else if (filter === 'spend') {
    where.amount = { lt: 0 };
  }

  if (month) {
    const [year, monthNum] = month.split('-').map(Number);
    const start = new Date(year, monthNum - 1, 1);
    const end = new Date(year, monthNum, 0, 23, 59, 59);
    where.createdAt = { gte: start, lte: end };
  }

  const [transactions, totalCount] = await Promise.all([
    db.pointTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * ITEMS_PER_PAGE,
      take: ITEMS_PER_PAGE,
    }),
    db.pointTransaction.count({ where }),
  ]);

  // 월별 통계
  const monthlyStats = await db.pointTransaction.groupBy({
    by: ['type'],
    where: {
      userPoints: { userId: user.id },
      createdAt: month
        ? {
            gte: startOfMonth(new Date(`${month}-01`)),
            lte: endOfMonth(new Date(`${month}-01`)),
          }
        : {
            gte: startOfMonth(new Date()),
            lte: endOfMonth(new Date()),
          },
    },
    _sum: { amount: true },
    _count: true,
  });

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  // 사용 가능한 월 목록 (최근 6개월)
  const availableMonths = Array.from({ length: 6 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return format(date, 'yyyy-MM');
  });

  return json({
    points: userPoints,
    transactions,
    totalCount,
    totalPages,
    currentPage: page,
    monthlyStats,
    availableMonths,
  });
}

export default function PointHistoryPage() {
  const { points, transactions, totalCount, totalPages, currentPage, monthlyStats, availableMonths } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const currentFilter = searchParams.get('filter') || 'all';
  const currentMonth = searchParams.get('month') || '';

  const handleFilterChange = (filter: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('filter', filter);
    params.delete('page');
    setSearchParams(params);
  };

  const handleMonthChange = (month: string) => {
    const params = new URLSearchParams(searchParams);
    if (month) {
      params.set('month', month);
    } else {
      params.delete('month');
    }
    params.delete('page');
    setSearchParams(params);
  };

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', page.toString());
    setSearchParams(params);
  };

  // 월별 통계 계산
  const earnTotal = monthlyStats
    .filter((s) => (s._sum.amount || 0) > 0)
    .reduce((acc, s) => acc + (s._sum.amount || 0), 0);
  const spendTotal = Math.abs(
    monthlyStats
      .filter((s) => (s._sum.amount || 0) < 0)
      .reduce((acc, s) => acc + (s._sum.amount || 0), 0)
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container mx-auto px-4 py-8" style={{ maxWidth: '600px' }}>
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link to="/points">
              <Button variant="ghost" size="sm">
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                거래 내역
              </h1>
              <p className="text-sm text-gray-500">총 {totalCount}건</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">현재 잔액</p>
            <p className="font-bold text-blue-600">{points.balance.toLocaleString()}P</p>
          </div>
        </div>

        {/* 월 선택 */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          <button
            onClick={() => handleMonthChange('')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm whitespace-nowrap',
              !currentMonth
                ? 'bg-blue-500 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600'
            )}
          >
            전체
          </button>
          {availableMonths.map((month) => (
            <button
              key={month}
              onClick={() => handleMonthChange(month)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm whitespace-nowrap',
                currentMonth === month
                  ? 'bg-blue-500 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600'
              )}
            >
              {format(new Date(`${month}-01`), 'yyyy년 M월', { locale: ko })}
            </button>
          ))}
        </div>

        {/* 기간 통계 */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span className="text-sm text-green-600">획득</span>
            </div>
            <p className="text-xl font-bold text-green-600">
              +{earnTotal.toLocaleString()}P
            </p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <span className="text-sm text-red-600">사용</span>
            </div>
            <p className="text-xl font-bold text-red-600">
              -{spendTotal.toLocaleString()}P
            </p>
          </div>
        </div>

        {/* 필터 */}
        <div className="flex gap-2 mb-4">
          {[
            { value: 'all', label: '전체' },
            { value: 'earn', label: '획득' },
            { value: 'spend', label: '사용' },
          ].map((filter) => (
            <button
              key={filter.value}
              onClick={() => handleFilterChange(filter.value)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium',
                currentFilter === filter.value
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                  : 'bg-white dark:bg-gray-800 text-gray-600 hover:bg-gray-100'
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* 거래 내역 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden">
          {transactions.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Filter className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p>거래 내역이 없습니다</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {transactions.map((tx) => (
                <TransactionItem key={tx.id} transaction={tx} />
              ))}
            </div>
          )}
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            <span className="text-sm text-gray-500">
              {currentPage} / {totalPages}
            </span>

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

function TransactionItem({ transaction }: { transaction: any }) {
  const config = TYPE_CONFIG[transaction.type] || {
    label: transaction.type,
    icon: Coins,
    color: 'text-gray-500',
  };
  const Icon = config.icon;
  const isPositive = transaction.amount > 0;

  return (
    <div className="flex items-center gap-4 p-4">
      <div
        className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center',
          isPositive ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
        )}
      >
        <Icon className={cn('w-5 h-5', config.color)} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 dark:text-gray-100">{config.label}</p>
        {transaction.description && (
          <p className="text-sm text-gray-500 truncate">{transaction.description}</p>
        )}
        <p className="text-xs text-gray-400">
          {format(new Date(transaction.createdAt), 'yyyy.MM.dd HH:mm', { locale: ko })}
        </p>
      </div>

      <div className="text-right">
        <p
          className={cn(
            'font-bold',
            isPositive ? 'text-green-600' : 'text-red-600'
          )}
        >
          {isPositive ? '+' : ''}
          {transaction.amount.toLocaleString()}P
        </p>
        <p className="text-xs text-gray-400">
          잔액 {transaction.balance.toLocaleString()}P
        </p>
      </div>
    </div>
  );
}
