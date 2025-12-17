// Redis 클러스터 캐시 시스템

import { Redis } from "ioredis";

// 개발 환경에서는 Map을 사용한 간단한 캐시 구현
class SimpleLRUCache {
  private cache = new Map();
  private maxSize = 10000;
  
  constructor(options: any) {
    this.maxSize = options.max || 10000;
  }
  
  set(key: string, value: any, options?: any) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
  
  get(key: string) {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (LRU behavior)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }
  
  delete(key: string) {
    this.cache.delete(key);
  }
  
  has(key: string) {
    return this.cache.has(key);
  }
  
  clear() {
    this.cache.clear();
  }
  
  keys() {
    return Array.from(this.cache.keys());
  }
  
  get size() {
    return this.cache.size;
  }
  
  get calculatedSize() {
    return this.cache.size;
  }
}

// 개발환경에서는 간단한 캐시만 사용
const LRUCache = SimpleLRUCache;

// Redis 사용 여부 확인
const USE_REDIS = process.env.USE_REDIS === 'true' || false;
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

// Redis 인스턴스 (클러스터 대신 단일 인스턴스 사용)
let redisClient: Redis | null = null;

if (USE_REDIS) {
  try {
    redisClient = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      retryStrategy: (times) => {
        if (times > 3) {
          console.log('Redis connection failed after 3 retries, falling back to LRU cache');
          return null; // Stop retrying
        }
        return Math.min(times * 100, 3000);
      },
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err.message);
      // Redis 오류 시 LRU 캐시로 폴백
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });

    // 연결 시도
    redisClient.connect().catch((err) => {
      console.error('Failed to connect to Redis:', err.message);
      redisClient = null;
    });
  } catch (error) {
    console.error('Failed to initialize Redis:', error);
    redisClient = null;
  }
}

// 메모리 캐시 (L1 캐시) - Redis 없어도 작동
const memoryCache = new LRUCache({
  max: 10000, // 최대 10,000개 항목
});

// 캐시 인터페이스
export interface CacheConfig {
  ttl?: number; // 캐시 만료 시간 (초)
  useMemoryCache?: boolean; // 메모리 캐시 사용 여부
  compress?: boolean; // 압축 여부
}

