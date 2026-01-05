/**
 * 이벤트 상세/수정 페이지
 */

import { json, redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from '@remix-run/node';
import { useLoaderData, Form, useNavigation, Link } from '@remix-run/react';
import { db } from '~/lib/db.server';
import { requireAdmin } from '~/lib/auth.server';
import { Button } from '~/components/ui/button';
import { ArrowLeft, Save, Trash2, Users, Trophy, Clock, CheckCircle, Play, Pause, XCircle } from 'lucide-react';
import { useState } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { EventType, EventStatus } from '@prisma/client';

interface EventOption {
  id: string;
  label: string;
  color: string;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const { id } = params;

  const event = await db.participationEvent.findUnique({
    where: { id },
    include: {
      participations: {
        include: {
          user: { select: { id: true, username: true, name: true, profileImage: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      _count: { select: { participations: true } },
    },
  });

  if (!event) {
    throw new Response('이벤트를 찾을 수 없습니다', { status: 404 });
  }

  // 선택지별 통계 계산
  const options = event.options as EventOption[];
  const stats = await db.participation.groupBy({
    by: ['choice'],
    where: { eventId: id },
    _count: true,
    _sum: { points: true },
  });

  const optionStats = options.map((option) => {
    const stat = stats.find((s) => s.choice === option.id);
    return {
      ...option,
      count: stat?._count || 0,
      points: stat?._sum?.points || 0,
      percentage: event._count.participations > 0
        ? Math.round(((stat?._count || 0) / event._count.participations) * 100)
        : 0,
    };
  });

  return json({ event, optionStats });
}

export async function action({ request, params }: ActionFunctionArgs) {
  await requireAdmin(request);

  const { id } = params;
  const formData = await request.formData();
  const action = formData.get('_action');

  if (action === 'delete') {
    await db.participationEvent.delete({ where: { id } });
    return redirect('/admin/events');
  }

  if (action === 'updateStatus') {
    const status = formData.get('status') as EventStatus;
    await db.participationEvent.update({
      where: { id },
      data: { status },
    });
    return json({ success: true });
  }

  // 이벤트 업데이트
  const title = formData.get('title') as string;
  const description = formData.get('description') as string;
  const type = formData.get('type') as EventType;
  const startsAt = new Date(formData.get('startsAt') as string);
  const endsAt = new Date(formData.get('endsAt') as string);
  const pointCost = parseInt(formData.get('pointCost') as string) || 0;
  const rewardMultiplier = parseFloat(formData.get('rewardMultiplier') as string) || 2.0;
  const isPublished = formData.get('isPublished') === 'true';
  const optionsJson = formData.get('options') as string;

  await db.participationEvent.update({
    where: { id },
    data: {
      title,
      description: description || null,
      type,
      startsAt,
      endsAt,
      pointCost,
      rewardMultiplier,
      isPublished,
      options: JSON.parse(optionsJson),
    },
  });

  return json({ success: true });
}

const STATUS_ACTIONS: Record<EventStatus, { next: EventStatus; label: string; icon: typeof Play }[]> = {
  UPCOMING: [{ next: 'OPEN', label: '시작하기', icon: Play }],
  OPEN: [{ next: 'CLOSED', label: '마감하기', icon: Pause }],
  CLOSED: [{ next: 'OPEN', label: '다시 시작', icon: Play }],
  SETTLED: [],
  CANCELLED: [{ next: 'UPCOMING', label: '복원', icon: Play }],
};

export default function AdminEventDetail() {
  const { event, optionStats } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  const [options, setOptions] = useState<EventOption[]>(event.options as EventOption[]);

  const formatDateTimeLocal = (date: string) => {
    return new Date(date).toISOString().slice(0, 16);
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/admin/events">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{event.title}</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              생성: {format(new Date(event.createdAt), 'yyyy년 MM월 dd일 HH:mm', { locale: ko })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 상태 변경 버튼들 */}
          {STATUS_ACTIONS[event.status].map((action) => (
            <Form key={action.next} method="post">
              <input type="hidden" name="_action" value="updateStatus" />
              <input type="hidden" name="status" value={action.next} />
              <Button type="submit" variant="outline">
                <action.icon className="w-4 h-4 mr-2" />
                {action.label}
              </Button>
            </Form>
          ))}

          {event.status === 'CLOSED' && (
            <Link to={`/admin/events/${event.id}/result`}>
              <Button className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="w-4 h-4 mr-2" />
                결과 입력
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* 메인 폼 */}
        <div className="col-span-2 space-y-6">
          <Form method="post" className="space-y-6">
            <input type="hidden" name="options" value={JSON.stringify(options)} />

            {/* 기본 정보 */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">기본 정보</h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  제목
                </label>
                <input
                  type="text"
                  name="title"
                  defaultValue={event.title}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  설명
                </label>
                <textarea
                  name="description"
                  rows={3}
                  defaultValue={event.description || ''}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  타입
                </label>
                <select
                  name="type"
                  defaultValue={event.type}
                  disabled={event._count.participations > 0}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 disabled:opacity-50"
                >
                  <option value="ODD_EVEN">홀짝</option>
                  <option value="BINARY">이진</option>
                  <option value="MULTI_CHOICE">다지선다</option>
                  <option value="PREDICTION">예측</option>
                </select>
                {event._count.participations > 0 && (
                  <p className="text-yellow-500 text-sm mt-1">참여자가 있어 타입을 변경할 수 없습니다</p>
                )}
              </div>
            </div>

            {/* 일정 */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">일정</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    시작 시간
                  </label>
                  <input
                    type="datetime-local"
                    name="startsAt"
                    defaultValue={formatDateTimeLocal(event.startsAt)}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    종료 시간
                  </label>
                  <input
                    type="datetime-local"
                    name="endsAt"
                    defaultValue={formatDateTimeLocal(event.endsAt)}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                  />
                </div>
              </div>
            </div>

            {/* 보상 */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">보상</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    참여 비용
                  </label>
                  <input
                    type="number"
                    name="pointCost"
                    defaultValue={event.pointCost}
                    min={0}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    보상 배수
                  </label>
                  <input
                    type="number"
                    name="rewardMultiplier"
                    defaultValue={event.rewardMultiplier}
                    min={1}
                    max={10}
                    step={0.1}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                  />
                </div>
              </div>
            </div>

            {/* 공개 설정 */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="isPublished"
                  value="true"
                  defaultChecked={event.isPublished}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-medium text-gray-900 dark:text-gray-100">공개</span>
              </label>
            </div>

            {/* 저장/삭제 */}
            <div className="flex justify-between">
              <Form method="post">
                <input type="hidden" name="_action" value="delete" />
                <Button
                  type="submit"
                  variant="outline"
                  className="text-red-600 border-red-600 hover:bg-red-50"
                  onClick={(e) => {
                    if (!confirm('정말 삭제하시겠습니까?')) {
                      e.preventDefault();
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  삭제
                </Button>
              </Form>

              <Button type="submit" disabled={isSubmitting}>
                <Save className="w-4 h-4 mr-2" />
                {isSubmitting ? '저장 중...' : '저장'}
              </Button>
            </div>
          </Form>
        </div>

        {/* 사이드바 - 통계 */}
        <div className="space-y-6">
          {/* 요약 통계 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">통계</h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <Users className="w-6 h-6 mx-auto mb-2 text-blue-500" />
                <div className="text-2xl font-bold">{event._count.participations}</div>
                <div className="text-sm text-gray-500">참여자</div>
              </div>
              <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <Trophy className="w-6 h-6 mx-auto mb-2 text-yellow-500" />
                <div className="text-2xl font-bold">{event.rewardPool.toLocaleString()}</div>
                <div className="text-sm text-gray-500">보상 풀</div>
              </div>
            </div>
          </div>

          {/* 선택지별 통계 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">선택지별 현황</h2>

            <div className="space-y-3">
              {optionStats.map((option) => (
                <div key={option.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: option.color }}
                      />
                      <span>{option.label}</span>
                    </div>
                    <span className="font-medium">{option.count}명 ({option.percentage}%)</span>
                  </div>
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${option.percentage}%`,
                        backgroundColor: option.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 최근 참여자 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">최근 참여자</h2>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {event.participations.map((p) => {
                const option = optionStats.find((o) => o.id === p.choice);
                return (
                  <div key={p.id} className="flex items-center gap-3 text-sm">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: option?.color || '#6b7280' }}
                    />
                    <span className="flex-1 truncate">
                      {p.user.name || p.user.username}
                    </span>
                    <span className="text-gray-500">{option?.label}</span>
                  </div>
                );
              })}

              {event.participations.length === 0 && (
                <p className="text-gray-500 text-center py-4">아직 참여자가 없습니다</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
