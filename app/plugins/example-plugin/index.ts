/**
 * 예제 플러그인
 * 
 * 이 파일은 플러그인 개발을 위한 예제입니다.
 * 플러그인 구조와 각 기능의 사용 방법을 보여줍니다.
 */

import { IPlugin, IPluginMetadata, IHook, IPluginRoute, IPluginMenuItem, IPluginWidget } from '../../core/plugin-system/plugin.types';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 플러그인 메타데이터 정의
 * 플러그인의 기본 정보를 담고 있습니다
 */
const metadata: IPluginMetadata = {
  name: '예제 플러그인',
  version: '1.0.0',
  description: '플러그인 시스템을 시연하기 위한 예제 플러그인입니다',
  author: 'CodeB CMS',
  license: 'MIT',
  homepage: 'https://example.com/plugins/example',
  minCmsVersion: '1.0.0',
  dependencies: [],
  tags: ['example', 'demo', 'tutorial']
};

/**
 * 예제 플러그인 클래스
 * IPlugin 인터페이스를 구현합니다
 */
class ExamplePlugin implements IPlugin {
  id = 'example-plugin';
  metadata = metadata;

  /**
   * 플러그인 설정
   * 기본 설정값을 정의합니다
   */
  config = {
    enabled: true,
    priority: 50,
    settings: {
      apiKey: '',
      enableLogging: true,
      maxItems: 10,
      customMessage: '안녕하세요, 예제 플러그인입니다!'
    }
  };

  /**
   * 플러그인이 등록할 훅 목록
   * 시스템의 다양한 지점에서 코드를 실행할 수 있습니다
   */
  hooks: IHook[] = [
    {
      name: 'post_init',
      pluginId: this.id,
      priority: 10,
      callback: async (data) => {
        console.log('[예제 플러그인] 시스템 초기화 후 훅 실행됨');
        return data;
      }
    },
    {
      name: 'filter_content',
      pluginId: this.id,
      priority: 20,
      callback: async (content: string) => {
        // 콘텐츠에 플러그인 서명 추가
        if (this.config.settings.enableLogging) {
          console.log('[예제 플러그인] 콘텐츠 필터링 중...');
        }
        return content + '\n<!-- 예제 플러그인에 의해 처리됨 -->';
      }
    },
    {
      name: 'user_login',
      pluginId: this.id,
      callback: async (userData: any) => {
        console.log(`[예제 플러그인] 사용자 로그인: ${userData.username}`);
        // 로그인 시 추가 작업 수행 가능
        return userData;
      }
    }
  ];

  /**
   * 플러그인이 추가할 라우트 목록
   * API 엔드포인트를 추가할 수 있습니다
   */
  routes: IPluginRoute[] = [
    {
      path: '/api/plugins/example/hello',
      method: 'GET',
      handler: async (req: NextRequest) => {
        return NextResponse.json({
          message: this.config.settings.customMessage,
          timestamp: new Date().toISOString(),
          plugin: this.metadata.name
        });
      }
    },
    {
      path: '/api/plugins/example/data',
      method: 'POST',
      handler: async (req: NextRequest) => {
        try {
          const body = await req.json();
          
          // 간단한 검증
          if (!body.name) {
            return NextResponse.json(
              { error: 'name 필드가 필요합니다' },
              { status: 400 }
            );
          }

          // 데이터 처리 (예: 데이터베이스 저장)
          console.log('[예제 플러그인] 데이터 수신:', body);

          return NextResponse.json({
            success: true,
            data: {
              id: Math.random().toString(36).substr(2, 9),
              ...body,
              createdAt: new Date().toISOString()
            }
          });
        } catch (error) {
          return NextResponse.json(
            { error: '요청 처리 중 오류가 발생했습니다' },
            { status: 500 }
          );
        }
      }
    }
  ];

  /**
   * 플러그인이 추가할 메뉴 아이템 목록
   * 관리자 패널에 메뉴를 추가할 수 있습니다
   */
  menuItems: IPluginMenuItem[] = [
    {
      id: 'example-main',
      title: '예제 플러그인',
      path: '/admin/plugins/example',
      icon: '🔌',
      order: 100,
      permissions: ['admin', 'editor']
    },
    {
      id: 'example-settings',
      title: '예제 설정',
      path: '/admin/plugins/example/settings',
      parentId: 'example-main',
      order: 1
    },
    {
      id: 'example-logs',
      title: '활동 로그',
      path: '/admin/plugins/example/logs',
      parentId: 'example-main',
      order: 2
    }
  ];

