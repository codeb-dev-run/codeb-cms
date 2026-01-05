/**
 * 이벤트 상세 API
 */

import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { db } from '~/lib/db.server';
import { getUser } from '~/lib/auth.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await getUser(request);
  const { id } = params;

  if (!id) {
    throw new Response('Event ID required', { status: 400 });
  }

  const event = await db.participationEvent.findUnique({
    where: { id },
  });

  if (!event) {
    throw new Response('Event not found', { status: 404 });
  }

  // 옵션별 통계 계산
  const options = event.options as Array<{ id: string; label: string; color: string }>;
  const participationsByChoice = await db.participation.groupBy({
    by: ['choice'],
    where: { eventId: id },
    _count: true,
  });

  const totalParticipants = participationsByChoice.reduce((sum, p) => sum + p._count, 0);

  const optionStats = options.map((option) => {
    const participation = participationsByChoice.find((p) => p.choice === option.id);
    const count = participation?._count || 0;
    const percentage = totalParticipants > 0
      ? Math.round((count / totalParticipants) * 100)
      : 0;

    return {
      id: option.id,
      label: option.label,
      color: option.color,
      count,
      percentage,
    };
  });

  // 사용자 참여 정보
  let userParticipation = null;
  if (user) {
    const participation = await db.participation.findUnique({
      where: {
        eventId_userId: {
          eventId: id,
          userId: user.id,
        },
      },
    });

    if (participation) {
      userParticipation = {
        choice: participation.choice,
        points: participation.points,
        isWinner: participation.isWinner,
        reward: participation.reward,
        createdAt: participation.createdAt,
      };
    }
  }

  // 최근 참여자
  const recentParticipants = await db.participation.findMany({
    where: { eventId: id },
    orderBy: { createdAt: 'desc' },
    take: 10,
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

  return json({
    event: {
      ...event,
      totalParticipants,
    },
    optionStats,
    userParticipation,
    recentParticipants: recentParticipants.map((p) => ({
      id: p.id,
      choice: p.choice,
      user: p.user,
      createdAt: p.createdAt,
    })),
  });
}
