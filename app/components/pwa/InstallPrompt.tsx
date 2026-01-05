/**
 * PWA 설치 프롬프트 컴포넌트
 */

import { useState, useEffect } from 'react';
import { X, Download, Smartphone } from 'lucide-react';
import { Button } from '~/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    // 이미 설치되었거나 배너를 닫은 경우 표시하지 않음
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10);
      const weekInMs = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - dismissedTime < weekInMs) {
        return;
      }
    }

    // iOS 감지
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    // iOS에서 Safari가 아니면 표시하지 않음
    if (isIOSDevice) {
      const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
      const isStandalone = (window.navigator as any).standalone;

      if (isSafari && !isStandalone) {
        setShowBanner(true);
      }
      return;
    }

    // Android/데스크탑: beforeinstallprompt 이벤트 리스닝
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // 이미 설치되었는지 확인
    window.addEventListener('appinstalled', () => {
      setShowBanner(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      if (isIOS) {
        setShowIOSInstructions(true);
      }
      return;
    }

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setShowBanner(false);
    }

    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setShowIOSInstructions(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  if (!showBanner) return null;

  return (
    <>
      {/* 설치 배너 */}
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-4 z-50 animate-in slide-in-from-bottom-4">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
            <Smartphone className="w-8 h-8 text-white" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 dark:text-gray-100">
              앱으로 설치하기
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              홈 화면에 추가하여 더 빠르게 접속하세요
            </p>

            <div className="flex gap-2 mt-3">
              <Button onClick={handleInstall} size="sm" className="flex-1">
                <Download className="w-4 h-4 mr-2" />
                설치
              </Button>
              <Button onClick={handleDismiss} variant="ghost" size="sm">
                나중에
              </Button>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* iOS 설치 안내 모달 */}
      {showIOSInstructions && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm overflow-hidden animate-in slide-in-from-bottom-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  홈 화면에 추가하기
                </h3>
                <button onClick={handleDismiss} className="text-gray-400">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <ol className="space-y-4 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs">
                    1
                  </span>
                  <span>
                    Safari 하단의 <strong>공유</strong> 버튼을 탭하세요
                    <span className="inline-block ml-1">⬆️</span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs">
                    2
                  </span>
                  <span>
                    스크롤하여 <strong>홈 화면에 추가</strong>를 찾아 탭하세요
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs">
                    3
                  </span>
                  <span>
                    우측 상단의 <strong>추가</strong>를 탭하세요
                  </span>
                </li>
              </ol>

              <Button onClick={handleDismiss} className="w-full mt-6">
                확인
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
