/**
 * Redis 클러스터 연결 관리
 * 10,000+ 동시 사용자 지원을 위한 고가용성 Redis 클러스터 구성
 */

import { Cluster, Redis, RedisOptions } from 'ioredis';

// 환경 변수에서 Redis 클러스터 노드 정보 가져오기
const getClusterNodes = () => {
  const nodes = [];
  
  // 최소 3개 노드 지원 (환경 변수로 설정 가능)
  const defaultNodes = [
    { host: process.env.REDIS_HOST_1 || 'localhost', port: parseInt(process.env.REDIS_PORT_1 || '6379') },
    { host: process.env.REDIS_HOST_2 || 'localhost', port: parseInt(process.env.REDIS_PORT_2 || '6380') },
    { host: process.env.REDIS_HOST_3 || 'localhost', port: parseInt(process.env.REDIS_PORT_3 || '6381') }
  ];

  // 환경 변수로 추가 노드 설정 가능
  for (let i = 1; i <= 10; i++) {
    const host = process.env[`REDIS_HOST_${i}`];
    const port = process.env[`REDIS_PORT_${i}`];
    
    if (host && port) {
      nodes.push({ host, port: parseInt(port) });
    }
  }

  return nodes.length > 0 ? nodes : defaultNodes;
};

// Redis 클러스터 설정
const clusterOptions = {
  // 자동 파이프라이닝으로 성능 최적화
  enableAutoPipelining: true,
  
  // 오프라인 큐 활성화 (연결이 끊겼을 때 명령 큐잉)
  enableOfflineQueue: true,
  
  // 읽기 분산 전략 (slave 노드에서 읽기)
  scaleReads: 'slave' as const,
  
  // 재시도 설정
  maxRetriesPerRequest: 3,
  
  // 클러스터 다운 시 재시도 지연
  retryDelayOnClusterDown: 100,
  
  // 페일오버 시 재시도 지연
  retryDelayOnFailover: 100,
  
  // TRYAGAIN 에러 시 재시도 지연
  retryDelayOnTryAgain: 100,
  
  // MOVED 에러 시 재시도 지연 (슬롯 이동)
  retryDelayOnMoved: 0,
  
  // 최대 리다이렉션 횟수
  maxRedirections: 16,
  
  // 슬롯 새로고침 간격 (5초)
  slotsRefreshInterval: 5000,
  
  // 슬롯 새로고침 타임아웃 (1초)
  slotsRefreshTimeout: 1000,
  
  // 클러스터 재시도 전략
  clusterRetryStrategy: (times: number) => {
    // 지수 백오프 전략 (최대 2초)
    return Math.min(100 + times * 2, 2000);
  },
  
  // Redis 노드 옵션
  redisOptions: {
    password: process.env.REDIS_PASSWORD,
    
    // 연결 유지
    keepAlive: 10000,
    
    // Nagle 알고리즘 비활성화 (낮은 지연시간)
    noDelay: true,
    
    // 연결 타임아웃 (10초)
    connectTimeout: 10000,
    
    // 명령 타임아웃 (5초)
    commandTimeout: 5000,
    
    // 자동 재연결
    retryStrategy: (times: number) => {
      if (times > 10) {
        // 10번 이상 실패 시 에러 발생
        console.error('Redis connection failed after 10 attempts');
        return null;
      }
      // 지수 백오프
      return Math.min(times * 50, 2000);
    },
    
    // 레이지 커넥트 비활성화 (즉시 연결)
    lazyConnect: false,
  } as RedisOptions,
  
  // Ready 체크 활성화
  enableReadyCheck: true,
  
  // 네트워크 주소 변환 (NAT) 매핑 (Docker/Kubernetes 환경)
  natMap: process.env.REDIS_NAT_MAP ? JSON.parse(process.env.REDIS_NAT_MAP) : undefined,
};

// Redis 인스턴스 (클러스터 모드 여부에 따라 Cluster 또는 Redis)
let redisCluster: Cluster | Redis | null = null;

// 클러스터 모드 사용 여부 (환경 변수로 제어)
const USE_CLUSTER_MODE = process.env.USE_REDIS_CLUSTER === 'true';

