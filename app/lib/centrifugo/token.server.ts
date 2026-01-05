/**
 * Centrifugo JWT 토큰 생성
 * 연결 토큰 및 구독 토큰 생성
 */

import jwt from 'jsonwebtoken';

const SECRET = process.env.CENTRIFUGO_SECRET || 'default-secret-change-in-production';

interface ConnectionTokenPayload {
  sub: string; // User ID
  info?: Record<string, any>; // 사용자 정보 (이름, 아바타 등)
  exp?: number; // 만료 시간
}

interface SubscriptionTokenPayload {
  sub: string; // User ID
  channel: string; // 채널 이름
  info?: Record<string, any>;
  exp?: number;
}

/**
 * 연결 토큰 생성
 * 클라이언트가 Centrifugo에 연결할 때 사용
 */
export function generateConnectionToken(
  userId: string,
  info?: Record<string, any>,
  expiresInSeconds: number = 86400 // 24시간
): string {
  const payload: ConnectionTokenPayload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };

  if (info) {
    payload.info = info;
  }

  return jwt.sign(payload, SECRET);
}

/**
 * 구독 토큰 생성
 * 비공개 채널($로 시작) 구독 시 사용
 */
export function generateSubscriptionToken(
  userId: string,
  channel: string,
  info?: Record<string, any>,
  expiresInSeconds: number = 3600 // 1시간
): string {
  const payload: SubscriptionTokenPayload = {
    sub: userId,
    channel,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };

  if (info) {
    payload.info = info;
  }

  return jwt.sign(payload, SECRET);
}

/**
 * 토큰 검증
 */
export function verifyToken(token: string): ConnectionTokenPayload | SubscriptionTokenPayload | null {
  try {
    return jwt.verify(token, SECRET) as ConnectionTokenPayload | SubscriptionTokenPayload;
  } catch {
    return null;
  }
}

/**
 * 익명 사용자용 연결 토큰
 * 비로그인 사용자도 공개 채널 구독 가능
 */
export function generateAnonymousToken(
  expiresInSeconds: number = 3600
): string {
  const payload: ConnectionTokenPayload = {
    sub: '', // 빈 sub = 익명 사용자
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };

  return jwt.sign(payload, SECRET);
}
