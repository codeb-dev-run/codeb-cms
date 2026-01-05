/**
 * Centrifugo 채널 명명 규칙
 * 채널 이름 규칙:
 * - 공개 채널: channel_name
 * - 비공개 채널: $channel_name (구독 시 토큰 필요)
 */

export const CHANNELS = {
  // ========================================
  // 개인 채널 (Private - $ prefix)
  // ========================================

  /** 사용자 개인 알림 채널 */
  personal: (userId: string) => `$user:${userId}`,

  /** 사용자 포인트 업데이트 */
  userPoints: (userId: string) => `$user:${userId}:points`,

  // ========================================
  // 이벤트/투표 채널 (Public)
  // ========================================

  /** 이벤트 메인 채널 (참여자 정보, 결과 등) */
  event: (eventId: string) => `event:${eventId}`,

  /** 이벤트 실시간 통계 */
  eventStats: (eventId: string) => `event:stats:${eventId}`,

  /** 이벤트 참여자 피드 */
  eventFeed: (eventId: string) => `event:feed:${eventId}`,

  /** 모든 활성 이벤트 목록 */
  eventsActive: () => `events:active`,

  // ========================================
  // 채팅 채널
  // ========================================

  /** 공개 채팅방 */
  chatPublic: (roomId: string) => `chat:public:${roomId}`,

  /** 비공개 채팅방 (Private) */
  chatPrivate: (roomId: string) => `$chat:private:${roomId}`,

  /** 게시글 댓글 실시간 */
  postComments: (postId: string) => `post:comments:${postId}`,

  // ========================================
  // 관리자 채널 (Private)
  // ========================================

  /** 관리자 실시간 메트릭 */
  adminMetrics: () => `$admin:metrics`,

  /** 관리자 알림 */
  adminNotifications: () => `$admin:notifications`,

  /** 관리자 이벤트 모니터링 */
  adminEvents: () => `$admin:events`,

  // ========================================
  // 글로벌 채널 (Public)
  // ========================================

  /** 전체 리더보드 */
  leaderboard: () => `leaderboard:global`,

  /** 일별 리더보드 */
  leaderboardDaily: () => `leaderboard:daily`,

  /** 주별 리더보드 */
  leaderboardWeekly: () => `leaderboard:weekly`,

  /** 전체 공지사항 */
  announcements: () => `announcements:global`,

  /** 온라인 사용자 수 */
  onlineUsers: () => `presence:online`,
} as const;

// 채널 타입
export type ChannelName = ReturnType<typeof CHANNELS[keyof typeof CHANNELS]>;

// 채널이 비공개인지 확인
export function isPrivateChannel(channel: string): boolean {
  return channel.startsWith('$');
}

// 채널 파싱 유틸리티
export function parseChannel(channel: string): {
  isPrivate: boolean;
  type: string;
  id?: string;
} {
  const isPrivate = channel.startsWith('$');
  const cleanChannel = isPrivate ? channel.slice(1) : channel;
  const parts = cleanChannel.split(':');

  return {
    isPrivate,
    type: parts[0],
    id: parts.length > 1 ? parts.slice(1).join(':') : undefined,
  };
}

// 사용자가 채널에 접근할 수 있는지 확인
export function canAccessChannel(
  channel: string,
  userId?: string,
  userRole?: string
): boolean {
  const parsed = parseChannel(channel);

  // 공개 채널은 누구나 접근 가능
  if (!parsed.isPrivate) {
    return true;
  }

  // 비공개 채널은 인증 필요
  if (!userId) {
    return false;
  }

  // 개인 채널 확인
  if (parsed.type === 'user' && parsed.id !== userId) {
    return false;
  }

  // 관리자 채널 확인
  if (parsed.type === 'admin' && userRole !== 'ADMIN') {
    return false;
  }

  return true;
}
