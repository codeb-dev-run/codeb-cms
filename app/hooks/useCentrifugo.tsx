/**
 * Centrifugo React Hook
 * 컴포넌트에서 실시간 통신을 위한 훅
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { getCentrifugoClient, CentrifugoClient, SubscriptionOptions } from '~/lib/centrifugo/client.client';
import type { Subscription, PublicationContext } from 'centrifuge';

interface UseCentrifugoOptions {
  /** 자동 연결 여부 (기본: true) */
  autoConnect?: boolean;
  /** 연결 완료 시 콜백 */
  onConnect?: () => void;
  /** 연결 해제 시 콜백 */
  onDisconnect?: (code: number, reason: string) => void;
  /** 에러 발생 시 콜백 */
  onError?: (error: Error) => void;
}

interface UseCentrifugoReturn {
  /** 연결 상태 */
  isConnected: boolean;
  /** 연결 중 상태 */
  isConnecting: boolean;
  /** 에러 상태 */
  error: Error | null;
  /** 수동 연결 */
  connect: (token: string) => void;
  /** 연결 해제 */
  disconnect: () => void;
  /** 채널 구독 */
  subscribe: (channel: string, options?: SubscriptionOptions) => Subscription | null;
  /** 채널 구독 해제 */
  unsubscribe: (channel: string) => void;
  /** 클라이언트 인스턴스 */
  client: CentrifugoClient | null;
}

/**
 * Centrifugo 연결 관리 훅
 */
export function useCentrifugo(options: UseCentrifugoOptions = {}): UseCentrifugoReturn {
  const { autoConnect = true, onConnect, onDisconnect, onError } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const clientRef = useRef<CentrifugoClient | null>(null);
  const tokenFetchedRef = useRef(false);

  // 토큰 가져오기
  const fetchToken = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch('/api/centrifugo/token');
      if (!response.ok) {
        throw new Error('Failed to fetch token');
      }
      const data = await response.json();
      return data.token;
    } catch (err) {
      console.error('Failed to fetch Centrifugo token:', err);
      return null;
    }
  }, []);

  // 연결 함수
  const connect = useCallback((token: string) => {
    if (clientRef.current?.isConnected) {
      return;
    }

    setIsConnecting(true);
    setError(null);

    const client = getCentrifugoClient();
    clientRef.current = client;

    client.connect({
      token,
      onConnect: () => {
        setIsConnected(true);
        setIsConnecting(false);
        onConnect?.();
      },
      onDisconnect: (code, reason) => {
        setIsConnected(false);
        setIsConnecting(false);
        onDisconnect?.(code, reason);
      },
      onError: (err) => {
        setError(err);
        setIsConnecting(false);
        onError?.(err);
      },
    });
  }, [onConnect, onDisconnect, onError]);

  // 연결 해제 함수
  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  // 구독 함수
  const subscribe = useCallback((channel: string, subscriptionOptions?: SubscriptionOptions) => {
    if (!clientRef.current) {
      console.error('Centrifugo client not initialized');
      return null;
    }
    return clientRef.current.subscribe(channel, subscriptionOptions);
  }, []);

  // 구독 해제 함수
  const unsubscribe = useCallback((channel: string) => {
    clientRef.current?.unsubscribe(channel);
  }, []);

  // 자동 연결
  useEffect(() => {
    if (!autoConnect || tokenFetchedRef.current) {
      return;
    }

    tokenFetchedRef.current = true;

    (async () => {
      const token = await fetchToken();
      if (token) {
        connect(token);
      }
    })();

    return () => {
      // 컴포넌트 언마운트 시 연결 해제하지 않음 (싱글톤)
      // disconnect();
    };
  }, [autoConnect, fetchToken, connect]);

  return {
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    client: clientRef.current,
  };
}

/**
 * 특정 채널 구독 훅
 */
