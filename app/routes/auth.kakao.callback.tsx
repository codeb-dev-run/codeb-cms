/**
 * 카카오 OAuth 콜백 처리 라우트
 * /auth/kakao/callback - 카카오에서 리다이렉트되는 콜백 URL
 */

import { type LoaderFunction, redirect } from '@remix-run/node';
import { handleKakaoCallback } from '~/lib/auth/kakao.server';
import { commitSession, getSession } from '~/lib/session.server';

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  // 에러 처리
  if (error) {
    console.error('카카오 OAuth 에러:', error, errorDescription);
    return redirect('/login?error=kakao_auth_failed');
  }

  if (!code || !state) {
    return redirect('/login?error=missing_params');
  }

  const session = await getSession(request.headers.get('Cookie'));
  const sessionState = session.get('kakao_oauth_state');
  const returnTo = session.get('return_to') || '/';

  if (!sessionState) {
    return redirect('/login?error=missing_state');
  }

  try {
    // 카카오 콜백 처리
    const { sessionToken, user, isNewUser } = await handleKakaoCallback(
      code,
      state,
      sessionState
    );

    // 세션 정리 및 설정
    session.unset('kakao_oauth_state');
    session.unset('return_to');
    session.set('session_token', sessionToken);
    session.set('user_id', user.id);
    session.flash('message', isNewUser ? '카카오 계정으로 가입되었습니다!' : '로그인되었습니다!');

    // 환영 페이지 또는 원래 페이지로 리다이렉트
    const redirectUrl = isNewUser ? '/welcome' : returnTo;
    
    return redirect(redirectUrl, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    });
  } catch (error) {
    console.error('카카오 로그인 처리 실패:', error);
    
    // 에러 메시지와 함께 로그인 페이지로 리다이렉트
    session.flash('error', '카카오 로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
    
    return redirect('/login', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    });
  }
};

// 에러 페이지 컴포넌트 (옵션)
export default function KakaoCallbackError() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-red-600">인증 오류</h1>
        <p className="mt-2 text-gray-600">카카오 로그인 처리 중 오류가 발생했습니다.</p>
        <a href="/login" className="mt-4 inline-block text-blue-600 hover:underline">
          로그인 페이지로 돌아가기
        </a>
      </div>
    </div>
  );
}