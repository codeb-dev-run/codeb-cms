/**
 * Centrifugo 클라이언트 사이드 연결 관리
 * 브라우저에서 Centrifugo 서버에 연결
 */

import { Centrifuge, Subscription, PublicationContext } from 'centrifuge';

const CENTRIFUGO_URL = typeof window !== 'undefined'
  ? (window as any).__CENTRIFUGO_URL__ || 'wss://ws.codeb.kr/connection/websocket'
  : '';

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

interface CentrifugoClientOptions {
  token: string;
  onConnect?: () => void;
  onDisconnect?: (code: number, reason: string) => void;
  onError?: (error: Error) => void;
}

interface SubscriptionOptions {
  onPublication?: (ctx: PublicationContext) => void;
  onSubscribed?: () => void;
  onUnsubscribed?: () => void;
  onError?: (error: Error) => void;
  token?: string; // 비공개 채널용
}

class CentrifugoClient {
  private centrifuge: Centrifuge | null = null;
  private subscriptions: Map<string, Subscription> = new Map();
  private connectionState: ConnectionState = 'disconnected';
  private tokenGetter: (() => Promise<string>) | null = null;

  /**
   * Centrifugo에 연결
   */
  connect(options: CentrifugoClientOptions): void {
    if (this.centrifuge) {
      console.warn('Already connected to Centrifugo');
      return;
    }

    this.connectionState = 'connecting';

    this.centrifuge = new Centrifuge(CENTRIFUGO_URL, {
      token: options.token,
      // 토큰 갱신 함수 (만료 시 호출)
      getToken: this.tokenGetter || undefined,
    });

    this.centrifuge.on('connected', () => {
      this.connectionState = 'connected';
      options.onConnect?.();
    });

    this.centrifuge.on('disconnected', (ctx) => {
      this.connectionState = 'disconnected';
      options.onDisconnect?.(ctx.code, ctx.reason);
    });

    this.centrifuge.on('error', (ctx) => {
      options.onError?.(new Error(ctx.error?.message || 'Unknown error'));
    });

    this.centrifuge.connect();
  }

  /**
   * 연결 종료
   */
  disconnect(): void {
    if (this.centrifuge) {
      // 모든 구독 해제
      this.subscriptions.forEach((sub) => sub.unsubscribe());
      this.subscriptions.clear();

      this.centrifuge.disconnect();
      this.centrifuge = null;
      this.connectionState = 'disconnected';
    }
  }

  /**
   * 토큰 갱신 함수 설정
   */
  setTokenGetter(getter: () => Promise<string>): void {
    this.tokenGetter = getter;
  }

  /**
   * 채널 구독
   */
  subscribe(channel: string, options: SubscriptionOptions = {}): Subscription | null {
    if (!this.centrifuge) {
      console.error('Not connected to Centrifugo');
      return null;
    }

    // 이미 구독 중인 경우 기존 구독 반환
    if (this.subscriptions.has(channel)) {
      return this.subscriptions.get(channel)!;
    }

    const sub = this.centrifuge.newSubscription(channel, {
      token: options.token,
      // 비공개 채널 토큰 갱신
      getToken: options.token
        ? async () => {
            const response = await fetch(`/api/centrifugo/subscription-token?channel=${encodeURIComponent(channel)}`);
            const data = await response.json();
            return data.token;
          }
        : undefined,
    });

    sub.on('publication', (ctx) => {
      options.onPublication?.(ctx);
    });

    sub.on('subscribed', () => {
      options.onSubscribed?.();
    });

    sub.on('unsubscribed', () => {
      options.onUnsubscribed?.();
      this.subscriptions.delete(channel);
    });

    sub.on('error', (ctx) => {
      options.onError?.(new Error(ctx.error?.message || 'Subscription error'));
    });

    sub.subscribe();
    this.subscriptions.set(channel, sub);

    return sub;
  }

  /**
   * 채널 구독 해제
   */
  unsubscribe(channel: string): void {
    const sub = this.subscriptions.get(channel);
    if (sub) {
      sub.unsubscribe();
      this.subscriptions.delete(channel);
    }
  }

  /**
   * 연결 상태 확인
   */
  get isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  /**
   * 현재 연결 상태
   */
  get state(): ConnectionState {
    return this.connectionState;
  }

  /**
   * 구독 중인 채널 목록
   */
  get channels(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * 특정 채널 구독 여부
   */
  isSubscribed(channel: string): boolean {
    return this.subscriptions.has(channel);
  }

  /**
   * RPC 호출 (서버 측 처리 필요)
   */
  async rpc<T = any>(method: string, data: any): Promise<T> {
    if (!this.centrifuge) {
      throw new Error('Not connected to Centrifugo');
    }

    const result = await this.centrifuge.rpc(method, data);
    return result.data as T;
  }

  /**
   * 채널에 메시지 발행 (클라이언트 사이드 발행)
   * 주의: Centrifugo 설정에서 publish 권한이 필요
   */
  async publish(channel: string, data: any): Promise<void> {
    const sub = this.subscriptions.get(channel);
    if (!sub) {
      throw new Error(`Not subscribed to channel: ${channel}`);
    }

    await sub.publish(data);
  }
}

// 싱글톤 인스턴스
let clientInstance: CentrifugoClient | null = null;

export function getCentrifugoClient(): CentrifugoClient {
  if (!clientInstance) {
    clientInstance = new CentrifugoClient();
  }
  return clientInstance;
}

export function resetCentrifugoClient(): void {
  if (clientInstance) {
    clientInstance.disconnect();
    clientInstance = null;
  }
}

export { CentrifugoClient };
export type { CentrifugoClientOptions, SubscriptionOptions };
