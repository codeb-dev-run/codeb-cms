/**
 * 실시간 채팅 서버 (Centrifugo 버전)
 * Socket.IO에서 Centrifugo로 완전 마이그레이션됨
 */

import { db } from '~/lib/db.server';
import { getRedisClient } from '~/lib/redis.server';
import { centrifugo } from '~/lib/centrifugo/client.server';
import { CHANNELS } from '~/lib/centrifugo/channels';
import { z } from 'zod';

// 메시지 스키마
const MessageSchema = z.object({
  roomId: z.string(),
  content: z.string().min(1).max(1000),
  type: z.enum(['text', 'image', 'file', 'emoji', 'system']).default('text'),
  metadata: z.record(z.any()).optional(),
});

const TypingSchema = z.object({
  roomId: z.string(),
  isTyping: z.boolean(),
});

const ReactionSchema = z.object({
  messageId: z.string(),
  emoji: z.string(),
});

export interface ChatUser {
  id: string;
  username: string;
  avatar?: string;
  status: 'online' | 'away' | 'offline';
  lastSeen: Date;
}

export interface ChatRoom {
  id: string;
  name: string;
  type: 'direct' | 'group' | 'channel';
  participants: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessage?: ChatMessage;
  unreadCount?: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'emoji' | 'system';
  metadata?: Record<string, unknown>;
  reactions?: Record<string, string[]>;
  editedAt?: Date;
  deletedAt?: Date;
  createdAt: Date;
}

/**
 * Centrifugo 기반 채팅 매니저
 */
export class ChatManager {
  private redis = getRedisClient();

