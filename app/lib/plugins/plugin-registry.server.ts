// 플러그인 레지스트리 시스템

import { join } from 'path';
import { readdir, stat, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { PluginManager } from '../core/plugin-system/plugin-manager';
import { Plugin, PluginMetadata, PluginHook } from '../core/plugin-system/types';
import { validateInput } from '../security/validation.server';
import { z } from 'zod';

// 플러그인 메타데이터 스키마
const pluginMetadataSchema = z.object({
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().max(500),
  author: z.string().max(100),
  homepage: z.string().url().optional(),
  license: z.string().max(50).optional(),
  keywords: z.array(z.string()).optional(),
  dependencies: z.record(z.string()).optional(),
  engines: z.object({
    node: z.string().optional(),
    'codeb-cms': z.string().optional(),
  }).optional(),
  codeb: z.object({
    apiVersion: z.string().default('1.0'),
    hooks: z.array(z.string()).optional(),
    permissions: z.array(z.string()).optional(),
    routes: z.array(z.string()).optional(),
    components: z.array(z.string()).optional(),
  }),
});

export interface RegisteredPlugin {
  id: string;
  metadata: PluginMetadata;
  status: 'inactive' | 'active' | 'error' | 'disabled';
  error?: string;
  loadedAt?: Date;
  instance?: Plugin;
}

class PluginRegistry {
  private plugins: Map<string, RegisteredPlugin> = new Map();
  private pluginManager: PluginManager;
  private readonly pluginDir: string;

  constructor() {
    this.pluginManager = new PluginManager();
    this.pluginDir = join(process.cwd(), 'plugins');
  }

  // 플러그인 디렉토리 스캔
  async scanPlugins(): Promise<void> {
    try {
      if (!existsSync(this.pluginDir)) {
        console.log('Plugin directory does not exist:', this.pluginDir);
        return;
      }

      const entries = await readdir(this.pluginDir, { withFileTypes: true });
      const pluginDirs = entries.filter(entry => entry.isDirectory());

      for (const dir of pluginDirs) {
        await this.discoverPlugin(dir.name);
      }

      console.log(`Discovered ${this.plugins.size} plugins`);
    } catch (error) {
      console.error('Failed to scan plugins:', error);
    }
  }

  // 개별 플러그인 발견
  private async discoverPlugin(pluginId: string): Promise<void> {
    try {
      const pluginPath = join(this.pluginDir, pluginId);
      const packageJsonPath = join(pluginPath, 'package.json');
      const indexPath = join(pluginPath, 'index.js');

      // package.json 확인
      if (!existsSync(packageJsonPath)) {
        console.warn(`Plugin ${pluginId} has no package.json`);
        return;
      }

      // index.js 확인
      if (!existsSync(indexPath)) {
        console.warn(`Plugin ${pluginId} has no index.js`);
        return;
      }

      // 메타데이터 읽기
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
      const metadata = await validateInput(pluginMetadataSchema, packageJson);

      // 플러그인 등록
      const plugin: RegisteredPlugin = {
        id: pluginId,
        metadata,
        status: 'inactive',
      };

      this.plugins.set(pluginId, plugin);
      console.log(`Discovered plugin: ${metadata.name} v${metadata.version}`);

    } catch (error) {
      console.error(`Failed to discover plugin ${pluginId}:`, error);
      
      this.plugins.set(pluginId, {
        id: pluginId,
        metadata: {
          name: pluginId,
          version: '0.0.0',
          description: 'Invalid plugin',
          author: 'unknown',
          codeb: { apiVersion: '1.0' },
        },
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // 플러그인 로드
  async loadPlugin(pluginId: string): Promise<boolean> {
    try {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        throw new Error(`Plugin ${pluginId} not found`);
      }

      if (plugin.status === 'active') {
        console.log(`Plugin ${pluginId} is already active`);
        return true;
      }

      // 플러그인 모듈 로드
      const pluginPath = join(this.pluginDir, pluginId, 'index.js');
      
      // 캐시 삭제 (개발 시 유용)
      delete require.cache[require.resolve(pluginPath)];
      
      const PluginClass = require(pluginPath).default || require(pluginPath);
      
      if (typeof PluginClass !== 'function') {
        throw new Error('Plugin must export a class or constructor function');
      }

      // 플러그인 인스턴스 생성
      const instance = new PluginClass();
      
      // 플러그인 초기화
      if (typeof instance.initialize === 'function') {
        await instance.initialize();
      }

      // 훅 등록
      if (instance.hooks) {
        Object.entries(instance.hooks).forEach(([hookName, handler]) => {
          this.pluginManager.addHook(hookName as PluginHook, handler, pluginId);
        });
      }

      // 상태 업데이트
      plugin.instance = instance;
      plugin.status = 'active';
      plugin.loadedAt = new Date();
      delete plugin.error;

      console.log(`Loaded plugin: ${plugin.metadata.name} v${plugin.metadata.version}`);
      return true;

    } catch (error) {
      console.error(`Failed to load plugin ${pluginId}:`, error);
      
      const plugin = this.plugins.get(pluginId);
      if (plugin) {
        plugin.status = 'error';
        plugin.error = error instanceof Error ? error.message : 'Unknown error';
      }

      return false;
    }
  }

  // 플러그인 언로드
  async unloadPlugin(pluginId: string): Promise<boolean> {
    try {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        throw new Error(`Plugin ${pluginId} not found`);
      }

      if (plugin.status !== 'active') {
        console.log(`Plugin ${pluginId} is not active`);
        return true;
      }

      // 플러그인 정리
      if (plugin.instance && typeof plugin.instance.cleanup === 'function') {
        await plugin.instance.cleanup();
      }

      // 훅 제거
      this.pluginManager.removePluginHooks(pluginId);

      // 상태 업데이트
      plugin.status = 'inactive';
      plugin.instance = undefined;
      plugin.loadedAt = undefined;

      console.log(`Unloaded plugin: ${plugin.metadata.name}`);
      return true;

    } catch (error) {
      console.error(`Failed to unload plugin ${pluginId}:`, error);
      return false;
    }
  }

  // 모든 플러그인 로드
  async loadAllPlugins(): Promise<void> {
    const pluginIds = Array.from(this.plugins.keys());
    
    for (const pluginId of pluginIds) {
      const plugin = this.plugins.get(pluginId);
      if (plugin && plugin.status === 'inactive') {
        await this.loadPlugin(pluginId);
      }
    }
  }

  // 플러그인 활성화
  async enablePlugin(pluginId: string): Promise<boolean> {
    try {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) {
        throw new Error(`Plugin ${pluginId} not found`);
      }

      if (plugin.status === 'disabled') {
        plugin.status = 'inactive';
      }

      return await this.loadPlugin(pluginId);
    } catch (error) {
      console.error(`Failed to enable plugin ${pluginId}:`, error);
      return false;
    }
  }

  // 플러그인 비활성화
  async disablePlugin(pluginId: string): Promise<boolean> {
    try {
      await this.unloadPlugin(pluginId);
      
      const plugin = this.plugins.get(pluginId);
      if (plugin) {
        plugin.status = 'disabled';
      }

      return true;
    } catch (error) {
      console.error(`Failed to disable plugin ${pluginId}:`, error);
      return false;
    }
  }

  // 플러그인 목록 조회
  getAllPlugins(): RegisteredPlugin[] {
    return Array.from(this.plugins.values());
  }

  // 활성화된 플러그인 조회
  getActivePlugins(): RegisteredPlugin[] {
    return Array.from(this.plugins.values()).filter(p => p.status === 'active');
  }

  // 특정 플러그인 조회
  getPlugin(pluginId: string): RegisteredPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  // 플러그인 매니저 접근
  getPluginManager(): PluginManager {
    return this.pluginManager;
  }

  // 플러그인 통계
  getStats() {
    const plugins = Array.from(this.plugins.values());
    return {
      total: plugins.length,
      active: plugins.filter(p => p.status === 'active').length,
      inactive: plugins.filter(p => p.status === 'inactive').length,
      disabled: plugins.filter(p => p.status === 'disabled').length,
      errors: plugins.filter(p => p.status === 'error').length,
    };
  }

  // 플러그인 의존성 검사
  async checkDependencies(pluginId: string): Promise<{
    satisfied: boolean;
    missing: string[];
  }> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !plugin.metadata.dependencies) {
      return { satisfied: true, missing: [] };
    }

    const missing: string[] = [];
    
    for (const [depName, depVersion] of Object.entries(plugin.metadata.dependencies)) {
      try {
        const depPlugin = Array.from(this.plugins.values())
          .find(p => p.metadata.name === depName);
        
        if (!depPlugin) {
          missing.push(`${depName}@${depVersion}`);
        } else if (depPlugin.status !== 'active') {
          missing.push(`${depName}@${depVersion} (not active)`);
        }
        // TODO: 버전 호환성 검사
      } catch (error) {
        missing.push(`${depName}@${depVersion} (check failed)`);
      }
    }

    return {
      satisfied: missing.length === 0,
      missing,
    };
  }
}

// 싱글톤 인스턴스
export const pluginRegistry = new PluginRegistry();

// 초기화 함수
export async function initializePluginSystem(): Promise<void> {
  console.log('Initializing plugin system...');
  
  try {
    await pluginRegistry.scanPlugins();
    await pluginRegistry.loadAllPlugins();
    
    const stats = pluginRegistry.getStats();
    console.log(`Plugin system initialized: ${stats.active}/${stats.total} plugins active`);
    
  } catch (error) {
    console.error('Failed to initialize plugin system:', error);
  }
}