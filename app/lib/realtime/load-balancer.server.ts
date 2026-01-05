/**
 * 실시간 기능 부하 분산 모듈
 *
 * QPS 10,000+ 지원:
 * 1. Centrifugo 클러스터 관리
 * 2. 메시지 배치 발행
 * 3. Presence 캐싱
 * 4. 채널 샤딩
 */

import { centrifugo, publishToChannel, broadcastToChannels } from '~/lib/centrifugo/client.server';
import { getRedisCluster } from '~/lib/redis/cluster.server';
import { getCacheManager } from '~/lib/cache/cache-manager';

const redis = getRedisCluster();
const cache = getCacheManager('realtime');

// ============================================
// 1. 메시지 배치 발행
// ============================================

interface QueuedMessage {
  channel: string;
  data: any;
  timestamp: number;
}

const messageQueue: QueuedMessage[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

const BATCH_CONFIG = {
  maxSize: 100,           // 최대 배치 크기
  maxWaitMs: 50,          // 최대 대기 시간 (ms)
  flushIntervalMs: 100,   // 강제 플러시 간격
};

/**
 * 메시지 큐에 추가 (배치 발행)
 */
export async function queueMessage(
  channel: string,
  data: any
): Promise<void> {
  messageQueue.push({
    channel,
    data,
    timestamp: Date.now(),
  });

  // 배치 크기 도달 시 즉시 플러시
  if (messageQueue.length >= BATCH_CONFIG.maxSize) {
    await flushMessageQueue();
    return;
  }

  // 타이머 설정
  if (!batchTimer) {
    batchTimer = setTimeout(async () => {
      await flushMessageQueue();
    }, BATCH_CONFIG.maxWaitMs);
  }
}

/**
 * 메시지 큐 플러시
 */
async function flushMessageQueue(): Promise<void> {
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  if (messageQueue.length === 0) return;

  // 큐 비우기
  const messages = messageQueue.splice(0);

  // 채널별로 그룹화
  const channelGroups = new Map<string, any[]>();
  for (const msg of messages) {
    const existing = channelGroups.get(msg.channel) || [];
    existing.push(msg.data);
    channelGroups.set(msg.channel, existing);
  }

  // 병렬로 발행
  const publishPromises: Promise<void>[] = [];

  for (const [channel, dataArray] of channelGroups) {
    // 단일 메시지는 그대로 발행
    if (dataArray.length === 1) {
      publishPromises.push(publishToChannel(channel, dataArray[0]));
    } else {
      // 여러 메시지는 배치로 발행
      publishPromises.push(
        publishToChannel(channel, {
          type: 'batch',
          messages: dataArray,
          count: dataArray.length,
        })
      );
    }
  }

  try {
    await Promise.all(publishPromises);
    console.log(`[Realtime] Flushed ${messages.length} messages to ${channelGroups.size} channels`);
  } catch (error) {
    console.error('[Realtime] Batch publish failed:', error);
    // 실패한 메시지 재큐잉 (선택적)
  }
}

// 주기적 플러시
setInterval(flushMessageQueue, BATCH_CONFIG.flushIntervalMs);

// ============================================
// 2. Presence 캐싱
// ============================================

const PRESENCE_CACHE_TTL = 30; // 30초

/**
 * 채널 Presence 조회 (캐시)
 */
export async function getChannelPresenceCached(
  channel: string
): Promise<{ users: number; clients: number }> {
  const cacheKey = `presence:${channel}`;

  return cache.get(cacheKey, async () => {
    try {
      const stats = await centrifugo.presenceStats(channel);
      return {
        users: stats.num_users,
        clients: stats.num_clients,
      };
    } catch {
      return { users: 0, clients: 0 };
    }
  }, { ttl: PRESENCE_CACHE_TTL });
}

/**
 * 전체 온라인 사용자 수 조회
 */
export async function getTotalOnlineUsers(): Promise<number> {
  const cacheKey = 'presence:total';

  return cache.get(cacheKey, async () => {
    try {
      const info = await centrifugo.info();
      return info.nodes.reduce((sum, node) => sum + node.num_users, 0);
    } catch {
      return 0;
    }
  }, { ttl: PRESENCE_CACHE_TTL });
}

// ============================================
// 3. 채널 샤딩
// ============================================

const SHARD_COUNT = 16; // 샤드 수

/**
 * 사용자 ID를 샤드 번호로 변환
 */
function getUserShard(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash) % SHARD_COUNT;
}

/**
 * 샤딩된 채널 이름 생성
 */
export function getShardedChannel(
  baseChannel: string,
  userId: string
): string {
  const shard = getUserShard(userId);
  return `${baseChannel}:shard${shard}`;
}

/**
 * 모든 샤드에 브로드캐스트
 */
