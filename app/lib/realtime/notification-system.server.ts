/**
 * 실시간 알림 시스템 (Centrifugo 버전)
 * Socket.IO에서 Centrifugo로 완전 마이그레이션됨
 */

import { db } from '~/lib/db.server';
import { centrifugo } from '~/lib/centrifugo/client.server';
import { CHANNELS } from '~/lib/centrifugo/channels';

export interface NotificationData {
  type: 'post' | 'comment' | 'like' | 'mention' | 'system' | 'admin';
  title: string;
  message: string;
  userId: string;
  data?: Record<string, unknown>;
  priority: 'low' | 'medium' | 'high';
  channels: ('web' | 'sms' | 'email')[];
}

export interface BroadcastData {
  type: 'new-post' | 'new-comment' | 'system-announcement' | 'maintenance';
  title: string;
  message: string;
  data?: Record<string, unknown>;
  targetRooms?: string[];
  excludeUsers?: string[];
}

class RealtimeNotificationSystem {
  /**
   * 개별 사용자에게 알림 전송
   */
  async sendNotification(notification: NotificationData): Promise<boolean> {
    try {
      // 데이터베이스에 알림 저장
      const savedNotification = await db.notification.create({
        data: {
          type: notification.type,
          priority: notification.priority,
          channels: notification.channels.join(','),
          status: 'sent',
          data: JSON.stringify({
            title: notification.title,
            message: notification.message,
            ...notification.data,
          }),
          userId: notification.userId,
        },
      });

      // Centrifugo를 통해 실시간 알림 전송 (비공개 채널)
      if (notification.channels.includes('web')) {
        await centrifugo.publish(CHANNELS.personal(notification.userId), {
          id: savedNotification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          priority: notification.priority,
          timestamp: savedNotification.createdAt.toISOString(),
        });
      }

      // SMS 알림 전송 (높은 우선순위만) - 필요 시 구현
      if (notification.channels.includes('sms') && notification.priority === 'high') {
        // SMS 발송 로직은 별도 구현
        console.log(`SMS notification to user ${notification.userId}: ${notification.message}`);
      }

      // 이메일 알림 (향후 구현)
      if (notification.channels.includes('email')) {
        console.log(`Email notification to user ${notification.userId}: ${notification.message}`);
      }

      return true;
    } catch (error) {
      console.error('Failed to send notification:', error);
      return false;
    }
  }

  /**
   * 여러 사용자에게 알림 브로드캐스트
   */
  async broadcastNotification(broadcast: BroadcastData): Promise<boolean> {
    try {
      const broadcastData = {
        type: broadcast.type,
        title: broadcast.title,
        message: broadcast.message,
        data: broadcast.data,
        timestamp: new Date().toISOString(),
      };

      // 특정 채널(룸)에만 브로드캐스트
      if (broadcast.targetRooms && broadcast.targetRooms.length > 0) {
        await centrifugo.broadcast(
          broadcast.targetRooms.map(room => CHANNELS.postComments(room)),
          broadcastData
        );
      } else {
        // 전체 공지사항 채널로 브로드캐스트
        await centrifugo.publish(CHANNELS.announcements(), broadcastData);
      }

      return true;
    } catch (error) {
      console.error('Failed to broadcast notification:', error);
      return false;
    }
  }

  /**
   * 새 게시물 알림
   */
  async notifyNewPost(postId: string, authorId: string): Promise<void> {
    try {
      const post = await db.post.findUnique({
        where: { id: postId },
        include: {
          author: { select: { name: true, email: true } },
          menu: { select: { name: true, slug: true } },
        },
      });

      if (!post || !post.isPublished) return;

      // 전체 공지사항 채널로 브로드캐스트
      await this.broadcastNotification({
        type: 'new-post',
        title: '새 게시물',
        message: `${post.author.name || post.author.email}님이 "${post.title}" 게시물을 올렸습니다.`,
        data: {
          postId: post.id,
          categorySlug: post.menu?.slug,
          authorName: post.author.name || post.author.email,
        },
        targetRooms: post.menu?.slug ? [post.menu.slug] : undefined,
      });
    } catch (error) {
      console.error('Failed to notify new post:', error);
    }
  }

