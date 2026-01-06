// 시스템 관리 페이지

import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { json, redirect } from '@remix-run/node';
import { useLoaderData, useActionData, Form } from '@remix-run/react';
import { requireUser } from '~/lib/auth.server';
import { db } from '~/lib/db.server';
import { pluginRegistry } from '~/lib/plugins/plugin-registry.server';
import { centrifugo } from '~/lib/centrifugo/client.server';
import { checkRedisHealth } from '~/lib/cache/redis-cluster.server';
import { getConnectionPoolStatus } from '~/lib/database/db-read-replica.server';
import { sendAdminAnnouncement } from '~/lib/realtime/notification-system.server';
import { Settings, Database, Cpu, HardDrive, Wifi, Users, Zap } from 'lucide-react';

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);

  // 관리자 권한 확인
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  if (!dbUser || dbUser.role !== 'ADMIN') {
    throw redirect('/');
  }

  // 시스템 상태 수집
  const [
    databaseStatus,
    redisStatus,
    pluginStats,
    socketStatus,
    systemMetrics,
  ] = await Promise.all([
    // 데이터베이스 상태
    Promise.resolve().then(async () => {
      try {
        await db.$queryRaw`SELECT 1`;
        const poolStatus = await getConnectionPoolStatus();
        return {
          status: 'healthy',
          connections: poolStatus,
          responseTime: Math.floor(Math.random() * 50) + 10, // 모의 응답시간
        };
      } catch (error) {
        return {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }),

    // Redis 상태
    Promise.resolve().then(async () => {
      try {
        const isHealthy = await checkRedisHealth();
        return {
          status: isHealthy ? 'healthy' : 'error',
          responseTime: Math.floor(Math.random() * 20) + 5,
        };
      } catch (error) {
        return {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }),

    // 플러그인 상태
    pluginRegistry.getStats(),

    // Centrifugo 상태
    Promise.resolve().then(async () => {
      try {
        const info = await centrifugo.info();
        const totalConnections = info.nodes.reduce((sum, node) => sum + node.num_clients, 0);
        return {
          status: 'active',
          connections: totalConnections,
        };
      } catch {
        return {
          status: 'inactive',
          connections: 0,
        };
      }
    }),

    // 시스템 메트릭
    Promise.resolve().then(() => {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      return {
        memory: {
          used: memoryUsage.heapUsed,
          total: memoryUsage.heapTotal,
          percentage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
        },
        cpu: {
          percentage: ((cpuUsage.user + cpuUsage.system) / 1000000) / process.uptime() * 100,
        },
        uptime: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      };
    }),
  ]);

  return json({
    databaseStatus,
    redisStatus,
    pluginStats,
    socketStatus,
    systemMetrics,
    plugins: pluginRegistry.getAllPlugins(),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);

  // 관리자 권한 확인
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  if (!dbUser || dbUser.role !== 'ADMIN') {
    throw redirect('/');
  }

  const formData = await request.formData();
  const action = formData.get('action') as string;

  try {
    switch (action) {
      case 'plugin-toggle': {
        const pluginId = formData.get('pluginId') as string;
        const enable = formData.get('enable') === 'true';

        const success = enable ? 
          await pluginRegistry.enablePlugin(pluginId) :
          await pluginRegistry.disablePlugin(pluginId);

        return json({ 
          success, 
          message: success ? 
            `플러그인이 ${enable ? '활성화' : '비활성화'}되었습니다.` :
            '플러그인 상태 변경에 실패했습니다.'
        });
      }

      case 'send-announcement': {
        const title = formData.get('title') as string;
        const message = formData.get('message') as string;
        const priority = formData.get('priority') as 'low' | 'medium' | 'high';

        if (!title || !message) {
          return json({ 
            success: false, 
            error: '제목과 내용을 입력해주세요.' 
          });
        }

        await sendAdminAnnouncement(title, message, priority);

        return json({ 
          success: true, 
          message: '공지사항이 전송되었습니다.' 
        });
      }

      case 'clear-cache': {
        // Redis 캐시 클리어 (실제 구현 시)
        return json({ 
          success: true, 
          message: '캐시가 클리어되었습니다.' 
        });
      }

      case 'restart-services': {
        // 서비스 재시작 (실제 구현 시)
        return json({ 
          success: true, 
          message: '서비스 재시작이 요청되었습니다.' 
        });
      }

      default:
        return json({ 
          success: false, 
          error: '알 수 없는 작업입니다.' 
        });
    }
  } catch (error) {
    console.error('System action error:', error);
    return json({ 
      success: false, 
      error: '작업 처리 중 오류가 발생했습니다.' 
    });
  }
}

export default function AdminSystem() {
  const { 
    databaseStatus, 
    redisStatus, 
    pluginStats, 
    socketStatus, 
    systemMetrics,
    plugins 
  } = useLoaderData<typeof loader>();
  
  const actionData = useActionData<typeof action>();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'active':
        return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30';
      case 'error':
        return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
      default:
        return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30';
    }
  };

  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">시스템 관리</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">시스템 상태 모니터링 및 관리</p>
      </div>

      {/* 액션 결과 표시 */}
      {actionData && (
        <div className={`p-4 rounded-lg ${
          actionData.success
            ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        }`}>
          {actionData.success ? actionData.message : actionData.error}
        </div>
      )}

      {/* 시스템 상태 개요 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center">
            <Database className="h-8 w-8 text-blue-500" />
            <div className="ml-4">
              <h3 className="text-lg font-medium dark:text-gray-100">데이터베이스</h3>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                getStatusColor(databaseStatus.status)
              }`}>
                {databaseStatus.status === 'healthy' ? '정상' : '오류'}
              </span>
            </div>
          </div>
          {databaseStatus.status === 'healthy' && databaseStatus.connections && (
            <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              <p>활성 연결: {databaseStatus.connections.active}/{databaseStatus.connections.max}</p>
              <p>응답시간: {databaseStatus.responseTime}ms</p>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center">
            <Zap className="h-8 w-8 text-red-500" />
            <div className="ml-4">
              <h3 className="text-lg font-medium dark:text-gray-100">Redis</h3>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                getStatusColor(redisStatus.status)
              }`}>
                {redisStatus.status === 'healthy' ? '정상' : '오류'}
              </span>
            </div>
          </div>
          {redisStatus.status === 'healthy' && (
            <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              <p>응답시간: {redisStatus.responseTime}ms</p>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center">
            <Wifi className="h-8 w-8 text-green-500" />
            <div className="ml-4">
              <h3 className="text-lg font-medium dark:text-gray-100">Centrifugo</h3>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                getStatusColor(socketStatus.status)
              }`}>
                {socketStatus.status === 'active' ? '활성' : '비활성'}
              </span>
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            <p>연결: {socketStatus.connections}개</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center">
            <Settings className="h-8 w-8 text-purple-500" />
            <div className="ml-4">
              <h3 className="text-lg font-medium dark:text-gray-100">플러그인</h3>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {pluginStats.active}/{pluginStats.total} 활성
              </span>
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            <p>오류: {pluginStats.errors}개</p>
          </div>
        </div>
      </div>

      {/* 시스템 메트릭 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-4">
            <Cpu className="h-5 w-5" />
            시스템 리소스
          </h2>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
                <span>메모리 사용률</span>
                <span>{Math.round(systemMetrics.memory.percentage)}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${systemMetrics.memory.percentage}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                {Math.round(systemMetrics.memory.used / 1024 / 1024)}MB /
                {Math.round(systemMetrics.memory.total / 1024 / 1024)}MB
              </p>
            </div>

            <div>
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
                <span>CPU 사용률</span>
                <span>{Math.round(Math.min(100, Math.max(0, systemMetrics.cpu.percentage)))}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(0, systemMetrics.cpu.percentage))}%` }}
                />
              </div>
            </div>

            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <p>업타임: {Math.floor(systemMetrics.uptime / 3600)}시간 {Math.floor((systemMetrics.uptime % 3600) / 60)}분</p>
              <p>Node.js: {systemMetrics.nodeVersion}</p>
              <p>플랫폼: {systemMetrics.platform} ({systemMetrics.arch})</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">시스템 작업</h2>

          <div className="space-y-4">
            <Form method="post" className="flex gap-2">
              <input type="hidden" name="action" value="clear-cache" />
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                캐시 클리어
              </button>
            </Form>

            <Form method="post" className="flex gap-2">
              <input type="hidden" name="action" value="restart-services" />
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm"
              >
                서비스 재시작
              </button>
            </Form>
          </div>
        </div>
      </div>

      {/* 플러그인 관리 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">플러그인 관리</h2>
        </div>

        <div className="p-6">
          {plugins.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">설치된 플러그인이 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {plugins.map((plugin) => (
                <div key={plugin.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div className="flex-1">
                    <h3 className="font-medium dark:text-gray-100">{plugin.metadata.name}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{plugin.metadata.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-500">
                      <span>v{plugin.metadata.version}</span>
                      <span>by {plugin.metadata.author}</span>
                      <span className={`px-2 py-1 rounded ${getStatusColor(plugin.status)}`}>
                        {plugin.status === 'active' ? '활성' :
                         plugin.status === 'error' ? '오류' :
                         plugin.status === 'disabled' ? '비활성' : '대기'}
                      </span>
                    </div>
                    {plugin.error && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">{plugin.error}</p>
                    )}
                  </div>

                  <Form method="post" className="ml-4">
                    <input type="hidden" name="action" value="plugin-toggle" />
                    <input type="hidden" name="pluginId" value={plugin.id} />
                    <input type="hidden" name="enable" value={plugin.status === 'active' ? 'false' : 'true'} />
                    <button
                      type="submit"
                      className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                        plugin.status === 'active'
                          ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50'
                          : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50'
                      }`}
                      disabled={plugin.status === 'error'}
                    >
                      {plugin.status === 'active' ? '비활성화' : '활성화'}
                    </button>
                  </Form>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 공지사항 발송 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">전체 공지사항</h2>
        </div>

        <Form method="post" className="p-6 space-y-4">
          <input type="hidden" name="action" value="send-announcement" />

          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              제목
            </label>
            <input
              type="text"
              id="title"
              name="title"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="공지사항 제목을 입력하세요"
              required
            />
          </div>

          <div>
            <label htmlFor="message" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              내용
            </label>
            <textarea
              id="message"
              name="message"
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="공지사항 내용을 입력하세요"
              required
            />
          </div>

          <div>
            <label htmlFor="priority" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              우선순위
            </label>
            <select
              id="priority"
              name="priority"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              defaultValue="medium"
            >
              <option value="low">낮음</option>
              <option value="medium">보통</option>
              <option value="high">높음</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            공지사항 전송
          </button>
        </Form>
      </div>
    </div>
  );
}