export async function broadcastToAllShards(
  baseChannel: string,
  data: any
): Promise<void> {
  const channels = Array.from(
    { length: SHARD_COUNT },
    (_, i) => `${baseChannel}:shard${i}`
  );

  await broadcastToChannels(channels, data);
}

// ============================================
// 4. 연결 관리
// ============================================

/**
 * 사용자 강제 연결 해제
 */
export async function disconnectUser(userId: string): Promise<void> {
  try {
    await centrifugo.disconnect(userId);
    console.log(`[Realtime] Disconnected user: ${userId}`);
  } catch (error) {
    console.error(`[Realtime] Failed to disconnect user ${userId}:`, error);
  }
}

/**
 * 채널에서 사용자 구독 해제
 */
export async function unsubscribeUserFromChannel(
  userId: string,
  channel: string
): Promise<void> {
  try {
    await centrifugo.unsubscribe(userId, channel);
  } catch (error) {
    console.error(`[Realtime] Failed to unsubscribe ${userId} from ${channel}:`, error);
  }
}

// ============================================
// 5. 이벤트 스트리밍
// ============================================

/**
 * 이벤트 참여 스트림 발행
 */
export async function publishParticipation(
  eventId: string,
  participation: {
    id: string;
    userId: string;
    username: string;
    choice: string;
    points: number;
  }
): Promise<void> {
  await queueMessage(`event:feed:${eventId}`, {
    type: 'NEW_PARTICIPATION',
    data: participation,
    timestamp: Date.now(),
  });
}

/**
 * 이벤트 통계 업데이트
 */
export async function publishEventStats(
  eventId: string,
  stats: {
    totalParticipants: number;
    options: Array<{ id: string; count: number; percentage: number }>;
  }
): Promise<void> {
  await queueMessage(`event:stats:${eventId}`, {
    type: 'STATS_UPDATE',
    data: stats,
    timestamp: Date.now(),
  });
}

/**
 * 리더보드 업데이트
 */
export async function publishLeaderboardUpdate(
  period: string,
  topEntries: Array<{
    rank: number;
    userId: string;
    username: string;
    points: number;
  }>
): Promise<void> {
  await queueMessage(`leaderboard:${period}`, {
    type: 'LEADERBOARD_UPDATE',
    data: topEntries.slice(0, 10), // Top 10만 브로드캐스트
    timestamp: Date.now(),
  });
}

// ============================================
// 6. 알림 발송
// ============================================

/**
 * 개인 알림 발송
 */
export async function sendUserNotification(
  userId: string,
  notification: {
    type: string;
    title: string;
    body: string;
    data?: Record<string, any>;
  }
): Promise<void> {
  await publishToChannel(`$user:${userId}`, {
    type: 'NOTIFICATION',
    data: notification,
    timestamp: Date.now(),
  });
}

/**
 * 여러 사용자에게 알림 발송
 */
export async function sendBulkNotifications(
  userIds: string[],
  notification: {
    type: string;
    title: string;
    body: string;
    data?: Record<string, any>;
  }
): Promise<void> {
  const channels = userIds.map((id) => `$user:${id}`);
  const data = {
    type: 'NOTIFICATION',
    data: notification,
    timestamp: Date.now(),
  };

  // 배치로 처리
  const batchSize = 50;
  for (let i = 0; i < channels.length; i += batchSize) {
    const batch = channels.slice(i, i + batchSize);
    await broadcastToChannels(batch, data);
  }
}

// ============================================
// 7. 모니터링
// ============================================

interface RealtimeMetrics {
  connectedUsers: number;
  channelCount: number;
  messageRate: number;
  queueSize: number;
  nodeStats: Array<{
    name: string;
    clients: number;
    channels: number;
  }>;
}

let messageCount = 0;
let lastMetricTime = Date.now();

/**
 * 메시지 카운트 증가
 */
export function recordMessage(): void {
  messageCount++;
}

/**
 * 실시간 메트릭 조회
 */
export async function getRealtimeMetrics(): Promise<RealtimeMetrics> {
  try {
    const info = await centrifugo.info();
    const now = Date.now();
    const elapsed = (now - lastMetricTime) / 1000; // 초
    const rate = messageCount / elapsed;

    // 리셋
    messageCount = 0;
    lastMetricTime = now;

    return {
      connectedUsers: info.nodes.reduce((sum, n) => sum + n.num_users, 0),
      channelCount: info.nodes.reduce((sum, n) => sum + n.num_channels, 0),
      messageRate: Math.round(rate * 100) / 100,
      queueSize: messageQueue.length,
      nodeStats: info.nodes.map((n) => ({
        name: n.name,
        clients: n.num_clients,
        channels: n.num_channels,
      })),
    };
  } catch {
    return {
      connectedUsers: 0,
      channelCount: 0,
      messageRate: 0,
      queueSize: messageQueue.length,
      nodeStats: [],
    };
  }
}
