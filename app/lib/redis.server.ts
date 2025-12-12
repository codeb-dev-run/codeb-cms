/**
 * Redis 클라이언트 (선택적 - 환경에 따라 사용)
 */

import { Redis, Cluster } from "ioredis";

let redis: Redis | Cluster | null = null;

export function getRedis(): Redis | Cluster | null {
  if (redis) return redis;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn("REDIS_URL not configured, Redis features disabled");
    return null;
  }

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true,
    });

    redis.on("error", (error) => {
      console.error("Redis connection error:", error);
    });

    redis.on("connect", () => {
      console.log("Redis connected successfully");
    });

    return redis;
  } catch (error) {
    console.error("Failed to initialize Redis:", error);
    return null;
  }
}

export async function setCache(key: string, value: string, ttl?: number): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    if (ttl) {
      await client.setex(key, ttl, value);
    } else {
      await client.set(key, value);
    }
  } catch (error) {
    console.error("Redis set error:", error);
  }
}

export async function getCache(key: string): Promise<string | null> {
  const client = getRedis();
  if (!client) return null;

  try {
    return await client.get(key);
  } catch (error) {
    console.error("Redis get error:", error);
    return null;
  }
}

export async function deleteCache(key: string): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    await client.del(key);
  } catch (error) {
    console.error("Redis delete error:", error);
  }
}

export async function invalidatePattern(pattern: string): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  } catch (error) {
    console.error("Redis invalidate pattern error:", error);
  }
}

export { redis };