/**
 * Redis 클러스터 인스턴스 가져오기
 */
export function getRedisCluster(): Cluster | Redis {
  if (!redisCluster) {
    if (USE_CLUSTER_MODE) {
      // Redis Cluster 모드
      const nodes = getClusterNodes();

      console.log('Initializing Redis Cluster with nodes:', nodes);

      redisCluster = new Cluster(nodes, clusterOptions);

      // 이벤트 리스너 설정
      redisCluster.on('connect', () => {
        console.log('Redis Cluster connected');
      });

      redisCluster.on('ready', () => {
        console.log('Redis Cluster ready');
      });

      redisCluster.on('error', (error) => {
        console.error('Redis Cluster error:', error);
      });

      redisCluster.on('close', () => {
        console.log('Redis Cluster connection closed');
      });

      redisCluster.on('reconnecting', (delay: number) => {
        console.log(`Redis Cluster reconnecting in ${delay}ms`);
      });

      redisCluster.on('node error', (error: Error, address: string) => {
        console.error(`Redis node error at ${address}:`, error);
      });
    } else {
      // 단일 Redis 인스턴스 모드
      const host = process.env.REDIS_HOST_1 || process.env.REDIS_HOST || 'localhost';
      const port = parseInt(process.env.REDIS_PORT_1 || process.env.REDIS_PORT || '6379');

      console.log(`Initializing standalone Redis at ${host}:${port}`);

      redisCluster = new Redis({
        host,
        port,
        password: process.env.REDIS_PASSWORD,
        retryStrategy: (times: number) => {
          if (times > 10) {
            console.error('Redis connection failed after 10 attempts');
            return null;
          }
          return Math.min(times * 50, 2000);
        },
        lazyConnect: false,
        keepAlive: 10000,
        connectTimeout: 10000,
      });

      // 이벤트 리스너 설정
      redisCluster.on('connect', () => {
        console.log('Redis connected');
      });

      redisCluster.on('ready', () => {
        console.log('Redis ready');
      });

      redisCluster.on('error', (error) => {
        console.error('Redis error:', error);
      });

      redisCluster.on('close', () => {
        console.log('Redis connection closed');
      });

      redisCluster.on('reconnecting', (delay: number) => {
        console.log(`Redis reconnecting in ${delay}ms`);
      });
    }

    // 프로세스 종료 시 연결 정리
    process.on('SIGINT', async () => {
      await closeRedisCluster();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await closeRedisCluster();
      process.exit(0);
    });
  }

  return redisCluster;
}

/**
 * Redis 클러스터 연결 종료
 */
export async function closeRedisCluster(): Promise<void> {
  if (redisCluster) {
    console.log('Closing Redis Cluster connection...');
    await redisCluster.quit();
    redisCluster = null;
    console.log('Redis Cluster connection closed');
  }
}

/**
 * Redis 클러스터 헬스체크
 */
export async function checkRedisHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  details: {
    connected: boolean;
    nodesCount: number;
    masters: number;
    slaves: number;
    responseTime: number;
  };
}> {
  const startTime = Date.now();
  
  try {
    const cluster = getRedisCluster();

    // PING 테스트
    await cluster.ping();

    // 노드 정보 가져오기 (Cluster 모드일 때만)
    let nodesCount = 1;
    let mastersCount = 1;
    let slavesCount = 0;

    if ('nodes' in cluster && typeof cluster.nodes === 'function') {
      const nodes = (cluster as Cluster).nodes('all');
      const masters = (cluster as Cluster).nodes('master');
      const slaves = (cluster as Cluster).nodes('slave');
      nodesCount = nodes.length;
      mastersCount = masters.length;
      slavesCount = slaves.length;
    }

    const responseTime = Date.now() - startTime;

    return {
      status: 'healthy',
      details: {
        connected: true,
        nodesCount,
        masters: mastersCount,
        slaves: slavesCount,
        responseTime
      }
    };
  } catch (error) {
    console.error('Redis health check failed:', error);
    
    return {
      status: 'unhealthy',
      details: {
        connected: false,
        nodesCount: 0,
        masters: 0,
        slaves: 0,
        responseTime: Date.now() - startTime
      }
    };
  }
}

