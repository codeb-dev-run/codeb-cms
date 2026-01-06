/**
 * 알림 매니저
 * 알림 생성, 전송, 관리를 담당하는 핵심 클래스
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '~/lib/db.server';
import { getRedisCluster } from '../redis/cluster.server';
import { centrifugo } from '../centrifugo/client.server';
import { CHANNELS } from '../centrifugo/channels';
import {
  Notification,
  NotificationType,
  NotificationPriority,
  NotificationChannel,
  NotificationStatus,
  NotificationData,
  NotificationFilter,
  NotificationStats,
  NotificationEvent,
  NotificationPreferences,
  NotificationQueueItem,
} from './notification.types';

/**
 * 알림 매니저 설정
 */
interface NotificationManagerConfig {
  // 큐 설정
  queuePrefix?: string;
  maxRetries?: number;
  retryDelay?: number; // ms
  
  // TTL 설정
  notificationTTL?: number; // 초
  cacheTTL?: number; // 초
  
  // 배치 설정
  batchSize?: number;
  batchInterval?: number; // ms
  
  // 성능 설정
  enableCache?: boolean;
  enableMetrics?: boolean;
}

/**
 * 알림 매니저
 */
export class NotificationManager {
  private redis = getRedisCluster();
  private config: Required<NotificationManagerConfig>;
  private processingBatch = false;
  
  // 메트릭
  private metrics = {
    created: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    expired: 0,
  };
  
  constructor(config: NotificationManagerConfig = {}) {
    this.config = {
      queuePrefix: 'notification:queue',
      maxRetries: 3,
      retryDelay: 5000,
      notificationTTL: 7 * 24 * 60 * 60, // 7일
      cacheTTL: 60 * 60, // 1시간
      batchSize: 100,
      batchInterval: 1000,
      enableCache: true,
      enableMetrics: true,
      ...config,
    };
    
    // 배치 처리 시작
    this.startBatchProcessor();
  }
  
  /**
   * 알림 생성
   */
  async createNotification(
    userId: string,
    type: NotificationType,
    data: NotificationData,
    options: {
      priority?: NotificationPriority;
      channels?: NotificationChannel[];
      scheduledAt?: Date;
      expiresAt?: Date;
    } = {}
  ): Promise<Notification> {
    // 사용자 설정 확인
    const preferences = await this.getUserPreferences(userId);
    
    // 알림 채널 결정
    const channels = options.channels || this.getDefaultChannels(type, preferences);
    
    // DND 확인
    if (preferences.doNotDisturb) {
      channels.splice(channels.indexOf(NotificationChannel.PUSH), 1);
      channels.splice(channels.indexOf(NotificationChannel.SMS), 1);
    }
    
    // 조용한 시간 확인
    if (this.isQuietHours(preferences)) {
      channels.splice(channels.indexOf(NotificationChannel.PUSH), 1);
    }
    
    // 알림 생성
    const notification: Notification = {
      id: uuidv4(),
      userId,
      type,
      priority: options.priority || NotificationPriority.NORMAL,
      channels,
      status: NotificationStatus.PENDING,
      data,
      createdAt: new Date(),
      expiresAt: options.expiresAt || new Date(Date.now() + this.config.notificationTTL * 1000),
    };
    
    // DB 저장
    await this.saveNotification(notification);
    
    // 큐에 추가
    await this.queueNotification(notification, options.scheduledAt);
    
    // 메트릭 업데이트
    if (this.config.enableMetrics) {
      this.metrics.created++;
    }
    
    // 이벤트 발생
    this.emitEvent({
      type: 'created',
      notification,
      timestamp: new Date(),
    });
    
    return notification;
  }
  
  /**
   * 알림을 큐에 추가
   */
  private async queueNotification(
    notification: Notification,
    scheduledAt?: Date
  ): Promise<void> {
    const queueItem: NotificationQueueItem = {
      notification,
      scheduledAt,
      attempts: 0,
      maxAttempts: this.config.maxRetries,
    };
    
    const queueKey = this.getQueueKey(notification.priority);
    
    if (scheduledAt && scheduledAt > new Date()) {
      // 예약 알림
      const score = scheduledAt.getTime();
      await this.redis.zadd(`${queueKey}:scheduled`, score, JSON.stringify(queueItem));
    } else {
      // 즉시 전송
      await this.redis.lpush(queueKey, JSON.stringify(queueItem));
    }
  }
  
