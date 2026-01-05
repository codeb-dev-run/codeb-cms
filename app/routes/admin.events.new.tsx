/**
 * 새 이벤트 생성 페이지
 */

import { json, redirect, type ActionFunctionArgs } from '@remix-run/node';
import { Form, useActionData, useNavigation } from '@remix-run/react';
import { db } from '~/lib/db.server';
import { requireAdmin } from '~/lib/auth.server';
import { Button } from '~/components/ui/button';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import { Link } from '@remix-run/react';
import { useState } from 'react';
import type { EventType } from '@prisma/client';

interface EventOption {
  id: string;
  label: string;
  color: string;
}

const DEFAULT_OPTIONS: Record<EventType, EventOption[]> = {
  BINARY: [
    { id: 'like', label: '좋아요', color: '#ef4444' },
    { id: 'dislike', label: '싫어요', color: '#3b82f6' },
  ],
  ODD_EVEN: [
    { id: 'odd', label: '홀', color: '#ef4444' },
    { id: 'even', label: '짝', color: '#3b82f6' },
  ],
  MULTI_CHOICE: [
    { id: 'a', label: 'A', color: '#ef4444' },
    { id: 'b', label: 'B', color: '#3b82f6' },
    { id: 'c', label: 'C', color: '#22c55e' },
    { id: 'd', label: 'D', color: '#eab308' },
  ],
  PREDICTION: [
    { id: 'input', label: '직접 입력', color: '#8b5cf6' },
  ],
};

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);

  const formData = await request.formData();

  const title = formData.get('title') as string;
  const description = formData.get('description') as string;
  const type = formData.get('type') as EventType;
  const startsAt = new Date(formData.get('startsAt') as string);
  const endsAt = new Date(formData.get('endsAt') as string);
  const pointCost = parseInt(formData.get('pointCost') as string) || 0;
  const rewardMultiplier = parseFloat(formData.get('rewardMultiplier') as string) || 2.0;
  const isPublished = formData.get('isPublished') === 'true';
  const optionsJson = formData.get('options') as string;

  const errors: Record<string, string> = {};

  if (!title) errors.title = '제목을 입력해주세요';
  if (!type) errors.type = '타입을 선택해주세요';
  if (!startsAt) errors.startsAt = '시작 시간을 입력해주세요';
  if (!endsAt) errors.endsAt = '종료 시간을 입력해주세요';
  if (startsAt >= endsAt) errors.endsAt = '종료 시간은 시작 시간보다 늦어야 합니다';

  if (Object.keys(errors).length > 0) {
    return json({ errors, success: false });
  }

  let options: EventOption[];
  try {
    options = JSON.parse(optionsJson);
  } catch {
    options = DEFAULT_OPTIONS[type];
  }

  const event = await db.participationEvent.create({
    data: {
      title,
      description: description || null,
      type,
      startsAt,
      endsAt,
      pointCost,
      rewardMultiplier,
      isPublished,
      options,
      status: new Date() >= startsAt ? 'OPEN' : 'UPCOMING',
    },
  });

  return redirect(`/admin/events/${event.id}`);
}

