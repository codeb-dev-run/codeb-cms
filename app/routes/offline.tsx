/**
 * 오프라인 페이지
 */

import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '~/components/ui/button';

export default function OfflinePage() {
  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="mx-auto w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6">
          <WifiOff className="w-10 h-10 text-gray-400" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          오프라인 상태
        </h1>

        <p className="text-gray-600 dark:text-gray-400 mb-6">
          인터넷 연결이 끊어졌습니다.<br />
          연결 상태를 확인한 후 다시 시도해주세요.
        </p>

        <div className="space-y-3">
          <Button onClick={handleRefresh} className="w-full">
            <RefreshCw className="w-4 h-4 mr-2" />
            다시 시도
          </Button>

          <p className="text-xs text-gray-500 dark:text-gray-500">
            일부 기능은 오프라인에서도 사용 가능합니다.<br />
            연결이 복구되면 자동으로 동기화됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
