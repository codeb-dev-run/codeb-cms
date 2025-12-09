import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { PasswordResetForm } from '~/components/auth/PasswordResetForm';
import { createPasswordResetToken, resetPassword } from '~/lib/auth.server';
import { sendPasswordResetEmail } from '~/lib/email.server';
import { prisma } from '~/lib/db.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  
  return json({ token });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = formData.get('email');
  const token = formData.get('token');
  const password = formData.get('password');
  const confirmPassword = formData.get('confirmPassword');

  // 비밀번호 재설정 요청
  if (email && typeof email === 'string') {
    try {
      const result = await createPasswordResetToken(email);
      
      // 보안상 이유로 사용자 존재 여부와 관계없이 성공 메시지 표시
      // 실제로는 여기서 이메일을 보내야 함
      if (result) {
        // 사용자 정보 조회
        const user = await prisma.user.findUnique({
          where: { email },
          select: { name: true, username: true, email: true }
        });

        if (user) {
          // 이메일 발송
          await sendPasswordResetEmail(user, result.resetToken);
        }
      }
      
      return json({ success: true });
    } catch (_error) {
      return json(
        { error: '요청 처리 중 오류가 발생했습니다' },
        { status: 500 }
      );
    }
  }

  // 비밀번호 재설정
  if (token && password) {
    if (typeof password !== 'string' || password.length < 8) {
      return json(
        { error: '비밀번호는 8자 이상이어야 합니다' },
        { status: 400 }
      );
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      return json(
        { error: '비밀번호는 대문자, 소문자, 숫자를 포함해야 합니다' },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return json(
        { error: '비밀번호가 일치하지 않습니다' },
        { status: 400 }
      );
    }

    try {
      await resetPassword(token as string, password);
      // 성공 후 로그인 페이지로 리다이렉트
      return json({ success: true, redirect: '/auth/login' });
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : '비밀번호 재설정에 실패했습니다' },
        { status: 400 }
      );
    }
  }

  return json({ error: '잘못된 요청입니다' }, { status: 400 });
}

export default function ForgotPasswordPage() {
  const { token } = useLoaderData<typeof loader>();

  return (
    <div className="container py-8">
      <PasswordResetForm 
        mode={token ? 'reset' : 'request'} 
        token={token || undefined}
      />
    </div>
  );
}