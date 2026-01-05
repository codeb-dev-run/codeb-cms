/**
 * 어드민 메트릭 API
 * 실시간 대시보드 통계 데이터 제공
 */

import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { db } from '~/lib/db.server';
import { requireAdmin } from '~/lib/auth.server';
import { centrifugo } from '~/lib/centrifugo/client.server';
import { CHANNELS } from '~/lib/centrifugo/channels';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 병렬로 통계 조회
  const [
    activeEvents,
    participationsToday,
    pointsToday,
    userCount,
    recentParticipations,
  ] = await Promise.all([
    // 활성 이벤트 수
    db.participationEvent.count({
      where: { status: 'OPEN' },
    }),

    // 오늘 참여 수
    db.participation.count({
      where: { createdAt: { gte: today } },
    }),

    // 오늘 포인트 통계
    db.pointTransaction.aggregate({
      where: { createdAt: { gte: today } },
      _sum: { amount: true },
    }),

    // 총 사용자 수
    db.user.count(),

    // 최근 5분 참여 (분당 참여율 계산용)
    db.participation.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 5 * 60 * 1000),
        },
      },
    }),
  ]);

  // 오늘 포인트 획득/사용 분리
  const [earnedToday, spentToday] = await Promise.all([
    db.pointTransaction.aggregate({
      where: {
        createdAt: { gte: today },
        amount: { gt: 0 },
      },
      _sum: { amount: true },
    }),
    db.pointTransaction.aggregate({
      where: {
        createdAt: { gte: today },
        amount: { lt: 0 },
      },
      _sum: { amount: true },
    }),
  ]);

  // 실시간 접속자 수 (Centrifugo presence 사용)
  let activeUsers = 0;
  try {
    const info = await centrifugo.info();
    activeUsers = info.nodes.reduce((sum, node) => sum + node.num_users, 0);
  } catch (error) {
    // Centrifugo 연결 실패 시 기본값 사용
    console.error('Failed to get Centrifugo info:', error);
  }

  const metrics = {
    activeUsers,
    activeEvents,
    participationsToday,
    participationsPerMin: Math.round(recentParticipations / 5),
    pointsEarnedToday: earnedToday._sum.amount || 0,
    pointsSpentToday: Math.abs(spentToday._sum.amount || 0),
    totalUsers: userCount,
    lastUpdated: new Date().toISOString(),
  };

  return json(metrics);
}
