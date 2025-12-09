/**
 * 다층 캐싱 전략 관리자
 * L1 (메모리) + L2 (Redis) + L3 (DB) 계층적 캐싱
 */

import { LRUCache, getGlobalL1Cache } from './lru-cache';
import { RedisCache, getGlobalRedisCache } from '../redis/redis-cache';
import { db } from '~/lib/db.server';
import { getRedisCluster } from '../redis/cluster.server';
import { EventEmitter } from 'events';

/**
 * 캐시 레벨 정의
 */
export enum CacheLevel {
  L1_MEMORY = 'L1_MEMORY',
  L2_REDIS = 'L2_REDIS',
  L3_DATABASE = 'L3_DATABASE',
}

/**
 * 캐시 옵션
 */
export interface CacheOptions {
  ttl?: number; // TTL (초)
  levels?: CacheLevel[]; // 사용할 캐시 레벨
  skipL1?: boolean; // L1 스킵 (큰 데이터)
  skipL2?: boolean; // L2 스킵
  refreshOnHit?: boolean; // 히트 시 TTL 갱신
  namespace?: string; // 캐시 네임스페이스
}

/**
 * 캐시 통계
 */
export interface CacheStatistics {
  l1: {
    hits: number;
    misses: number;
    hitRate: number;
    memoryUsage: number;
  };
  l2: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  l3: {
    queries: number;
  };
  overall: {
    totalHits: number;
    totalMisses: number;
    hitRate: number;
  };
}

/**
 * 다층 캐시 매니저
 */
export class CacheManager extends EventEmitter {
  private l1Cache: LRUCache;
  private l2Cache: RedisCache;
  private namespace: string;
  
  // 통계
  private stats = {
    l1Hits: 0,
    l1Misses: 0,
    l2Hits: 0,
    l2Misses: 0,
    l3Queries: 0,
  };
  
  // Pub/Sub for cache invalidation
  private pubsubClient?: { subscribe: (channel: string, callback: (message: string) => void) => void; publish: (channel: string, message: string) => void };
  private invalidationChannel: string;
  
  constructor(namespace: string = 'app') {
    super();
    this.namespace = namespace;
    this.l1Cache = getGlobalL1Cache();
    this.l2Cache = getGlobalRedisCache();
    this.invalidationChannel = `cache:invalidate:${namespace}`;
    
    // Pub/Sub 설정 (캐시 무효화용)
    this.setupPubSub();
  }
  
  /**
   * 캐시에서 값 가져오기
   */
  async get<T = any>(
    key: string,
    loader?: () => Promise<T | null>,
    options: CacheOptions = {}
  ): Promise<T | null> {
    const fullKey = this.getFullKey(key);
    const { skipL1, skipL2, refreshOnHit, ttl } = options;
    
    // L1 캐시 확인
    if (!skipL1) {
      const l1Value = this.l1Cache.get(fullKey);
      if (l1Value !== null) {
        this.stats.l1Hits++;
        this.emit('cache:hit', { level: 'L1', key });
        
        // TTL 갱신
        if (refreshOnHit && ttl) {
          this.l1Cache.set(fullKey, l1Value, ttl);
        }
        
        return l1Value as T;
      }
      this.stats.l1Misses++;
    }
    
    // L2 캐시 확인
    if (!skipL2) {
      const l2Value = await this.l2Cache.get<T>(fullKey);
      if (l2Value !== null) {
        this.stats.l2Hits++;
        this.emit('cache:hit', { level: 'L2', key });
        
        // L1에 저장 (Write-through)
        if (!skipL1) {
          this.l1Cache.set(fullKey, l2Value, ttl || 300);
        }
        
        // TTL 갱신
        if (refreshOnHit && ttl) {
          await this.l2Cache.expire(fullKey, ttl);
        }
        
        return l2Value;
      }
      this.stats.l2Misses++;
    }
    
    // L3 (DB) 또는 loader 함수 실행
    if (loader) {
      this.stats.l3Queries++;
      this.emit('cache:miss', { key });
      
      const value = await loader();
      
      if (value !== null) {
        // 모든 레벨에 저장 (Write-through)
        await this.setAll(key, value, options);
      }
      
      return value;
    }
    
    return null;
  }
  
  /**
   * 캐시에 값 저장
   */
  async set<T = any>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<void> {
    await this.setAll(key, value, options);
  }
  
