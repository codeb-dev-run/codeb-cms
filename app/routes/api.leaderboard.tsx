/**
 * 리더보드 API
 */

import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { db } from '~/lib/db.server';
import { getUser } from '~/lib/auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  const url = new URL(request.url);

  const period = url.searchParams.get('period') || 'all_time';
  const limit = parseInt(url.searchParams.get('limit') || '100', 10);

  // 리더보드 조회
  const entries = await db.leaderboardEntry.findMany({
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

  // 현재 사용자 순위
  let userRank = null;
  if (user) {
    userRank = await db.leaderboardEntry.findUnique({
      where: {
        userId_period: {
          userId: user.id,
          period,
        },
      },
    });
  }

  return json({
    entries,
    userRank,
    period,
  });
}
