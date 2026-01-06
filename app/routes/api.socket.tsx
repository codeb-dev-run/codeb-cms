// Centrifugo 실시간 통신 API 엔드포인트
// Socket.IO에서 Centrifugo로 완전 마이그레이션됨

import type { ActionFunction } from '@remix-run/node';
import { json } from '@remix-run/node';
import { requireUser } from '../lib/auth.server';
import { centrifugo } from '../lib/centrifugo/client.server';
import { CHANNELS } from '../lib/centrifugo/channels';
import { z } from 'zod';
import { db } from '~/lib/db.server';

// Socket 이벤트 스키마
const socketEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('new-post'),
    data: z.object({
      postId: z.string(),
      title: z.string(),
      author: z.string(),
      categorySlug: z.string(),
    }),
  }),
  z.object({
    type: z.literal('new-comment'),
    data: z.object({
      postId: z.string(),
      commentId: z.string(),
      content: z.string(),
      author: z.string(),
    }),
  }),
  z.object({
    type: z.literal('notification'),
    data: z.object({
      userId: z.string(),
      message: z.string(),
      type: z.enum(['info', 'success', 'warning', 'error']),
    }),
  }),
  z.object({
    type: z.literal('admin-broadcast'),
    data: z.object({
      message: z.string(),
      priority: z.enum(['low', 'medium', 'high']),
    }),
  }),
]);

export const action: ActionFunction = async ({ request }) => {
  const user = await requireUser(request);

  try {
    const body = await request.json();
    const validatedData = socketEventSchema.parse(body);

    switch (validatedData.type) {
      case 'new-post': {
        // 새 게시물 알림 - 전체 공지사항 채널로 발행
        await centrifugo.publish(CHANNELS.announcements(), {
          type: 'post:new',
          id: validatedData.data.postId,
          title: validatedData.data.title,
          author: validatedData.data.author,
          categorySlug: validatedData.data.categorySlug,
          timestamp: new Date().toISOString(),
        });

        // 카테고리 게시글 채널 (댓글 채널 재활용)
        await centrifugo.publish(CHANNELS.postComments(validatedData.data.categorySlug), {
          type: 'category:new-post',
          id: validatedData.data.postId,
          title: validatedData.data.title,
          author: validatedData.data.author,
          timestamp: new Date().toISOString(),
        });

        return json({ success: true, event: 'new-post broadcasted via Centrifugo' });
      }

      case 'new-comment': {
        // 새 댓글 알림 - 해당 게시물 채널로 발행
        await centrifugo.publish(CHANNELS.postComments(validatedData.data.postId), {
          type: 'comment:new',
          id: validatedData.data.commentId,
          postId: validatedData.data.postId,
          content: validatedData.data.content,
          author: validatedData.data.author,
          timestamp: new Date().toISOString(),
        });

        return json({ success: true, event: 'new-comment broadcasted via Centrifugo' });
      }

      case 'notification': {
        // 특정 사용자에게 개인 알림 (비공개 채널)
        await centrifugo.publish(CHANNELS.personal(validatedData.data.userId), {
          type: 'notification',
          message: validatedData.data.message,
          notificationType: validatedData.data.type,
          timestamp: new Date().toISOString(),
        });

        return json({ success: true, event: 'notification sent via Centrifugo' });
      }

      case 'admin-broadcast': {
        // 관리자만 전체 브로드캐스트 가능
        const dbUser = await db.user.findUnique({
          where: { id: user.id },
          select: { role: true },
        });

        if (!dbUser || dbUser.role !== 'ADMIN') {
          return json({ error: '권한이 없습니다.' }, { status: 403 });
        }

        // 전체 사용자에게 관리자 공지사항 브로드캐스트
        await centrifugo.publish(CHANNELS.announcements(), {
          type: 'admin:broadcast',
          message: validatedData.data.message,
          priority: validatedData.data.priority,
          timestamp: new Date().toISOString(),
        });

        return json({ success: true, event: 'admin-broadcast sent via Centrifugo' });
      }
    }

  } catch (error) {
    console.error('Socket event error:', error);

    if (error instanceof z.ZodError) {
      return json({
        error: '이벤트 데이터가 올바르지 않습니다.',
        details: error.errors
      }, { status: 400 });
    }

    return json({
      error: 'Centrifugo 이벤트 처리 중 오류가 발생했습니다.'
    }, { status: 500 });
  }
};