// 캐시 매니저 클래스
export class CacheManager {
  private static instance: CacheManager;
  
  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }
  
  // 데이터 설정
  async set(
    key: string, 
    value: any, 
    config: CacheConfig = {}
  ): Promise<void> {
    const { ttl = 3600, useMemoryCache = true, compress = true } = config;
    
    let serializedValue: string;
    
    if (compress && typeof value === 'object') {
      serializedValue = JSON.stringify(value);
    } else {
      serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
    }
    
    // Redis에 저장 (사용 가능한 경우)
    if (redisClient) {
      try {
        await redisClient.setex(key, ttl, serializedValue);
      } catch (error) {
        console.error('Redis set error:', error);
      }
    }
    
    // 메모리 캐시에 저장 (항상)
    if (useMemoryCache) {
      memoryCache.set(key, value, {
        ttl: Math.min(ttl * 1000, 1000 * 60 * 5) // 최대 5분
      });
    }
  }
  
  // 데이터 가져오기
  async get<T = any>(
    key: string, 
    config: CacheConfig = {}
  ): Promise<T | null> {
    const { useMemoryCache = true } = config;
    
    // L1 캐시 (메모리) 확인
    if (useMemoryCache) {
      const memoryValue = memoryCache.get(key);
      if (memoryValue !== undefined) {
        return memoryValue;
      }
    }
    
    // L2 캐시 (Redis) 확인
    if (redisClient) {
      try {
        const redisValue = await redisClient.get(key);
        
        if (redisValue === null) {
          return null;
        }
        
        let parsedValue: T;
        try {
          parsedValue = JSON.parse(redisValue);
        } catch {
          parsedValue = redisValue as T;
        }
        
        // 메모리 캐시에 백필
        if (useMemoryCache) {
          memoryCache.set(key, parsedValue);
        }
        
        return parsedValue;
      } catch (error) {
        console.error(`Cache get error for key ${key}:`, error);
      }
    }
    
    return null;
  }
  
  // 다중 키 가져오기
  async mget(keys: string[]): Promise<Record<string, any>> {
    const output: Record<string, any> = {};
    
    // 먼저 메모리 캐시에서 확인
    for (const key of keys) {
      const memoryValue = memoryCache.get(key);
      if (memoryValue !== undefined) {
        output[key] = memoryValue;
      }
    }
    
    // Redis에서 나머지 가져오기
    if (redisClient) {
      const missingKeys = keys.filter(key => !(key in output));
      
      if (missingKeys.length > 0) {
        try {
          const pipeline = redisClient.pipeline();
          missingKeys.forEach(key => pipeline.get(key));
          
          const results = await pipeline.exec();
          
          results?.forEach((result, index) => {
            const [err, value] = result;
            if (!err && value !== null) {
              try {
                output[missingKeys[index]] = JSON.parse(value as string);
              } catch {
                output[missingKeys[index]] = value;
              }
            }
          });
        } catch (error) {
          console.error('Cache mget error:', error);
        }
      }
    }
    
    return output;
  }
  
  // 키 삭제
  async delete(key: string): Promise<void> {
    memoryCache.delete(key);
    
    if (redisClient) {
      try {
        await redisClient.del(key);
      } catch (error) {
        console.error('Cache delete error:', error);
      }
    }
  }
  
  // 패턴으로 키 삭제
  async deletePattern(pattern: string): Promise<void> {
    // 메모리 캐시 클리어 (패턴 매칭)
    const keys = memoryCache.keys();
    for (const key of keys) {
      if (key.toString().match(pattern)) {
        memoryCache.delete(key.toString());
      }
    }
    
    // Redis에서 삭제
    if (redisClient) {
      try {
        const keys = await redisClient.keys(pattern);
        if (keys.length > 0) {
          await redisClient.del(...keys);
        }
      } catch (error) {
        console.error('Cache deletePattern error:', error);
      }
    }
  }
  
  // 캐시 통계
  async getStats() {
    const memoryStats = {
      size: memoryCache.size,
      calculatedSize: memoryCache.calculatedSize,
    };
    
    let redisStats = null;
    if (redisClient) {
      try {
        const info = await redisClient.info();
        redisStats = info;
      } catch (error) {
        console.error('Redis stats error:', error);
      }
    }
    
    return {
      memory: memoryStats,
      redis: redisStats,
    };
  }
  
  // 전체 캐시 클리어
  async flush(): Promise<void> {
    memoryCache.clear();
    
    if (redisClient) {
      try {
        await redisClient.flushdb();
      } catch (error) {
        console.error('Cache flush error:', error);
      }
    }
  }
  
  // TTL 업데이트
  async updateTTL(key: string, ttl: number): Promise<void> {
    if (redisClient) {
      try {
        await redisClient.expire(key, ttl);
      } catch (error) {
        console.error('Cache updateTTL error:', error);
      }
    }
  }
  
  // 키 존재 여부 확인
  async exists(key: string): Promise<boolean> {
    // 메모리 캐시 확인
    if (memoryCache.has(key)) {
      return true;
    }
    
    // Redis 확인
    if (redisClient) {
      try {
        const exists = await redisClient.exists(key);
        return exists === 1;
      } catch (error) {
        console.error('Cache exists error:', error);
      }
    }
    
    return false;
  }
}

// 싱글톤 인스턴스
export const cacheManager = CacheManager.getInstance();

// Redis 상태 확인 함수
export async function checkRedisHealth(): Promise<boolean> {
  if (!redisClient) {
    return false;
  }
  
  try {
    await redisClient.ping();
    return true;
  } catch (error) {
    console.error('Redis health check failed:', error);
    return false;
  }
}

// 캐시 미들웨어
export interface CacheMiddlewareOptions {
  key: string | ((request: Request) => string);
  ttl?: number;
  condition?: (request: Request) => boolean;
}

export function cacheMiddleware(options: CacheMiddlewareOptions) {
  return async (request: Request, next: () => Promise<Response>) => {
    // 캐시 조건 확인
    if (options.condition && !options.condition(request)) {
      return next();
    }
    
    // 캐시 키 생성
    const cacheKey = typeof options.key === 'function' 
      ? options.key(request) 
      : options.key;
    
    // 캐시에서 조회
    const cached = await cacheManager.get(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: {
          'Content-Type': 'application/json',
          'X-Cache': 'HIT',
        },
      });
    }
    
    // 캐시 미스 - 실제 처리
    const response = await next();
    
    // 성공 응답만 캐시
    if (response.ok) {
      const data = await response.clone().json();
      await cacheManager.set(cacheKey, data, { ttl: options.ttl });
    }
    
    return response;
  };
}

// 기본 export (하위 호환성)
export { redisClient as redisCluster };
export const cache = cacheManager;