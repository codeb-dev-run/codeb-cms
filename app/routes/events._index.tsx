/**
 * 유저 이벤트 목록 페이지
 */

import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, Link } from '@remix-run/react';
import { db } from '~/lib/db.server';
import { getUser } from '~/lib/auth.server';
import { EventCard } from '~/components/events/EventCard';
import { Button } from '~/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Trophy, Clock, CheckCircle, History } from 'lucide-react';
import type { EventStatus, EventType } from '@prisma/client';

interface EventOption {
  id: string;
  label: string;
  color: string;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);

  const now = new Date();

  // 활성 이벤트 (OPEN)
  const activeEvents = await db.participationEvent.findMany({
    where: {
      status: 'OPEN',
      isPublished: true,
      endsAt: { gt: now },
    },
    orderBy: { endsAt: 'asc' },
    include: {
      _count: { select: { participations: true } },
      participations: user
        ? {
            where: { userId: user.id },
            select: { choice: true, points: true, isWinner: true, reward: true },
          }
        : false,
    },
  });

  // 예정 이벤트 (UPCOMING)
  const upcomingEvents = await db.participationEvent.findMany({
    where: {
      status: 'UPCOMING',
      isPublished: true,
    },
    orderBy: { startsAt: 'asc' },
    take: 10,
    include: {
      _count: { select: { participations: true } },
    },
  });

  // 종료된 이벤트 (SETTLED) - 최근 10개
  const pastEvents = await db.participationEvent.findMany({
    where: {
      status: 'SETTLED',
      isPublished: true,
    },
    orderBy: { resultAt: 'desc' },
    take: 10,
    include: {
      _count: { select: { participations: true } },
      participations: user
        ? {
            where: { userId: user.id },
            select: { choice: true, points: true, isWinner: true, reward: true },
          }
        : false,
    },
  });

  // 유저 통계
  let userStats = null;
  if (user) {
    const userPoints = await db.userPoints.findUnique({
      where: { userId: user.id },
      select: { balance: true, lifetime: true, wins: true, losses: true, streak: true },
    });

    const participationCount = await db.participation.count({
      where: { userId: user.id },
    });

    userStats = {
      balance: userPoints?.balance || 0,
      lifetime: userPoints?.lifetime || 0,
      wins: userPoints?.wins || 0,
      losses: userPoints?.losses || 0,
      streak: userPoints?.streak || 0,
      participations: participationCount,
    };
  }

  return json({
    activeEvents,
    upcomingEvents,
    pastEvents,
    userStats,
    isLoggedIn: !!user,
  });
}

export default function EventsIndex() {
  const { activeEvents, upcomingEvents, pastEvents, userStats, isLoggedIn } =
    useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container mx-auto px-4 py-8" style={{ maxWidth: '1200px' }}>
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">이벤트</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              참여하고 포인트를 획득하세요
            </p>
          </div>

          {isLoggedIn && (
            <Link to="/events/history">
              <Button variant="outline">
                <History className="w-4 h-4 mr-2" />
                내 참여 내역
              </Button>
            </Link>
          )}
        </div>

        {/* 유저 통계 */}
        {userStats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <StatCard
              label="보유 포인트"
              value={`${userStats.balance.toLocaleString()}P`}
              icon={<Trophy className="w-5 h-5 text-yellow-500" />}
              highlight
            />
            <StatCard
              label="누적 획득"
              value={`${userStats.lifetime.toLocaleString()}P`}
            />
            <StatCard
              label="승리"
              value={userStats.wins.toString()}
              className="text-green-600"
            />
            <StatCard
              label="패배"
              value={userStats.losses.toString()}
              className="text-red-600"
            />
            <StatCard
              label="연속 승리"
              value={`${userStats.streak}회`}
              icon={userStats.streak >= 3 && <span>🔥</span>}
            />
          </div>
        )}

        {/* 탭 */}
        <Tabs defaultValue="active" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
            <TabsTrigger value="active" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              진행중 ({activeEvents.length})
            </TabsTrigger>
            <TabsTrigger value="upcoming" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              예정 ({upcomingEvents.length})
            </TabsTrigger>
            <TabsTrigger value="past" className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              종료 ({pastEvents.length})
            </TabsTrigger>
          </TabsList>

          {/* 진행중 */}
          <TabsContent value="active">
            {activeEvents.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2">
                {activeEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    id={event.id}
                    title={event.title}
                    description={event.description}
                    type={event.type}
                    status={event.status}
                    options={event.options as EventOption[]}
                    startsAt={event.startsAt}
                    endsAt={event.endsAt}
                    totalParticipants={event._count.participations}
                    rewardPool={event.rewardPool}
                    rewardMultiplier={event.rewardMultiplier}
                    pointCost={event.pointCost}
                    userParticipation={event.participations?.[0] || null}
                    correctAnswer={event.correctAnswer}
                    isLoggedIn={isLoggedIn}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="진행 중인 이벤트가 없습니다"
                description="곧 새로운 이벤트가 시작됩니다"
              />
            )}
          </TabsContent>

          {/* 예정 */}
          <TabsContent value="upcoming">
            {upcomingEvents.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2">
                {upcomingEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    id={event.id}
                    title={event.title}
                    description={event.description}
                    type={event.type}
                    status={event.status}
                    options={event.options as EventOption[]}
                    startsAt={event.startsAt}
                    endsAt={event.endsAt}
                    totalParticipants={event._count.participations}
                    rewardPool={event.rewardPool}
                    rewardMultiplier={event.rewardMultiplier}
                    pointCost={event.pointCost}
                    userParticipation={null}
                    correctAnswer={null}
                    isLoggedIn={isLoggedIn}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="예정된 이벤트가 없습니다"
                description="새 이벤트를 기다려주세요"
              />
            )}
          </TabsContent>

          {/* 종료 */}
          <TabsContent value="past">
            {pastEvents.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2">
                {pastEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    id={event.id}
                    title={event.title}
                    description={event.description}
                    type={event.type}
                    status={event.status}
                    options={event.options as EventOption[]}
                    startsAt={event.startsAt}
                    endsAt={event.endsAt}
                    totalParticipants={event._count.participations}
                    rewardPool={event.rewardPool}
                    rewardMultiplier={event.rewardMultiplier}
                    pointCost={event.pointCost}
                    userParticipation={event.participations?.[0] || null}
                    correctAnswer={event.correctAnswer}
                    isLoggedIn={isLoggedIn}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="종료된 이벤트가 없습니다"
                description="아직 종료된 이벤트가 없습니다"
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  highlight,
  className,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg p-4 ${
        highlight ? 'ring-2 ring-yellow-400 bg-yellow-50 dark:bg-yellow-900/20' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
        {icon}
      </div>
      <div className={`text-2xl font-bold mt-1 ${className || 'text-gray-900 dark:text-gray-100'}`}>
        {value}
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg">
      <Trophy className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600" />
      <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">{title}</h3>
      <p className="mt-1 text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  );
}