export default function AdminEventsNew() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  const [eventType, setEventType] = useState<EventType>('ODD_EVEN');
  const [options, setOptions] = useState<EventOption[]>(DEFAULT_OPTIONS.ODD_EVEN);

  const handleTypeChange = (type: EventType) => {
    setEventType(type);
    setOptions(DEFAULT_OPTIONS[type]);
  };

  const addOption = () => {
    const newId = String.fromCharCode(97 + options.length); // a, b, c, d...
    setOptions([
      ...options,
      { id: newId, label: newId.toUpperCase(), color: '#6b7280' },
    ]);
  };

  const removeOption = (id: string) => {
    setOptions(options.filter((o) => o.id !== id));
  };

  const updateOption = (id: string, field: keyof EventOption, value: string) => {
    setOptions(options.map((o) => (o.id === id ? { ...o, [field]: value } : o)));
  };

  // 기본값: 지금부터 1시간 후 시작, 2시간 후 종료
  const now = new Date();
  const defaultStart = new Date(now.getTime() + 60 * 60 * 1000);
  const defaultEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const formatDateTimeLocal = (date: Date) => {
    return date.toISOString().slice(0, 16);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-4">
        <Link to="/admin/events">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">새 이벤트 생성</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            새로운 참여형 이벤트를 생성합니다
          </p>
        </div>
      </div>

      <Form method="post" className="space-y-6">
        {/* 기본 정보 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">기본 정보</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              제목 *
            </label>
            <input
              type="text"
              name="title"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
              placeholder="이벤트 제목을 입력하세요"
            />
            {actionData?.errors?.title && (
              <p className="text-red-500 text-sm mt-1">{actionData.errors.title}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              설명
            </label>
            <textarea
              name="description"
              rows={3}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
              placeholder="이벤트 설명을 입력하세요"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              이벤트 타입 *
            </label>
            <select
              name="type"
              value={eventType}
              onChange={(e) => handleTypeChange(e.target.value as EventType)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
            >
              <option value="ODD_EVEN">홀짝</option>
              <option value="BINARY">이진 (좋아요/싫어요)</option>
              <option value="MULTI_CHOICE">다지선다</option>
              <option value="PREDICTION">예측</option>
            </select>
          </div>
        </div>

        {/* 옵션 설정 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">선택지 설정</h2>
            {eventType === 'MULTI_CHOICE' && options.length < 6 && (
              <Button type="button" variant="outline" size="sm" onClick={addOption}>
                <Plus className="w-4 h-4 mr-1" />
                추가
              </Button>
            )}
          </div>

          <input type="hidden" name="options" value={JSON.stringify(options)} />

          <div className="grid gap-3">
            {options.map((option, index) => (
              <div key={option.id} className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: option.color }}
                >
                  {index + 1}
                </div>
                <input
                  type="text"
                  value={option.label}
                  onChange={(e) => updateOption(option.id, 'label', e.target.value)}
                  className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                  placeholder="선택지 이름"
                />
                <input
                  type="color"
                  value={option.color}
                  onChange={(e) => updateOption(option.id, 'color', e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer"
                />
                {eventType === 'MULTI_CHOICE' && options.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeOption(option.id)}
                    className="text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 일정 설정 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">일정 설정</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                시작 시간 *
              </label>
              <input
                type="datetime-local"
                name="startsAt"
                defaultValue={formatDateTimeLocal(defaultStart)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
              />
              {actionData?.errors?.startsAt && (
                <p className="text-red-500 text-sm mt-1">{actionData.errors.startsAt}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                종료 시간 *
              </label>
              <input
                type="datetime-local"
                name="endsAt"
                defaultValue={formatDateTimeLocal(defaultEnd)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
              />
              {actionData?.errors?.endsAt && (
                <p className="text-red-500 text-sm mt-1">{actionData.errors.endsAt}</p>
              )}
            </div>
          </div>
        </div>

        {/* 보상 설정 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">보상 설정</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                참여 비용 (포인트)
              </label>
              <input
                type="number"
                name="pointCost"
                defaultValue={0}
                min={0}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
              />
              <p className="text-gray-500 text-sm mt-1">0 = 무료 참여</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                승리 보상 배수
              </label>
              <input
                type="number"
                name="rewardMultiplier"
                defaultValue={2.0}
                min={1}
                max={10}
                step={0.1}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
              />
              <p className="text-gray-500 text-sm mt-1">베팅 포인트 × 배수 = 승리 보상</p>
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
              defaultChecked={true}
              className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100">공개 여부</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                체크하면 즉시 사용자에게 표시됩니다
              </div>
            </div>
          </label>
        </div>

        {/* 제출 버튼 */}
        <div className="flex justify-end gap-3">
          <Link to="/admin/events">
            <Button type="button" variant="outline">
              취소
            </Button>
          </Link>
          <Button type="submit" disabled={isSubmitting}>
            <Save className="w-4 h-4 mr-2" />
            {isSubmitting ? '생성 중...' : '이벤트 생성'}
          </Button>
        </div>
      </Form>
    </div>
  );
}
