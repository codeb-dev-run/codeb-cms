/**
 * 포인트 API
 */

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from '@remix-run/node';
import { db } from '~/lib/db.server';
import { requireUser } from '~/lib/auth.server';
import { getUserPoints, dailyCheckIn, getPointHistory } from '~/lib/points/point.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const url = new URL(request.url);

  const action = url.searchParams.get('action');

  if (action === 'history') {
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    const history = await getPointHistory(user.id, limit, offset);
    const total = await db.pointTransaction.count({
      where: { userPoints: { userId: user.id } },
    });

    return json({
      history,
      total,
      hasMore: offset + history.length < total,
    });
  }

  const points = await getUserPoints(user.id);

  return json({
    balance: points.balance,
    lifetime: points.lifetime,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'checkIn') {
    try {
      const result = await dailyCheckIn(user.id);
      return json({
        success: true,
        points: result.points,
        isBonus: result.isBonus,
        newBalance: result.newBalance,
      });
    } catch (error: any) {
      return json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
  }

  return json(
    { success: false, error: 'Unknown action' },
    { status: 400 }
  );
}
