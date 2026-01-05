/**
 * UI 설정 관리 시스템
 * 데이터베이스 기반 UI 설정 저장 및 관리
 */
import { db } from '~/lib/db.server';
import { getRedisCluster } from './redis/cluster.server';
import { z } from 'zod';

// UI 설정 스키마 정의
const UIConfigSchema = z.object({
  header: z.object({
    logo: z.string().url().optional(),
    title: z.string().min(1).max(100),
    subtitle: z.string().max(200).optional(),
    showSearch: z.boolean().default(true),
    showNavigation: z.boolean().default(true),
    ctaButton: z.object({
      text: z.string().max(50),
      url: z.string().url(),
      enabled: z.boolean().default(true),
    }).optional(),
  }),
  
  footer: z.object({
    enabled: z.boolean().default(true),
    copyright: z.string().max(200).optional(),
    columns: z.array(
      z.object({
        title: z.string().max(50),
        links: z.array(
          z.object({
            text: z.string().max(50),
            url: z.string().url(),
            external: z.boolean().default(false),
          })
        ).max(10),
      })
    ).max(4),
    social: z.object({
      enabled: z.boolean().default(false),
      links: z.array(
        z.object({
          platform: z.enum(['facebook', 'twitter', 'instagram', 'youtube', 'linkedin']),
          url: z.string().url(),
        })
      ).max(5),
    }).optional(),
  }),
  
  homepage: z.object({
    hero: z.object({
      enabled: z.boolean().default(true),
      title: z.string().max(200),
      subtitle: z.string().max(500).optional(),
      backgroundImage: z.string().url().optional(),
      ctaButton: z.object({
        text: z.string().max(50),
        url: z.string().url(),
        style: z.enum(['primary', 'secondary', 'outline']).default('primary'),
      }).optional(),
    }),
    
    sections: z.array(
      z.object({
        id: z.string(),
        type: z.enum(['featured_posts', 'recent_posts', 'categories', 'custom_html', 'banner']),
        title: z.string().max(100).optional(),
        enabled: z.boolean().default(true),
        order: z.number().int().min(0).max(100).default(0),
        settings: z.record(z.any()).optional(),
      })
    ).max(10),
  }),
  
  theme: z.object({
    primaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).default('#007bff'),
    secondaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).default('#6c757d'),
    fontFamily: z.enum(['inter', 'roboto', 'noto-sans', 'pretendard']).default('pretendard'),
    borderRadius: z.enum(['none', 'small', 'medium', 'large']).default('medium'),
    layout: z.enum(['boxed', 'full-width']).default('boxed'),
  }),
  
  seo: z.object({
    siteName: z.string().min(1).max(100),
    description: z.string().max(300).optional(),
    keywords: z.string().max(500).optional(),
    ogImage: z.string().url().optional(),
    twitterCard: z.enum(['summary', 'summary_large_image']).default('summary_large_image'),
    googleAnalytics: z.string().optional(),
    googleSearchConsole: z.string().optional(),
  }),
  
  features: z.object({
    comments: z.boolean().default(true),
    reactions: z.boolean().default(true),
    socialShare: z.boolean().default(true),
    relatedPosts: z.boolean().default(true),
    newsletter: z.boolean().default(false),
    darkMode: z.boolean().default(true),
    searchHighlight: z.boolean().default(true),
    breadcrumbs: z.boolean().default(true),
  }),
});

export type UIConfig = z.infer<typeof UIConfigSchema>;

/**
 * UI 설정 키 enum
 */
export enum UIConfigKey {
  HEADER = 'header',
  FOOTER = 'footer',  
  HOMEPAGE = 'homepage',
  THEME = 'theme',
  SEO = 'seo',
  FEATURES = 'features',
}

/**
 * 기본 UI 설정
 */
