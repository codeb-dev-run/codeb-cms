/**
 * Redis 기반 세션 관리 시스템
 * 10,000+ 동시 사용자를 위한 고성능 세션 스토어
 */

import { createCookieSessionStorage, SessionStorage, Session } from '@remix-run/node';
import crypto from 'crypto';
import { getRedisCluster } from './redis/cluster.server';
import { getSessionRedisCache } from './redis/redis-cache';
import { security } from './env.server';

// Redis 세션 스토어는 RedisSessionManager로 대체됨

/**
 * Redis 기반 세션 저장소
 * Cookie는 세션 ID만 저장, 실제 데이터는 Redis에 저장
 */
export const redisSessionStorage = createCookieSessionStorage({
  cookie: {
    name: 'codeb-cms-session',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60, // 7일 (초 단위)
    sameSite: 'lax',
    // 세션 ID만 쿠키에 저장
    secrets: [process.env.SESSION_SECRET || 'fallback-secret-change-in-production'],
  },
});

/**
 * 세션 데이터 인터페이스
 */
export interface SessionData {
  userId?: string;
  sessionToken?: string;
  createdAt?: number;
  lastAccessedAt?: number;
  userAgent?: string;
  ipAddress?: string;
  rememberMe?: boolean;
  data?: Record<string, any>;
}

/**
 * Redis 세션 매니저 클래스
 */
export class RedisSessionManager {
  private cache = getSessionRedisCache();
  
  /**
   * 세션 생성
   */
  async createSession(data: SessionData): Promise<string> {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const sessionKey = `session:${sessionId}`;
    
    const sessionData: SessionData = {
      ...data,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };
    
    // TTL 설정 (remember me 여부에 따라)
    const ttl = data.rememberMe ? 30 * 24 * 3600 : 24 * 3600; // 30일 또는 24시간
    
    await this.cache.set(sessionKey, sessionData, ttl);
    
    return sessionId;
  }
  
  /**
   * 세션 조회
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    const sessionKey = `session:${sessionId}`;
    const sessionData = await this.cache.get<SessionData>(sessionKey);
    
    if (sessionData) {
      // 마지막 접근 시간 업데이트
      sessionData.lastAccessedAt = Date.now();
      
      // TTL 갱신 (세션 연장)
      const ttl = sessionData.rememberMe ? 30 * 24 * 3600 : 24 * 3600;
      await this.cache.set(sessionKey, sessionData, ttl);
    }
    
    return sessionData;
  }
  
  /**
   * 세션 업데이트
   */
  async updateSession(sessionId: string, data: Partial<SessionData>): Promise<boolean> {
    const sessionKey = `session:${sessionId}`;
    const existingSession = await this.cache.get<SessionData>(sessionKey);
    
    if (!existingSession) {
      return false;
    }
    
    const updatedSession: SessionData = {
      ...existingSession,
      ...data,
      lastAccessedAt: Date.now(),
    };
    
    const ttl = updatedSession.rememberMe ? 30 * 24 * 3600 : 24 * 3600;
    await this.cache.set(sessionKey, updatedSession, ttl);
    
    return true;
  }
  
  /**
   * 세션 삭제
   */
  async deleteSession(sessionId: string): Promise<void> {
    const sessionKey = `session:${sessionId}`;
    await this.cache.del(sessionKey);
  }
  
  /**
   * 사용자의 모든 세션 조회
   */
  async getUserSessions(userId: string): Promise<string[]> {
    // 사용자별 세션 목록 관리
    const userSessionsKey = `user:${userId}:sessions`;
    const sessions = await this.cache.smembers<string>(userSessionsKey);
    
    // 유효한 세션만 필터링
    const validSessions: string[] = [];
    for (const sessionId of sessions) {
      const session = await this.getSession(sessionId);
      if (session) {
        validSessions.push(sessionId);
      } else {
        // 만료된 세션은 목록에서 제거
        await this.cache.sismember(userSessionsKey, sessionId);
      }
    }
    
    return validSessions;
  }
  
  /**
   * 사용자 세션 등록
   */
  async registerUserSession(userId: string, sessionId: string): Promise<void> {
    const userSessionsKey = `user:${userId}:sessions`;
    await this.cache.sadd(userSessionsKey, sessionId);
    
    // 사용자 세션 목록도 TTL 설정 (최대 30일)
    await this.cache.expire(userSessionsKey, 30 * 24 * 3600);
  }
  
  /**
   * 사용자의 모든 세션 삭제
   */
  async deleteUserSessions(userId: string): Promise<void> {
    const sessions = await this.getUserSessions(userId);
    
    for (const sessionId of sessions) {
      await this.deleteSession(sessionId);
    }
    
    // 사용자 세션 목록 삭제
    const userSessionsKey = `user:${userId}:sessions`;
    await this.cache.del(userSessionsKey);
  }
  
