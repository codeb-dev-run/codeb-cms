# 🚀 CodeB CMS - 10점 프로젝트 업그레이드 가이드

현재 점수: **6.2/10** → 목표: **10/10**

이 문서는 CodeB CMS를 완벽한 10점 프로젝트로 만들기 위한 단계별 가이드입니다.

---

## 📋 완료된 작업 ✅

### 1. Docker 환경 설정
- ✅ `.env.example` 업데이트 (올바른 DB/Redis 설정)
- ✅ `scripts/init-dev.sh` 개발 환경 자동 초기화 스크립트
- ✅ 헬스체크 및 자동 대기 로직

**사용법**:
```bash
./scripts/init-dev.sh
npm run dev
```

### 2. Package.json 최적화
- ✅ `"type": "module"` 추가 (모듈 경고 제거)
- ✅ 프로젝트 이름 변경: `codeb-cms` → `codeb-cms`
- ✅ 개발 스크립트 추가:
  - `npm run setup` - 원클릭 환경 설정
  - `npm run docker:up/down` - Docker 관리
  - `npm run test:*` - 테스트 실행
  - `npm run lint/typecheck` - 코드 품질 검사
  - `npm run validate` - 전체 검증

### 3. 로깅 시스템 구현
- ✅ `app/lib/logger.server.ts` 생성
  - Pino 기반 구조화된 로깅
  - 컴포넌트별 전용 로거 (db, auth, api, cache, security)
  - 성능 측정 유틸리티
  - 요청별 추적 ID

### 4. 테스트 프레임워크 설정
- ✅ `vitest.config.ts` - 단위/통합 테스트
- ✅ Playwright 설정 준비

---

## 🔴 필수 작업 (1-2주)

### 1. 의존성 설치 및 보안 수정

```bash
# 새 의존성 설치
npm install

# 보안 취약점 수정
npm audit fix

# 수동 확인 필요한 항목 검토
npm audit
```

**예상 결과**: 취약점 0개

---

### 2. console.log 제거 및 로거 적용

**현재 문제**: 504개의 console.log 구문

**해결 방법**:
```bash
# 1. 전역 검색 및 교체
# console.log → logger.debug
# console.error → logger.error
# console.warn → logger.warn
# console.info → logger.info

# 2. 각 파일 상단에 로거 import 추가
import { logger, createLogger } from '~/lib/logger.server';

# 3. 검증
npm run lint
```

**자동화 스크립트** (scripts/replace-console-logs.sh):
```bash
#!/bin/bash
find app -name "*.ts" -o -name "*.tsx" | while read file; do
  # console.log를 logger.debug로 교체
  sed -i.bak 's/console\.log(/logger.debug(/g' "$file"
  sed -i.bak 's/console\.error(/logger.error(/g' "$file"
  sed -i.bak 's/console\.warn(/logger.warn(/g' "$file"
  sed -i.bak 's/console\.info(/logger.info(/g' "$file"
  rm "${file}.bak"
done
```

---

### 3. 종합 테스트 작성

#### 3.1 단위 테스트 (목표: 70% 커버리지)

**우선순위 테스트 대상**:
1. `app/lib/auth.server.ts` - 인증 로직
2. `app/lib/security/validation.server.ts` - 입력 검증
3. `app/lib/cache/cache-manager.ts` - 캐시 로직
4. `app/lib/notifications/notification.manager.ts` - 알림 로직

**예제 테스트** (app/lib/__tests__/auth.server.test.ts):
```typescript
import { describe, it, expect, vi } from 'vitest';
import { hashPassword, verifyPassword } from '../auth.server';

describe('Authentication', () => {
  describe('hashPassword', () => {
    it('should hash password correctly', async () => {
      const password = 'Test123!@#';
      const hashed = await hashPassword(password);

      expect(hashed).not.toBe(password);
      expect(hashed).toMatch(/^\$2[ayb]\$/);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'Test123!@#';
      const hashed = await hashPassword(password);
      const isValid = await verifyPassword(password, hashed);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'Test123!@#';
      const hashed = await hashPassword(password);
      const isValid = await verifyPassword('WrongPass', hashed);

      expect(isValid).toBe(false);
    });
  });
});
```

**실행**:
```bash
npm run test:unit
npm run test:coverage
```

#### 3.2 통합 테스트

**대상**:
- API 엔드포인트
- 데이터베이스 작업
- 인증 플로우

