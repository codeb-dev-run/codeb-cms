/**
 * 보안 미들웨어 - 모든 보안 헤더 및 보호 기능
 */
import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { validateCSRFToken, generateCSRFToken } from './csrf.server';

// 보안 헤더 설정
export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", "wss:", "ws:"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Socket.io 호환성
    hsts: {
      maxAge: 31536000, // 1년
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
}

// 속도 제한 설정
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 5, // 15분당 5회 시도
  message: {
    error: '너무 많은 로그인 시도입니다. 15분 후 다시 시도해주세요.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100, // 15분당 100회 요청
  message: {
    error: 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
    code: 'API_RATE_LIMIT_EXCEEDED',
  },
});

// CSRF 보호 미들웨어
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // GET, HEAD, OPTIONS는 CSRF 검증 제외
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // API 엔드포인트는 별도 인증 방식 사용
  if (req.path.startsWith('/api/')) {
    return next();
  }

  const token = req.headers['x-csrf-token'] || req.body._csrf;
  
  if (!validateCSRFToken(token as string, req.sessionID)) {
    return res.status(403).json({
      error: 'CSRF 토큰이 유효하지 않습니다.',
      code: 'INVALID_CSRF_TOKEN',
    });
  }

  next();
}

// 세션 보안 설정
export function getSecureSessionConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    name: 'codeb-cms-session',
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction, // HTTPS에서만
      httpOnly: true, // XSS 방지
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
      sameSite: 'lax' as const, // CSRF 방지
    },
    genid: () => {
      // 보안 강화를 위한 커스텀 세션 ID 생성
      const crypto = require('crypto');
      return crypto.randomBytes(32).toString('hex');
    },
  };
}

// 입력 검증 및 살균
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // 스크립트 태그 제거
    .replace(/javascript:/gi, '') // javascript: 프로토콜 제거
    .replace(/on\w+\s*=/gi, ''); // 이벤트 핸들러 제거
}

// 비밀번호 정책 검증
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < 12) {
    errors.push('비밀번호는 최소 12자 이상이어야 합니다.');
  }
  
  if (!/(?=.*[a-z])/.test(password)) {
    errors.push('소문자를 포함해야 합니다.');
  }
  
  if (!/(?=.*[A-Z])/.test(password)) {
    errors.push('대문자를 포함해야 합니다.');
  }
  
  if (!/(?=.*\d)/.test(password)) {
    errors.push('숫자를 포함해야 합니다.');
  }
  
  if (!/(?=.*[@$!%*?&])/.test(password)) {
    errors.push('특수문자(@$!%*?&)를 포함해야 합니다.');
  }
  
  // 일반적인 패스워드 패턴 금지
  const commonPatterns = [
    /(.)\1{2,}/, // 연속된 같은 문자
    /123456|password|admin|qwerty/i, // 흔한 패스워드
    /^[0-9]+$/, // 숫자만
    /^[a-zA-Z]+$/, // 문자만
  ];
  
  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      errors.push('너무 간단하거나 흔한 패스워드입니다.');
      break;
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// 이메일 검증
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

// SQL 인젝션 방지를 위한 입력 검증
export function validateSafeInput(input: string): boolean {
  const dangerousPatterns = [
    /('|(\\')|(;\s*(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE))/i,
    /(UNION|SELECT|FROM|WHERE)\s+/i,
    /(<script|javascript:|data:)/i,
  ];
  
  return !dangerousPatterns.some(pattern => pattern.test(input));
}

// IP 화이트리스트 (관리자 기능용)
export function adminIPWhitelist(allowedIPs: string[] = []) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (allowedIPs.length === 0) {
      return next(); // 화이트리스트 비활성화
    }
    
    const clientIP = req.ip || req.connection.remoteAddress || '';
    
    if (!allowedIPs.includes(clientIP)) {
      return res.status(403).json({
        error: '접근이 거부되었습니다.',
        code: 'IP_NOT_ALLOWED',
      });
    }
    
    next();
  };
}