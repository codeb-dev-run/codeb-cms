/**
 * 플러그인 시스템
 * 확장 가능한 아키텍처를 위한 플러그인 관리 시스템
 */
import { performance } from 'perf_hooks';
import * as path from 'path';
import * as fs from 'fs/promises';
import { getDependencyManager } from './dependency-manager.server';

/**
 * 플러그인 매니저
 */
export class PluginManager {
  private plugins = new Map<string, PluginInstance>();
  private hooks = new Map<string, Hook[]>();
  private middleware = new Map<string, MiddlewareHandler[]>();
  private commands = new Map<string, CommandHandler>();
  private dependencyManager = getDependencyManager();
  
  private pluginDirectories = [
    './plugins',
    './app/plugins',
    './node_modules/@codeb-cms/plugin-*'
  ];

  /**
   * 플러그인 등록
   */
  async registerPlugin(pluginConfig: PluginConfig): Promise<void> {
    const { name, version, main } = pluginConfig;
    
    if (this.plugins.has(name)) {
      throw new Error(`플러그인 "${name}"이 이미 등록되어 있습니다`);
    }

    try {
      const start = performance.now();
      
      // 플러그인 모듈 로드
      const pluginModule = await this.loadPluginModule(main);
      
      // 플러그인 인스턴스 생성
      const plugin: PluginInstance = {
        config: pluginConfig,
        module: pluginModule,
        status: 'loaded',
        loadTime: performance.now() - start,
        hooks: [],
        middleware: [],
        commands: [],
      };

      // 플러그인 초기화
      if (pluginModule.initialize && typeof pluginModule.initialize === 'function') {
        await pluginModule.initialize(this.createPluginContext(name));
        plugin.status = 'active';
      }

      this.plugins.set(name, plugin);
      
      console.log(`📦 플러그인 등록: ${name}@${version} (${plugin.loadTime.toFixed(2)}ms)`);
    } catch (error) {
      console.error(`❌ 플러그인 등록 실패: ${name}`, error);
      throw error;
    }
  }

  /**
   * 플러그인 모듈 로드
   */
  private async loadPluginModule(mainPath: string): Promise<PluginModule> {
    try {
      // 동적 import 사용
      const modulePath = path.resolve(mainPath);
      const module = await import(modulePath);
      
      return module.default || module;
    } catch (error) {
      console.error(`플러그인 모듈 로드 실패: ${mainPath}`, error);
      throw error;
    }
  }

  /**
   * 플러그인 컨텍스트 생성
   */
  private createPluginContext(pluginName: string): PluginContext {
    return {
      name: pluginName,
      logger: {
        info: (message: string, ...args: any[]) => console.log(`[${pluginName}] ${message}`, ...args),
        warn: (message: string, ...args: any[]) => console.warn(`[${pluginName}] ${message}`, ...args),
        error: (message: string, ...args: any[]) => console.error(`[${pluginName}] ${message}`, ...args),
        debug: (message: string, ...args: any[]) => console.debug(`[${pluginName}] ${message}`, ...args),
      },
      
      // 훅 등록
      addHook: (hookName: string, handler: HookHandler, priority = 10) => {
        this.addHook(hookName, handler, { plugin: pluginName, priority });
      },
      
      // 미들웨어 등록
      addMiddleware: (routePattern: string, handler: MiddlewareHandler, priority = 10) => {
        this.addMiddleware(routePattern, handler, { plugin: pluginName, priority });
      },
      
      // 명령어 등록
      addCommand: (commandName: string, handler: CommandHandler) => {
        this.addCommand(commandName, handler, pluginName);
      },
      
      // 서비스 접근
      getService: <T>(serviceName: string) => this.dependencyManager.resolve<T>(serviceName),
      
      // 설정 관리
      getConfig: (key?: string) => this.getPluginConfig(pluginName, key),
      setConfig: (key: string, value: any) => this.setPluginConfig(pluginName, key, value),
      
      // 다른 플러그인과 통신
      emit: (eventName: string, data?: any) => this.emitEvent(`plugin:${pluginName}:${eventName}`, data),
      on: (eventName: string, handler: (data: any) => void) => this.onEvent(eventName, handler),
    };
  }