  /**
   * 메시지 전송 및 브로드캐스트
   */
  async sendMessage(userId: string, data: z.infer<typeof MessageSchema>): Promise<ChatMessage> {
    const validated = MessageSchema.parse(data);

    // 사용자 정보 조회
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, profileImage: true },
    });

    if (!user) {
      throw new Error('사용자를 찾을 수 없습니다.');
    }

    // 메시지 생성 (Note: ChatMessage 모델이 없으면 메모리/Redis에만 저장)
    const message: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      roomId: validated.roomId,
      userId,
      content: validated.content,
      type: validated.type,
      metadata: validated.metadata,
      createdAt: new Date(),
    };

    // Redis에 메시지 캐시
    await this.redis.zadd(
      `chat:room:${validated.roomId}:messages`,
      Date.now(),
      JSON.stringify(message)
    );

    // Redis에서 오래된 메시지 정리 (최근 1000개만 유지)
    await this.redis.zremrangebyrank(
      `chat:room:${validated.roomId}:messages`,
      0,
      -1001
    );

    // 채팅방 타입에 따라 적절한 채널로 발행
    const channelName = validated.roomId.startsWith('private_')
      ? CHANNELS.chatPrivate(validated.roomId)
      : CHANNELS.chatPublic(validated.roomId);

    await centrifugo.publish(channelName, {
      type: 'message:new',
      message: {
        ...message,
        user: {
          id: user.id,
          username: user.username,
          avatar: user.profileImage,
        },
      },
    });

    return message;
  }

  /**
   * 메시지 수정
   */
  async editMessage(messageId: string, userId: string, content: string, roomId: string): Promise<ChatMessage | null> {
    // Redis에서 메시지 조회 및 수정
    const messages = await this.redis.zrange(`chat:room:${roomId}:messages`, 0, -1);

    for (const msgStr of messages) {
      const msg = JSON.parse(msgStr) as ChatMessage;
      if (msg.id === messageId && msg.userId === userId) {
        const updatedMessage: ChatMessage = {
          ...msg,
          content,
          editedAt: new Date(),
        };

        // Redis 업데이트
        await this.redis.zrem(`chat:room:${roomId}:messages`, msgStr);
        await this.redis.zadd(
          `chat:room:${roomId}:messages`,
          new Date(msg.createdAt).getTime(),
          JSON.stringify(updatedMessage)
        );

        // Centrifugo로 브로드캐스트
        const channelName = roomId.startsWith('private_')
          ? CHANNELS.chatPrivate(roomId)
          : CHANNELS.chatPublic(roomId);

        await centrifugo.publish(channelName, {
          type: 'message:edited',
          message: updatedMessage,
        });

        return updatedMessage;
      }
    }

    return null;
  }

  /**
   * 메시지 삭제
   */
  async deleteMessage(messageId: string, userId: string, roomId: string): Promise<boolean> {
    const messages = await this.redis.zrange(`chat:room:${roomId}:messages`, 0, -1);

    for (const msgStr of messages) {
      const msg = JSON.parse(msgStr) as ChatMessage;
      if (msg.id === messageId && msg.userId === userId) {
        // Redis에서 삭제
        await this.redis.zrem(`chat:room:${roomId}:messages`, msgStr);

        // Centrifugo로 브로드캐스트
        const channelName = roomId.startsWith('private_')
          ? CHANNELS.chatPrivate(roomId)
          : CHANNELS.chatPublic(roomId);

        await centrifugo.publish(channelName, {
          type: 'message:deleted',
          messageId,
          roomId,
        });

        return true;
      }
    }

    return false;
  }

  /**
   * 타이핑 상태 브로드캐스트
   */
  async broadcastTyping(userId: string, roomId: string, isTyping: boolean): Promise<void> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    const channelName = roomId.startsWith('private_')
      ? CHANNELS.chatPrivate(roomId)
      : CHANNELS.chatPublic(roomId);

    await centrifugo.publish(channelName, {
      type: isTyping ? 'typing:start' : 'typing:stop',
      userId,
      username: user?.username || 'Unknown',
      roomId,
    });
  }

  /**
   * 반응 추가
   */
  async addReaction(messageId: string, userId: string, emoji: string, roomId: string): Promise<boolean> {
    const messages = await this.redis.zrange(`chat:room:${roomId}:messages`, 0, -1);

    for (const msgStr of messages) {
      const msg = JSON.parse(msgStr) as ChatMessage;
      if (msg.id === messageId) {
        const reactions = msg.reactions || {};
        if (!reactions[emoji]) {
          reactions[emoji] = [];
        }
        if (!reactions[emoji].includes(userId)) {
          reactions[emoji].push(userId);
        }

        const updatedMessage = { ...msg, reactions };

        await this.redis.zrem(`chat:room:${roomId}:messages`, msgStr);
        await this.redis.zadd(
          `chat:room:${roomId}:messages`,
          new Date(msg.createdAt).getTime(),
          JSON.stringify(updatedMessage)
        );

        const channelName = roomId.startsWith('private_')
          ? CHANNELS.chatPrivate(roomId)
          : CHANNELS.chatPublic(roomId);

        await centrifugo.publish(channelName, {
          type: 'reaction:added',
          messageId,
          userId,
          emoji,
        });

        return true;
      }
    }

    return false;
  }

  /**
   * 반응 제거
   */
  async removeReaction(messageId: string, userId: string, emoji: string, roomId: string): Promise<boolean> {
    const messages = await this.redis.zrange(`chat:room:${roomId}:messages`, 0, -1);

    for (const msgStr of messages) {
      const msg = JSON.parse(msgStr) as ChatMessage;
      if (msg.id === messageId) {
        const reactions = msg.reactions || {};
        if (reactions[emoji]) {
          reactions[emoji] = reactions[emoji].filter(id => id !== userId);
          if (reactions[emoji].length === 0) {
            delete reactions[emoji];
          }
        }

        const updatedMessage = { ...msg, reactions };

        await this.redis.zrem(`chat:room:${roomId}:messages`, msgStr);
        await this.redis.zadd(
          `chat:room:${roomId}:messages`,
          new Date(msg.createdAt).getTime(),
          JSON.stringify(updatedMessage)
        );

        const channelName = roomId.startsWith('private_')
          ? CHANNELS.chatPrivate(roomId)
          : CHANNELS.chatPublic(roomId);

        await centrifugo.publish(channelName, {
          type: 'reaction:removed',
          messageId,
          userId,
          emoji,
        });

        return true;
      }
    }

    return false;
  }

  /**
   * 채팅방 생성
   */
  async createRoom(
    createdBy: string,
    name: string,
    type: 'direct' | 'group' | 'channel',
    participants: string[]
  ): Promise<ChatRoom> {
    // 창작자 포함
    if (!participants.includes(createdBy)) {
      participants.push(createdBy);
    }

    const room: ChatRoom = {
      id: type === 'direct' && participants.length === 2
        ? `direct_${[...participants].sort().join('_')}`
        : `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      type,
      participants,
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Redis에 채팅방 저장
    await this.redis.hset(`chat:rooms`, room.id, JSON.stringify(room));

    // 참여자들에게 알림
    for (const participantId of participants) {
      await centrifugo.publish(CHANNELS.personal(participantId), {
        type: 'room:created',
        room,
      });
    }

    return room;
  }

  /**
   * 채팅방 나가기
   */
  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const roomStr = await this.redis.hget('chat:rooms', roomId);
    if (!roomStr) {
      throw new Error('채팅방을 찾을 수 없습니다.');
    }

    const room = JSON.parse(roomStr) as ChatRoom;
    room.participants = room.participants.filter(id => id !== userId);
    room.updatedAt = new Date();

    await this.redis.hset('chat:rooms', roomId, JSON.stringify(room));

    // 시스템 메시지 전송
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    const channelName = roomId.startsWith('private_')
      ? CHANNELS.chatPrivate(roomId)
      : CHANNELS.chatPublic(roomId);

    await centrifugo.publish(channelName, {
      type: 'message:new',
      message: {
        id: `sys_${Date.now()}`,
        roomId,
        userId: 'system',
        content: `${user?.username || 'Unknown'}님이 채팅방을 나갔습니다.`,
        type: 'system',
        createdAt: new Date(),
      },
    });

    // 나간 사용자에게 알림
    await centrifugo.publish(CHANNELS.personal(userId), {
      type: 'room:left',
      roomId,
    });
  }

  /**
   * 사용자의 채팅방 목록 조회
   */
  async getUserRooms(userId: string): Promise<ChatRoom[]> {
    const allRooms = await this.redis.hgetall('chat:rooms');
    const rooms: ChatRoom[] = [];

    for (const [, roomStr] of Object.entries(allRooms)) {
      const room = JSON.parse(roomStr) as ChatRoom;
      if (room.participants.includes(userId)) {
        rooms.push(room);
      }
    }

    return rooms.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  /**
   * 메시지 히스토리 조회
   */
  async getMessageHistory(roomId: string, limit: number = 50, before?: number): Promise<ChatMessage[]> {
    const maxScore = before || Date.now();
    const messages = await this.redis.zrevrangebyscore(
      `chat:room:${roomId}:messages`,
      maxScore,
      '-inf',
      'LIMIT',
      0,
      limit
    );

    return messages.map(str => JSON.parse(str) as ChatMessage).reverse();
  }

  /**
   * 메시지 검색
   */
  async searchMessages(roomId: string, query: string, limit: number = 20): Promise<ChatMessage[]> {
    const allMessages = await this.redis.zrange(`chat:room:${roomId}:messages`, 0, -1);
    const lowerQuery = query.toLowerCase();

    return allMessages
      .map(str => JSON.parse(str) as ChatMessage)
      .filter(msg => msg.content.toLowerCase().includes(lowerQuery))
      .slice(-limit);
  }

  /**
   * 온라인 사용자 수 조회 (Centrifugo presence 사용)
   */
  async getOnlineUserCount(roomId: string): Promise<number> {
    try {
      const channelName = roomId.startsWith('private_')
        ? CHANNELS.chatPrivate(roomId)
        : CHANNELS.chatPublic(roomId);

      const stats = await centrifugo.presenceStats(channelName);
      return stats.num_users;
    } catch {
      return 0;
    }
  }

  /**
   * 채널 구독자 목록 조회
   */
  async getRoomPresence(roomId: string): Promise<Array<{ id: string; username: string }>> {
    try {
      const channelName = roomId.startsWith('private_')
        ? CHANNELS.chatPrivate(roomId)
        : CHANNELS.chatPublic(roomId);

      const presence = await centrifugo.presence(channelName);
      return Object.values(presence.presence).map(p => ({
        id: p.user,
        username: p.conn_info?.username || p.user,
      }));
    } catch {
      return [];
    }
  }
}

// 싱글톤 인스턴스
let chatManagerInstance: ChatManager | null = null;

export function getChatManager(): ChatManager {
  if (!chatManagerInstance) {
    chatManagerInstance = new ChatManager();
  }
  return chatManagerInstance;
}

// 편의 함수들
export const sendChatMessage = (userId: string, data: z.infer<typeof MessageSchema>) =>
  getChatManager().sendMessage(userId, data);

export const editChatMessage = (messageId: string, userId: string, content: string, roomId: string) =>
  getChatManager().editMessage(messageId, userId, content, roomId);

export const deleteChatMessage = (messageId: string, userId: string, roomId: string) =>
  getChatManager().deleteMessage(messageId, userId, roomId);

export const broadcastTyping = (userId: string, roomId: string, isTyping: boolean) =>
  getChatManager().broadcastTyping(userId, roomId, isTyping);

export const createChatRoom = (createdBy: string, name: string, type: 'direct' | 'group' | 'channel', participants: string[]) =>
  getChatManager().createRoom(createdBy, name, type, participants);

export const leaveChatRoom = (roomId: string, userId: string) =>
  getChatManager().leaveRoom(roomId, userId);

export const getChatHistory = (roomId: string, limit?: number, before?: number) =>
  getChatManager().getMessageHistory(roomId, limit, before);

export const searchChatMessages = (roomId: string, query: string, limit?: number) =>
  getChatManager().searchMessages(roomId, query, limit);
