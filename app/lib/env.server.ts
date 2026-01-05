/**
 * 환경 변수 검증 및 관리 시스템
 * 모든 환경 변수를 중앙에서 관리하고 타입 안전성 보장
 */

import { z } from 'zod';

// 환경 변수 스키마 정의
const envSchema = z.object({
  // 필수 환경 변수
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // 선택적 환경 변수
  PORT: z.coerce.number().default(3000),
  CMS_VERSION: z.string().default('1.0.0'),
  PLUGIN_DIR: z.string().default('./app/plugins'),
  
  // 이메일 설정
  EMAIL_FROM: z.string().email().optional(),
  EMAIL_SMTP_HOST: z.string().optional(),
  EMAIL_SMTP_PORT: z.coerce.number().optional(),
  EMAIL_SMTP_USER: z.string().optional(),
  EMAIL_SMTP_PASS: z.string().optional(),
  
  // 테스트 계정 (개발 환경만)
  TEST_ADMIN_EMAIL: z.string().email().optional(),
  TEST_ADMIN_PASSWORD: z.string().min(8).optional(),
  TEST_USER_EMAIL: z.string().email().optional(),
  TEST_USER_PASSWORD: z.string().min(6).optional(),
  
  // 보안 설정
  BCRYPT_ROUNDS: z.coerce.number().min(10).max(15).default(12),
  SESSION_MAX_AGE: z.coerce.number().default(30 * 24 * 60 * 60 * 1000), // 30일
  RATE_LIMIT_WINDOW: z.coerce.number().default(15 * 60 * 1000), // 15분
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  
  // 파일 업로드
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE: z.coerce.number().default(10 * 1024 * 1024), // 10MB
});

// 환경 변수 타입
export type Env = z.infer<typeof envSchema>;

// 환경 변수 파싱 및 검증
function parseEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ 환경 변수 검증 실패:');
      error.errors.forEach(err => {
        console.error(`  ${err.path.join('.')}: ${err.message}`);
      });
      
      // 프로덕션에서는 프로세스 종료
      if (process.env.NODE_ENV === 'production') {
        process.exit(1);
      }
      
      throw new Error('환경 변수 설정을 확인하고 다시 시도하세요.');
    }
    throw error;
  }
}

// 검증된 환경 변수 내보내기
export const env = parseEnv();

// 개발 환경에서만 사용할 수 있는 테스트 계정 정보
export const getTestCredentials = () => {
  if (env.NODE_ENV === 'production') {
    throw new Error('테스트 계정은 프로덕션 환경에서 사용할 수 없습니다.');
  }
  
  return {
    admin: {
      email: env.TEST_ADMIN_EMAIL || 'admin@example.com',
      password: env.TEST_ADMIN_PASSWORD || 'SecureAdminPassword123!@#'
    },
    user: {
      email: env.TEST_USER_EMAIL || 'user@example.com', 
      password: env.TEST_USER_PASSWORD || 'SecureUserPassword123'
    }
  };
};

// 환경별 설정 검증
export const validateEnvironment = () => {
  console.log(`🔧 환경: ${env.NODE_ENV}`);
  
  if (env.NODE_ENV === 'production') {
    // 프로덕션 환경 필수 검증
    if (!env.EMAIL_FROM || !env.EMAIL_SMTP_HOST) {
      console.warn('⚠️  이메일 설정이 누락되어 비밀번호 재설정 기능이 제한됩니다.');
    }
    
    if (env.SESSION_SECRET === 'your-super-secret-session-key-here-change-this-in-production-minimum-32-characters') {
      throw new Error('🚨 프로덕션 환경에서는 SESSION_SECRET을 반드시 변경해야 합니다!');
    }
    
    console.log('✅ 프로덕션 환경 검증 완료');
  } else {
    console.log('🔧 개발 환경에서 실행 중');
  }
};

// 보안 헬퍼 함수들
export const security = {
  // 세션 설정
  sessionConfig: {
    name: 'codeb_session',
    secure: env.NODE_ENV === 'production',
    secrets: [env.SESSION_SECRET],
    sameSite: 'lax' as const,
    maxAge: env.SESSION_MAX_AGE,
    httpOnly: true,
  },
  
  // bcrypt 설정
  bcryptRounds: env.BCRYPT_ROUNDS,
  
  // Rate limiting 설정
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW,
    max: env.RATE_LIMIT_MAX,
  }
};

// 시작 시 환경 검증 실행
if (typeof process !== 'undefined') {
  validateEnvironment();
}