  /**
   * 훅 추가
   */
  addHook(hookName: string, handler: HookHandler, options?: HookOptions): void {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }
    
    const hook: Hook = {
      handler,
      plugin: options?.plugin,
      priority: options?.priority || 10,
    };
    
    this.hooks.get(hookName)!.push(hook);
    
    // 우선순위별 정렬
    this.hooks.get(hookName)!.sort((a, b) => (a.priority || 10) - (b.priority || 10));
    
    // 플러그인 정보 업데이트
    if (options?.plugin && this.plugins.has(options.plugin)) {
      this.plugins.get(options.plugin)!.hooks.push(hookName);
    }
  }

  /**
   * 훅 실행
   */
  async executeHook<T = any>(hookName: string, data?: T, context?: any): Promise<T> {
    const hooks = this.hooks.get(hookName) || [];
    
    if (hooks.length === 0) {
      return data as T;
    }

    let result = data;
    
    for (const hook of hooks) {
      try {
        const hookResult = await hook.handler(result, context);
        
        // 훅이 값을 반환하면 다음 훅의 입력으로 사용
        if (hookResult !== undefined) {
          result = hookResult;
        }
      } catch (error) {
        console.error(`훅 실행 실패: ${hookName} (플러그인: ${hook.plugin})`, error);
        
        // 에러 전파 방지 (다음 훅 계속 실행)
        continue;
      }
    }
    
    return result as T;
  }

  /**
   * 미들웨어 추가
   */
  addMiddleware(routePattern: string, handler: MiddlewareHandler, options?: MiddlewareOptions): void {
    if (!this.middleware.has(routePattern)) {
      this.middleware.set(routePattern, []);
    }
    
    const middleware: MiddlewareEntry = {
      handler,
      plugin: options?.plugin,
      priority: options?.priority || 10,
    };
    
    this.middleware.get(routePattern)!.push(middleware);
    
    // 우선순위별 정렬
    this.middleware.get(routePattern)!.sort((a, b) => (a.priority || 10) - (b.priority || 10));
    
    // 플러그인 정보 업데이트
    if (options?.plugin && this.plugins.has(options.plugin)) {
      this.plugins.get(options.plugin)!.middleware.push(routePattern);
    }
  }

  /**
   * 라우트에 대한 미들웨어 실행
   */
  async executeMiddleware(route: string, req: any, res: any, next: Function): Promise<void> {
    const matchingMiddleware: MiddlewareEntry[] = [];
    
    // 패턴 매칭으로 해당하는 미들웨어 찾기
    for (const [pattern, middlewares] of this.middleware.entries()) {
      if (this.matchRoute(route, pattern)) {
        matchingMiddleware.push(...middlewares);
      }
    }
    
    // 우선순위별 정렬
    matchingMiddleware.sort((a, b) => (a.priority || 10) - (b.priority || 10));
    
    // 미들웨어 체인 실행
    let index = 0;
    
    const executeNext = async (): Promise<void> => {
      if (index >= matchingMiddleware.length) {
        return next();
      }
      
      const middleware = matchingMiddleware[index++];
      
      try {
        await middleware.handler(req, res, executeNext);
      } catch (error) {
        console.error(`미들웨어 실행 실패 (플러그인: ${middleware.plugin})`, error);
        next(error);
      }
    };
    
    await executeNext();
  }

  /**
   * 라우트 패턴 매칭
   */
  private matchRoute(route: string, pattern: string): boolean {
    // 간단한 와일드카드 매칭
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/:\w+/g, '[^/]+');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(route);
  }

  /**
   * 명령어 추가
   */
  addCommand(commandName: string, handler: CommandHandler, pluginName?: string): void {
    if (this.commands.has(commandName)) {
      throw new Error(`명령어 "${commandName}"이 이미 등록되어 있습니다`);
    }
    
    this.commands.set(commandName, handler);
    
    // 플러그인 정보 업데이트
    if (pluginName && this.plugins.has(pluginName)) {
      this.plugins.get(pluginName)!.commands.push(commandName);
    }
    
    console.log(`⚡ 명령어 등록: ${commandName} (플러그인: ${pluginName || 'system'})`);
  }

  /**
   * 명령어 실행
   */
  async executeCommand(commandName: string, args: string[] = [], context?: any): Promise<any> {
    const handler = this.commands.get(commandName);
    
    if (!handler) {
      throw new Error(`명령어 "${commandName}"을 찾을 수 없습니다`);
    }
    
    try {
      return await handler(args, context);
    } catch (error) {
      console.error(`명령어 실행 실패: ${commandName}`, error);
      throw error;
    }
  }

  /**
   * 이벤트 발생
   */
  private eventListeners = new Map<string, Array<(data: any) => void>>();
  
  emitEvent(eventName: string, data?: any): void {
    const listeners = this.eventListeners.get(eventName) || [];
    
    listeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error(`이벤트 리스너 실행 실패: ${eventName}`, error);
      }
    });
  }

  /**
   * 이벤트 리스너 등록
   */
  onEvent(eventName: string, handler: (data: any) => void): void {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, []);
    }
    
    this.eventListeners.get(eventName)!.push(handler);
  }

  /**
   * 플러그인 자동 탐지 및 로드
   */
  async discoverAndLoadPlugins(): Promise<void> {
    console.log('🔍 플러그인 자동 탐지 시작...');
    
    for (const directory of this.pluginDirectories) {
      try {
        await this.scanPluginDirectory(directory);
      } catch (error) {
        console.warn(`플러그인 디렉토리 스캔 실패: ${directory}`, error);
      }
    }
    
    console.log(`✅ 플러그인 탐지 완료: ${this.plugins.size}개 플러그인 로드됨`);
  }

  /**
   * 플러그인 디렉토리 스캔
   */
  private async scanPluginDirectory(directory: string): Promise<void> {
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = path.join(directory, entry.name);
          await this.loadPluginFromDirectory(pluginPath);
        }
      }
    } catch (error) {
      // 디렉토리가 존재하지 않으면 무시
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * 디렉토리에서 플러그인 로드
   */
  private async loadPluginFromDirectory(pluginPath: string): Promise<void> {
    const packageJsonPath = path.join(pluginPath, 'package.json');
    
    try {
      const packageJson = await fs.readFile(packageJsonPath, 'utf-8');
      const config = JSON.parse(packageJson);
      
      // CodeB CMS 플러그인인지 확인
      if (config.keywords && config.keywords.includes('codeb-cms-plugin')) {
        const pluginConfig: PluginConfig = {
          name: config.name,
          version: config.version,
          description: config.description,
          main: path.join(pluginPath, config.main || 'index.js'),
          author: config.author,
          dependencies: config.dependencies || {},
          codebCmsVersion: config.codebCmsVersion || '*',
        };
        
        await this.registerPlugin(pluginConfig);
      }
    } catch (error) {
      console.warn(`플러그인 로드 실패: ${pluginPath}`, error);
    }
  }

  /**
   * 플러그인 설정 관리
   */
  private pluginConfigs = new Map<string, any>();
  
  private getPluginConfig(pluginName: string, key?: string): any {
    const config = this.pluginConfigs.get(pluginName) || {};
    return key ? config[key] : config;
  }
  
  private setPluginConfig(pluginName: string, key: string, value: any): void {
    if (!this.pluginConfigs.has(pluginName)) {
      this.pluginConfigs.set(pluginName, {});
    }
    
    this.pluginConfigs.get(pluginName)![key] = value;
  }

  /**
   * 플러그인 상태 조회
   */
  getPluginStatus(): PluginStatus {
    const plugins = Array.from(this.plugins.values());
    
    return {
      total: plugins.length,
      active: plugins.filter(p => p.status === 'active').length,
      inactive: plugins.filter(p => p.status === 'inactive').length,
      error: plugins.filter(p => p.status === 'error').length,
      hooks: this.hooks.size,
      middleware: this.middleware.size,
      commands: this.commands.size,
    };
  }

  /**
   * 플러그인 리스트 조회
   */
  getPluginList(): PluginInfo[] {
    return Array.from(this.plugins.entries()).map(([name, instance]) => ({
      name,
      version: instance.config.version,
      description: instance.config.description,
      status: instance.status,
      loadTime: instance.loadTime,
      hooks: instance.hooks.length,
      middleware: instance.middleware.length,
      commands: instance.commands.length,
    }));
  }

  /**
   * 플러그인 비활성화
   */
  async deactivatePlugin(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    
    if (!plugin) {
      throw new Error(`플러그인 "${pluginName}"을 찾을 수 없습니다`);
    }
    
    // cleanup 메서드 호출
    if (plugin.module.cleanup && typeof plugin.module.cleanup === 'function') {
      await plugin.module.cleanup();
    }
    
    plugin.status = 'inactive';
    
    console.log(`⏸️  플러그인 비활성화: ${pluginName}`);
  }

  /**
   * 플러그인 활성화
   */
  async activatePlugin(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    
    if (!plugin) {
      throw new Error(`플러그인 "${pluginName}"을 찾을 수 없습니다`);
    }
    
    if (plugin.status === 'active') {
      return;
    }
    
    // initialize 메서드 호출
    if (plugin.module.initialize && typeof plugin.module.initialize === 'function') {
      await plugin.module.initialize(this.createPluginContext(pluginName));
    }
    
    plugin.status = 'active';
    
    console.log(`▶️  플러그인 활성화: ${pluginName}`);
  }

  /**
   * 전체 정리
   */
  async cleanup(): Promise<void> {
    console.log('🧹 플러그인 매니저 정리 시작...');
    
    for (const [name, plugin] of this.plugins.entries()) {
      try {
        await this.deactivatePlugin(name);
      } catch (error) {
        console.error(`플러그인 정리 실패: ${name}`, error);
      }
    }
    
    this.plugins.clear();
    this.hooks.clear();
    this.middleware.clear();
    this.commands.clear();
    this.eventListeners.clear();
    this.pluginConfigs.clear();
    
    console.log('✅ 플러그인 매니저 정리 완료');
  }
}

