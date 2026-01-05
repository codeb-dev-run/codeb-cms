/**
 * 리더보드 페이지
 *
 * QPS 10K 최적화:
 * - N+1 쿼리 제거: 8개 쿼리 → 2개 병렬 쿼리
 * - Redis 캐싱: 1분 TTL
 * - 사용자 순위도 병렬 조회
 */

import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { getUser } from '~/lib/auth.server';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Trophy, Medal, Crown, TrendingUp, User } from 'lucide-react';
import { cn } from '~/lib/utils';
import {
  getLeaderboardsCached,
  getUserRanksCached,
} from '~/lib/performance/qps-optimizer.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);

  // 병렬로 리더보드 조회 (캐시 + N+1 최적화)
  const [leaderboards, userRanks] = await Promise.all([
    getLeaderboardsCached(),
    user ? getUserRanksCached(user.id) : null,
  ]);

  return json({
    leaderboards,
    userRanks,
    currentUserId: user?.id,
  });
}

export default function LeaderboardPage() {
  const { leaderboards, userRanks, currentUserId } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container mx-auto px-4 py-8" style={{ maxWidth: '900px' }}>
        {/* 헤더 */}
        <div className="text-center mb-8">
          <Trophy className="w-16 h-16 mx-auto text-yellow-500 mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">리더보드</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">
            최고의 플레이어들을 확인하세요
          </p>
        </div>

        {/* 내 순위 카드 */}
        {userRanks && (
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-6 mb-8 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm">내 순위 (전체)</p>
                <p className="text-4xl font-bold mt-1">
                  {userRanks.all_time?.rank
                    ? `#${userRanks.all_time.rank}`
                    : '순위 없음'}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-blue-100 text-xs">포인트</p>
                  <p className="text-xl font-bold">
                    {userRanks.all_time?.points?.toLocaleString() || 0}
                  </p>
                </div>
                <div>
                  <p className="text-blue-100 text-xs">승리</p>
                  <p className="text-xl font-bold">{userRanks.all_time?.wins || 0}</p>
                </div>
                <div>
                  <p className="text-blue-100 text-xs">승률</p>
                  <p className="text-xl font-bold">
                    {userRanks.all_time?.winRate?.toFixed(1) || 0}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 리더보드 탭 */}
        <Tabs defaultValue="all_time" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all_time">전체</TabsTrigger>
            <TabsTrigger value="monthly">이번 달</TabsTrigger>
            <TabsTrigger value="weekly">이번 주</TabsTrigger>
            <TabsTrigger value="daily">오늘</TabsTrigger>
          </TabsList>

          {(['all_time', 'monthly', 'weekly', 'daily'] as const).map((period) => (
            <TabsContent key={period} value={period}>
              {/* 상위 3명 */}
              {leaderboards[period].length >= 3 && (
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {/* 2등 */}
                  <TopRankCard
                    rank={2}
                    user={leaderboards[period][1]?.user}
                    points={leaderboards[period][1]?.points}
                    wins={leaderboards[period][1]?.wins}
                    isCurrentUser={leaderboards[period][1]?.user?.id === currentUserId}
                  />
                  {/* 1등 */}
                  <TopRankCard
                    rank={1}
                    user={leaderboards[period][0]?.user}
                    points={leaderboards[period][0]?.points}
                    wins={leaderboards[period][0]?.wins}
                    isCurrentUser={leaderboards[period][0]?.user?.id === currentUserId}
                    featured
                  />
                  {/* 3등 */}
                  <TopRankCard
                    rank={3}
                    user={leaderboards[period][2]?.user}
                    points={leaderboards[period][2]?.points}
                    wins={leaderboards[period][2]?.wins}
                    isCurrentUser={leaderboards[period][2]?.user?.id === currentUserId}
                  />
                </div>
              )}

              {/* 나머지 순위 */}
              <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        순위
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        사용자
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        포인트
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        승리
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        승률
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {leaderboards[period].slice(3).map((entry, index) => (
                      <tr
                        key={entry.id}
                        className={cn(
                          'hover:bg-gray-50 dark:hover:bg-gray-700/50',
                          entry.user?.id === currentUserId && 'bg-blue-50 dark:bg-blue-900/20'
                        )}
                      >
                        <td className="px-4 py-3">
                          <span className="font-bold text-gray-500">#{index + 4}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {entry.user?.profileImage ? (
                              <img
                                src={entry.user.profileImage}
                                alt=""
                                className="w-8 h-8 rounded-full"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                                <User className="w-4 h-4 text-gray-500" />
                              </div>
                            )}
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {entry.user?.name || entry.user?.username || '익명'}
                            </span>
                            {entry.user?.id === currentUserId && (
                              <span className="text-xs text-blue-500">(나)</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-gray-100">
                          {entry.points.toLocaleString()}P
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                          {entry.wins}승
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                          {entry.winRate.toFixed(1)}%
                        </td>
                      </tr>
                    ))}

                    {leaderboards[period].length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                          아직 순위 데이터가 없습니다
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

function TopRankCard({
  rank,
  user,
  points,
  wins,
  isCurrentUser,
  featured,
}: {
  rank: 1 | 2 | 3;
  user?: { id: string; username: string; name?: string | null; profileImage?: string | null };
  points?: number;
  wins?: number;
  isCurrentUser?: boolean;
  featured?: boolean;
}) {
  const RankIcon = rank === 1 ? Crown : Medal;
  const rankColors = {
    1: 'text-yellow-500',
    2: 'text-gray-400',
    3: 'text-amber-600',
  };

  if (!user) {
    return (
      <div className={cn('bg-white dark:bg-gray-800 rounded-xl p-4 text-center', featured && 'transform -translate-y-4')}>
        <p className="text-gray-500">-</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'bg-white dark:bg-gray-800 rounded-xl p-4 text-center relative',
        featured && 'transform -translate-y-4 shadow-lg',
        isCurrentUser && 'ring-2 ring-blue-500'
      )}
    >
      {/* 순위 아이콘 */}
      <div className={cn('absolute -top-3 left-1/2 -translate-x-1/2', rankColors[rank])}>
        <RankIcon className="w-8 h-8" />
      </div>

      {/* 아바타 */}
      <div className="mt-4 mb-3">
        {user.profileImage ? (
          <img
            src={user.profileImage}
            alt=""
            className={cn(
              'mx-auto rounded-full border-4',
              featured ? 'w-20 h-20' : 'w-16 h-16',
              rank === 1 && 'border-yellow-400',
              rank === 2 && 'border-gray-300',
              rank === 3 && 'border-amber-400'
            )}
          />
        ) : (
          <div
            className={cn(
              'mx-auto rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center border-4',
              featured ? 'w-20 h-20' : 'w-16 h-16',
              rank === 1 && 'border-yellow-400',
              rank === 2 && 'border-gray-300',
              rank === 3 && 'border-amber-400'
            )}
          >
            <User className="w-8 h-8 text-gray-500" />
          </div>
        )}
      </div>

      {/* 이름 */}
      <p className="font-bold text-gray-900 dark:text-gray-100 truncate">
        {user.name || user.username}
      </p>
      {isCurrentUser && <span className="text-xs text-blue-500">(나)</span>}

      {/* 통계 */}
      <div className="mt-2 space-y-1">
        <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
          {points?.toLocaleString()}P
        </p>
        <p className="text-sm text-gray-500">{wins}승</p>
      </div>
    </div>
  );
}