  /**
   * 새 댓글 알림
   */
  async notifyNewComment(commentId: string): Promise<void> {
    try {
      const comment = await db.comment.findUnique({
        where: { id: commentId },
        include: {
          author: { select: { name: true, email: true } },
          post: {
            include: {
              author: { select: { id: true, name: true, email: true } },
              menu: { select: { slug: true } },
            },
          },
        },
      });

      if (!comment) return;

      // 게시물 작성자에게 알림 (자신의 댓글이 아닌 경우)
      if (comment.post.authorId !== comment.authorId) {
        await this.sendNotification({
          type: 'comment',
          title: '새 댓글',
          message: `"${comment.post.title}" 게시물에 새 댓글이 달렸습니다.`,
          userId: comment.post.authorId,
          priority: 'medium',
          channels: ['web'],
          data: {
            commentId: comment.id,
            postId: comment.postId,
            categorySlug: comment.post.menu?.slug,
          },
        });
      }

      // 같은 게시물 채널 구독자들에게 실시간 브로드캐스트
      await centrifugo.publish(CHANNELS.postComments(comment.postId), {
        type: 'comment:new',
        id: comment.id,
        content: comment.content,
        author: comment.author.name || comment.author.email,
        timestamp: comment.createdAt.toISOString(),
      });
    } catch (error) {
      console.error('Failed to notify new comment:', error);
    }
  }

  /**
   * 멘션 알림
   */
  async notifyMention(mentionedUserId: string, postId: string, mentionerName: string): Promise<void> {
    try {
      const post = await db.post.findUnique({
        where: { id: postId },
        select: { title: true, slug: true, menu: { select: { slug: true } } },
      });

      if (!post) return;

      await this.sendNotification({
        type: 'mention',
        title: '멘션 알림',
        message: `${mentionerName}님이 당신을 언급했습니다.`,
        userId: mentionedUserId,
        priority: 'high',
        channels: ['web'],
        data: {
          postId,
          categorySlug: post.menu?.slug,
          mentionerName,
        },
      });
    } catch (error) {
      console.error('Failed to notify mention:', error);
    }
  }

