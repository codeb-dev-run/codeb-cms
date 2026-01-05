/**
 * 이벤트 참여 API
 */

import { json, type ActionFunctionArgs } from '@remix-run/node';
import { db } from '~/lib/db.server';
import { getUser } from '~/lib/auth.server';
import { centrifugo } from '~/lib/centrifugo/client.server';
import { CHANNELS } from '~/lib/centrifugo/channels';

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const user = await getUser(request);
  if (!user) {
    return json({ error: '로그인이 필요합니다' }, { status: 401 });
  }

  const { id: eventId } = params;
  const formData = await request.formData();
  const choice = formData.get('choice') as string;
  const points = parseInt(formData.get('points') as string) || 0;

  if (!choice) {
    return json({ error: '선택지를 선택해주세요' }, { status: 400 });
  }

  // 이벤트 조회
  const event = await db.participationEvent.findUnique({
    where: { id: eventId },
  });

  if (!event) {
    return json({ error: '이벤트를 찾을 수 없습니다' }, { status: 404 });
  }

  if (event.status !== 'OPEN') {
    return json({ error: '참여할 수 없는 이벤트입니다' }, { status: 400 });
  }

  const now = new Date();
  if (now < event.startsAt || now > event.endsAt) {
    return json({ error: '참여 기간이 아닙니다' }, { status: 400 });
  }

  // 이미 참여했는지 확인
  const existingParticipation = await db.participation.findUnique({
    where: {
      eventId_userId: {
        eventId: eventId!,
        userId: user.id,
      },
    },
  });

  if (existingParticipation) {
    return json({ error: '이미 참여하셨습니다' }, { status: 400 });
  }

  // 포인트 차감이 필요한 경우
  const totalCost = event.pointCost + points;
  if (totalCost > 0) {
    const userPoints = await db.userPoints.findUnique({
      where: { userId: user.id },
    });

    if (!userPoints || userPoints.balance < totalCost) {
      return json({ error: '포인트가 부족합니다' }, { status: 400 });
    }
  }

  // IP 주소 가져오기
  const ipAddress =
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    'unknown';

  try {
    // 트랜잭션으로 참여 처리
    const participation = await db.$transaction(async (tx) => {
      // 포인트 차감
      if (totalCost > 0) {
        const userPoints = await tx.userPoints.update({
          where: { userId: user.id },
          data: {
            balance: { decrement: totalCost },
          },
        });

        // 포인트 거래 내역
        await tx.pointTransaction.create({
          data: {
            userPointId: userPoints.id,
            type: 'SPEND_EVENT',
            amount: -totalCost,
            balance: userPoints.balance,
            eventId: eventId,
            description: `${event.title} 이벤트 참여`,
          },
        });
      }

      // 참여 기록 생성
      const newParticipation = await tx.participation.create({
        data: {
          eventId: eventId!,
          userId: user.id,
          choice,
          points: totalCost,
          ipAddress,
        },
        include: {
          user: { select: { id: true, username: true, name: true, profileImage: true } },
        },
      });

      // 이벤트 참여자 수 업데이트
      await tx.participationEvent.update({
        where: { id: eventId },
        data: {
          totalParticipants: { increment: 1 },
          rewardPool: { increment: totalCost },
        },
      });

      return newParticipation;
    });

    // 실시간 통계 업데이트 발행
    try {
      // 참여자 피드 업데이트
      await centrifugo.publish(CHANNELS.eventFeed(eventId!), {
        type: 'NEW_PARTICIPATION',
        user: {
          id: participation.user.id,
          username: participation.user.username,
          name: participation.user.name,
          avatar: participation.user.profileImage,
        },
        choice,
        points: totalCost,
        timestamp: new Date().toISOString(),
      });

      // 통계 업데이트 (별도 계산 후 발행)
      const stats = await db.participation.groupBy({
        by: ['choice'],
        where: { eventId: eventId },
        _count: true,
      });

      const totalCount = await db.participationEvent.findUnique({
        where: { id: eventId },
        select: { totalParticipants: true },
      });

      const options = event.options as Array<{ id: string; label: string; color: string }>;
      const optionStats = options.map((option) => {
        const stat = stats.find((s) => s.choice === option.id);
        return {
          id: option.id,
          count: stat?._count || 0,
          percentage: totalCount?.totalParticipants
            ? Math.round(((stat?._count || 0) / totalCount.totalParticipants) * 100)
            : 0,
        };
      });

      await centrifugo.publish(CHANNELS.eventStats(eventId!), {
        totalParticipants: totalCount?.totalParticipants || 0,
        options: optionStats,
      });
    } catch (e) {
      console.error('Failed to publish participation update:', e);
    }

    return json({
      success: true,
      participation: {
        id: participation.id,
        choice: participation.choice,
        points: participation.points,
      },
    });
  } catch (error) {
    console.error('Participation error:', error);
    return json({ error: '참여 중 오류가 발생했습니다' }, { status: 500 });
  }
}
