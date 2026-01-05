/**
 * 이벤트 카드 컴포넌트
 * 다양한 이벤트 타입을 지원하는 통합 카드
 */

import { useFetcher } from '@remix-run/react';
import { useState, useEffect } from 'react';
import { cn } from '~/lib/utils';
import { Clock, Users, Trophy, Check, Loader2 } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { useEventStats } from '~/hooks/useCentrifugo';
import type { EventType, EventStatus } from '@prisma/client';

interface EventOption {
  id: string;
  label: string;
  color: string;
}

interface EventCardProps {
  id: string;
  title: string;
  description?: string | null;
  type: EventType;
  status: EventStatus;
  options: EventOption[];
  startsAt: string;
  endsAt: string;
  totalParticipants: number;
  rewardPool: number;
  rewardMultiplier: number;
  pointCost: number;
  userParticipation?: {
    choice: string;
    points: number;
    isWinner?: boolean | null;
    reward?: number | null;
  } | null;
  correctAnswer?: string | null;
  isLoggedIn: boolean;
  compact?: boolean;
}

export function EventCard({
  id,
  title,
  description,
  type,
  status,
  options,
  startsAt,
  endsAt,
  totalParticipants: initialParticipants,
  rewardPool,
  rewardMultiplier,
  pointCost,
  userParticipation,
  correctAnswer,
  isLoggedIn,
  compact = false,
}: EventCardProps) {
  const fetcher = useFetcher();
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [betPoints, setBetPoints] = useState(0);
  const { data: liveStats } = useEventStats(status === 'OPEN' ? id : null);

  const isSubmitting = fetcher.state === 'submitting';
  const hasParticipated = !!userParticipation;
  const isOpen = status === 'OPEN';
  const isSettled = status === 'SETTLED';

  // 남은 시간 계산
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const end = new Date(endsAt);
      const diff = end.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft('마감');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (hours > 0) {
        setTimeLeft(`${hours}시간 ${minutes}분`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}분 ${seconds}초`);
      } else {
        setTimeLeft(`${seconds}초`);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  // 실시간 통계 적용
  const currentParticipants = liveStats?.totalParticipants ?? initialParticipants;
  const optionStats = liveStats?.options ?? options.map((o) => ({
    id: o.id,
    count: 0,
    percentage: 0,
  }));

  const handleSubmit = () => {
    if (!selectedChoice || !isLoggedIn || !isOpen || hasParticipated) return;

    fetcher.submit(
      { choice: selectedChoice, points: betPoints.toString() },
      { method: 'post', action: `/api/events/${id}/participate` }
    );
  };

  return (
    <div className={cn(
      'bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden',
      compact ? 'p-4' : 'p-6'
    )}>
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className={cn('font-bold text-gray-900 dark:text-gray-100', compact ? 'text-lg' : 'text-xl')}>
            {title}
          </h3>
          {description && !compact && (
            <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">{description}</p>
          )}
        </div>

        {/* 상태 뱃지 */}
        <StatusBadge status={status} timeLeft={timeLeft} />
      </div>

      {/* 선택지 */}
      <div className={cn('grid gap-3', options.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
        {options.map((option) => {
          const stat = optionStats.find((s) => s.id === option.id);
          const isSelected = selectedChoice === option.id;
          const isUserChoice = userParticipation?.choice === option.id;
          const isCorrect = correctAnswer === option.id;
          const isWrong = isSettled && isUserChoice && !userParticipation?.isWinner;

          return (
            <button
              key={option.id}
              onClick={() => !hasParticipated && isOpen && setSelectedChoice(option.id)}
              disabled={hasParticipated || !isOpen || isSubmitting}
              className={cn(
                'relative p-4 rounded-lg border-2 transition-all text-left',
                isSelected && !hasParticipated && 'ring-2 ring-offset-2',
                isUserChoice && 'border-blue-500',
                isCorrect && isSettled && 'border-green-500 bg-green-50 dark:bg-green-900/20',
                isWrong && 'border-red-500 bg-red-50 dark:bg-red-900/20',
                !isSelected && !isUserChoice && !isCorrect && 'border-gray-200 dark:border-gray-600',
                hasParticipated || !isOpen ? 'cursor-default' : 'cursor-pointer hover:border-gray-300'
              )}
              style={{
                borderColor: isSelected && !hasParticipated ? option.color : undefined,
                ringColor: isSelected ? option.color : undefined,
              }}
            >
              {/* 배경 프로그레스 바 */}
              {(hasParticipated || isSettled) && (
                <div
                  className="absolute inset-0 rounded-lg opacity-10"
                  style={{
                    width: `${stat?.percentage || 0}%`,
                    backgroundColor: option.color,
                  }}
                />
              )}

              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: option.color }}
                  >
                    {option.label.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {option.label}
                    </div>
                    {(hasParticipated || isSettled) && (
                      <div className="text-sm text-gray-500">
                        {stat?.count || 0}명 ({stat?.percentage || 0}%)
                      </div>
                    )}
                  </div>
                </div>

                {/* 선택 표시 */}
                {isSelected && !hasParticipated && (
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: option.color }}
                  >
                    <Check className="w-4 h-4 text-white" />
                  </div>
                )}

                {/* 참여 완료 표시 */}
                {isUserChoice && (
                  <div className="flex items-center gap-2">
                    {isSettled && userParticipation?.isWinner && (
                      <span className="text-green-600 font-bold">
                        +{userParticipation.reward?.toLocaleString()}P
                      </span>
                    )}
                    <Check className="w-5 h-5 text-blue-500" />
                  </div>
                )}

                {/* 정답 표시 */}
                {isCorrect && isSettled && !isUserChoice && (
                  <Trophy className="w-5 h-5 text-yellow-500" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 베팅 포인트 (optional) */}
      {isOpen && !hasParticipated && pointCost === 0 && !compact && (
        <div className="mt-4">
          <label className="text-sm text-gray-600 dark:text-gray-400 mb-2 block">
            추가 베팅 (선택)
          </label>
          <div className="flex gap-2">
            {[0, 10, 50, 100].map((amount) => (
              <button
                key={amount}
                onClick={() => setBetPoints(amount)}
                className={cn(
                  'px-3 py-1 rounded-lg border text-sm',
                  betPoints === amount
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'border-gray-300 dark:border-gray-600'
                )}
              >
                {amount === 0 ? '무료' : `${amount}P`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 참여 버튼 */}
      {isOpen && !hasParticipated && (
        <div className="mt-4">
          {isLoggedIn ? (
            <Button
              onClick={handleSubmit}
              disabled={!selectedChoice || isSubmitting}
              className="w-full"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  참여 중...
                </>
              ) : (
                `참여하기 ${pointCost + betPoints > 0 ? `(${pointCost + betPoints}P)` : ''}`
              )}
            </Button>
          ) : (
            <Button variant="outline" className="w-full" disabled>
              로그인 후 참여 가능
            </Button>
          )}
        </div>
      )}

      {/* 푸터 통계 */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-sm text-gray-500">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            {currentParticipants.toLocaleString()}명
          </span>
          {rewardPool > 0 && (
            <span className="flex items-center gap-1">
              <Trophy className="w-4 h-4" />
              {rewardPool.toLocaleString()}P
            </span>
          )}
        </div>
        <span className="text-xs">x{rewardMultiplier} 보상</span>
      </div>
    </div>
  );
}

function StatusBadge({ status, timeLeft }: { status: EventStatus; timeLeft: string }) {
  const config = {
    UPCOMING: { label: '예정', color: 'bg-blue-100 text-blue-800' },
    OPEN: { label: timeLeft, color: 'bg-green-100 text-green-800', icon: Clock },
    CLOSED: { label: '마감', color: 'bg-yellow-100 text-yellow-800' },
    SETTLED: { label: '종료', color: 'bg-purple-100 text-purple-800' },
    CANCELLED: { label: '취소', color: 'bg-red-100 text-red-800' },
  }[status];

  const Icon = config.icon;

  return (
    <span className={cn('px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1', config.color)}>
      {Icon && <Icon className="w-3 h-3" />}
      {config.label}
    </span>
  );
}