  /**
   * 세션 통계
   */
  async getSessionStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
  }> {
    const allSessionKeys = await this.cache.keys('session:*');
    let activeSessions = 0;
    let expiredSessions = 0;
    
    for (const key of allSessionKeys) {
      const ttl = await this.cache.ttl(key.replace('session:', ''));
      if (ttl > 0) {
        activeSessions++;
      } else if (ttl === -2) {
        expiredSessions++;
      }
    }
    
    return {
      totalSessions: allSessionKeys.length,
      activeSessions,
      expiredSessions,
    };
  }
  
  /**
   * 세션 정리 (만료된 세션 제거)
   */
  async cleanupExpiredSessions(): Promise<number> {
    const allSessionKeys = await this.cache.keys('session:*');
    let cleaned = 0;
    
    for (const key of allSessionKeys) {
      const sessionId = key.replace('session:', '');
      const session = await this.getSession(sessionId);
      
      if (!session) {
        await this.cache.del(key);
        cleaned++;
      }
    }
    
    return cleaned;
  }
  
  /**
   * 동시 세션 제한 확인
   */
  async checkConcurrentSessions(userId: string, maxSessions: number = 5): Promise<boolean> {
    const sessions = await this.getUserSessions(userId);
    
    if (sessions.length >= maxSessions) {
      // 가장 오래된 세션 삭제
      const sessionDatas = await Promise.all(
        sessions.map(async (id) => ({
          id,
          data: await this.getSession(id)
        }))
      );
      
      // 마지막 접근 시간 기준 정렬
      sessionDatas.sort((a, b) => 
        (a.data?.lastAccessedAt || 0) - (b.data?.lastAccessedAt || 0)
      );
      
      // 가장 오래된 세션 삭제
      if (sessionDatas.length > 0 && sessionDatas[0].id) {
        await this.deleteSession(sessionDatas[0].id);
      }
    }
    
    return true;
  }
}

// 전역 세션 매니저 인스턴스
let sessionManager: RedisSessionManager | null = null;

/**
 * 세션 매니저 인스턴스 가져오기
 */
export function getSessionManager(): RedisSessionManager {
  if (!sessionManager) {
    sessionManager = new RedisSessionManager();
  }
  return sessionManager;
}

/**
 * DB 세션을 Redis로 마이그레이션
 */
export async function migrateDbSessionsToRedis(
  dbSessions: Array<{
    id: string;
    userId: string;
    token: string;
    expiresAt: Date;
    createdAt: Date;
  }>
): Promise<{
  migrated: number;
  failed: number;
  errors: string[];
}> {
  const manager = getSessionManager();
  const results = {
    migrated: 0,
    failed: 0,
    errors: [] as string[],
  };
  
  for (const dbSession of dbSessions) {
    try {
      // Redis 세션 생성
      const sessionId = await manager.createSession({
        userId: dbSession.userId,
        sessionToken: dbSession.token,
        createdAt: dbSession.createdAt.getTime(),
        rememberMe: false, // 기본값
      });
      
      // 사용자 세션 등록
      await manager.registerUserSession(dbSession.userId, sessionId);
      
      // 만료 시간 설정
      const ttl = Math.max(
        0,
        Math.floor((dbSession.expiresAt.getTime() - Date.now()) / 1000)
      );

      if (ttl > 0) {
        // TTL을 설정하기 위해 세션을 다시 저장
        const session = await manager.getSession(sessionId);
        if (session) {
          await manager.updateSession(sessionId, { ...session });
        }
      }
      
      results.migrated++;
    } catch (error) {
      results.failed++;
      results.errors.push(`Session ${dbSession.id}: ${error}`);
    }
  }
  
  return results;
}

/**
 * 세션 정리 스케줄러 (크론잡용)
 */
export async function scheduleSessionCleanup(): Promise<void> {
  const manager = getSessionManager();
  
  // 매시간 만료된 세션 정리
  setInterval(async () => {
    try {
      const cleaned = await manager.cleanupExpiredSessions();
      console.log(`세션 정리 완료: ${cleaned}개 만료 세션 제거`);
    } catch (error) {
      console.error('세션 정리 실패:', error);
    }
  }, 3600 * 1000); // 1시간마다
}

// Export 타입 (인터페이스만 - 클래스는 이미 export됨)

// Compatibility exports for auth
export const getSession = redisSessionStorage.getSession;
export const commitSession = redisSessionStorage.commitSession;
export const destroySession = redisSessionStorage.destroySession;

// Export main functions
export { 
  redisSessionStorage as sessionStorage
};