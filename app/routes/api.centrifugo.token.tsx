/**
 * Centrifugo 연결 토큰 발급 API
 */

import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { getUser } from '~/lib/auth.server';
import {
  generateConnectionToken,
  generateAnonymousToken,
  generateSubscriptionToken,
} from '~/lib/centrifugo/token.server';
import { canAccessChannel } from '~/lib/centrifugo/channels';

/**
 * GET /api/centrifugo/token
 * 연결 토큰 발급
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const channel = url.searchParams.get('channel');

  const user = await getUser(request);

  // 채널별 구독 토큰 요청인 경우
  if (channel) {
    // 비로그인 사용자의 비공개 채널 접근 차단
    if (channel.startsWith('$') && !user) {
      return json({ error: 'Authentication required for private channels' }, { status: 401 });
    }

    // 채널 접근 권한 확인
    if (!canAccessChannel(channel, user?.id, user?.role)) {
      return json({ error: 'Access denied to this channel' }, { status: 403 });
    }

    // 구독 토큰 발급
    const token = generateSubscriptionToken(
      user?.id || '',
      channel,
      user
        ? {
            username: user.username,
            name: user.name,
            role: user.role,
            avatar: user.profileImage,
          }
        : undefined
    );

    return json({ token, channel });
  }

  // 연결 토큰 발급
  if (user) {
    // 로그인 사용자
    const token = generateConnectionToken(user.id, {
      username: user.username,
      name: user.name,
      role: user.role,
      avatar: user.profileImage,
    });

    return json({
      token,
      userId: user.id,
      username: user.username,
    });
  } else {
    // 익명 사용자
    const token = generateAnonymousToken();

    return json({
      token,
      userId: null,
      username: null,
    });
  }
}
