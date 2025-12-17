/**
 * 프로덕션 모니터링 시스템
 * 실시간 모니터링, 알림, 로깅, 성능 추적
 */
import { EventEmitter } from 'events';

export interface MonitoringConfig {
  alerting: {
    email: string[];
    slack?: {
      webhookUrl: string;
      channel: string;
    };
    thresholds: {
      errorRate: number;
      responseTime: number;
      memoryUsage: number;
      cpuUsage: number;
      diskUsage: number;
    };
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    retentionDays: number;
    maxFileSize: string;
  };
  metrics: {
    collectInterval: number;
    retentionDays: number;
  };
}

export interface SystemMetrics {
  timestamp: Date;
  server: {
    uptime: number;
    memoryUsage: {
      total: number;
      used: number;
      free: number;
      percentage: number;
    };
    cpuUsage: {
      percentage: number;
      loadAverage: number[];
    };
    diskUsage: {
      total: number;
      used: number;
      free: number;
      percentage: number;
    };
  };
  application: {
    activeUsers: number;
    requestsPerMinute: number;
    averageResponseTime: number;
    errorRate: number;
    databaseConnections: number;
    cacheHitRate: number;
  };
  business: {
    dailyActiveUsers: number;
    newRegistrations: number;
    postsCreated: number;
    pageViews: number;
  };
}

export interface Alert {
  id: string;
  type: 'warning' | 'critical' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  source: string;
  resolved: boolean;
  resolvedAt?: Date;
  metadata: Record<string, any>;
}

export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  source: string;
  userId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
  stack?: string;
}

class MonitoringSystem extends EventEmitter {
  private metrics: SystemMetrics[] = [];
  private alerts: Map<string, Alert> = new Map();
  private logs: LogEntry[] = [];
  private config: MonitoringConfig;
  private metricsInterval: NodeJS.Timeout | null = null;
  private isStarted = false;

  constructor(config: MonitoringConfig) {
    super();
    this.config = config;
  }

  /**
   * 모니터링 시스템 시작
   */
  start(): void {
    if (this.isStarted) return;

    console.log('🔍 프로덕션 모니터링 시스템 시작...');
    
    this.isStarted = true;
    
    // 메트릭 수집 시작
    this.startMetricsCollection();
    
    // 알림 시스템 초기화
    this.initializeAlertingSystem();
    
    // 로그 시스템 초기화
    this.initializeLoggingSystem();
    
    this.emit('started');
    console.log('✅ 모니터링 시스템 시작됨');
  }

  /**
   * 모니터링 시스템 중지
   */
  stop(): void {
    if (!this.isStarted) return;

    console.log('⏹️  모니터링 시스템 중지...');
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    this.isStarted = false;
    this.emit('stopped');
    
    console.log('✅ 모니터링 시스템 중지됨');
  }

