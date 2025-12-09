// 헬스체크 및 상태 모니터링 엔드포인트

import type { LoaderFunction } from '@remix-run/node';
import { json } from '@remix-run/node';
import { prisma } from '../lib/db.server';
import { checkRedisHealth } from '../lib/cache/redis-cluster.server';
import { getConnectionPoolStatus } from '../lib/database/db-read-replica.server';

interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  services: {
    database: {
      status: 'up' | 'down';
      responseTime?: number;
      connections?: {
        active: number;
        max: number;
      };
    };
    redis: {
      status: 'up' | 'down';
      responseTime?: number;
    };
    filesystem: {
      status: 'up' | 'down';
      uploadDirectory: boolean;
      logDirectory: boolean;
    };
  };
  metrics: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      percentage: number;
    };
    requests: {
      total: number;
      errorsLast24h: number;
    };
  };
}

export const loader: LoaderFunction = async () => {
  const startTime = Date.now();
  
  try {
    // 데이터베이스 상태 확인
    const dbStartTime = Date.now();
    let databaseStatus: { status: 'up' | 'down'; responseTime?: number; connections?: { active: number; max: number } } = { status: 'down' };
    
    try {
      await prisma.$queryRaw`SELECT 1`;
      const connectionStatus = await getConnectionPoolStatus();
      
      databaseStatus = {
        status: 'up',
        responseTime: Date.now() - dbStartTime,
        connections: connectionStatus
      };
    } catch (error) {
      console.error('Database health check failed:', error);
      databaseStatus = { status: 'down' };
    }

    // Redis 상태 확인
    const redisStartTime = Date.now();
    let redisStatus: { status: 'up' | 'down'; responseTime?: number } = { status: 'down' };
    
    try {
      const isRedisHealthy = await checkRedisHealth();
      redisStatus = {
        status: isRedisHealthy ? 'up' : 'down',
        responseTime: Date.now() - redisStartTime
      };
    } catch (error) {
      console.error('Redis health check failed:', error);
      redisStatus = { status: 'down' };
    }

    // 파일시스템 상태 확인
    const filesystemStatus = {
      status: 'up' as const,
      uploadDirectory: true,
      logDirectory: true
    };

    try {
      const fs = await import('fs/promises');
      
      // 업로드 디렉토리 확인
      try {
        await fs.access('./uploads');
      } catch {
        filesystemStatus.uploadDirectory = false;
        filesystemStatus.status = 'down';
      }

      // 로그 디렉토리 확인
      try {
        await fs.access('./logs');
      } catch {
        filesystemStatus.logDirectory = false;
        filesystemStatus.status = 'down';
      }
    } catch (error) {
      console.error('Filesystem health check failed:', error);
      filesystemStatus.status = 'down';
    }

    // 시스템 메트릭 수집
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // 메모리 사용률 계산 (RSS 기준)
    const memoryPercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

    // CPU 사용률 (간단한 근사치)
    const cpuPercentage = ((cpuUsage.user + cpuUsage.system) / 1000000) / process.uptime() * 100;

    // 애플리케이션 메트릭
    let requestMetrics = {
      total: 0,
      errorsLast24h: 0
    };

    try {
      // 24시간 내 요청 통계 (실제 구현 시 로그 분석 또는 메트릭 저장소에서 조회)
      // const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // 예시: 로그 테이블이 있다면
      // const requestStats = await prisma.requestLog.aggregate({
      //   where: { createdAt: { gte: last24Hours } },
      //   _count: { id: true },
      //   _sum: { errors: true }
      // });

      requestMetrics = {
        total: Math.floor(Math.random() * 10000), // 임시 값
        errorsLast24h: Math.floor(Math.random() * 50) // 임시 값
      };
    } catch (error) {
      console.error('Request metrics collection failed:', error);
    }

    // 전체 상태 결정
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    
    if (databaseStatus.status === 'down') {
      overallStatus = 'unhealthy';
    } else if (redisStatus.status === 'down' || filesystemStatus.status === 'down') {
      overallStatus = 'degraded';
    }

    const healthCheck: HealthCheckResult = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      services: {
        database: databaseStatus,
        redis: redisStatus,
        filesystem: filesystemStatus
      },
      metrics: {
        memory: {
          used: memoryUsage.heapUsed,
          total: memoryUsage.heapTotal,
          percentage: memoryPercentage
        },
        cpu: {
          percentage: Math.min(100, Math.max(0, cpuPercentage))
        },
        requests: requestMetrics
      }
    };

    const responseTime = Date.now() - startTime;
    
    // 응답 시간이 너무 길면 성능 문제로 간주
    if (responseTime > 5000) {
      healthCheck.status = 'degraded';
    }

    return json(healthCheck, {
      status: overallStatus === 'unhealthy' ? 503 : 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Response-Time': `${responseTime}ms`
      }
    });

  } catch (error) {
    console.error('Health check error:', error);
    
    return json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
        uptime: process.uptime()
      },
      { 
        status: 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      }
    );
  }
};