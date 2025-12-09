import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/node';
import { RegisterForm } from '~/components/auth/RegisterForm';
import { createUser, createUserSession, getUserByEmail, getUserByUsername, getUserId } from '~/lib/auth.server';
import { safeRedirect } from '~/lib/utils';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getUserId(request);
  if (userId) return redirect('/');
  
  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const username = formData.get('username');
  const email = formData.get('email');
  const password = formData.get('password');
  const confirmPassword = formData.get('confirmPassword');
  const name = formData.get('name');
  const redirectTo = safeRedirect(formData.get('redirectTo'), '/');

  // 유효성 검사
  const fieldErrors: Record<string, string> = {};

  if (typeof username !== 'string' || username.length < 3) {
    fieldErrors.username = '사용자명은 3자 이상이어야 합니다';
  } else if (username.length > 20) {
    fieldErrors.username = '사용자명은 20자 이하여야 합니다';
  } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    fieldErrors.username = '사용자명은 영문, 숫자, 언더스코어(_)만 사용할 수 있습니다';
  }

  if (typeof email !== 'string' || !email.includes('@')) {
    fieldErrors.email = '올바른 이메일 형식이 아닙니다';
  }

  if (typeof password !== 'string' || password.length < 8) {
    fieldErrors.password = '비밀번호는 8자 이상이어야 합니다';
  } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
    fieldErrors.password = '비밀번호는 대문자, 소문자, 숫자를 포함해야 합니다';
  }

  if (password !== confirmPassword) {
    fieldErrors.confirmPassword = '비밀번호가 일치하지 않습니다';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return json({ fieldErrors }, { status: 400 });
  }

  // 중복 확인
  const existingUserByEmail = await getUserByEmail(email as string);
  if (existingUserByEmail) {
    return json(
      { fieldErrors: { email: '이미 사용 중인 이메일입니다' } },
      { status: 400 }
    );
  }

  const existingUserByUsername = await getUserByUsername(username as string);
  if (existingUserByUsername) {
    return json(
      { fieldErrors: { username: '이미 사용 중인 사용자명입니다' } },
      { status: 400 }
    );
  }

  try {
    const user = await createUser({
      username: username as string,
      email: email as string,
      password: password as string,
      name: name as string | undefined,
    });

    return createUserSession(user.id, redirectTo, false);
  } catch (_error) {
    return json(
      { error: '회원가입 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 500 }
    );
  }
}

export default function RegisterPage() {
  return (
    <div className="container py-8">
      <RegisterForm />
    </div>
  );
}