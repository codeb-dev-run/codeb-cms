/**
 * 포인트 시스템 서버 로직
 */

import { db } from '~/lib/db.server';

// 포인트 설정값
export const POINT_CONFIG = {
  SIGNUP_BONUS: 100,        // 가입 보너스
  DAILY_CHECKIN: 10,        // 일일 출석
  WIN_MULTIPLIER: 2,        // 승리 보상 배수
  PREDICTION_MULTIPLIER: 3, // 예측 정답 배수
  REFERRAL_BONUS: 50,       // 추천인 보너스
};

export type PointTransactionType =
  | 'EARN_SIGNUP'      // 가입 보너스
  | 'EARN_CHECKIN'     // 일일 출석
  | 'EARN_WIN'         // 이벤트 승리
  | 'EARN_REFERRAL'    // 추천인 보너스
  | 'EARN_BONUS'       // 관리자 지급
  | 'SPEND_EVENT'      // 이벤트 참여
  | 'SPEND_PURCHASE'   // 아이템 구매
  | 'REFUND'           // 환불
  | 'ADJUST';          // 조정

/**
 * 사용자 포인트 조회 (없으면 생성)
 */
export async function getUserPoints(userId: string) {
  let userPoints = await db.userPoints.findUnique({
    where: { userId },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!userPoints) {
    userPoints = await db.userPoints.create({
      data: {
        userId,
        balance: POINT_CONFIG.SIGNUP_BONUS,
        lifetime: POINT_CONFIG.SIGNUP_BONUS,
      },
      include: {
        transactions: true,
      },
    });

    // 가입 보너스 거래 기록
    await db.pointTransaction.create({
      data: {
        userPointId: userPoints.id,
        type: 'EARN_SIGNUP',
        amount: POINT_CONFIG.SIGNUP_BONUS,
        balance: POINT_CONFIG.SIGNUP_BONUS,
        description: '가입 축하 보너스',
      },
    });
  }

  return userPoints;
}

/**
 * 포인트 추가
 */
export async function addPoints(
  userId: string,
  amount: number,
  type: PointTransactionType,
  options?: {
    eventId?: string;
    description?: string;
  }
) {
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }

  const userPoints = await getUserPoints(userId);

  const updated = await db.userPoints.update({
    where: { id: userPoints.id },
    data: {
      balance: { increment: amount },
      lifetime: { increment: amount },
    },
  });

  await db.pointTransaction.create({
    data: {
      userPointId: userPoints.id,
      type,
      amount,
      balance: updated.balance,
      eventId: options?.eventId,
      description: options?.description,
    },
  });

  return updated;
}

/**
 * 포인트 차감
 */
export async function deductPoints(
  userId: string,
  amount: number,
  type: PointTransactionType,
  options?: {
    eventId?: string;
    description?: string;
  }
) {
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }

  const userPoints = await getUserPoints(userId);

  if (userPoints.balance < amount) {
    throw new Error('Insufficient points');
  }

  const updated = await db.userPoints.update({
    where: { id: userPoints.id },
    data: {
      balance: { decrement: amount },
    },
  });

  await db.pointTransaction.create({
    data: {
      userPointId: userPoints.id,
      type,
      amount: -amount,
      balance: updated.balance,
      eventId: options?.eventId,
      description: options?.description,
    },
  });

  return updated;
}

/**
 * 일일 출석 체크
 */
export async function dailyCheckIn(userId: string) {
  const userPoints = await getUserPoints(userId);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (userPoints.lastCheckIn) {
    const lastCheckIn = new Date(userPoints.lastCheckIn);
    lastCheckIn.setHours(0, 0, 0, 0);

    if (lastCheckIn.getTime() === today.getTime()) {
      return { success: false, message: '오늘 이미 출석체크를 했습니다' };
    }
  }

  const updated = await db.userPoints.update({
    where: { id: userPoints.id },
    data: {
      balance: { increment: POINT_CONFIG.DAILY_CHECKIN },
      lifetime: { increment: POINT_CONFIG.DAILY_CHECKIN },
      lastCheckIn: new Date(),
    },
  });

  await db.pointTransaction.create({
    data: {
      userPointId: userPoints.id,
      type: 'EARN_CHECKIN',
      amount: POINT_CONFIG.DAILY_CHECKIN,
      balance: updated.balance,
      description: '일일 출석 보너스',
    },
  });

  return { success: true, points: POINT_CONFIG.DAILY_CHECKIN, newBalance: updated.balance };
}

/**
 * 포인트 거래 내역 조회
 */
export async function getPointHistory(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    type?: PointTransactionType;
  }
) {
  const userPoints = await db.userPoints.findUnique({
    where: { userId },
  });

  if (!userPoints) {
    return { transactions: [], total: 0 };
  }

  const where = {
    userPointId: userPoints.id,
    ...(options?.type && { type: options.type }),
  };

  const [transactions, total] = await Promise.all([
    db.pointTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 20,
      skip: options?.offset || 0,
    }),
    db.pointTransaction.count({ where }),
  ]);

  return { transactions, total };
}

/**
 * 리더보드 업데이트
 */
export async function updateLeaderboard(userId: string) {
  const userPoints = await db.userPoints.findUnique({
    where: { userId },
    select: { lifetime: true, wins: true, losses: true },
  });

  if (!userPoints) return;

  const totalGames = userPoints.wins + userPoints.losses;
  const winRate = totalGames > 0 ? (userPoints.wins / totalGames) * 100 : 0;

  const periods = ['daily', 'weekly', 'monthly', 'all_time'];

  for (const period of periods) {
    await db.leaderboardEntry.upsert({
      where: {
        userId_period: { userId, period },
      },
      create: {
        userId,
        period,
        points: userPoints.lifetime,
        wins: userPoints.wins,
        winRate,
        rank: 0, // 별도 계산 필요
      },
      update: {
        points: userPoints.lifetime,
        wins: userPoints.wins,
        winRate,
      },
    });
  }
}

/**
 * 리더보드 순위 재계산
 */
export async function recalculateLeaderboardRanks(period: string = 'all_time') {
  const entries = await db.leaderboardEntry.findMany({
    where: { period },
    orderBy: { points: 'desc' },
  });

  for (let i = 0; i < entries.length; i++) {
    await db.leaderboardEntry.update({
      where: { id: entries[i].id },
      data: { rank: i + 1 },
    });
  }
}

/**
 * 상위 리더보드 조회
 */
export async function getLeaderboard(
  period: string = 'all_time',
  limit: number = 100
) {
  return db.leaderboardEntry.findMany({
    where: { period },
    orderBy: { rank: 'asc' },
    take: limit,
    include: {
      user: {
        select: {
          id: true,
          username: true,
          name: true,
          profileImage: true,
        },
      },
    },
  });
}

/**
 * 사용자 순위 조회
 */
export async function getUserRank(userId: string, period: string = 'all_time') {
  return db.leaderboardEntry.findUnique({
    where: {
      userId_period: { userId, period },
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          name: true,
          profileImage: true,
        },
      },
    },
  });
}