  /**
   * 관리자 공지사항
   */
  async sendAdminAnnouncement(
    title: string,
    message: string,
    priority: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<void> {
    try {
      // 전체 사용자에게 실시간 브로드캐스트
      await centrifugo.publish(CHANNELS.announcements(), {
        type: 'admin:announcement',
        title,
        message,
        priority,
        timestamp: new Date().toISOString(),
      });

      // 관리자 알림 채널에도 발행
      await centrifugo.publish(CHANNELS.adminNotifications(), {
        type: 'announcement:sent',
        title,
        message,
        priority,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to send admin announcement:', error);
    }
  }

  /**
   * 사용자 알림 목록 조회
   */
  async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    notifications: Array<{
      id: string;
      type: string;
      data: string;
      createdAt: string;
      readAt: string | null;
    }>;
    pagination: {
      page: number;
      limit: number;
      totalCount: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    } | null;
  }> {
    try {
      const skip = (page - 1) * limit;

      const [notifications, totalCount] = await Promise.all([
        db.notification.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        db.notification.count({ where: { userId } }),
      ]);

      return {
        notifications: notifications.map(notification => ({
          id: notification.id,
          type: notification.type,
          data: notification.data,
          createdAt: notification.createdAt.toISOString(),
          readAt: notification.readAt?.toISOString() || null,
        })),
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasNext: page * limit < totalCount,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      console.error('Failed to get user notifications:', error);
      return { notifications: [], pagination: null };
    }
  }

  /**
   * 알림 읽음 처리
   */
  async markNotificationAsRead(notificationId: string, userId: string): Promise<boolean> {
    try {
      await db.notification.updateMany({
        where: {
          id: notificationId,
          userId, // 권한 확인
        },
        data: { readAt: new Date() },
      });

      return true;
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      return false;
    }
  }

  /**
   * 모든 알림 읽음 처리
   */
  async markAllNotificationsAsRead(userId: string): Promise<boolean> {
    try {
      await db.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      });

      return true;
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
      return false;
    }
  }

  /**
   * 읽지 않은 알림 수 조회
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const count = await db.notification.count({
        where: { userId, readAt: null },
      });

      return count;
    } catch (error) {
      console.error('Failed to get unread count:', error);
      return 0;
    }
  }

  /**
   * 이벤트 실시간 통계 발행
   */
  async publishEventStats(eventId: string, stats: {
    totalParticipants: number;
    options: Array<{ id: string; count: number; percentage: number }>;
    recentParticipants: Array<{
      userId: string;
      username: string;
      choice: string;
      timestamp: number;
    }>;
  }): Promise<void> {
    try {
      await centrifugo.publish(CHANNELS.eventStats(eventId), {
        type: 'stats:update',
        ...stats,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Failed to publish event stats:', error);
    }
  }

  /**
   * 리더보드 업데이트 발행
   */
  async publishLeaderboardUpdate(period: 'daily' | 'weekly' | 'all_time', entries: Array<{
    rank: number;
    userId: string;
    username: string;
    points: number;
    wins: number;
    winRate: number;
  }>): Promise<void> {
    try {
      const channel = period === 'daily'
        ? CHANNELS.leaderboardDaily()
        : period === 'weekly'
        ? CHANNELS.leaderboardWeekly()
        : CHANNELS.leaderboard();

      await centrifugo.publish(channel, {
        type: 'leaderboard:update',
        entries,
        updatedAt: Date.now(),
      });
    } catch (error) {
      console.error('Failed to publish leaderboard update:', error);
    }
  }

  /**
   * 관리자 메트릭 발행
   */
  async publishAdminMetrics(metrics: {
    activeUsers: number;
    participationsPerMin: number;
    pointsToday: number;
    activeEvents: number;
    serverLoad: number;
  }): Promise<void> {
    try {
      await centrifugo.publish(CHANNELS.adminMetrics(), {
        type: 'metrics:update',
        ...metrics,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Failed to publish admin metrics:', error);
    }
  }
}

// 싱글톤 인스턴스
export const notificationSystem = new RealtimeNotificationSystem();

// 편의 함수들
export const sendNotification = (notification: NotificationData) =>
  notificationSystem.sendNotification(notification);

export const broadcastNotification = (broadcast: BroadcastData) =>
  notificationSystem.broadcastNotification(broadcast);

export const notifyNewPost = (postId: string, authorId: string) =>
  notificationSystem.notifyNewPost(postId, authorId);

export const notifyNewComment = (commentId: string) =>
  notificationSystem.notifyNewComment(commentId);

export const notifyMention = (mentionedUserId: string, postId: string, mentionerName: string) =>
  notificationSystem.notifyMention(mentionedUserId, postId, mentionerName);

export const sendAdminAnnouncement = (title: string, message: string, priority?: 'low' | 'medium' | 'high') =>
  notificationSystem.sendAdminAnnouncement(title, message, priority);

export const getUserNotifications = (userId: string, page?: number, limit?: number) =>
  notificationSystem.getUserNotifications(userId, page, limit);

export const markNotificationAsRead = (notificationId: string, userId: string) =>
  notificationSystem.markNotificationAsRead(notificationId, userId);

export const markAllNotificationsAsRead = (userId: string) =>
  notificationSystem.markAllNotificationsAsRead(userId);

export const getUnreadCount = (userId: string) =>
  notificationSystem.getUnreadCount(userId);

export const publishEventStats = (eventId: string, stats: Parameters<typeof notificationSystem.publishEventStats>[1]) =>
  notificationSystem.publishEventStats(eventId, stats);

export const publishLeaderboardUpdate = (period: 'daily' | 'weekly' | 'all_time', entries: Parameters<typeof notificationSystem.publishLeaderboardUpdate>[1]) =>
  notificationSystem.publishLeaderboardUpdate(period, entries);

export const publishAdminMetrics = (metrics: Parameters<typeof notificationSystem.publishAdminMetrics>[0]) =>
  notificationSystem.publishAdminMetrics(metrics);
