// 입력 검증 및 보안 처리

import DOMPurify from "isomorphic-dompurify";
import { z } from "zod";

// Generic input validation helper
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

// HTML 콘텐츠 정화 (XSS 방지)
export function sanitizeHTML(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'code', 'pre'
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target'],
    FORBID_TAGS: ['script', 'object', 'embed', 'base', 'link', 'style'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
  });
}

// SQL 인젝션 방지를 위한 입력 검증
export function validateSQLInput(input: string): boolean {
  // 위험한 SQL 키워드 패턴 검사
  const dangerousPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
    /(UNION\s+SELECT|OR\s+1\s*=\s*1|AND\s+1\s*=\s*1)/gi,
    /(--|\/\*|\*\/|;)/g,
    /(\bSCRIPT\b|\bJAVASCRIPT\b|\bVBSCRIPT\b)/gi
  ];
  
  return !dangerousPatterns.some(pattern => pattern.test(input));
}

// 파일 업로드 검증
export function validateFileUpload(file: File): {
  isValid: boolean;
  error?: string;
} {
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  if (!allowedTypes.includes(file.type)) {
    return {
      isValid: false,
      error: `허용되지 않는 파일 형식입니다: ${file.type}`
    };
  }
  
  if (file.size > maxSize) {
    return {
      isValid: false,
      error: `파일 크기가 너무 큽니다. 최대 10MB까지 업로드 가능합니다.`
    };
  }
  
  return { isValid: true };
}

// 비밀번호 강도 검증
export const passwordSchema = z.string()
  .min(8, "비밀번호는 최소 8자 이상이어야 합니다")
  .max(128, "비밀번호는 128자를 초과할 수 없습니다")
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
    "비밀번호는 대문자, 소문자, 숫자, 특수문자를 모두 포함해야 합니다");

// 이메일 검증
export const emailSchema = z.string()
  .email("올바른 이메일 형식이 아닙니다")
  .max(255, "이메일은 255자를 초과할 수 없습니다");

// 한국 전화번호 검증
export const phoneSchema = z.string()
  .regex(/^01[0-9]-\d{3,4}-\d{4}$/, "올바른 전화번호 형식이 아닙니다 (010-0000-0000)");

// 사업자등록번호 검증
export const businessNumberSchema = z.string()
  .regex(/^\d{3}-\d{2}-\d{5}$/, "올바른 사업자등록번호 형식이 아닙니다 (000-00-00000)");

// 게시글 제목 검증
export const postTitleSchema = z.string()
  .min(2, "제목은 최소 2자 이상이어야 합니다")
  .max(200, "제목은 200자를 초과할 수 없습니다")
  .refine(validateSQLInput, "유효하지 않은 문자가 포함되어 있습니다");

// 게시글 내용 검증
export const postContentSchema = z.string()
  .min(10, "내용은 최소 10자 이상이어야 합니다")
  .max(50000, "내용은 50,000자를 초과할 수 없습니다")
  .transform(sanitizeHTML);

// 사용자 등록 검증 스키마
export const userRegistrationSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  name: z.string()
    .min(2, "이름은 최소 2자 이상이어야 합니다")
    .max(50, "이름은 50자를 초과할 수 없습니다"),
  phone: phoneSchema.optional(),
  agree: z.boolean().refine(val => val === true, "이용약관에 동의해야 합니다")
}).refine(data => data.password === data.confirmPassword, {
  message: "비밀번호가 일치하지 않습니다",
  path: ["confirmPassword"]
});

// IP 주소 검증 및 차단 목록 확인
export function validateIPAddress(ip: string): boolean {
  // 차단된 IP 대역 (예시)
  const blockedRanges = [
    '127.0.0.1', // localhost (개발용)
    // 실제 프로덕션에서는 스팸/악성 IP 대역 추가
  ];
  
  return !blockedRanges.some(blocked => ip.startsWith(blocked));
}

// 사용자 에이전트 검증 (봇 탐지)
export function validateUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;
  
  // 악성 봇 패턴
  const maliciousBots = [
    /scrapy/i,
    /bot/i,
    /crawler/i,
    /spider/i,
    /curl/i,
    /wget/i
  ];
  
  return !maliciousBots.some(pattern => pattern.test(userAgent));
}

// 요청 속도 제한을 위한 키 생성
export function generateRateLimitKey(ip: string, endpoint: string): string {
  return `rate_limit:${ip}:${endpoint}`;
}

// 환경 변수 검증
export function validateEnvironmentVariables(): void {
  const requiredEnvVars = [
    'DATABASE_URL',
    'SESSION_SECRET',
    'NODE_ENV'
  ];
  
  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`필수 환경 변수가 설정되지 않았습니다: ${missing.join(', ')}`);
  }
  
  // SESSION_SECRET 길이 검증
  if (process.env.SESSION_SECRET!.length < 32) {
    throw new Error('SESSION_SECRET은 최소 32자 이상이어야 합니다');
  }
}

// Content Security Policy 헤더 생성
export function getCSPHeader(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://js.tosspayments.com https://t1.daumcdn.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' wss: https:",
    "frame-src https://js.tosspayments.com https://t1.daumcdn.net",
    "object-src 'none'",
    "base-uri 'self'"
  ].join('; ');
}