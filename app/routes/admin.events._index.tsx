/**
 * 어드민 이벤트 목록 페이지
 */

import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, Link, useSearchParams } from '@remix-run/react';
import { db } from '~/lib/db.server';
import { requireAdmin } from '~/lib/auth.server';
import { Button } from '~/components/ui/button';
import {
  Plus,
  Search,
  Calendar,
  Users,
  Trophy,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  MoreHorizontal,
  Edit,
  Eye,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { EventType, EventStatus } from '@prisma/client';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const status = url.searchParams.get('status') as EventStatus | null;
  const type = url.searchParams.get('type') as EventType | null;
  const search = url.searchParams.get('search') || '';

  const perPage = 20;
  const skip = (page - 1) * perPage;

  const where = {
    ...(status && { status }),
    ...(type && { type }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: 'insensitive' as const } },
        { description: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  };

  const [events, total, stats] = await Promise.all([
    db.participationEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: perPage,
      include: {
        _count: { select: { participations: true } },
      },
    }),
    db.participationEvent.count({ where }),
    db.participationEvent.groupBy({
      by: ['status'],
      _count: true,
    }),
  ]);

  const statusCounts = {
    UPCOMING: 0,
    OPEN: 0,
    CLOSED: 0,
    SETTLED: 0,
    CANCELLED: 0,
  };

  stats.forEach((s) => {
    statusCounts[s.status] = s._count;
  });

  return json({
    events,
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage),
    },
    filters: { status, type, search },
    statusCounts,
  });
}

const STATUS_CONFIG = {
  UPCOMING: { label: '예정', color: 'bg-blue-100 text-blue-800', icon: Clock },
  OPEN: { label: '진행중', color: 'bg-green-100 text-green-800', icon: AlertCircle },
  CLOSED: { label: '마감', color: 'bg-yellow-100 text-yellow-800', icon: XCircle },
  SETTLED: { label: '정산완료', color: 'bg-purple-100 text-purple-800', icon: CheckCircle },
  CANCELLED: { label: '취소', color: 'bg-red-100 text-red-800', icon: XCircle },
};

const TYPE_CONFIG = {
  BINARY: { label: '이진', color: 'bg-gray-100 text-gray-800' },
  ODD_EVEN: { label: '홀짝', color: 'bg-orange-100 text-orange-800' },
  MULTI_CHOICE: { label: '다지선다', color: 'bg-cyan-100 text-cyan-800' },
  PREDICTION: { label: '예측', color: 'bg-pink-100 text-pink-800' },
};

export default function AdminEventsIndex() {
  const { events, pagination, filters, statusCounts } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const updateFilter = (key: string, value: string | null) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    newParams.delete('page');
    setSearchParams(newParams);
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">이벤트 관리</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            참여형 이벤트를 생성하고 관리합니다
          </p>
        </div>
        <Link to="/admin/events/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            새 이벤트
          </Button>
        </Link>
      </div>

      {/* 상태별 통계 카드 */}
      <div className="grid grid-cols-5 gap-4">
        {Object.entries(STATUS_CONFIG).map(([status, config]) => {
          const Icon = config.icon;
          const count = statusCounts[status as EventStatus] || 0;
          const isActive = filters.status === status;

          return (
            <button
              key={status}
              onClick={() => updateFilter('status', isActive ? null : status)}
              className={`p-4 rounded-lg border-2 transition-all ${
                isActive
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-transparent bg-white dark:bg-gray-800 hover:border-gray-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${config.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <div className="text-2xl font-bold">{count}</div>
                  <div className="text-sm text-gray-500">{config.label}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 필터 및 검색 */}
      <div className="flex gap-4 items-center bg-white dark:bg-gray-800 p-4 rounded-lg">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="이벤트 검색..."
            defaultValue={filters.search}
            onChange={(e) => updateFilter('search', e.target.value || null)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
          />
        </div>

        <select
          value={filters.type || ''}
          onChange={(e) => updateFilter('type', e.target.value || null)}
          className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
        >
          <option value="">모든 타입</option>
          {Object.entries(TYPE_CONFIG).map(([type, config]) => (
            <option key={type} value={type}>
              {config.label}
            </option>
          ))}
        </select>
      </div>

      {/* 이벤트 테이블 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                이벤트
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                타입
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                상태
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                기간
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                참여자
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                보상
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                액션
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {events.map((event) => {
              const statusConfig = STATUS_CONFIG[event.status];
              const typeConfig = TYPE_CONFIG[event.type];
              const StatusIcon = statusConfig.icon;

              return (
                <tr key={event.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {event.imageUrl ? (
                        <img
                          src={event.imageUrl}
                          alt={event.title}
                          className="w-10 h-10 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                          <Trophy className="w-5 h-5 text-white" />
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {event.title}
                        </div>
                        {event.description && (
                          <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">
                            {event.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${typeConfig.color}`}>
                      {typeConfig.label}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
                      <StatusIcon className="w-3 h-3" />
                      {statusConfig.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <span>
                        {format(new Date(event.startsAt), 'MM/dd HH:mm', { locale: ko })}
                      </span>
                      <span>~</span>
                      <span>
                        {format(new Date(event.endsAt), 'MM/dd HH:mm', { locale: ko })}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 text-gray-900 dark:text-gray-100">
                      <Users className="w-4 h-4" />
                      <span className="font-medium">{event._count.participations}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm">
                      <div className="text-gray-900 dark:text-gray-100 font-medium">
                        {event.rewardPool.toLocaleString()}P
                      </div>
                      <div className="text-gray-500 dark:text-gray-400">
                        x{event.rewardMultiplier}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link to={`/admin/events/${event.id}`}>
                        <Button variant="ghost" size="sm">
                          <Edit className="w-4 h-4" />
                        </Button>
                      </Link>
                      {event.status === 'CLOSED' && (
                        <Link to={`/admin/events/${event.id}/result`}>
                          <Button variant="ghost" size="sm" className="text-green-600">
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                        </Link>
                      )}
                      <Link to={`/events/${event.id}`} target="_blank">
                        <Button variant="ghost" size="sm">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}

            {events.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  이벤트가 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => {
                const newParams = new URLSearchParams(searchParams);
                newParams.set('page', p.toString());
                setSearchParams(newParams);
              }}
              className={`px-4 py-2 rounded-lg ${
                p === pagination.page
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