export const DEFAULT_UI_CONFIG: UIConfig = {
  header: {
    title: 'CodeB CMS',
    subtitle: '강력한 한국형 콘텐츠 관리 시스템',
    showSearch: true,
    showNavigation: true,
    ctaButton: {
      text: '시작하기',
      url: '/auth/register',
      enabled: true,
    },
  },
  
  footer: {
    enabled: true,
    copyright: '© 2024 CodeB CMS. All rights reserved.',
    columns: [
      {
        title: '서비스',
        links: [
          { text: '홈', url: '/', external: false },
          { text: '소개', url: '/about', external: false },
          { text: '연락처', url: '/contact', external: false },
        ],
      },
      {
        title: '지원',
        links: [
          { text: '도움말', url: '/help', external: false },
          { text: 'FAQ', url: '/faq', external: false },
          { text: 'API 문서', url: '/docs/api', external: false },
        ],
      },
      {
        title: '커뮤니티',
        links: [
          { text: 'GitHub', url: 'https://github.com/codeb-cms', external: true },
          { text: '블로그', url: '/blog', external: false },
        ],
      },
    ],
    social: {
      enabled: false,
      links: [],
    },
  },
  
  homepage: {
    hero: {
      enabled: true,
      title: '강력하고 유연한 콘텐츠 관리',
      subtitle: 'CodeB CMS로 현대적이고 확장 가능한 웹사이트를 구축하세요',
      ctaButton: {
        text: '지금 시작하기',
        url: '/auth/register',
        style: 'primary',
      },
    },
    sections: [
      {
        id: 'featured-posts',
        type: 'featured_posts',
        title: '추천 게시글',
        enabled: true,
        order: 1,
        settings: { limit: 6 },
      },
      {
        id: 'recent-posts',
        type: 'recent_posts', 
        title: '최신 게시글',
        enabled: true,
        order: 2,
        settings: { limit: 10 },
      },
      {
        id: 'categories',
        type: 'categories',
        title: '카테고리',
        enabled: true,
        order: 3,
        settings: { showPostCount: true },
      },
    ],
  },
  
  theme: {
    primaryColor: '#3b82f6',
    secondaryColor: '#6b7280',
    fontFamily: 'pretendard',
    borderRadius: 'medium',
    layout: 'boxed',
  },
  
  seo: {
    siteName: 'CodeB CMS',
    description: '강력하고 유연한 한국형 콘텐츠 관리 시스템',
    keywords: 'CMS, 콘텐츠 관리, 블로그, 웹사이트, Korean',
    twitterCard: 'summary_large_image',
  },
  
  features: {
    comments: true,
    reactions: true,
    socialShare: true,
    relatedPosts: true,
    newsletter: false,
    darkMode: true,
    searchHighlight: true,
    breadcrumbs: true,
  },
};

/**
 * UI 설정 관리 클래스
 */
export class UIConfigManager {
  private redis = getRedisCluster();
  private cacheKey = 'ui:config';
  private cacheTTL = 3600; // 1시간