**예제** (app/routes/__tests__/api.posts.test.ts):
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createMockRequest } from '~/tests/helpers';

describe('POST /api/posts', () => {
  it('should create post with valid data', async () => {
    const request = createMockRequest({
      method: 'POST',
      body: {
        title: 'Test Post',
        content: 'Content',
        menuId: 'menu-1'
      }
    });

    const response = await loader({ request });
    expect(response.status).toBe(201);
  });
});
```

#### 3.3 E2E 테스트 (Playwright)

**핵심 시나리오** (tests/e2e/auth-flow.spec.ts):
```typescript
import { test, expect } from '@playwright/test';

test('user can register and login', async ({ page }) => {
  // 회원가입
  await page.goto('/auth/register');
  await page.fill('[name="email"]', 'test@example.com');
  await page.fill('[name="password"]', 'Test123!@#');
  await page.click('button[type="submit"]');

  // 로그인 확인
  await expect(page).toHaveURL('/');
  await expect(page.locator('text=환영합니다')).toBeVisible();
});

test('admin can create post', async ({ page }) => {
  // 관리자 로그인
  await page.goto('/admin');

  // 게시글 작성
  await page.click('text=새 글 작성');
  await page.fill('[name="title"]', '테스트 게시글');
  await page.fill('[name="content"]', '내용');
  await page.click('button:has-text("게시")');

  // 확인
  await expect(page.locator('text=게시글이 작성되었습니다')).toBeVisible();
});
```

**실행**:
```bash
npm run test:e2e
```

---

### 4. 알림 시스템 완성

#### 4.1 이메일 알림 (Nodemailer)

**파일**: `app/lib/notifications/email.server.ts`

```typescript
import nodemailer from 'nodemailer';
import { logger } from '~/lib/logger.server';

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SMTP_HOST,
  port: parseInt(process.env.EMAIL_SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.EMAIL_SMTP_USER,
    pass: process.env.EMAIL_SMTP_PASS,
  },
});

export async function sendEmail(to: string, subject: string, html: string) {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
    });

    logger.info({ messageId: info.messageId, to }, 'Email sent successfully');
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error({ error, to }, 'Failed to send email');
    throw error;
  }
}

export async function sendWelcomeEmail(email: string, name: string) {
  const html = `
    <h1>환영합니다, ${name}님!</h1>
    <p>CodeB CMS에 가입해 주셔서 감사합니다.</p>
  `;

  return sendEmail(email, '가입을 환영합니다', html);
}
```

#### 4.2 SMS 알림 (Solapi 또는 Twilio)

**파일**: `app/lib/notifications/sms.server.ts`

```typescript
import { logger } from '~/lib/logger.server';

