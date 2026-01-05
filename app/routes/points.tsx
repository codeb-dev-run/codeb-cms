/**
 * 내 포인트 페이지
 */

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from '@remix-run/node';
import { useLoaderData, useFetcher, Link } from '@remix-run/react';
import { db } from '~/lib/db.server';
import { requireUser } from '~/lib/auth.server';
import { getUserPoints, dailyCheckIn, getPointHistory, POINT_CONFIG } from '~/lib/points/point.server';
import { Button } from '~/components/ui/button';
import {
  Coins,
  TrendingUp,
  Gift,
  Calendar,
  Trophy,
  History,
  ChevronRight,
  Sparkles,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { cn } from '~/lib/utils';
import { format, isToday } from 'date-fns';
import { ko } from 'date-fns/locale';

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const userPoints = await getUserPoints(user.id);
  const recentHistory = await getPointHistory(user.id, 5);

  // 오늘 출석 여부 확인
  const todayCheckIn = await db.pointTransaction.findFirst({
    where: {
      userPoints: { userId: user.id },
      type: 'EARN_CHECK_IN',
      createdAt: {
        gte: new Date(new Date().setHours(0, 0, 0, 0)),
      },
    },
  });

  // 이번 주 출석 현황
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const weekCheckIns = await db.pointTransaction.findMany({
    where: {
      userPoints: { userId: user.id },
      type: 'EARN_CHECK_IN',
      createdAt: { gte: weekStart },
    },
    select: { createdAt: true },
  });

  const weekCheckInDays = weekCheckIns.map((c) => new Date(c.createdAt).getDay());

  // 통계
  const [totalEarned, totalSpent, eventWins] = await Promise.all([
    db.pointTransaction.aggregate({
      where: {
        userPoints: { userId: user.id },
        amount: { gt: 0 },
      },
      _sum: { amount: true },
    }),
    db.pointTransaction.aggregate({
      where: {
        userPoints: { userId: user.id },
        amount: { lt: 0 },
      },
      _sum: { amount: true },
    }),
    db.participation.count({
      where: { userId: user.id, isWinner: true },
    }),
  ]);

  return json({
    points: userPoints,
    recentHistory,
    todayCheckedIn: !!todayCheckIn,
    weekCheckInDays,
    stats: {
      totalEarned: totalEarned._sum.amount || 0,
      totalSpent: Math.abs(totalSpent._sum.amount || 0),
      eventWins,
    },
    config: POINT_CONFIG,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'checkIn') {
    try {
      const result = await dailyCheckIn(user.id);
      return json({ success: true, points: result.points, isBonus: result.isBonus });
    } catch (error: any) {
      return json({ success: false, error: error.message }, { status: 400 });
    }
  }

  return json({ success: false, error: 'Unknown action' }, { status: 400 });
}

export default function PointsPage() {
  const { points, recentHistory, todayCheckedIn, weekCheckInDays, stats, config } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const isCheckingIn = fetcher.state === 'submitting';
  const checkInResult = fetcher.data;

  const weekDays = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container mx-auto px-4 py-8" style={{ maxWidth: '600px' }}>
        {/* 포인트 카드 */}
        <div className="bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-2xl p-6 text-white mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Coins className="w-6 h-6" />
            <span className="text-blue-100">내 포인트</span>
          </div>

          <div className="text-5xl font-bold mb-2">
            {points.balance.toLocaleString()}
            <span className="text-2xl font-normal opacity-75">P</span>
          </div>

          <div className="flex items-center gap-4 text-sm text-blue-100">
            <span>누적 {points.lifetime.toLocaleString()}P</span>
          </div>
        </div>

        {/* 출석 체크 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-500" />
              출석 체크
            </h2>
            <span className="text-sm text-gray-500">
              매일 +{config.DAILY_CHECK_IN}P
            </span>
          </div>

          {/* 주간 출석 현황 */}
          <div className="grid grid-cols-7 gap-2 mb-4">
            {weekDays.map((day, index) => {
              const isChecked = weekCheckInDays.includes(index);
              const isCurrentDay = new Date().getDay() === index;

              return (
                <div
                  key={day}
                  className={cn(
                    'aspect-square rounded-lg flex flex-col items-center justify-center text-sm',
                    isChecked
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                      : isCurrentDay
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 ring-2 ring-blue-500'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                  )}
                >
                  <span className="text-xs">{day}</span>
                  {isChecked && <CheckCircle className="w-4 h-4 mt-0.5" />}
                </div>
              );
            })}
          </div>

          {/* 출석 체크 버튼 */}
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="checkIn" />
            <Button
              type="submit"
              className="w-full"
              disabled={todayCheckedIn || isCheckingIn}
            >
              {isCheckingIn ? (
                <>
                  <Clock className="w-4 h-4 mr-2 animate-spin" />
                  출석 중...
                </>
              ) : todayCheckedIn ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  오늘 출석 완료!
                </>
              ) : (
                <>
                  <Gift className="w-4 h-4 mr-2" />
                  출석 체크하기
                </>
              )}
            </Button>
          </fetcher.Form>

          {/* 출석 체크 결과 */}
          {checkInResult?.success && (
            <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
              <Sparkles className="w-8 h-8 mx-auto text-yellow-500 mb-2" />
              <p className="font-bold text-green-600">
                +{checkInResult.points}P 획득!
              </p>
              {checkInResult.isBonus && (
                <p className="text-sm text-green-500 mt-1">
                  7일 연속 출석 보너스!
                </p>
              )}
            </div>
          )}

          {checkInResult?.error && (
            <p className="mt-4 text-center text-red-500 text-sm">
              {checkInResult.error}
            </p>
          )}
        </div>

        {/* 통계 */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatBox
            icon={TrendingUp}
            label="총 획득"
            value={stats.totalEarned}
            color="text-green-500"
          />
          <StatBox
            icon={Coins}
            label="총 사용"
            value={stats.totalSpent}
            color="text-red-500"
          />
          <StatBox
            icon={Trophy}
            label="이벤트 승리"
            value={stats.eventWins}
            suffix="회"
            color="text-yellow-500"
          />
        </div>

        {/* 포인트 획득 방법 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6">
          <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4">
            포인트 획득 방법
          </h2>
          <div className="space-y-3">
            <EarnMethod
              icon={Gift}
              title="회원가입"
              points={config.SIGNUP_BONUS}
              description="처음 가입하면 바로 지급"
            />
            <EarnMethod
              icon={Calendar}
              title="출석 체크"
              points={config.DAILY_CHECK_IN}
              description="매일 출석 체크"
            />
            <EarnMethod
              icon={Trophy}
              title="이벤트 승리"
              points="베팅 x2"
              description="이벤트 정답 맞추기"
            />
            <EarnMethod
              icon={Sparkles}
              title="예측 성공"
              points="베팅 x3"
              description="예측 이벤트 정답"
            />
          </div>
        </div>

        {/* 최근 내역 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <History className="w-5 h-5" />
              최근 내역
            </h2>
            <Link
              to="/points/history"
              className="text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1"
            >
              전체보기
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {recentHistory.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                아직 거래 내역이 없습니다
              </div>
            ) : (
              recentHistory.map((tx) => (
                <TransactionItem key={tx.id} transaction={tx} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({
  icon: Icon,
  label,
  value,
  suffix = 'P',
  color,
}: {
  icon: any;
  label: string;
  value: number;
  suffix?: string;
  color: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center">
      <Icon className={cn('w-5 h-5 mx-auto mb-2', color)} />
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="font-bold text-gray-900 dark:text-gray-100">
        {value.toLocaleString()}{suffix}
      </p>
    </div>
  );
}

function EarnMethod({
  icon: Icon,
  title,
  points,
  description,
}: {
  icon: any;
  title: string;
  points: number | string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
        <Icon className="w-5 h-5 text-blue-500" />
      </div>
      <div className="flex-1">
        <p className="font-medium text-gray-900 dark:text-gray-100">{title}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <span className="text-blue-500 font-bold">
        +{typeof points === 'number' ? `${points}P` : points}
      </span>
    </div>
  );
}

function TransactionItem({ transaction }: { transaction: any }) {
  const isPositive = transaction.amount > 0;

  const typeLabels: Record<string, string> = {
    EARN_SIGNUP: '회원가입 보너스',
    EARN_CHECK_IN: '출석 체크',
    EARN_WIN: '이벤트 승리',
    EARN_PREDICTION: '예측 성공',
    EARN_BONUS: '보너스',
    SPEND_EVENT: '이벤트 참여',
    SPEND_BET: '베팅',
    ADMIN_ADJUST: '관리자 조정',
  };

  return (
    <div className="flex items-center justify-between p-4">
      <div>
        <p className="font-medium text-gray-900 dark:text-gray-100">
          {typeLabels[transaction.type] || transaction.type}
        </p>
        <p className="text-xs text-gray-500">
          {format(new Date(transaction.createdAt), 'MM.dd HH:mm', { locale: ko })}
        </p>
      </div>
      <div className="text-right">
        <p className={cn(
          'font-bold',
          isPositive ? 'text-green-600' : 'text-red-600'
        )}>
          {isPositive ? '+' : ''}{transaction.amount.toLocaleString()}P
        </p>
        <p className="text-xs text-gray-400">
          잔액 {transaction.balance.toLocaleString()}P
        </p>
      </div>
    </div>
  );
}