  /**
   * 모든 레벨에 저장
   */
  private async setAll<T = any>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<void> {
    const fullKey = this.getFullKey(key);
    const { ttl = 3600, skipL1, skipL2 } = options;
    
    // L1 저장
    if (!skipL1) {
      this.l1Cache.set(fullKey, value, ttl);
    }
    
    // L2 저장
    if (!skipL2) {
      await this.l2Cache.set(fullKey, value, ttl);
    }
    
    this.emit('cache:set', { key, levels: this.getActiveLevels(options) });
  }
  
  /**
   * 캐시 무효화
   */
  async invalidate(key: string | string[], broadcast: boolean = true): Promise<void> {
    const keys = Array.isArray(key) ? key : [key];
    
    for (const k of keys) {
      const fullKey = this.getFullKey(k);
      
      // L1 무효화
      this.l1Cache.delete(fullKey);
      
      // L2 무효화
      await this.l2Cache.del(fullKey);
      
      this.emit('cache:invalidate', { key: k });
    }
    
    // 다른 인스턴스에 브로드캐스트
    if (broadcast && this.pubsubClient) {
      await this.broadcastInvalidation(keys);
    }
  }
  
  /**
   * 패턴으로 무효화
   */
  async invalidatePattern(pattern: string, broadcast: boolean = true): Promise<void> {
    const fullPattern = this.getFullKey(pattern);
    
    // L2에서 패턴 매칭 키 찾기
    const keys = await this.l2Cache.keys(pattern);
    
    // 각 키 무효화
    await this.invalidate(keys, false);
    
    // 브로드캐스트
    if (broadcast && this.pubsubClient) {
      await this.broadcastInvalidation(keys, true);
    }
    
    this.emit('cache:invalidate:pattern', { pattern });
  }
  
  /**
   * 캐시 워밍업
   */
  async warmup(
    keys: string[],
    loader: (key: string) => Promise<any>,
    options: CacheOptions = {}
  ): Promise<{ loaded: number; failed: number }> {
    let loaded = 0;
    let failed = 0;
    
    for (const key of keys) {
      try {
        const value = await loader(key);
        if (value !== null) {
          await this.setAll(key, value, options);
          loaded++;
        }
      } catch (error) {
        console.error(`Failed to warmup key ${key}:`, error);
        failed++;
      }
    }
    
    this.emit('cache:warmup', { loaded, failed });
    
    return { loaded, failed };
  }
  
  /**
   * 캐시 통계
   */
  getStatistics(): CacheStatistics {
    const l1Stats = this.l1Cache.getStats();
    const l1Total = this.stats.l1Hits + this.stats.l1Misses;
    const l2Total = this.stats.l2Hits + this.stats.l2Misses;
    const overallTotal = l1Total + l2Total;
    
    return {
      l1: {
        hits: this.stats.l1Hits,
        misses: this.stats.l1Misses,
        hitRate: l1Total > 0 ? this.stats.l1Hits / l1Total : 0,
        memoryUsage: l1Stats.memoryUsage,
      },
      l2: {
        hits: this.stats.l2Hits,
        misses: this.stats.l2Misses,
        hitRate: l2Total > 0 ? this.stats.l2Hits / l2Total : 0,
      },
      l3: {
        queries: this.stats.l3Queries,
      },
      overall: {
        totalHits: this.stats.l1Hits + this.stats.l2Hits,
        totalMisses: this.stats.l1Misses + this.stats.l2Misses,
        hitRate: overallTotal > 0 
          ? (this.stats.l1Hits + this.stats.l2Hits) / overallTotal 
          : 0,
      },
    };
  }
  
  /**
   * 통계 리셋
   */
  resetStatistics(): void {
    this.stats = {
      l1Hits: 0,
      l1Misses: 0,
      l2Hits: 0,
      l2Misses: 0,
      l3Queries: 0,
    };
  }
  
  /**
   * 핫 키 조회
   */
  getHotKeys(limit: number = 10): Array<{ key: string; hits: number }> {
    return this.l1Cache.getHotKeys(limit);
  }
  
