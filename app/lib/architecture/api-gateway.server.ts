/**
 * API 게이트웨이 시스템
 * 통합된 API 관리, 라우팅, 인증, 제한, 모니터링
 */
import { performance } from 'perf_hooks';
import { getMetricsCollector } from '../monitoring/metrics-collector.server';
import { getRedisCluster } from '../redis/cluster.server';
import { getDependencyManager } from './dependency-manager.server';
import { getPluginManager } from './plugin-system.server';

/**
 * API 게이트웨이 매니저
 */
export class ApiGateway {
  private routes = new Map<string, ApiRoute>();
  private middlewares: Middleware[] = [];
  private rateLimiter = new Map<string, RateLimitConfig>();
  private metricsCollector = getMetricsCollector();
  private redis = getRedisCluster();
  private dependencyManager = getDependencyManager();
  private pluginManager = getPluginManager();

  /**
   * API 라우트 등록
   */
  registerRoute(config: ApiRouteConfig): void {
    const route: ApiRoute = {
      ...config,
      id: this.generateRouteId(config.method, config.path),
      registeredAt: new Date(),
      metrics: {
        requests: 0,
        errors: 0,
        avgResponseTime: 0,
        lastAccess: null,
      },
    };

    this.routes.set(route.id, route);
    
    console.log(`🚦 API 라우트 등록: ${config.method} ${config.path} -> ${config.handler}`);
  }

  /**
   * 라우트 ID 생성
   */
  private generateRouteId(method: string, path: string): string {
    return `${method.toUpperCase()}:${path}`;
  }

  /**
   * 미들웨어 등록
   */
  registerMiddleware(middleware: Middleware): void {
    this.middlewares.push(middleware);
    
    // 우선순위별 정렬
    this.middlewares.sort((a, b) => (a.priority || 10) - (b.priority || 10));
    
    console.log(`🔧 미들웨어 등록: ${middleware.name} (우선순위: ${middleware.priority || 10})`);
  }

  /**
   * Rate Limiting 설정
   */
  setRateLimit(pattern: string, config: RateLimitConfig): void {
    this.rateLimiter.set(pattern, config);
    console.log(`⏰ Rate Limit 설정: ${pattern} - ${config.requests}회/${config.window}ms`);
  }

  /**
   * API 요청 처리
   */
  async handleRequest(request: ApiRequest): Promise<ApiResponse> {
    const start = performance.now();
    const requestId = this.generateRequestId();
    
    const context: RequestContext = {
      requestId,
      startTime: start,
      route: null,
      user: null,
      metadata: {},
    };

    try {
      // 1. 라우트 매칭
      const route = this.matchRoute(request.method, request.path);
      if (!route) {
        return this.createErrorResponse(404, 'Route not found', requestId);
      }
      
      context.route = route;

      // 2. Rate Limiting 체크
      const rateLimitResult = await this.checkRateLimit(request, route);
      if (!rateLimitResult.allowed) {
        return this.createErrorResponse(
          429, 
          'Rate limit exceeded', 
          requestId,
          { 
            retryAfter: rateLimitResult.retryAfter,
            limit: rateLimitResult.limit,
            remaining: rateLimitResult.remaining,
          }
        );
      }

      // 3. 미들웨어 체인 실행
      const middlewareResult = await this.executeMiddlewareChain(request, context);
      if (middlewareResult.error) {
        return this.createErrorResponse(
          middlewareResult.statusCode || 500,
          middlewareResult.error,
          requestId
        );
      }

      // 플러그인 미들웨어 실행
      await this.pluginManager.executeMiddleware(
        request.path, 
        request, 
        context, 
        () => {}
      );

      // 4. 훅 실행 (before_request)
      await this.pluginManager.executeHook('before_request', request, context);

      // 5. 핸들러 실행
      const handlerResult = await this.executeHandler(route, request, context);
      
      // 6. 응답 후처리
      const response = await this.processResponse(handlerResult, context);

      // 7. 훅 실행 (after_request)
      await this.pluginManager.executeHook('after_request', response, context);

      // 8. 메트릭 업데이트
      await this.updateMetrics(route, context, response);

      return response;

    } catch (error) {
      console.error(`API 요청 처리 실패 [${requestId}]:`, error);
      
      const response = this.createErrorResponse(
        500,
        'Internal server error',
        requestId
      );
      
      // 에러 메트릭 업데이트
      if (context.route) {
        await this.updateErrorMetrics(context.route, error);
      }

      return response;
    }
  }

