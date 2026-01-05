/**
 * 이벤트 목록 API
 */

import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { db } from '~/lib/db.server';
import { getUser } from '~/lib/auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  const url = new URL(request.url);

  const status = url.searchParams.get('status') || 'OPEN';
  const type = url.searchParams.get('type');
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  const where: any = {};

  if (status !== 'all') {
    where.status = status;
  }

  if (type) {
    where.type = type;
  }

  const [events, total] = await Promise.all([
    db.participationEvent.findMany({
      where,
      orderBy: [
        { status: 'asc' },
        { endsAt: 'asc' },
        { createdAt: 'desc' },
      ],
      take: limit,
      skip: offset,
    }),
    db.participationEvent.count({ where }),
  ]);

  // 사용자 참여 정보 추가
  let userParticipations: Record<string, any> = {};
  if (user) {
    const participations = await db.participation.findMany({
      where: {
        userId: user.id,
        eventId: { in: events.map((e) => e.id) },
      },
    });

    userParticipations = Object.fromEntries(
      participations.map((p) => [p.eventId, {
        choice: p.choice,
        points: p.points,
        isWinner: p.isWinner,
        reward: p.reward,
      }])
    );
  }

  return json({
    events: events.map((event) => ({
      ...event,
      userParticipation: userParticipations[event.id] || null,
    })),
    total,
    hasMore: offset + events.length < total,
  });
}
