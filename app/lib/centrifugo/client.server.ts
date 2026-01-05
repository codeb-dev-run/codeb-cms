/**
 * Centrifugo 서버 사이드 API 클라이언트
 * 백엔드에서 Centrifugo API를 호출하여 메시지 발행
 */

const API_URL = process.env.CENTRIFUGO_API_URL || 'http://localhost:8000/api';
const API_KEY = process.env.CENTRIFUGO_API_KEY || '';

interface PublishParams {
  channel: string;
  data: any;
}

interface BroadcastParams {
  channels: string[];
  data: any;
}

interface PresenceResult {
  presence: Record<string, {
    client: string;
    user: string;
    conn_info?: Record<string, any>;
    chan_info?: Record<string, any>;
  }>;
}

interface PresenceStatsResult {
  num_clients: number;
  num_users: number;
}

interface HistoryResult {
  publications: Array<{
    data: any;
    offset: number;
    info?: {
      client: string;
      user: string;
    };
  }>;
  offset: number;
  epoch: string;
}

class CentrifugoServer {
  private async request<T>(method: string, params: Record<string, any> = {}): Promise<T> {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `apikey ${API_KEY}`,
      },
      body: JSON.stringify({
        method,
        params,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Centrifugo API error: ${response.status} ${text}`);
    }

    const result = await response.json();

    if (result.error) {
      throw new Error(`Centrifugo error: ${result.error.message}`);
    }

    return result.result;
  }

  /**
   * 채널에 메시지 발행
   */
  async publish(channel: string, data: any): Promise<void> {
    await this.request('publish', { channel, data });
  }

  /**
   * 여러 채널에 동시 발행
   */
  async broadcast(channels: string[], data: any): Promise<void> {
    await this.request('broadcast', { channels, data });
  }

  /**
   * 채널의 현재 접속자 목록 조회
   */
  async presence(channel: string): Promise<PresenceResult> {
    return this.request<PresenceResult>('presence', { channel });
  }

  /**
   * 채널의 접속자 통계 조회
   */
  async presenceStats(channel: string): Promise<PresenceStatsResult> {
    return this.request<PresenceStatsResult>('presence_stats', { channel });
  }

  /**
   * 채널 히스토리 조회
   */
  async history(
    channel: string,
    options?: { limit?: number; since?: { offset: number; epoch: string } }
  ): Promise<HistoryResult> {
    return this.request<HistoryResult>('history', {
      channel,
      ...options,
    });
  }

  /**
   * 특정 사용자의 모든 연결 종료
   */
  async disconnect(userId: string): Promise<void> {
    await this.request('disconnect', { user: userId });
  }

  /**
   * 특정 사용자를 채널에서 구독 해제
   */
  async unsubscribe(userId: string, channel: string): Promise<void> {
    await this.request('unsubscribe', { user: userId, channel });
  }

  /**
   * 채널 구독자 수 조회
   */
  async channelSubscribers(channel: string): Promise<number> {
    const stats = await this.presenceStats(channel);
    return stats.num_users;
  }

  /**
   * 서버 정보 조회
   */
  async info(): Promise<{
    nodes: Array<{
      uid: string;
      name: string;
      num_clients: number;
      num_users: number;
      num_channels: number;
    }>;
  }> {
    return this.request('info');
  }
}

// 싱글톤 인스턴스
export const centrifugo = new CentrifugoServer();

// 편의 함수들
export async function publishToChannel(channel: string, data: any): Promise<void> {
  return centrifugo.publish(channel, data);
}

export async function broadcastToChannels(channels: string[], data: any): Promise<void> {
  return centrifugo.broadcast(channels, data);
}

export async function getChannelPresence(channel: string): Promise<PresenceResult> {
  return centrifugo.presence(channel);
}

export async function getOnlineUserCount(channel: string): Promise<number> {
  return centrifugo.channelSubscribers(channel);
}