/**
 * Redis 클러스터 정보 가져오기
 */
export async function getClusterInfo(): Promise<{
  slots: { [key: string]: string[] };
  nodes: Array<{
    host: string;
    port: number;
    status: string;
    role: string;
  }>;
}> {
  const cluster = getRedisCluster();

  // 슬롯 정보
  const slots: { [key: string]: string[] } = {};

  // Cluster 모드가 아닌 경우 단일 노드 반환
  if (!('nodes' in cluster) || typeof cluster.nodes !== 'function') {
    return {
      slots,
      nodes: [{
        host: (cluster as Redis).options?.host || 'localhost',
        port: (cluster as Redis).options?.port || 6379,
        status: 'ready',
        role: 'master'
      }]
    };
  }

  // 노드 정보
  const allNodes = (cluster as Cluster).nodes('all');
  const nodes = await Promise.all(
    allNodes.map(async (node: Redis) => {
      try {
        const info = await node.info('replication');
        const role = info.includes('role:master') ? 'master' : 'slave';

        return {
          host: node.options?.host || 'unknown',
          port: node.options?.port || 0,
          status: node.status || 'unknown',
          role
        };
      } catch {
        return {
          host: node.options?.host || 'unknown',
          port: node.options?.port || 0,
          status: 'error',
          role: 'unknown'
        };
      }
    })
  );

  return { slots, nodes };
}

/**
 * Redis 클러스터 성능 메트릭
 */
export async function getClusterMetrics(): Promise<{
  operations: {
    total: number;
    instantaneous: number;
  };
  connections: {
    received: number;
    rejected: number;
  };
  memory: {
    used: number;
    peak: number;
  };
}> {
  const cluster = getRedisCluster();

  let totalOps = 0;
  let instantOps = 0;
  let connectionsReceived = 0;
  let connectionsRejected = 0;
  let memoryUsed = 0;
  let memoryPeak = 0;

  // 메트릭 수집 함수
  const collectMetrics = async (node: Redis) => {
    try {
      const info = await node.info('stats');
      const memInfo = await node.info('memory');

      // 연산 통계
      const opsMatch = info.match(/total_commands_processed:(\d+)/);
      const instantOpsMatch = info.match(/instantaneous_ops_per_sec:(\d+)/);

      if (opsMatch) totalOps += parseInt(opsMatch[1]);
      if (instantOpsMatch) instantOps += parseInt(instantOpsMatch[1]);

      // 연결 통계
      const connReceivedMatch = info.match(/total_connections_received:(\d+)/);
      const connRejectedMatch = info.match(/rejected_connections:(\d+)/);

      if (connReceivedMatch) connectionsReceived += parseInt(connReceivedMatch[1]);
      if (connRejectedMatch) connectionsRejected += parseInt(connRejectedMatch[1]);

      // 메모리 통계
      const memUsedMatch = memInfo.match(/used_memory:(\d+)/);
      const memPeakMatch = memInfo.match(/used_memory_peak:(\d+)/);

      if (memUsedMatch) memoryUsed += parseInt(memUsedMatch[1]);
      if (memPeakMatch) memoryPeak += parseInt(memPeakMatch[1]);
    } catch (error) {
      console.error('Failed to get metrics from node:', error);
    }
  };

  // Cluster 모드가 아닌 경우 단일 노드에서 수집
  if (!('nodes' in cluster) || typeof cluster.nodes !== 'function') {
    await collectMetrics(cluster as Redis);
  } else {
    const masters = (cluster as Cluster).nodes('master');
    await Promise.all(masters.map(collectMetrics));
  }

  return {
    operations: {
      total: totalOps,
      instantaneous: instantOps
    },
    connections: {
      received: connectionsReceived,
      rejected: connectionsRejected
    },
    memory: {
      used: memoryUsed,
      peak: memoryPeak
    }
  };
}

// Export cluster instance for direct access if needed
export { redisCluster };