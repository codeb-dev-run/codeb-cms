/**
 * Redis 기반 캐시 구현체
 * 플러그인 시스템과 통합 가능한 캐시 인터페이스 제공
 */

import { Cluster, Redis } from 'ioredis';
import { getRedisCluster } from './cluster.server';

/**
 * 캐시 인터페이스 정의
 */
export interface CacheInterface {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
  keys(pattern: string): Promise<string[]>;
  expire(key: string, ttl: number): Promise<void>;
}

/**
 * Redis 캐시 구현 클래스
 * 10,000+ 동시 사용자를 위한 고성능 캐싱
 */
export class RedisCache implements CacheInterface {
  private cluster: Cluster | Redis;
  private namespace: string;
  private defaultTTL: number = 3600; // 기본 1시간

  constructor(namespace: string = 'app') {
    this.cluster = getRedisCluster();
    this.namespace = namespace;
  }

  /**
   * 키에 네임스페이스 접두사 추가
   */
  private getKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  /**
   * 값 저장
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    const fullKey = this.getKey(key);
    const serialized = JSON.stringify(value);
    
    if (ttl !== undefined && ttl > 0) {
      // TTL이 지정된 경우 SETEX 사용
      await this.cluster.setex(fullKey, ttl, serialized);
    } else if (this.defaultTTL > 0) {
      // 기본 TTL 사용
      await this.cluster.setex(fullKey, this.defaultTTL, serialized);
    } else {
      // TTL 없이 저장
      await this.cluster.set(fullKey, serialized);
    }
  }

  /**
   * 값 조회
   */
  async get<T = any>(key: string): Promise<T | null> {
    const fullKey = this.getKey(key);
    const value = await this.cluster.get(fullKey);
    
    if (value === null) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`Failed to parse cached value for key ${key}:`, error);
      // 파싱 실패 시 원본 문자열 반환 (문자열 캐시인 경우)
      return value as unknown as T;
    }
  }

  /**
   * 키 삭제
   */
  async del(key: string): Promise<void> {
    const fullKey = this.getKey(key);
    await this.cluster.del(fullKey);
  }

  /**
   * 키 존재 확인
   */
  async has(key: string): Promise<boolean> {
    const fullKey = this.getKey(key);
    const exists = await this.cluster.exists(fullKey);
    return exists === 1;
  }

  /**
   * TTL 설정/갱신
   */
  async expire(key: string, ttl: number): Promise<void> {
    const fullKey = this.getKey(key);
    await this.cluster.expire(fullKey, ttl);
  }

  /**
   * 네임스페이스의 모든 키 삭제
   */
  async clear(): Promise<void> {
    // 패턴 매칭으로 네임스페이스의 모든 키 찾기
    const pattern = `${this.namespace}:*`;
    const keys = await this.keys('*');
    
    if (keys.length > 0) {
      // 파이프라인을 사용하여 효율적으로 삭제
      const pipeline = this.cluster.pipeline();
      for (const key of keys) {
        pipeline.del(this.getKey(key));
      }
      await pipeline.exec();
    }
  }

  /**
   * 패턴으로 키 검색
   */
  async keys(pattern: string): Promise<string[]> {
    const fullPattern = this.getKey(pattern);
    const allKeys: string[] = [];

    // 클러스터 모드인지 확인
    if ('nodes' in this.cluster && typeof this.cluster.nodes === 'function') {
      // 클러스터의 모든 노드에서 키 검색
      const nodes = (this.cluster as Cluster).nodes('master');

      for (const node of nodes) {
        try {
          // SCAN을 사용하여 안전하게 키 검색 (KEYS 명령어는 프로덕션에서 위험)
          const stream = node.scanStream({
            match: fullPattern,
            count: 100
          });

          await new Promise<void>((resolve, reject) => {
            stream.on('data', (keys: string[]) => {
              allKeys.push(...keys);
            });
            stream.on('end', resolve);
            stream.on('error', reject);
          });
        } catch (error) {
          console.error(`Failed to scan keys on node:`, error);
        }
      }
    } else {
      // 단일 Redis 인스턴스에서 검색
      try {
        const stream = (this.cluster as Redis).scanStream({
          match: fullPattern,
          count: 100
        });

        await new Promise<void>((resolve, reject) => {
          stream.on('data', (keys: string[]) => {
            allKeys.push(...keys);
          });
          stream.on('end', resolve);
          stream.on('error', reject);
        });
      } catch (error) {
        console.error(`Failed to scan keys:`, error);
      }
    }

    // 네임스페이스 접두사 제거하여 반환
    const prefix = `${this.namespace}:`;
    return allKeys.map(key => key.startsWith(prefix) ? key.slice(prefix.length) : key);
  }

  // 추가 Redis 전용 메서드들

  /**
   * 원자적 증가
   */
  async incr(key: string, value: number = 1): Promise<number> {
    const fullKey = this.getKey(key);
    if (value === 1) {
      return await this.cluster.incr(fullKey);
    } else {
      return await this.cluster.incrby(fullKey, value);
    }
  }

  /**
   * 원자적 감소
   */
  async decr(key: string, value: number = 1): Promise<number> {
    const fullKey = this.getKey(key);
    if (value === 1) {
      return await this.cluster.decr(fullKey);
    } else {
      return await this.cluster.decrby(fullKey, value);
    }
  }

  /**
   * 해시 설정
   */
  async hset(key: string, field: string, value: any): Promise<void> {
    const fullKey = this.getKey(key);
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    await this.cluster.hset(fullKey, field, serialized);
  }

  /**
   * 해시 조회
   */
  async hget<T = any>(key: string, field: string): Promise<T | null> {
    const fullKey = this.getKey(key);
    const value = await this.cluster.hget(fullKey, field);
    
    if (value === null) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  /**
   * 해시 전체 조회
   */
  async hgetall<T = Record<string, any>>(key: string): Promise<T | null> {
    const fullKey = this.getKey(key);
    const hash = await this.cluster.hgetall(fullKey);
    
    if (!hash || Object.keys(hash).length === 0) {
      return null;
    }

    // 각 필드 값을 파싱 시도
    const result: Record<string, any> = {};
    for (const [field, value] of Object.entries(hash)) {
      try {
        result[field] = JSON.parse(value);
      } catch {
        result[field] = value;
      }
    }

    return result as T;
  }

  /**
   * 리스트에 추가 (왼쪽)
   */
  async lpush(key: string, ...values: any[]): Promise<number> {
    const fullKey = this.getKey(key);
    const serialized = values.map(v => JSON.stringify(v));
    return await this.cluster.lpush(fullKey, ...serialized);
  }

  /**
   * 리스트에서 가져오기 (오른쪽)
   */
  async rpop<T = any>(key: string): Promise<T | null> {
    const fullKey = this.getKey(key);
    const value = await this.cluster.rpop(fullKey);
    
    if (value === null) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  /**
   * 리스트 범위 조회
   */
  async lrange<T = any>(key: string, start: number, stop: number): Promise<T[]> {
    const fullKey = this.getKey(key);
    const values = await this.cluster.lrange(fullKey, start, stop);
    
    return values.map(value => {
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    });
  }

  /**
   * 집합에 추가
   */
  async sadd(key: string, ...members: any[]): Promise<number> {
    const fullKey = this.getKey(key);
    const serialized = members.map(m => JSON.stringify(m));
    return await this.cluster.sadd(fullKey, ...serialized);
  }

  /**
   * 집합 멤버 확인
   */
  async sismember(key: string, member: any): Promise<boolean> {
    const fullKey = this.getKey(key);
    const serialized = JSON.stringify(member);
    const result = await this.cluster.sismember(fullKey, serialized);
    return result === 1;
  }

  /**
   * 집합 멤버 조회
   */
  async smembers<T = any>(key: string): Promise<T[]> {
    const fullKey = this.getKey(key);
    const members = await this.cluster.smembers(fullKey);
    
    return members.map(member => {
      try {
        return JSON.parse(member) as T;
      } catch {
        return member as unknown as T;
      }
    });
  }

  /**
   * 남은 TTL 조회 (초 단위)
   */
  async ttl(key: string): Promise<number> {
    const fullKey = this.getKey(key);
    return await this.cluster.ttl(fullKey);
  }

  /**
   * 여러 키를 한번에 조회 (mget)
   */
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    const fullKeys = keys.map(key => this.getKey(key));
    const values = await this.cluster.mget(...fullKeys);
    
    return values.map(value => {
      if (value === null) {
        return null;
      }
      
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    });
  }

  /**
   * 여러 키를 한번에 설정 (mset)
   */
  async mset(keyValues: Record<string, any>, ttl?: number): Promise<void> {
    const pipeline = this.cluster.pipeline();
    
    for (const [key, value] of Object.entries(keyValues)) {
      const fullKey = this.getKey(key);
      const serialized = JSON.stringify(value);
      
      if (ttl !== undefined && ttl > 0) {
        pipeline.setex(fullKey, ttl, serialized);
      } else {
        pipeline.set(fullKey, serialized);
      }
    }
    
    await pipeline.exec();
  }

  /**
   * 조건부 설정 (키가 존재하지 않을 때만)
   */
  async setnx(key: string, value: any, ttl?: number): Promise<boolean> {
    const fullKey = this.getKey(key);
    const serialized = JSON.stringify(value);
    
    if (ttl !== undefined && ttl > 0) {
      // SET NX EX 조합 사용
      const result = await this.cluster.set(fullKey, serialized, 'EX', ttl, 'NX');
      return result === 'OK';
    } else {
      const result = await this.cluster.setnx(fullKey, serialized);
      return result === 1;
    }
  }

  /**
   * 캐시 통계 조회
   */
  async getStats(): Promise<{
    keyCount: number;
    memoryUsage: number;
    hitRate?: number;
  }> {
    const keys = await this.keys('*');
    const keyCount = keys.length;
    
    // 메모리 사용량 추정 (샘플링)
    let totalMemory = 0;
    const sampleSize = Math.min(100, keyCount);
    const sampleKeys = keys.slice(0, sampleSize);
    
    for (const key of sampleKeys) {
      const fullKey = this.getKey(key);
      try {
        const memory = await this.cluster.memory('USAGE', fullKey);
        if (typeof memory === 'number') {
          totalMemory += memory;
        }
      } catch {
        // 메모리 조회 실패 시 무시
      }
    }
    
    // 샘플 기반 전체 메모리 추정
    const estimatedMemory = keyCount > 0 ? (totalMemory / sampleSize) * keyCount : 0;
    
    return {
      keyCount,
      memoryUsage: Math.round(estimatedMemory),
    };
  }
}

/**
 * 플러그인용 Redis 캐시 클라이언트 생성
 */
export function createPluginRedisCacheClient(pluginId: string): CacheInterface {
  return new RedisCache(`plugin:${pluginId}`);
}

/**
 * 글로벌 Redis 캐시 인스턴스
 */
let globalRedisCache: RedisCache | null = null;

/**
 * 글로벌 Redis 캐시 인스턴스 가져오기
 */
export function getGlobalRedisCache(): RedisCache {
  if (!globalRedisCache) {
    globalRedisCache = new RedisCache('global');
  }
  return globalRedisCache;
}

/**
 * 세션용 Redis 캐시 인스턴스
 */
let sessionRedisCache: RedisCache | null = null;

/**
 * 세션용 Redis 캐시 인스턴스 가져오기
 */
export function getSessionRedisCache(): RedisCache {
  if (!sessionRedisCache) {
    sessionRedisCache = new RedisCache('session');
  }
  return sessionRedisCache;
}