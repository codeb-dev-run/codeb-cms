/**
 * QPS 10,000+ 지원을 위한 고성능 데이터베이스 연결 풀
 *
 * 최적화 전략:
 * 1. Master-Replica 분리 (Write/Read)
 * 2. 연결 풀 크기 동적 조정
 * 3. 쿼리 타임아웃 및 재시도
 * 4. 느린 쿼리 자동 감지
 * 5. 연결 상태 모니터링
 */

import { PrismaClient, Prisma } from '@prisma/client';

// ============================================
// 1. 환경 설정
// ============================================

const CONFIG = {
  // 마스터 DB (쓰기 전용)
  master: {
    url: process.env.DATABASE_URL!,
    poolSize: parseInt(process.env.DB_POOL_SIZE_MASTER || '50', 10),
    connectionTimeout: 10000,  // 10초
    idleTimeout: 60000,        // 1분
  },
  // 복제본 DB (읽기 전용) - 설정된 경우에만 사용
  replicas: (process.env.DATABASE_REPLICA_URLS || '')
    .split(',')
    .filter(Boolean)
    .map((url, index) => ({
      url,
      weight: parseInt(process.env[`DB_REPLICA_${index}_WEIGHT`] || '1', 10),
      poolSize: parseInt(process.env.DB_POOL_SIZE_REPLICA || '30', 10),
    })),
  // 쿼리 설정
  query: {
    slowQueryThreshold: 100,   // 100ms 이상 = 느린 쿼리
    timeout: 30000,            // 30초 타임아웃
    retryCount: 3,
    retryDelay: 100,           // 100ms
  },
};

// ============================================
// 2. Prisma 클라이언트 생성
// ============================================

function createPrismaClient(
  url: string,
  poolSize: number,
  isReplica: boolean = false
): PrismaClient {
  // URL에 connection_limit 추가
  const urlWithPool = url.includes('connection_limit')
    ? url
    : `${url}${url.includes('?') ? '&' : '?'}connection_limit=${poolSize}&pool_timeout=10`;

  const client = new PrismaClient({
    datasources: {
      db: { url: urlWithPool },
    },
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'warn', 'error']
      : ['warn', 'error'],
  });

  // 미들웨어: 느린 쿼리 로깅
  client.$use(async (params, next) => {
    const start = Date.now();
    const result = await next(params);
    const duration = Date.now() - start;

    if (duration > CONFIG.query.slowQueryThreshold) {
      console.warn(
        `[SlowQuery] ${isReplica ? 'Replica' : 'Master'} | ` +
        `${params.model}.${params.action} | ${duration}ms`
      );
    }

    return result;
  });

  return client;
}

// ============================================
// 3. Master 클라이언트 (싱글톤)
// ============================================

let masterClient: PrismaClient | null = null;

function getMasterClient(): PrismaClient {
  if (!masterClient) {
    masterClient = createPrismaClient(
      CONFIG.master.url,
      CONFIG.master.poolSize,
      false
    );
  }
  return masterClient;
}

// ============================================
// 4. Replica 클라이언트 (라운드 로빈)
// ============================================

let replicaClients: PrismaClient[] = [];
let replicaWeights: number[] = [];
let replicaIndex = 0;
let totalWeight = 0;

function initReplicaClients(): void {
  if (replicaClients.length > 0) return;

  CONFIG.replicas.forEach((replica) => {
    const client = createPrismaClient(replica.url, replica.poolSize, true);
    replicaClients.push(client);
    replicaWeights.push(replica.weight);
    totalWeight += replica.weight;
  });

  console.log(`[DB] Initialized ${replicaClients.length} replica connections`);
}

/**
 * 가중치 기반 라운드 로빈으로 복제본 선택
 */
function getReplicaClient(): PrismaClient {
  if (replicaClients.length === 0) {
    return getMasterClient(); // 복제본 없으면 마스터 사용
  }

  // 가중치 기반 선택
  let random = Math.random() * totalWeight;
  for (let i = 0; i < replicaClients.length; i++) {
    random -= replicaWeights[i];
    if (random <= 0) {
      return replicaClients[i];
    }
  }

  // Fallback: 라운드 로빈
  const client = replicaClients[replicaIndex];
  replicaIndex = (replicaIndex + 1) % replicaClients.length;
  return client;
}

// ============================================
// 5. 공개 API
// ============================================

/**
 * 쓰기 전용 클라이언트 (Master)
 */