  /**
   * 캐시 크기 조회
   */
  async getCacheSize(): Promise<{
    l1: { items: number; memory: number };
    l2: { items: number; memory: number };
  }> {
    const l1Stats = this.l1Cache.getStats();
    const l2Stats = await this.l2Cache.getStats();
    
    return {
      l1: {
        items: l1Stats.items,
        memory: l1Stats.memoryUsage,
      },
      l2: {
        items: l2Stats.keyCount,
        memory: l2Stats.memoryUsage,
      },
    };
  }
  
  /**
   * 모든 캐시 클리어
   */
  async clear(): Promise<void> {
    this.l1Cache.clear();
    await this.l2Cache.clear();
    this.resetStatistics();
    this.emit('cache:clear');
  }
  
  // 내부 메서드들
  
  private getFullKey(key: string): string {
    return `${this.namespace}:${key}`;
  }
  
  private getActiveLevels(options: CacheOptions): string[] {
    const levels: string[] = [];
    if (!options.skipL1) levels.push('L1');
    if (!options.skipL2) levels.push('L2');
    return levels;
  }
  
  /**
   * Pub/Sub 설정 (캐시 무효화 브로드캐스트)
   */
  private async setupPubSub(): Promise<void> {
    try {
      const cluster = getRedisCluster();
      
      // 구독용 클라이언트 (복제본 생성 필요)
      this.pubsubClient = cluster.duplicate();
      
      // 무효화 메시지 구독
      await this.pubsubClient.subscribe(this.invalidationChannel);
      
      this.pubsubClient.on('message', (channel: string, message: string) => {
        if (channel === this.invalidationChannel) {
          this.handleInvalidationMessage(message);
        }
      });
      
      console.log(`캐시 무효화 채널 구독: ${this.invalidationChannel}`);
    } catch (error) {
      console.error('Pub/Sub 설정 실패:', error);
    }
  }
  
  /**
   * 무효화 메시지 브로드캐스트
   */
  private async broadcastInvalidation(
    keys: string[],
    isPattern: boolean = false
  ): Promise<void> {
    if (!this.pubsubClient) return;
    
    const message = JSON.stringify({
      keys,
      isPattern,
      timestamp: Date.now(),
      source: process.env.HOSTNAME || 'unknown',
    });
    
    try {
      await this.pubsubClient.publish(this.invalidationChannel, message);
    } catch (error) {
      console.error('무효화 브로드캐스트 실패:', error);
    }
  }
  
  /**
   * 무효화 메시지 처리
   */
  private handleInvalidationMessage(message: string): void {
    try {
      const data = JSON.parse(message);
      
      // 자신이 보낸 메시지는 무시
      if (data.source === process.env.HOSTNAME) return;
      
      // L1 캐시 무효화
      for (const key of data.keys) {
        const fullKey = this.getFullKey(key);
        this.l1Cache.delete(fullKey);
      }
      
      this.emit('cache:invalidate:remote', data);
    } catch (error) {
      console.error('무효화 메시지 처리 실패:', error);
    }
  }
}

// 전역 캐시 매니저 인스턴스
let globalCacheManager: CacheManager | null = null;

/**
 * 전역 캐시 매니저 가져오기
 */
export function getCacheManager(namespace?: string): CacheManager {
  if (!globalCacheManager) {
    globalCacheManager = new CacheManager(namespace);
  }
  return globalCacheManager;
}

/**
 * 캐시 데코레이터 (메서드 캐싱용)
 */
export function Cacheable(options: CacheOptions = {}) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const cacheManager = getCacheManager();
      const cacheKey = `${target.constructor.name}:${propertyName}:${JSON.stringify(args)}`;
      
      // 캐시에서 조회
      const cached = await cacheManager.get(cacheKey, null, options);
      if (cached !== null) {
        return cached;
      }
      
      // 메서드 실행
      const result = await method.apply(this, args);
      
      // 캐시에 저장
      if (result !== null && result !== undefined) {
        await cacheManager.set(cacheKey, result, options);
      }
      
      return result;
    };
    
    return descriptor;
  };
}

/**
 * 캐시 무효화 데코레이터
 */
export function CacheEvict(patterns: string[] | ((args: any[]) => string[])) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const result = await method.apply(this, args);
      
      const cacheManager = getCacheManager();
      const patternsToEvict = typeof patterns === 'function' 
        ? patterns(args) 
        : patterns;
      
      // 패턴으로 무효화
      for (const pattern of patternsToEvict) {
        await cacheManager.invalidatePattern(pattern);
      }
      
      return result;
    };
    
    return descriptor;
  };
}