  /**
   * 플러그인이 추가할 위젯 목록
   * 대시보드나 다른 영역에 위젯을 추가할 수 있습니다
   */
  widgets: IPluginWidget[] = [
    {
      id: 'example-stats',
      title: '예제 통계',
      zone: 'dashboard',
      size: 'medium',
      order: 50,
      component: async () => {
        // 실제로는 React 컴포넌트를 반환해야 합니다
        // 여기서는 예시를 위해 문자열 반환
        return '<div>예제 플러그인 통계 위젯</div>';
      }
    },
    {
      id: 'example-info',
      title: '플러그인 정보',
      zone: 'sidebar',
      size: 'small',
      order: 100,
      component: async () => {
        return `<div>
          <h4>${this.metadata.name}</h4>
          <p>버전: ${this.metadata.version}</p>
          <p>${this.metadata.description}</p>
        </div>`;
      }
    }
  ];

  /**
   * 플러그인 설치 시 호출되는 메서드
   * 데이터베이스 테이블 생성, 초기 데이터 삽입 등을 수행합니다
   */
  async onInstall(): Promise<void> {
    console.log('[예제 플러그인] 설치 중...');
    
    // 데이터베이스 테이블 생성 예시
    // await db.createTable('example_plugin_data', { ... });
    
    // 초기 설정 저장
    // await db.saveSettings('example_plugin', this.config.settings);
    
    console.log('[예제 플러그인] 설치 완료!');
  }

  /**
   * 플러그인 제거 시 호출되는 메서드
   * 데이터 정리, 테이블 삭제 등을 수행합니다
   */
  async onUninstall(): Promise<void> {
    console.log('[예제 플러그인] 제거 중...');
    
    // 데이터베이스 테이블 삭제 예시
    // await db.dropTable('example_plugin_data');
    
    // 설정 삭제
    // await db.deleteSettings('example_plugin');
    
    console.log('[예제 플러그인] 제거 완료!');
  }

  /**
   * 플러그인 활성화 시 호출되는 메서드
   * 필요한 리소스를 준비하고 서비스를 시작합니다
   */
  async onActivate(): Promise<void> {
    console.log('[예제 플러그인] 활성화 중...');
    
    // 캐시 초기화
    // await cache.set('example_plugin_active', true);
    
    // 백그라운드 작업 시작
    // this.startBackgroundJobs();
    
    console.log('[예제 플러그인] 활성화 완료!');
  }

  /**
   * 플러그인 비활성화 시 호출되는 메서드
   * 실행 중인 작업을 중지하고 리소스를 정리합니다
   */
  async onDeactivate(): Promise<void> {
    console.log('[예제 플러그인] 비활성화 중...');
    
    // 백그라운드 작업 중지
    // this.stopBackgroundJobs();
    
    // 캐시 정리
    // await cache.delete('example_plugin_active');
    
    console.log('[예제 플러그인] 비활성화 완료!');
  }

  /**
   * 플러그인 업데이트 시 호출되는 메서드
   * 버전 간 마이그레이션을 수행합니다
   */
  async onUpdate(previousVersion: string): Promise<void> {
    console.log(`[예제 플러그인] 업데이트 중... (${previousVersion} → ${this.metadata.version})`);
    
    // 버전별 마이그레이션 로직
    if (previousVersion < '1.0.0') {
      // 1.0.0 이전 버전에서 업데이트 시 처리
      console.log('[예제 플러그인] 1.0.0 마이그레이션 수행');
    }
    
    console.log('[예제 플러그인] 업데이트 완료!');
  }

  /**
   * 플러그인 초기화 메서드
   * 플러그인이 로드될 때 호출됩니다
   */
  async init(): Promise<void> {
    console.log('[예제 플러그인] 초기화 중...');
    
    // API 키 검증
    if (this.config.settings.apiKey) {
      // await this.validateApiKey(this.config.settings.apiKey);
    }
    
    // 필요한 리소스 로드
    // await this.loadResources();
    
    console.log('[예제 플러그인] 초기화 완료!');
  }

  /**
   * 플러그인 정리 메서드
   * 플러그인이 언로드될 때 호출됩니다
   */
  async cleanup(): Promise<void> {
    console.log('[예제 플러그인] 정리 중...');
    
    // 열린 연결 닫기
    // await this.closeConnections();
    
    // 임시 파일 삭제
    // await this.deleteTempFiles();
    
    console.log('[예제 플러그인] 정리 완료!');
  }

  /**
   * 내부 헬퍼 메서드들
   */
  
  private startBackgroundJobs(): void {
    // 주기적인 작업 시작
    console.log('[예제 플러그인] 백그라운드 작업 시작');
  }

  private stopBackgroundJobs(): void {
    // 주기적인 작업 중지
    console.log('[예제 플러그인] 백그라운드 작업 중지');
  }

  private async loadResources(): Promise<void> {
    // 필요한 리소스 로드
    console.log('[예제 플러그인] 리소스 로드 중...');
  }

  private async closeConnections(): Promise<void> {
    // 연결 정리
    console.log('[예제 플러그인] 연결 닫는 중...');
  }
}

// 플러그인 인스턴스 내보내기
export default new ExamplePlugin();