// 타입 정의
export interface PluginConfig {
  name: string;
  version: string;
  description?: string;
  main: string;
  author?: string;
  dependencies?: Record<string, string>;
  codebCmsVersion?: string;
}

export interface PluginModule {
  initialize?(context: PluginContext): Promise<void> | void;
  cleanup?(): Promise<void> | void;
}

export interface PluginContext {
  name: string;
  logger: {
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
  };
  addHook(hookName: string, handler: HookHandler, priority?: number): void;
  addMiddleware(routePattern: string, handler: MiddlewareHandler, priority?: number): void;
  addCommand(commandName: string, handler: CommandHandler): void;
  getService<T>(serviceName: string): Promise<T>;
  getConfig(key?: string): any;
  setConfig(key: string, value: any): void;
  emit(eventName: string, data?: any): void;
  on(eventName: string, handler: (data: any) => void): void;
}

export interface PluginInstance {
  config: PluginConfig;
  module: PluginModule;
  status: 'loaded' | 'active' | 'inactive' | 'error';
  loadTime: number;
  hooks: string[];
  middleware: string[];
  commands: string[];
}

export type HookHandler = (data?: any, context?: any) => Promise<any> | any;
export type MiddlewareHandler = (req: any, res: any, next: Function) => Promise<void> | void;
export type CommandHandler = (args: string[], context?: any) => Promise<any> | any;

export interface Hook {
  handler: HookHandler;
  plugin?: string;
  priority?: number;
}

export interface MiddlewareEntry {
  handler: MiddlewareHandler;
  plugin?: string;
  priority?: number;
}

export interface HookOptions {
  plugin?: string;
  priority?: number;
}

export interface MiddlewareOptions {
  plugin?: string;
  priority?: number;
}

export interface PluginStatus {
  total: number;
  active: number;
  inactive: number;
  error: number;
  hooks: number;
  middleware: number;
  commands: number;
}

export interface PluginInfo {
  name: string;
  version: string;
  description?: string;
  status: string;
  loadTime: number;
  hooks: number;
  middleware: number;
  commands: number;
}

// 전역 플러그인 매니저
let globalPluginManager: PluginManager | null = null;

/**
 * 전역 플러그인 매니저 가져오기
 */
export function getPluginManager(): PluginManager {
  if (!globalPluginManager) {
    globalPluginManager = new PluginManager();
  }
  return globalPluginManager;
}

export default getPluginManager;