  /**
   * 메트릭 수집 시작
   */
  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(async () => {
      try {
        const metrics = await this.collectSystemMetrics();
        this.metrics.push(metrics);
        
        // 메트릭 보존 기간 관리
        const cutoff = new Date(Date.now() - this.config.metrics.retentionDays * 24 * 60 * 60 * 1000);
        this.metrics = this.metrics.filter(m => m.timestamp > cutoff);
        
        // 임계값 체크 및 알림
        await this.checkThresholds(metrics);
        
        this.emit('metricsCollected', metrics);
      } catch (error) {
        this.logError('메트릭 수집 실패', error instanceof Error ? error : undefined);
      }
    }, this.config.metrics.collectInterval);
  }

  /**
   * 시스템 메트릭 수집
   */
  private async collectSystemMetrics(): Promise<SystemMetrics> {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // 애플리케이션 메트릭 수집
    const applicationMetrics = await this.collectApplicationMetrics();
    
    // 비즈니스 메트릭 수집
    const businessMetrics = await this.collectBusinessMetrics();

    return {
      timestamp: new Date(),
      server: {
        uptime: process.uptime(),
        memoryUsage: {
          total: Math.round(memUsage.heapTotal / 1024 / 1024),
          used: Math.round(memUsage.heapUsed / 1024 / 1024),
          free: Math.round((memUsage.heapTotal - memUsage.heapUsed) / 1024 / 1024),
          percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
        },
        cpuUsage: {
          percentage: Math.round((cpuUsage.user + cpuUsage.system) / 1000000), // 간소화된 계산
          loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0],
        },
        diskUsage: await this.getDiskUsage(),
      },
      application: applicationMetrics,
      business: businessMetrics,
    };
  }

  /**
   * 애플리케이션 메트릭 수집
   */
  private async collectApplicationMetrics() {
    try {
      // Redis에서 실시간 통계 가져오기
      const { getRedisCluster } = await import('../redis/cluster.server');
      const redis = getRedisCluster();
      
      const activeUsers = parseInt(await redis.get('metrics:active_users') || '0');
      const requestsPerMinute = parseInt(await redis.get('metrics:requests_per_minute') || '0');
      const averageResponseTime = parseFloat(await redis.get('metrics:avg_response_time') || '0');
      const errorRate = parseFloat(await redis.get('metrics:error_rate') || '0');
      const cacheHitRate = parseFloat(await redis.get('metrics:cache_hit_rate') || '0');

      return {
        activeUsers,
        requestsPerMinute,
        averageResponseTime,
        errorRate,
        databaseConnections: await this.getDatabaseConnections(),
        cacheHitRate,
      };
    } catch (error) {
      return {
        activeUsers: 0,
        requestsPerMinute: 0,
        averageResponseTime: 0,
        errorRate: 0,
        databaseConnections: 0,
        cacheHitRate: 0,
      };
    }
  }

  /**
   * 비즈니스 메트릭 수집
   */
  private async collectBusinessMetrics() {
    try {
      const { db } = await import('../db.server');
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const [dailyActiveUsers, newRegistrations, postsCreated] = await Promise.all([
        db.user.count({
          where: {
            updatedAt: { gte: today },
          },
        }),
        db.user.count({
          where: {
            createdAt: { gte: today },
          },
        }),
        db.post.count({
          where: {
            createdAt: { gte: today },
          },
        }),
      ]);

      return {
        dailyActiveUsers,
        newRegistrations,
        postsCreated,
        pageViews: 0, // 실제 구현 시 웹 분석 도구와 연동
      };
    } catch (error) {
      return {
        dailyActiveUsers: 0,
        newRegistrations: 0,
        postsCreated: 0,
        pageViews: 0,
      };
    }
  }

  /**
   * 디스크 사용량 가져오기
   */
  private async getDiskUsage() {
    try {
      const fs = await import('fs');
      const stats = fs.statSync(process.cwd());
      
      // 간소화된 디스크 사용량 (실제로는 statvfs 등 사용)
      return {
        total: 1000000, // 1TB (가상)
        used: 500000,   // 500GB (가상)
        free: 500000,   // 500GB (가상)
        percentage: 50,
      };
    } catch {
      return {
        total: 0,
        used: 0,
        free: 0,
        percentage: 0,
      };
    }
  }

  /**
   * 데이터베이스 연결 수 가져오기
   */
  private async getDatabaseConnections(): Promise<number> {
    try {
      // Prisma 연결 풀 정보 (실제 구현 필요)
      return 5; // 가상 값
    } catch {
      return 0;
    }
  }

  /**
   * 임계값 체크 및 알림 발생
   */
  private async checkThresholds(metrics: SystemMetrics): Promise<void> {
    const { thresholds } = this.config.alerting;

    // 에러율 체크
    if (metrics.application.errorRate > thresholds.errorRate) {
      await this.createAlert({
        type: 'critical',
        title: '높은 오류율 감지',
        message: `현재 오류율: ${metrics.application.errorRate.toFixed(2)}% (임계값: ${thresholds.errorRate}%)`,
        source: 'error_rate_monitor',
        metadata: { errorRate: metrics.application.errorRate },
      });
    }

    // 응답시간 체크
    if (metrics.application.averageResponseTime > thresholds.responseTime) {
      await this.createAlert({
        type: 'warning',
        title: '느린 응답시간 감지',
        message: `평균 응답시간: ${metrics.application.averageResponseTime}ms (임계값: ${thresholds.responseTime}ms)`,
        source: 'response_time_monitor',
        metadata: { responseTime: metrics.application.averageResponseTime },
      });
    }

    // 메모리 사용률 체크
    if (metrics.server.memoryUsage.percentage > thresholds.memoryUsage) {
      await this.createAlert({
        type: 'warning',
        title: '높은 메모리 사용률',
        message: `메모리 사용률: ${metrics.server.memoryUsage.percentage}% (임계값: ${thresholds.memoryUsage}%)`,
        source: 'memory_monitor',
        metadata: { memoryUsage: metrics.server.memoryUsage },
      });
    }

    // CPU 사용률 체크
    if (metrics.server.cpuUsage.percentage > thresholds.cpuUsage) {
      await this.createAlert({
        type: 'warning',
        title: '높은 CPU 사용률',
        message: `CPU 사용률: ${metrics.server.cpuUsage.percentage}% (임계값: ${thresholds.cpuUsage}%)`,
        source: 'cpu_monitor',
        metadata: { cpuUsage: metrics.server.cpuUsage },
      });
    }

    // 디스크 사용률 체크
    if (metrics.server.diskUsage.percentage > thresholds.diskUsage) {
      await this.createAlert({
        type: 'critical',
        title: '디스크 공간 부족',
        message: `디스크 사용률: ${metrics.server.diskUsage.percentage}% (임계값: ${thresholds.diskUsage}%)`,
        source: 'disk_monitor',
        metadata: { diskUsage: metrics.server.diskUsage },
      });
    }
  }

  /**
   * 알림 생성
   */
  private async createAlert(alertData: Omit<Alert, 'id' | 'timestamp' | 'resolved'>): Promise<Alert> {
    const alert: Alert = {
      id: this.generateAlertId(),
      timestamp: new Date(),
      resolved: false,
      ...alertData,
    };

    this.alerts.set(alert.id, alert);

    // 알림 전송
    await this.sendAlert(alert);

    this.emit('alertCreated', alert);
    return alert;
  }

  /**
   * 알림 전송
   */
  private async sendAlert(alert: Alert): Promise<void> {
    try {
      // 이메일 알림
      await this.sendEmailAlert(alert);

      // Slack 알림
      if (this.config.alerting.slack) {
        await this.sendSlackAlert(alert);
      }

      this.logInfo(`알림 전송 완료: ${alert.title}`);
    } catch (error) {
      this.logError('알림 전송 실패', error instanceof Error ? error : undefined);
    }
  }

  /**
   * 이메일 알림 전송
   */
  private async sendEmailAlert(alert: Alert): Promise<void> {
    // 실제 구현에서는 nodemailer 등 사용
    console.log(`📧 이메일 알림: ${alert.title}`);
  }

  /**
   * Slack 알림 전송
   */
  private async sendSlackAlert(alert: Alert): Promise<void> {
    if (!this.config.alerting.slack) return;

    const payload = {
      channel: this.config.alerting.slack.channel,
      text: `🚨 ${alert.title}`,
      attachments: [
        {
          color: alert.type === 'critical' ? 'danger' : 'warning',
          fields: [
            {
              title: 'Message',
              value: alert.message,
              short: false,
            },
            {
              title: 'Source',
              value: alert.source,
              short: true,
            },
            {
              title: 'Time',
              value: alert.timestamp.toISOString(),
              short: true,
            },
          ],
        },
      ],
    };

    // 실제 Slack 웹훅 전송 (구현 필요)
    console.log('📱 Slack 알림:', payload);
  }

  /**
   * 알림 시스템 초기화
   */
  private initializeAlertingSystem(): void {
    // 알림 해결 자동 체크
    setInterval(() => {
      this.checkAlertResolution();
    }, 60000); // 1분마다 체크
  }

  /**
   * 알림 해결 상태 체크
   */
  private checkAlertResolution(): void {
    const unresolvedAlerts = Array.from(this.alerts.values()).filter(a => !a.resolved);
    
    for (const alert of unresolvedAlerts) {
      // 최근 메트릭과 비교하여 문제가 해결되었는지 확인
      if (this.isAlertResolved(alert)) {
        this.resolveAlert(alert.id);
      }
    }
  }

  /**
   * 알림 해결 여부 확인
   */
  private isAlertResolved(alert: Alert): boolean {
    if (this.metrics.length === 0) return false;
    
    const latestMetrics = this.metrics[this.metrics.length - 1];
    const { thresholds } = this.config.alerting;

    switch (alert.source) {
      case 'error_rate_monitor':
        return latestMetrics.application.errorRate <= thresholds.errorRate;
      case 'response_time_monitor':
        return latestMetrics.application.averageResponseTime <= thresholds.responseTime;
      case 'memory_monitor':
        return latestMetrics.server.memoryUsage.percentage <= thresholds.memoryUsage;
      case 'cpu_monitor':
        return latestMetrics.server.cpuUsage.percentage <= thresholds.cpuUsage;
      case 'disk_monitor':
        return latestMetrics.server.diskUsage.percentage <= thresholds.diskUsage;
      default:
        return false;
    }
  }

  /**
   * 알림 해결
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.resolved) return false;

    alert.resolved = true;
    alert.resolvedAt = new Date();

    this.emit('alertResolved', alert);
    this.logInfo(`알림 해결됨: ${alert.title}`);

    return true;
  }

  /**
   * 로깅 시스템 초기화
   */
  private initializeLoggingSystem(): void {
    // 로그 보존 기간 관리
    setInterval(() => {
      const cutoff = new Date(Date.now() - this.config.logging.retentionDays * 24 * 60 * 60 * 1000);
      this.logs = this.logs.filter(log => log.timestamp > cutoff);
    }, 60 * 60 * 1000); // 1시간마다 정리
  }

  /**
   * 로그 메서드들
   */
  logDebug(message: string, metadata?: Record<string, any>): void {
    if (this.config.logging.level === 'debug') {
      this.addLog('debug', message, metadata);
    }
  }

  logInfo(message: string, metadata?: Record<string, any>): void {
    if (['debug', 'info'].includes(this.config.logging.level)) {
      this.addLog('info', message, metadata);
    }
  }

  logWarn(message: string, metadata?: Record<string, any>): void {
    if (['debug', 'info', 'warn'].includes(this.config.logging.level)) {
      this.addLog('warn', message, metadata);
    }
  }

  logError(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.addLog('error', message, metadata, error?.stack);
  }

  private addLog(level: LogEntry['level'], message: string, metadata?: Record<string, any>, stack?: string): void {
    const log: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      source: 'monitoring_system',
      metadata,
      stack,
    };

    this.logs.push(log);
    this.emit('logCreated', log);

    // 콘솔 출력
    console.log(`[${log.level.toUpperCase()}] ${log.timestamp.toISOString()} - ${message}`);
    if (stack) console.log(stack);
  }

  /**
   * 공개 메서드들
   */
  getLatestMetrics(): SystemMetrics | null {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
  }

  getMetricsHistory(hours = 24): SystemMetrics[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.metrics.filter(m => m.timestamp > cutoff);
  }

  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(a => !a.resolved);
  }

  getAllAlerts(): Alert[] {
    return Array.from(this.alerts.values());
  }

  getRecentLogs(level?: LogEntry['level'], limit = 100): LogEntry[] {
    let logs = this.logs;
    
    if (level) {
      logs = logs.filter(log => log.level === level);
    }
    
    return logs
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  getSystemStatus(): {
    status: 'healthy' | 'warning' | 'critical';
    uptime: number;
    activeAlerts: number;
    recentErrors: number;
  } {
    const activeAlerts = this.getActiveAlerts();
    const criticalAlerts = activeAlerts.filter(a => a.type === 'critical').length;
    const warningAlerts = activeAlerts.filter(a => a.type === 'warning').length;

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentErrors = this.logs.filter(
      log => log.level === 'error' && log.timestamp > oneHourAgo
    ).length;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (criticalAlerts > 0) status = 'critical';
    else if (warningAlerts > 0 || recentErrors > 10) status = 'warning';

    return {
      status,
      uptime: process.uptime(),
      activeAlerts: activeAlerts.length,
      recentErrors,
    };
  }

  /**
   * 유틸리티 메서드들
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getIsStarted(): boolean {
    return this.isStarted;
  }
}

// 기본 설정
const defaultConfig: MonitoringConfig = {
  alerting: {
    email: ['admin@example.com'],
    thresholds: {
      errorRate: 5,      // 5%
      responseTime: 1000, // 1초
      memoryUsage: 80,   // 80%
      cpuUsage: 80,      // 80%
      diskUsage: 85,     // 85%
    },
  },
  logging: {
    level: 'info',
    retentionDays: 30,
    maxFileSize: '100MB',
  },
  metrics: {
    collectInterval: 30000, // 30초
    retentionDays: 7,
  },
};

let monitoringSystem: MonitoringSystem;

export function getMonitoringSystem(config: MonitoringConfig = defaultConfig): MonitoringSystem {
  if (!monitoringSystem) {
    monitoringSystem = new MonitoringSystem(config);
  }
  return monitoringSystem;
}