interface UseChannelOptions<T> {
  /** 초기 데이터 */
  initialData?: T;
  /** 메시지 수신 시 콜백 */
  onMessage?: (data: T) => void;
  /** 구독용 토큰 (비공개 채널) */
  token?: string;
}

interface UseChannelReturn<T> {
  /** 최신 데이터 */
  data: T | null;
  /** 구독 상태 */
  isSubscribed: boolean;
  /** 에러 */
  error: Error | null;
  /** 수동 구독 해제 */
  unsubscribe: () => void;
}

export function useChannel<T = any>(
  channel: string | null,
  options: UseChannelOptions<T> = {}
): UseChannelReturn<T> {
  const { initialData, onMessage, token } = options;
  const { isConnected, subscribe, unsubscribe: unsubscribeChannel } = useCentrifugo({ autoConnect: true });

  const [data, setData] = useState<T | null>(initialData ?? null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const subscriptionRef = useRef<Subscription | null>(null);
  const channelRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isConnected || !channel) {
      return;
    }

    // 채널이 변경된 경우 이전 구독 해제
    if (channelRef.current && channelRef.current !== channel) {
      unsubscribeChannel(channelRef.current);
    }

    channelRef.current = channel;

    const sub = subscribe(channel, {
      token,
      onPublication: (ctx: PublicationContext) => {
        const newData = ctx.data as T;
        setData(newData);
        onMessage?.(newData);
      },
      onSubscribed: () => {
        setIsSubscribed(true);
        setError(null);
      },
      onUnsubscribed: () => {
        setIsSubscribed(false);
      },
      onError: (err) => {
        setError(err);
      },
    });

    subscriptionRef.current = sub;

    return () => {
      if (channelRef.current) {
        unsubscribeChannel(channelRef.current);
      }
    };
  }, [isConnected, channel, token, subscribe, unsubscribeChannel, onMessage]);

  const unsubscribe = useCallback(() => {
    if (channel) {
      unsubscribeChannel(channel);
    }
  }, [channel, unsubscribeChannel]);

  return {
    data,
    isSubscribed,
    error,
    unsubscribe,
  };
}

/**
 * 이벤트 실시간 통계 구독 훅
 */
interface EventStats {
  totalParticipants: number;
  options: Array<{
    id: string;
    count: number;
    percentage: number;
  }>;
  recentParticipants: Array<{
    userId: string;
    username: string;
    choice: string;
    timestamp: number;
  }>;
}

export function useEventStats(eventId: string | null) {
  return useChannel<EventStats>(
    eventId ? `event:stats:${eventId}` : null,
    {
      initialData: {
        totalParticipants: 0,
        options: [],
        recentParticipants: [],
      },
    }
  );
}

/**
 * 리더보드 실시간 구독 훅
 */
interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatar?: string;
  points: number;
  wins: number;
  winRate: number;
}

interface LeaderboardData {
  entries: LeaderboardEntry[];
  updatedAt: number;
}

export function useLeaderboard(period: 'daily' | 'weekly' | 'monthly' | 'all_time' = 'all_time') {
  const channel = period === 'daily'
    ? 'leaderboard:daily'
    : period === 'weekly'
    ? 'leaderboard:weekly'
    : 'leaderboard:global';

  return useChannel<LeaderboardData>(channel, {
    initialData: {
      entries: [],
      updatedAt: 0,
    },
  });
}

/**
 * 관리자 실시간 메트릭 구독 훅
 */
interface AdminMetrics {
  activeUsers: number;
  participationsPerMin: number;
  pointsToday: number;
  activeEvents: number;
  serverLoad: number;
}

export function useAdminMetrics() {
  return useChannel<AdminMetrics>('$admin:metrics');
}

/**
 * 개인 알림 구독 훅
 */
interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  createdAt: number;
}

export function usePersonalNotifications(
  userId: string | null,
  onNotification?: (notification: Notification) => void
) {
  return useChannel<Notification>(
    userId ? `$user:${userId}` : null,
    {
      onMessage: onNotification,
    }
  );
}