  /**
   * 전체 UI 설정 가져오기
   */
  async getConfig(): Promise<UIConfig> {
    try {
      // 캐시에서 먼저 시도
      const cached = await this.redis.get(this.cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // 데이터베이스에서 조회
      const dbConfigs = await db.setting.findMany({
        where: {
          key: {
            startsWith: 'ui.',
          },
        },
        select: {
          key: true,
          value: true,
        },
      });

      // 설정 조합
      let config = { ...DEFAULT_UI_CONFIG };
      
      for (const dbConfig of dbConfigs) {
        const keyPath = dbConfig.key.replace('ui.', '').split('.');
        this.setNestedProperty(config, keyPath, JSON.parse(dbConfig.value));
      }

      // 스키마 유효성 검증
      config = UIConfigSchema.parse(config);

      // 캐시 저장
      await this.redis.setex(this.cacheKey, this.cacheTTL, JSON.stringify(config));

      return config;
    } catch (error) {
      console.error('UI 설정 로드 실패:', error);
      return DEFAULT_UI_CONFIG;
    }
  }

  /**
   * 특정 섹션 설정 가져오기
   */
  async getConfigSection(section: UIConfigKey): Promise<any> {
    const config = await this.getConfig();
    return config[section];
  }

  /**
   * UI 설정 업데이트
   */
  async updateConfig(updates: Partial<UIConfig>): Promise<void> {
    try {
      // 현재 설정 가져오기
      const currentConfig = await this.getConfig();
      
      // 설정 병합
      const mergedConfig = this.mergeDeep(currentConfig, updates);
      
      // 스키마 유효성 검증
      const validatedConfig = UIConfigSchema.parse(mergedConfig);

      // 데이터베이스에 저장
      await this.saveConfigToDatabase(validatedConfig);

      // 캐시 무효화
      await this.redis.del(this.cacheKey);

      console.log('UI 설정 업데이트 완료');
    } catch (error) {
      console.error('UI 설정 업데이트 실패:', error);
      throw new Error('UI 설정 업데이트에 실패했습니다');
    }
  }

  /**
   * 특정 섹션 설정 업데이트
   */
  async updateConfigSection(section: UIConfigKey, data: any): Promise<void> {
    const updates = { [section]: data };
    await this.updateConfig(updates);
  }

  /**
   * 설정 초기화
   */
  async resetConfig(): Promise<void> {
    try {
      // 데이터베이스에서 UI 설정 삭제
      await db.setting.deleteMany({
        where: {
          key: {
            startsWith: 'ui.',
          },
        },
      });

      // 기본 설정 저장
      await this.saveConfigToDatabase(DEFAULT_UI_CONFIG);

      // 캐시 무효화
      await this.redis.del(this.cacheKey);

      console.log('UI 설정 초기화 완료');
    } catch (error) {
      console.error('UI 설정 초기화 실패:', error);
      throw new Error('UI 설정 초기화에 실패했습니다');
    }
  }

  /**
   * 설정을 데이터베이스에 저장
   */
  private async saveConfigToDatabase(config: UIConfig): Promise<void> {
    const flattenedConfig = this.flattenObject(config, 'ui');
    
    // 트랜잭션으로 일괄 업데이트
    await db.$transaction(
      Object.entries(flattenedConfig).map(([key, value]) =>
        db.setting.upsert({
          where: { key },
          update: { 
            value: JSON.stringify(value),
            updatedAt: new Date(),
          },
          create: {
            key,
            value: JSON.stringify(value),
            type: 'json',
            description: `UI 설정 - ${key}`,
          },
        })
      )
    );
  }

  /**
   * 객체 깊은 병합
   */
  private mergeDeep(target: any, source: any): any {
    const output = { ...target };
    
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            output[key] = source[key];
          } else {
            output[key] = this.mergeDeep(target[key], source[key]);
          }
        } else {
          output[key] = source[key];
        }
      });
    }
    
    return output;
  }

  /**
   * 객체 평면화 (중첩된 객체를 dot notation으로 변환)
   */
  private flattenObject(obj: any, prefix = ''): Record<string, any> {
    const flattened: Record<string, any> = {};
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        
        if (this.isObject(obj[key]) && !Array.isArray(obj[key])) {
          Object.assign(flattened, this.flattenObject(obj[key], newKey));
        } else {
          flattened[newKey] = obj[key];
        }
      }
    }
    
    return flattened;
  }

  /**
   * 중첩된 속성 설정
   */
  private setNestedProperty(obj: any, path: string[], value: any): void {
    let current = obj;
    
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!(key in current) || !this.isObject(current[key])) {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[path[path.length - 1]] = value;
  }

  /**
   * 객체 타입 검사
   */
  private isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
  }
}

// 전역 UI 설정 관리자 인스턴스
let uiConfigManager: UIConfigManager | null = null;

/**
 * UI 설정 관리자 인스턴스 가져오기
 */
export function getUIConfigManager(): UIConfigManager {
  if (!uiConfigManager) {
    uiConfigManager = new UIConfigManager();
  }
  return uiConfigManager;
}

/**
 * 캐시된 UI 설정 가져오기 (빠른 액세스용)
 */
export async function getCachedUIConfig(): Promise<UIConfig> {
  const manager = getUIConfigManager();
  return await manager.getConfig();
}

export default getUIConfigManager;