// Solapi 예제
export async function sendSMS(to: string, message: string) {
  if (process.env.SMS_PROVIDER !== 'solapi') {
    logger.warn('SMS provider not configured');
    return { success: false };
  }

  try {
    const response = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SOLAPI_API_KEY}`,
      },
      body: JSON.stringify({
        message: {
          to,
          from: process.env.SOLAPI_FROM,
          text: message,
        },
      }),
    });

    const data = await response.json();
    logger.info({ to, messageId: data.messageId }, 'SMS sent successfully');
    return { success: true, data };
  } catch (error) {
    logger.error({ error, to }, 'Failed to send SMS');
    throw error;
  }
}
```

#### 4.3 푸시 알림 (Firebase Cloud Messaging)

**파일**: `app/lib/notifications/push.server.ts`

```typescript
import admin from 'firebase-admin';
import { logger } from '~/lib/logger.server';

// Firebase 초기화
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}

export async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>
) {
  try {
    const message = {
      notification: { title, body },
      data,
      token,
    };

    const response = await admin.messaging().send(message);
    logger.info({ token, messageId: response }, 'Push notification sent');
    return { success: true, messageId: response };
  } catch (error) {
    logger.error({ error, token }, 'Failed to send push notification');
    throw error;
  }
}
```

#### 4.4 알림 관리자 통합

**app/lib/notifications/notification.manager.ts 업데이트**:

```typescript
import { sendEmail } from './email.server';
import { sendSMS } from './sms.server';
import { sendPushNotification } from './push.server';
import { logger } from '~/lib/logger.server';

// 기존 TODO 주석들을 실제 구현으로 교체

private async sendEmail(notification: Notification): Promise<void> {
  try {
    const user = await this.getUserEmail(notification.userId);
    await sendEmail(user.email, notification.data.subject, notification.data.body);
    logger.info({ notificationId: notification.id }, 'Email notification sent');
  } catch (error) {
    logger.error({ error, notificationId: notification.id }, 'Email notification failed');
    throw error;
  }
}

private async sendSMS(notification: Notification): Promise<void> {
  try {
    const user = await this.getUserPhone(notification.userId);
    await sendSMS(user.phone, notification.data.message);
    logger.info({ notificationId: notification.id }, 'SMS notification sent');
  } catch (error) {
    logger.error({ error, notificationId: notification.id }, 'SMS notification failed');
    throw error;
  }
}

private async sendPush(notification: Notification): Promise<void> {
  try {
    const tokens = await this.getUserPushTokens(notification.userId);
    for (const token of tokens) {
      await sendPushNotification(token, notification.data.title, notification.data.body);
    }
    logger.info({ notificationId: notification.id }, 'Push notification sent');
  } catch (error) {
    logger.error({ error, notificationId: notification.id }, 'Push notification failed');
    throw error;
  }
}
```

---

### 5. 성능 최적화

#### 5.1 Root Loader 캐싱

**app/root.tsx 최적화**:

```typescript
import { cacheManager } from '~/lib/cache/cache-manager';
import { logger, PerformanceLogger } from '~/lib/logger.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const perf = new PerformanceLogger('root-loader');

  try {
    // 캐시에서 먼저 확인
    const cached = await cacheManager.get('app:config');
    if (cached) {
      perf.end({ cached: true });
      return json(cached);
    }

    // 병렬로 데이터 가져오기
    const [user, menus, theme, settings] = await Promise.all([
      getUser(request),
      cacheManager.remember('menus:active', 3600, () =>
        db.menu.findMany({
          where: { isActive: true },
          select: { id: true, name: true, slug: true, order: true },
          orderBy: { order: 'asc' },
        })
      ),
      cacheManager.remember('theme:config', 3600, () => getThemeConfig()),
      cacheManager.remember('settings:map', 3600, async () => {
        const settings = await db.setting.findMany({
          select: { key: true, value: true },
        });
        return settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {});
      }),
    ]);

    const themeCSS = generateCSSVariables(theme);
    const data = { user, menus, theme, themeCSS, settings };

    // 사용자별 캐시 (user 제외)
    if (!user) {
      await cacheManager.set('app:config', { menus, theme, themeCSS, settings }, 3600);
    }

    perf.end({ cached: false });
    return json(data);
  } catch (error) {
    perf.error(error as Error);
    throw error;
  }
}
```

#### 5.2 N+1 쿼리 해결

**Prisma include 최적화**:

```typescript
// ❌ 나쁜 예 (N+1 쿼리)
const posts = await db.post.findMany();
for (const post of posts) {
  const author = await db.user.findUnique({ where: { id: post.authorId } });
  const comments = await db.comment.findMany({ where: { postId: post.id } });
}

// ✅ 좋은 예 (단일 쿼리)
const posts = await db.post.findMany({
  include: {
    author: {
      select: { id: true, username: true, name: true },
    },
    comments: {
      select: { id: true, content: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    },
    _count: {
      select: { comments: true },
    },
  },
});
```

#### 5.3 데이터베이스 인덱스 최적화

**prisma/schema.prisma 검증**:

```prisma
// 인덱스가 누락된 필드 확인
model Post {
  // ...기존 필드...

  // 자주 조회되는 필드에 인덱스 추가
  @@index([isPublished, publishedAt])
  @@index([menuId, isPublished])
  @@index([authorId, createdAt])

  // 복합 인덱스로 쿼리 최적화
  @@index([boardId, isNotice, publishedAt])
}
```

---

### 6. Board/Menu 아키텍처 정리

**문제**: Board와 Menu의 중복된 역할

**해결책**: 명확한 역할 정의

**docs/architecture/board-menu-system.md**:

```markdown
# Board/Menu 시스템 아키텍처

## 개념 정리

### Board (게시판)
- **목적**: 콘텐츠 그룹핑 및 기능 설정
- **역할**:
  - 게시판별 권한 관리
  - 댓글/첨부파일 기능 토글
  - 게시판 타입 정의 (일반/공지/갤러리/QnA)

### Menu (메뉴/카테고리)
- **목적**: 네비게이션 및 URL 라우팅
- **역할**:
  - 사용자 네비게이션
  - URL 구조 정의 (/:slug)
  - 순서 및 표시 관리

## 관계
- 1 Board : N Menu (하나의 게시판이 여러 메뉴 항목으로 노출 가능)
- Post는 반드시 Menu를 가지며, 선택적으로 Board를 가짐
- Menu가 없는 Post는 시스템 페이지로 간주

## 마이그레이션 가이드
1. 기존 데이터 정리: Menu에 Board 연결
2. Post의 menuId 필수화
3. Board 없는 Menu는 기본 Board 생성
```

---

### 7. CI/CD 파이프라인

**.github/workflows/ci.yml**:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_PASSWORD: test_password
          POSTGRES_DB: codeb_cms_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

      - name: Type check
        run: npm run typecheck

      - name: Run unit tests
        run: npm run test:unit
        env:
          DATABASE_URL: postgresql://postgres:test_password@localhost:5432/codeb_cms_test

      - name: Run E2E tests
        run: npm run test:e2e
        env:
          DATABASE_URL: postgresql://postgres:test_password@localhost:5432/codeb_cms_test

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npm run build

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build
          path: build/
```

---

## 🟡 중간 우선순위 (1개월)

### 8. 종합 문서화

#### docs/API.md
- 모든 API 엔드포인트 문서화
- 요청/응답 예제
- 에러 코드 정의

#### docs/DEPLOYMENT.md
- 프로덕션 배포 가이드
- 환경 변수 설정
- 데이터베이스 마이그레이션
- 모니터링 설정

#### docs/ARCHITECTURE.md
- 시스템 아키텍처 다이어그램
- 데이터 플로우
- 보안 정책
- 성능 최적화 전략

#### docs/CONTRIBUTING.md
- 개발 가이드라인
- 코드 스타일
- PR 프로세스
- 테스트 작성 가이드

---

## 🟢 낮은 우선순위 (향후)

### 9. 추가 기능
- GraphQL API
- 실시간 협업 편집
- AI 기반 콘텐츠 추천
- 다국어 지원 (i18n)
- PWA 지원

### 10. 고급 최적화
- Server-side caching (Varnish)
- CDN 통합
- Image optimization pipeline
- Lazy loading 최적화

---

## 📊 진행 체크리스트

### 필수 작업
- [ ] 의존성 설치 및 보안 수정
- [ ] console.log → logger 교체 (504개)
- [ ] 단위 테스트 작성 (70% 커버리지)
- [ ] 통합 테스트 작성
- [ ] E2E 테스트 작성
- [ ] 이메일 알림 구현
- [ ] SMS 알림 구현 (선택)
- [ ] 푸시 알림 구현 (선택)
- [ ] Root loader 캐싱
- [ ] N+1 쿼리 해결
- [ ] 데이터베이스 인덱스 최적화
- [ ] Board/Menu 문서화
- [ ] CI/CD 파이프라인 구축

### 문서화
- [ ] API 문서
- [ ] 배포 가이드
- [ ] 아키텍처 문서
- [ ] 기여 가이드

---

## 🎯 예상 최종 점수

작업 완료 후 예상 점수:

| 카테고리 | 현재 | 목표 | 개선 |
|----------|------|------|------|
| 아키텍처 | 8/10 | 9/10 | +1 |
| 코드 품질 | 6/10 | 9/10 | +3 |
| 보안 | 7/10 | 9/10 | +2 |
| 성능 | 7/10 | 9/10 | +2 |
| 테스트 | 2/10 | 9/10 | +7 |
| 문서화 | 4/10 | 9/10 | +5 |
| **전체** | **6.2/10** | **9.2/10** | **+3.0** |

---

## 💡 시작하기

```bash
# 1. 환경 설정
./scripts/init-dev.sh

# 2. 의존성 설치
npm install

# 3. 보안 수정
npm audit fix

# 4. 개발 시작
npm run dev

# 5. 테스트 실행
npm run test:unit
npm run test:e2e

# 6. 코드 검증
npm run validate
```

---

## 📞 지원

문제가 발생하면 GitHub Issues에 보고해주세요.

---

**작성일**: 2025-01-13
**버전**: 1.0.0
**상태**: 진행 중 🚧