  /**
   * 알림 전송
   */
  async sendNotification(notification: Notification): Promise<void> {
    try {
      // 채널별 전송
      for (const channel of notification.channels) {
        await this.sendToChannel(notification, channel);
      }
      
      // 상태 업데이트
      notification.status = NotificationStatus.SENT;
      notification.sentAt = new Date();
      await this.updateNotification(notification);
      
      // 메트릭 업데이트
      if (this.config.enableMetrics) {
        this.metrics.sent++;
      }
      
      // 이벤트 발생
      this.emitEvent({
        type: 'sent',
        notification,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('알림 전송 실패:', error);
      
      // 재시도 처리
      await this.handleSendFailure(notification, error as Error);
    }
  }
  
  /**
   * 채널별 전송
   */
  private async sendToChannel(
    notification: Notification,
    channel: NotificationChannel
  ): Promise<void> {
    switch (channel) {
      case NotificationChannel.IN_APP:
        await this.sendInAppNotification(notification);
        break;
        
      case NotificationChannel.EMAIL:
        await this.sendEmailNotification(notification);
        break;
        
      case NotificationChannel.SMS:
        await this.sendSMSNotification(notification);
        break;
        
      case NotificationChannel.PUSH:
        await this.sendPushNotification(notification);
        break;
        
      case NotificationChannel.KAKAO:
        await this.sendKakaoNotification(notification);
        break;
        
      case NotificationChannel.WEBHOOK:
        await this.sendWebhookNotification(notification);
        break;
        
      default:
        console.warn(`지원하지 않는 채널: ${channel}`);
    }
  }
  
  /**
   * 인앱 알림 전송
   */
  private async sendInAppNotification(notification: Notification): Promise<void> {
    // Centrifugo를 통해 실시간 전송
    try {
      await centrifugo.publish(CHANNELS.personal(notification.userId), {
        type: 'new-notification',
        id: notification.id,
        notificationType: notification.type,
        priority: notification.priority,
        data: notification.data,
        createdAt: notification.createdAt,
      });
    } catch (error) {
      console.error('Failed to send in-app notification via Centrifugo:', error);
    }

    // 캐시 무효화
    await this.invalidateUserCache(notification.userId);
  }
  
  /**
   * 이메일 알림 전송
   */
  private async sendEmailNotification(notification: Notification): Promise<void> {
    // TODO: 이메일 전송 구현
    console.log(`이메일 알림: ${notification.id}`);
  }
  
  /**
   * SMS 알림 전송
   */
  private async sendSMSNotification(notification: Notification): Promise<void> {
    // TODO: SMS 전송 구현 (Twilio, Solapi 등)
    console.log(`SMS 알림: ${notification.id}`);
  }
  
  /**
   * 푸시 알림 전송
   */
  private async sendPushNotification(notification: Notification): Promise<void> {
    // TODO: FCM/APNS 푸시 전송 구현
    console.log(`푸시 알림: ${notification.id}`);
  }
  
  /**
   * 카카오 알림톡 전송
   */
  private async sendKakaoNotification(notification: Notification): Promise<void> {
    // TODO: 카카오 알림톡 API 연동
    console.log(`카카오 알림톡: ${notification.id}`);
  }
  
  /**
   * 웹훅 알림 전송
   */
  private async sendWebhookNotification(notification: Notification): Promise<void> {
    // TODO: 웹훅 전송 구현
    console.log(`웹훅 알림: ${notification.id}`);
  }
  
  /**
   * 알림 읽음 처리
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    const notification = await this.getNotification(notificationId);

    if (!notification || notification.userId !== userId) {
      throw new Error('알림을 찾을 수 없습니다.');
    }

    notification.status = NotificationStatus.READ;
    notification.readAt = new Date();

    await this.updateNotification(notification);

    // Centrifugo를 통해 읽음 상태 전송
    try {
      await centrifugo.publish(CHANNELS.personal(userId), {
        type: 'notification-read',
        id: notificationId,
        readAt: notification.readAt,
      });
    } catch (error) {
      console.error('Failed to send notification read status via Centrifugo:', error);
    }

    // 메트릭 업데이트
    if (this.config.enableMetrics) {
      this.metrics.read++;
    }

    // 이벤트 발생
    this.emitEvent({
      type: 'read',
      notification,
      timestamp: new Date(),
    });
  }
  
  /**
   * 모든 알림 읽음 처리
   */
  async markAllAsRead(userId: string): Promise<void> {
    const notifications = await this.getUserNotifications(userId, {
      unreadOnly: true,
    });
    
    for (const notification of notifications) {
      await this.markAsRead(notification.id, userId);
    }
  }
  
  /**
   * 사용자 알림 조회
   */
  async getUserNotifications(
    userId: string,
    filter: NotificationFilter = {}
  ): Promise<Notification[]> {
    // 캐시 확인
    if (this.config.enableCache && !filter.unreadOnly) {
      const cached = await this.getCachedNotifications(userId);
      if (cached) return cached;
    }
    
    // DB 조회
    const notifications = await this.queryNotifications({
      ...filter,
      userId,
    });
    
    // 캐시 저장
    if (this.config.enableCache && !filter.unreadOnly) {
      await this.cacheNotifications(userId, notifications);
    }
    
    return notifications;
  }
  
  /**
   * 알림 통계 조회
   */
  async getNotificationStats(userId: string): Promise<NotificationStats> {
    const notifications = await this.getUserNotifications(userId);
    
    const stats: NotificationStats = {
      total: notifications.length,
      unread: 0,
      byType: {} as Record<NotificationType, number>,
      byPriority: {} as Record<NotificationPriority, number>,
      byChannel: {} as Record<NotificationChannel, number>,
      byStatus: {} as Record<NotificationStatus, number>,
    };
    
    // 통계 계산
    for (const notification of notifications) {
      // 읽지 않음
      if (notification.status !== NotificationStatus.READ) {
        stats.unread++;
      }
      
      // 타입별
      stats.byType[notification.type] = (stats.byType[notification.type] || 0) + 1;
      
      // 우선순위별
      stats.byPriority[notification.priority] = 
        (stats.byPriority[notification.priority] || 0) + 1;
      
      // 채널별
      for (const channel of notification.channels) {
        stats.byChannel[channel] = (stats.byChannel[channel] || 0) + 1;
      }
      
      // 상태별
      stats.byStatus[notification.status] = 
        (stats.byStatus[notification.status] || 0) + 1;
    }
    
    return stats;
  }
  
  /**
   * 사용자 알림 설정 조회
   */
  async getUserPreferences(userId: string): Promise<NotificationPreferences> {
    // 캐시 확인
    const cacheKey = `preferences:${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // DB 조회
    const preferences = await db.notificationPreference.findUnique({
      where: { userId },
    });
    
    // 기본값
    const defaultPreferences: NotificationPreferences = {
      userId,
      channels: {
        [NotificationChannel.IN_APP]: true,
        [NotificationChannel.EMAIL]: true,
        [NotificationChannel.PUSH]: true,
      },
      types: {},
      doNotDisturb: false,
    };
    
    const result = preferences ? {
      ...defaultPreferences,
      ...preferences.data as any,
    } : defaultPreferences;
    
    // 캐시 저장
    await this.redis.setex(cacheKey, 3600, JSON.stringify(result));
    
    return result;
  }
  
  /**
   * 사용자 알림 설정 업데이트
   */
  async updateUserPreferences(
    userId: string,
    preferences: Partial<NotificationPreferences>
  ): Promise<void> {
    await db.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        data: preferences as any,
      },
      update: {
        data: preferences as any,
      },
    });
    
    // 캐시 무효화
    const cacheKey = `preferences:${userId}`;
    await this.redis.del(cacheKey);
  }
  
  /**
   * 배치 처리기 시작
   */
  private startBatchProcessor(): void {
    setInterval(async () => {
      if (this.processingBatch) return;
      
      this.processingBatch = true;
      try {
        await this.processBatch();
      } catch (error) {
        console.error('배치 처리 오류:', error);
      } finally {
        this.processingBatch = false;
      }
    }, this.config.batchInterval);
  }
  
  /**
   * 배치 처리
   */
  private async processBatch(): Promise<void> {
    // 우선순위별 큐 처리
    const priorities = [
      NotificationPriority.CRITICAL,
      NotificationPriority.URGENT,
      NotificationPriority.HIGH,
      NotificationPriority.NORMAL,
      NotificationPriority.LOW,
    ];
    
    for (const priority of priorities) {
      await this.processQueue(priority);
    }
    
    // 예약 알림 처리
    await this.processScheduledNotifications();
    
    // 만료 알림 처리
    await this.processExpiredNotifications();
  }
  
  /**
   * 큐 처리
   */
  private async processQueue(priority: NotificationPriority): Promise<void> {
    const queueKey = this.getQueueKey(priority);
    const batch = await this.redis.lrange(queueKey, 0, this.config.batchSize - 1);
    
    if (batch.length === 0) return;
    
    // 큐에서 제거
    await this.redis.ltrim(queueKey, batch.length, -1);
    
    // 처리
    for (const item of batch) {
      try {
        const queueItem: NotificationQueueItem = JSON.parse(item);
        await this.sendNotification(queueItem.notification);
      } catch (error) {
        console.error('알림 처리 오류:', error);
      }
    }
  }
  
  /**
   * 예약 알림 처리
   */
  private async processScheduledNotifications(): Promise<void> {
    const now = Date.now();
    const priorities = Object.values(NotificationPriority);
    
    for (const priority of priorities) {
      const queueKey = `${this.getQueueKey(priority)}:scheduled`;
      const items = await this.redis.zrangebyscore(queueKey, 0, now);
      
      if (items.length === 0) continue;
      
      // 예약 큐에서 제거
      await this.redis.zremrangebyscore(queueKey, 0, now);
      
      // 일반 큐로 이동
      for (const item of items) {
        const normalQueueKey = this.getQueueKey(priority);
        await this.redis.lpush(normalQueueKey, item);
      }
    }
  }
  
  /**
   * 만료 알림 처리
   */
  private async processExpiredNotifications(): Promise<void> {
    const expired = await db.notification.updateMany({
      where: {
        status: NotificationStatus.PENDING,
        expiresAt: {
          lte: new Date(),
        },
      },
      data: {
        status: NotificationStatus.EXPIRED,
      },
    });
    
    if (expired.count > 0) {
      console.log(`${expired.count}개 알림 만료 처리`);
      this.metrics.expired += expired.count;
    }
  }
  
  /**
   * 전송 실패 처리
   */
  private async handleSendFailure(
    notification: Notification,
    error: Error
  ): Promise<void> {
    notification.retryCount = (notification.retryCount || 0) + 1;
    notification.lastRetryAt = new Date();
    notification.error = error.message;
    
    if (notification.retryCount < this.config.maxRetries) {
      // 재시도 큐에 추가
      const delay = this.config.retryDelay * notification.retryCount;
      const scheduledAt = new Date(Date.now() + delay);
      await this.queueNotification(notification, scheduledAt);
    } else {
      // 최종 실패
      notification.status = NotificationStatus.FAILED;
      await this.updateNotification(notification);
      
      this.metrics.failed++;
      
      this.emitEvent({
        type: 'failed',
        notification,
        timestamp: new Date(),
      });
    }
  }
  
  // 헬퍼 메서드
  
  private getQueueKey(priority: NotificationPriority): string {
    return `${this.config.queuePrefix}:${priority}`;
  }
  
  private getDefaultChannels(
    type: NotificationType,
    preferences: NotificationPreferences
  ): NotificationChannel[] {
    // 타입별 기본 채널
    const typePrefs = preferences.types[type];
    if (typePrefs?.channels) {
      return typePrefs.channels;
    }
    
    // 전역 설정
    return Object.entries(preferences.channels)
      .filter(([, enabled]) => enabled)
      .map(([channel]) => channel as NotificationChannel);
  }
  
  private isQuietHours(preferences: NotificationPreferences): boolean {
    if (!preferences.quietHours?.enabled) return false;
    
    const now = new Date();
    const start = this.parseTime(preferences.quietHours.start);
    const end = this.parseTime(preferences.quietHours.end);
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    if (start < end) {
      return currentTime >= start && currentTime < end;
    } else {
      // 자정 넘는 경우
      return currentTime >= start || currentTime < end;
    }
  }
  
  private parseTime(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }
  
  private async saveNotification(notification: Notification): Promise<void> {
    await db.notification.create({
      data: {
        id: notification.id,
        userId: notification.userId,
        type: notification.type,
        priority: notification.priority,
        channels: notification.channels,
        status: notification.status,
        data: notification.data as any,
        createdAt: notification.createdAt,
        expiresAt: notification.expiresAt,
      },
    });
  }
  
  private async updateNotification(notification: Notification): Promise<void> {
    await db.notification.update({
      where: { id: notification.id },
      data: {
        status: notification.status,
        sentAt: notification.sentAt,
        deliveredAt: notification.deliveredAt,
        readAt: notification.readAt,
        retryCount: notification.retryCount,
        lastRetryAt: notification.lastRetryAt,
        error: notification.error,
      },
    });
  }
  
  private async getNotification(id: string): Promise<Notification | null> {
    const notification = await db.notification.findUnique({
      where: { id },
    });
    
    return notification as Notification | null;
  }
  
  private async queryNotifications(
    filter: NotificationFilter
  ): Promise<Notification[]> {
    const where: any = {};
    
    if (filter.userId) where.userId = filter.userId;
    if (filter.types) where.type = { in: filter.types };
    if (filter.priorities) where.priority = { in: filter.priorities };
    if (filter.status) where.status = { in: filter.status };
    if (filter.unreadOnly) where.status = { not: NotificationStatus.READ };
    
    if (filter.startDate || filter.endDate) {
      where.createdAt = {};
      if (filter.startDate) where.createdAt.gte = filter.startDate;
      if (filter.endDate) where.createdAt.lte = filter.endDate;
    }
    
    const notifications = await db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100, // 최대 100개
    });
    
    return notifications as Notification[];
  }
  
  private async getCachedNotifications(
    userId: string
  ): Promise<Notification[] | null> {
    const cacheKey = `notifications:${userId}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    return null;
  }
  
  private async cacheNotifications(
    userId: string,
    notifications: Notification[]
  ): Promise<void> {
    const cacheKey = `notifications:${userId}`;
    await this.redis.setex(
      cacheKey,
      this.config.cacheTTL,
      JSON.stringify(notifications)
    );
  }
  
  private async invalidateUserCache(userId: string): Promise<void> {
    const cacheKey = `notifications:${userId}`;
    await this.redis.del(cacheKey);
  }
  
  private emitEvent(event: NotificationEvent): void {
    // Centrifugo를 통해 이벤트 브로드캐스트
    centrifugo.publish(CHANNELS.adminNotifications(), {
      type: 'notification-event',
      event,
    }).catch(error => {
      console.error('Failed to emit notification event via Centrifugo:', error);
    });
  }
  
  /**
   * 메트릭 조회
   */
  getMetrics() {
    return { ...this.metrics };
  }
  
  /**
   * 매니저 종료
   */
  async shutdown(): Promise<void> {
    console.log('🛑 알림 매니저 종료 중...');
    this.processingBatch = true; // 배치 처리 중지
  }
}

// 전역 인스턴스
let globalNotificationManager: NotificationManager | null = null;

/**
 * 알림 매니저 가져오기
 */
export function getNotificationManager(): NotificationManager {
  if (!globalNotificationManager) {
    globalNotificationManager = new NotificationManager();
  }
  return globalNotificationManager;
}