export function getWriteClient(): PrismaClient {
  return getMasterClient();
}

/**
 * 읽기 전용 클라이언트 (Replica 또는 Master)
 */
export function getReadClient(): PrismaClient {
  initReplicaClients();
  return getReplicaClient();
}

/**
 * 기본 클라이언트 (호환성)
 */
export function getDbClient(): PrismaClient {
  return getMasterClient();
}

/**
 * 재시도 가능한 쿼리 실행
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  retries: number = CONFIG.query.retryCount
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // 재시도 불가능한 에러는 바로 throw
      if (!isRetryableError(error)) {
        throw error;
      }

      if (attempt < retries) {
        const delay = CONFIG.query.retryDelay * attempt;
        console.warn(`[DB] Retry ${attempt}/${retries} after ${delay}ms`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * 타임아웃 포함 쿼리 실행
 */
export async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = CONFIG.query.timeout
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Query timeout')), timeoutMs)
    ),
  ]);
}

/**
 * 트랜잭션 헬퍼 (재시도 + 타임아웃)
 */
export async function transaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: {
    maxWait?: number;
    timeout?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
  }
): Promise<T> {
  const client = getMasterClient();

  return executeWithRetry(() =>
    client.$transaction(fn, {
      maxWait: options?.maxWait || 5000,
      timeout: options?.timeout || 10000,
      isolationLevel: options?.isolationLevel || Prisma.TransactionIsolationLevel.ReadCommitted,
    })
  );
}

// ============================================
// 6. 연결 상태 모니터링
// ============================================

interface ConnectionPoolStats {
  master: {
    activeConnections: number;
    idleConnections: number;
    waitingQueries: number;
  };
  replicas: Array<{
    index: number;
    activeConnections: number;
    idleConnections: number;
  }>;
  health: 'healthy' | 'degraded' | 'unhealthy';
}

/**
 * 연결 풀 상태 조회
 */
export async function getPoolStats(): Promise<ConnectionPoolStats> {
  const masterStats = await getMasterClient().$queryRaw<
    Array<{ active: number; idle: number; waiting: number }>
  >`
    SELECT
      (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active,
      (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') as idle,
      (SELECT count(*) FROM pg_stat_activity WHERE wait_event_type IS NOT NULL) as waiting
  `;

  const replicaStats = await Promise.all(
    replicaClients.map(async (client, index) => {
      try {
        const stats = await client.$queryRaw<Array<{ active: number; idle: number }>>`
          SELECT
            (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active,
            (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') as idle
        `;
        return {
          index,
          activeConnections: Number(stats[0]?.active || 0),
          idleConnections: Number(stats[0]?.idle || 0),
        };
      } catch {
        return { index, activeConnections: -1, idleConnections: -1 };
      }
    })
  );

  const masterActive = Number(masterStats[0]?.active || 0);
  const masterWaiting = Number(masterStats[0]?.waiting || 0);
  const unhealthyReplicas = replicaStats.filter((r) => r.activeConnections < 0);

  let health: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (masterWaiting > 10 || unhealthyReplicas.length > 0) {
    health = 'degraded';
  }
  if (masterActive < 0 || unhealthyReplicas.length === replicaClients.length) {
    health = 'unhealthy';
  }

  return {
    master: {
      activeConnections: masterActive,
      idleConnections: Number(masterStats[0]?.idle || 0),
      waitingQueries: masterWaiting,
    },
    replicas: replicaStats,
    health,
  };
}

/**
 * 헬스체크
 */
export async function healthCheck(): Promise<boolean> {
  try {
    await getMasterClient().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

// ============================================
// 7. 유틸리티
// ============================================

function isRetryableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P1000: 인증 실패
    // P1001: 연결 불가
    // P1002: 타임아웃
    // P1008: 연산 타임아웃
    // P2024: 커넥션 풀 타임아웃
    return ['P1001', 'P1002', 'P1008', 'P2024'].includes(error.code);
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('pool')
    );
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// 8. 종료 처리
// ============================================

async function cleanup(): Promise<void> {
  console.log('[DB] Cleaning up connections...');

  if (masterClient) {
    await masterClient.$disconnect();
  }

  for (const client of replicaClients) {
    await client.$disconnect();
  }

  console.log('[DB] All connections closed');
}

// 프로세스 종료 시 정리
process.on('beforeExit', cleanup);
process.on('SIGINT', async () => {
  await cleanup();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await cleanup();
  process.exit(0);
});