  /**
   * 라우트 매칭
   */
  private matchRoute(method: string, path: string): ApiRoute | null {
    const routeId = this.generateRouteId(method, path);
    
    // 정확한 매치 시도
    if (this.routes.has(routeId)) {
      return this.routes.get(routeId)!;
    }

    // 패턴 매칭
    for (const [, route] of this.routes) {
      if (route.method.toUpperCase() !== method.toUpperCase()) {
        continue;
      }
      
      if (this.matchPathPattern(path, route.path)) {
        return route;
      }
    }

    return null;
  }

  /**
   * 경로 패턴 매칭
   */
  private matchPathPattern(path: string, pattern: string): boolean {
    // 파라미터 패턴을 정규식으로 변환
    const regexPattern = pattern
      .replace(/:\w+/g, '([^/]+)')  // :param -> 캡처 그룹
      .replace(/\*/g, '.*');        // * -> 모든 문자
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }

  /**
   * Rate Limiting 체크
   */
  private async checkRateLimit(
    request: ApiRequest, 
    route: ApiRoute
  ): Promise<RateLimitResult> {
    try {
      // 라우트별 또는 전역 Rate Limit 설정 찾기
      let rateLimitConfig: RateLimitConfig | null = null;
      
      for (const [pattern, config] of this.rateLimiter.entries()) {
        if (this.matchPathPattern(route.path, pattern)) {
          rateLimitConfig = config;
          break;
        }
      }

      if (!rateLimitConfig) {
        return { allowed: true, remaining: -1, limit: -1 };
      }

      // 클라이언트 식별 (IP 또는 사용자 ID)
      const clientId = request.clientId || request.ip || 'anonymous';
      const key = `ratelimit:${route.id}:${clientId}`;
      
      // Redis에서 현재 요청 수 조회
      const current = await this.redis.incr(key);
      
      if (current === 1) {
        // 첫 요청이면 TTL 설정
        await this.redis.expire(key, Math.ceil(rateLimitConfig.window / 1000));
      }

      const remaining = Math.max(0, rateLimitConfig.requests - current);
      
      if (current > rateLimitConfig.requests) {
        const ttl = await this.redis.ttl(key);
        
        return {
          allowed: false,
          remaining: 0,
          limit: rateLimitConfig.requests,
          retryAfter: ttl > 0 ? ttl : Math.ceil(rateLimitConfig.window / 1000),
        };
      }

      return {
        allowed: true,
        remaining,
        limit: rateLimitConfig.requests,
      };

    } catch (error) {
      console.warn('Rate Limit 체크 실패:', error);
      return { allowed: true, remaining: -1, limit: -1 };
    }
  }

  /**
   * 미들웨어 체인 실행
   */
  private async executeMiddlewareChain(
    request: ApiRequest, 
    context: RequestContext
  ): Promise<MiddlewareResult> {
    for (const middleware of this.middlewares) {
      try {
        const result = await middleware.handler(request, context);
        
        if (result && !result.continue) {
          return {
            error: result.error,
            statusCode: result.statusCode,
          };
        }
        
        // 컨텍스트 업데이트
        if (result && result.context) {
          Object.assign(context, result.context);
        }
        
      } catch (error) {
        console.error(`미들웨어 실행 실패: ${middleware.name}`, error);
        return {
          error: `Middleware error: ${error.message}`,
          statusCode: 500,
        };
      }
    }

    return { continue: true };
  }

