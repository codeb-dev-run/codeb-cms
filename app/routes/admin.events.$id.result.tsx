/**
 * 이벤트 결과 입력 및 정산 페이지
 */

import { json, redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from '@remix-run/node';
import { useLoaderData, Form, useNavigation, Link } from '@remix-run/react';
import { db } from '~/lib/db.server';
import { requireAdmin } from '~/lib/auth.server';
import { Button } from '~/components/ui/button';
import { ArrowLeft, CheckCircle, Trophy, Users, Coins, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { centrifugo } from '~/lib/centrifugo/client.server';
import { CHANNELS } from '~/lib/centrifugo/channels';

interface EventOption {
  id: string;
  label: string;
  color: string;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const { id } = params;

  const event = await db.participationEvent.findUnique({
    where: { id },
    include: {
      _count: { select: { participations: true } },
    },
  });

  if (!event) {
    throw new Response('이벤트를 찾을 수 없습니다', { status: 404 });
  }

  if (event.status !== 'CLOSED') {
    throw new Response('마감된 이벤트만 정산할 수 있습니다', { status: 400 });
  }

  // 선택지별 통계
  const options = event.options as EventOption[];
  const stats = await db.participation.groupBy({
    by: ['choice'],
    where: { eventId: id },
    _count: true,
    _sum: { points: true },
  });

  const optionStats = options.map((option) => {
    const stat = stats.find((s) => s.choice === option.id);
    return {
      ...option,
      count: stat?._count || 0,
      totalPoints: stat?._sum?.points || 0,
      percentage: event._count.participations > 0
        ? Math.round(((stat?._count || 0) / event._count.participations) * 100)
        : 0,
    };
  });

  return json({ event, optionStats });
}

export async function action({ request, params }: ActionFunctionArgs) {
  await requireAdmin(request);

  const { id } = params;
  const formData = await request.formData();
  const correctAnswer = formData.get('correctAnswer') as string;

  if (!correctAnswer) {
    return json({ error: '정답을 선택해주세요' }, { status: 400 });
  }

  const event = await db.participationEvent.findUnique({
    where: { id },
    include: {
      participations: {
        include: {
          user: { select: { id: true, username: true } },
        },
      },
    },
  });

  if (!event) {
    return json({ error: '이벤트를 찾을 수 없습니다' }, { status: 404 });
  }

  // 트랜잭션으로 정산 처리
  await db.$transaction(async (tx) => {
    const winners: string[] = [];
    const losers: string[] = [];

    for (const participation of event.participations) {
      const isWinner = participation.choice === correctAnswer;
      const reward = isWinner
        ? Math.floor(participation.points * event.rewardMultiplier)
        : 0;

      // 참여 기록 업데이트
      await tx.participation.update({
        where: { id: participation.id },
        data: {
          isWinner,
          reward,
        },
      });

      // 사용자 포인트 업데이트
      const userPoints = await tx.userPoints.upsert({
        where: { userId: participation.userId },
        create: {
          userId: participation.userId,
          balance: isWinner ? reward : 0,
          lifetime: isWinner ? reward : 0,
          wins: isWinner ? 1 : 0,
          losses: isWinner ? 0 : 1,
          streak: isWinner ? 1 : 0,
          maxStreak: isWinner ? 1 : 0,
        },
        update: {
          balance: { increment: isWinner ? reward : 0 },
          lifetime: { increment: isWinner ? reward : 0 },
          wins: { increment: isWinner ? 1 : 0 },
          losses: { increment: isWinner ? 0 : 1 },
          streak: isWinner ? { increment: 1 } : 0, // 패배 시 연승 초기화
          maxStreak: isWinner
            ? { increment: 0 } // 별도 처리 필요
            : undefined,
        },
      });

      // 포인트 거래 내역 생성
      if (isWinner && reward > 0) {
        await tx.pointTransaction.create({
          data: {
            userPointId: userPoints.id,
            type: 'EARN_WIN',
            amount: reward,
            balance: userPoints.balance + reward,
            eventId: event.id,
            description: `${event.title} 이벤트 승리 보상`,
          },
        });
      }

      if (isWinner) {
        winners.push(participation.userId);
      } else {
        losers.push(participation.userId);
      }
    }

    // 이벤트 상태 업데이트
    await tx.participationEvent.update({
      where: { id },
      data: {
        status: 'SETTLED',
        correctAnswer,
        resultAt: new Date(),
      },
    });

    // 리더보드 업데이트 (간단 버전)
    // TODO: 더 정교한 리더보드 계산 로직 필요

    return { winners: winners.length, losers: losers.length };
  });

  // 실시간 알림 발송
  try {
    await centrifugo.publish(CHANNELS.event(id!), {
      type: 'SETTLED',
      correctAnswer,
      settledAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Failed to publish settlement notification:', e);
  }

  return redirect(`/admin/events/${id}?settled=true`);
}

export default function AdminEventResult() {
  const { event, optionStats } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  const totalPoints = optionStats.reduce((sum, o) => sum + o.totalPoints, 0);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-4">
        <Link to={`/admin/events/${event.id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">결과 입력</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {event.title}
          </p>
        </div>
      </div>

      {/* 경고 */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-medium text-yellow-800 dark:text-yellow-200">정산 주의사항</div>
          <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
            정답을 선택하면 자동으로 포인트가 정산됩니다. 정산 후에는 되돌릴 수 없으니 신중하게 선택해주세요.
          </p>
        </div>
      </div>

      {/* 통계 요약 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center">
          <Users className="w-6 h-6 mx-auto mb-2 text-blue-500" />
          <div className="text-2xl font-bold">{event._count.participations}</div>
          <div className="text-sm text-gray-500">총 참여자</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center">
          <Coins className="w-6 h-6 mx-auto mb-2 text-yellow-500" />
          <div className="text-2xl font-bold">{totalPoints.toLocaleString()}</div>
          <div className="text-sm text-gray-500">베팅 포인트</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center">
          <Trophy className="w-6 h-6 mx-auto mb-2 text-purple-500" />
          <div className="text-2xl font-bold">x{event.rewardMultiplier}</div>
          <div className="text-sm text-gray-500">보상 배수</div>
        </div>
      </div>

      {/* 정답 선택 */}
      <Form method="post" className="bg-white dark:bg-gray-800 rounded-lg p-6 space-y-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">정답 선택</h2>

        <div className="space-y-3">
          {optionStats.map((option) => {
            const estimatedReward = Math.floor(option.totalPoints * event.rewardMultiplier);

            return (
              <label
                key={option.id}
                className="flex items-center gap-4 p-4 border-2 rounded-lg cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 dark:has-[:checked]:bg-blue-900/20"
              >
                <input
                  type="radio"
                  name="correctAnswer"
                  value={option.id}
                  className="w-5 h-5 text-blue-600"
                />
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: option.color }}
                >
                  {option.label.charAt(0)}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {option.label}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {option.count}명 참여 ({option.percentage}%) · {option.totalPoints.toLocaleString()}P 베팅
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">예상 지급</div>
                  <div className="font-bold text-green-600">
                    {estimatedReward.toLocaleString()}P
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Link to={`/admin/events/${event.id}`}>
            <Button type="button" variant="outline">
              취소
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-green-600 hover:bg-green-700"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            {isSubmitting ? '정산 중...' : '정산하기'}
          </Button>
        </div>
      </Form>
    </div>
  );
}