  /**
   * 핸들러 실행
   */
  private async executeHandler(
    route: ApiRoute,
    request: ApiRequest,
    context: RequestContext
  ): Promise<any> {
    try {
      // 의존성 주입을 통한 핸들러 인스턴스 획득
      const handlerInstance = await this.dependencyManager.resolve(route.handler);
      
      if (!handlerInstance) {
        throw new Error(`Handler not found: ${route.handler}`);
      }

      // 메서드 이름 결정 (HTTP 메서드를 소문자로)
      const methodName = route.method.toLowerCase();
      
      if (typeof handlerInstance[methodName] !== 'function') {
        throw new Error(`Method ${methodName} not found in handler ${route.handler}`);
      }

      // 핸들러 실행
      return await handlerInstance[methodName](request, context);

    } catch (error) {
      console.error(`핸들러 실행 실패: ${route.handler}`, error);
      throw error;
    }
  }

  /**
   * 응답 후처리
   */
  private async processResponse(
    handlerResult: any,
    context: RequestContext
  ): Promise<ApiResponse> {
    const duration = performance.now() - context.startTime;

    // 핸들러가 이미 ApiResponse 형태라면 그대로 반환
    if (handlerResult && typeof handlerResult === 'object' && 'statusCode' in handlerResult) {
      return {
        ...handlerResult,
        requestId: context.requestId,
        responseTime: Math.round(duration),
      };
    }

    // 일반 데이터를 ApiResponse로 변환
    return {
      statusCode: 200,
      data: handlerResult,
      requestId: context.requestId,
      responseTime: Math.round(duration),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 메트릭 업데이트
   */
  private async updateMetrics(
    route: ApiRoute,
    context: RequestContext,
    response: ApiResponse
  ): Promise<void> {
    try {
      const duration = performance.now() - context.startTime;
      
      // 라우트 메트릭 업데이트
      route.metrics.requests++;
      route.metrics.lastAccess = new Date();
      
      // 평균 응답 시간 계산
      const prevAvg = route.metrics.avgResponseTime;
      const count = route.metrics.requests;
      route.metrics.avgResponseTime = (prevAvg * (count - 1) + duration) / count;

      // 에러 카운트
      if (response.statusCode >= 400) {
        route.metrics.errors++;
      }

      // 전역 메트릭 기록
      this.metricsCollector.recordHttpRequest(
        route.method,
        route.path,
        response.statusCode,
        duration
      );

    } catch (error) {
      console.warn('메트릭 업데이트 실패:', error);
    }
  }

  /**
   * 에러 메트릭 업데이트
   */
  private async updateErrorMetrics(route: ApiRoute, error: Error): Promise<void> {
    route.metrics.errors++;
    
    this.metricsCollector.recordHttpRequest(
      route.method,
      route.path,
      500,
      0
    );
  }

  /**
   * 에러 응답 생성
   */
  private createErrorResponse(
    statusCode: number,
    message: string,
    requestId: string,
    details?: any
  ): ApiResponse {
    return {
      statusCode,
      error: {
        message,
        code: `ERR_${statusCode}`,
        details,
      },
      requestId,
      responseTime: 0,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 요청 ID 생성
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * API 문서 생성
   */
  generateApiDocumentation(): ApiDocumentation {
    const routes = Array.from(this.routes.values()).map(route => ({
      method: route.method,
      path: route.path,
      description: route.description,
      parameters: route.parameters || [],
      responses: route.responses || {},
      tags: route.tags || [],
      deprecated: route.deprecated || false,
      metrics: route.metrics,
    }));

    return {
      title: 'CodeB CMS API',
      version: '1.0.0',
      baseUrl: process.env.API_BASE_URL || 'http://localhost:3000/api',
      routes,
      totalRoutes: routes.length,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * API 상태 조회
   */
  getApiStatus(): ApiStatus {
    const routes = Array.from(this.routes.values());
    const totalRequests = routes.reduce((sum, r) => sum + r.metrics.requests, 0);
    const totalErrors = routes.reduce((sum, r) => sum + r.metrics.errors, 0);
    
    return {
      totalRoutes: routes.length,
      totalRequests,
      totalErrors,
      errorRate: totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0,
      avgResponseTime: routes.reduce((sum, r) => sum + r.metrics.avgResponseTime, 0) / routes.length || 0,
      middlewares: this.middlewares.length,
      rateLimits: this.rateLimiter.size,
      uptime: process.uptime(),
    };
  }

  /**
   * 라우트 목록 조회
   */
  getRouteList(): RouteInfo[] {
    return Array.from(this.routes.values()).map(route => ({
      id: route.id,
      method: route.method,
      path: route.path,
      handler: route.handler,
      description: route.description,
      tags: route.tags || [],
      deprecated: route.deprecated || false,
      registeredAt: route.registeredAt,
      metrics: route.metrics,
    }));
  }

  /**
   * 정리
   */
  async cleanup(): Promise<void> {
    console.log('🧹 API 게이트웨이 정리 시작...');
    
    this.routes.clear();
    this.middlewares.length = 0;
    this.rateLimiter.clear();
    
    console.log('✅ API 게이트웨이 정리 완료');
  }
}

// 타입 정의
export interface ApiRouteConfig {
  method: string;
  path: string;
  handler: string;
  description?: string;
  parameters?: Parameter[];
  responses?: Record<string, ResponseSchema>;
  tags?: string[];
  deprecated?: boolean;
  authentication?: boolean;
  rateLimit?: RateLimitConfig;
}

export interface ApiRoute extends ApiRouteConfig {
  id: string;
  registeredAt: Date;
  metrics: RouteMetrics;
}

export interface RouteMetrics {
  requests: number;
  errors: number;
  avgResponseTime: number;
  lastAccess: Date | null;
}

export interface ApiRequest {
  method: string;
  path: string;
  query: Record<string, any>;
  body: any;
  headers: Record<string, string>;
  ip: string;
  clientId?: string;
  user?: any;
}

export interface ApiResponse {
  statusCode: number;
  data?: any;
  error?: {
    message: string;
    code: string;
    details?: any;
  };
  headers?: Record<string, string>;
  requestId: string;
  responseTime: number;
  timestamp: string;
}

export interface RequestContext {
  requestId: string;
  startTime: number;
  route: ApiRoute | null;
  user: any;
  metadata: Record<string, any>;
}

export interface Middleware {
  name: string;
  handler: (request: ApiRequest, context: RequestContext) => Promise<MiddlewareResult>;
  priority?: number;
}

export interface MiddlewareResult {
  continue?: boolean;
  error?: string;
  statusCode?: number;
  context?: Partial<RequestContext>;
}

export interface RateLimitConfig {
  requests: number;
  window: number; // milliseconds
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfter?: number;
}

export interface Parameter {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  example?: any;
}

export interface ResponseSchema {
  description: string;
  schema: any;
  example?: any;
}

export interface ApiDocumentation {
  title: string;
  version: string;
  baseUrl: string;
  routes: any[];
  totalRoutes: number;
  generatedAt: string;
}

export interface ApiStatus {
  totalRoutes: number;
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
  avgResponseTime: number;
  middlewares: number;
  rateLimits: number;
  uptime: number;
}

export interface RouteInfo {
  id: string;
  method: string;
  path: string;
  handler: string;
  description?: string;
  tags: string[];
  deprecated: boolean;
  registeredAt: Date;
  metrics: RouteMetrics;
}

// 전역 API 게이트웨이
let globalApiGateway: ApiGateway | null = null;

/**
 * 전역 API 게이트웨이 가져오기
 */
export function getApiGateway(): ApiGateway {
  if (!globalApiGateway) {
    globalApiGateway = new ApiGateway();
  }
  return globalApiGateway;
}

export default getApiGateway;