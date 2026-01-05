# 예제 플러그인

이 디렉토리는 CodeB CMS 플러그인 개발을 위한 예제입니다.

## 플러그인 구조

```
example-plugin/
├── index.ts        # 플러그인 메인 파일
├── README.md       # 플러그인 문서
├── package.json    # 플러그인 종속성 (선택사항)
└── components/     # React 컴포넌트 (선택사항)
    └── widgets/    # 위젯 컴포넌트
```

## 플러그인 개발 가이드

### 1. 기본 구조

플러그인은 `IPlugin` 인터페이스를 구현해야 합니다:

```typescript
import { IPlugin } from '@/app/core/plugin-system';

class MyPlugin implements IPlugin {
  id = 'my-plugin';
  metadata = {
    name: '내 플러그인',
    version: '1.0.0',
    description: '플러그인 설명',
    author: '작성자'
  };
  
  // 플러그인 구현...
}

export default new MyPlugin();
```

### 2. 훅 사용하기

시스템의 다양한 지점에서 코드를 실행할 수 있습니다:

```typescript
hooks: IHook[] = [
  {
    name: 'post_init',
    pluginId: this.id,
    callback: async (data) => {
      console.log('초기화 후 실행');
      return data;
    }
  }
];
```

### 3. 라우트 추가하기

API 엔드포인트를 추가할 수 있습니다:

```typescript
routes: IPluginRoute[] = [
  {
    path: '/api/plugins/my-plugin/data',
    method: 'GET',
    handler: async (req) => {
      return NextResponse.json({ data: 'Hello' });
    }
  }
];
```

### 4. 메뉴 아이템 추가하기

관리자 패널에 메뉴를 추가할 수 있습니다:

```typescript
menuItems: IPluginMenuItem[] = [
  {
    id: 'my-menu',
    title: '내 메뉴',
    path: '/admin/my-plugin',
    icon: '🔌'
  }
];
```

### 5. 위젯 추가하기

대시보드나 다른 영역에 위젯을 추가할 수 있습니다:

```typescript
widgets: IPluginWidget[] = [
  {
    id: 'my-widget',
    title: '내 위젯',
    zone: 'dashboard',
    component: MyWidgetComponent
  }
];
```

## 생명주기 메서드

- `onInstall()`: 플러그인 설치 시
- `onUninstall()`: 플러그인 제거 시
- `onActivate()`: 플러그인 활성화 시
- `onDeactivate()`: 플러그인 비활성화 시
- `onUpdate(previousVersion)`: 플러그인 업데이트 시
- `init()`: 플러그인 초기화 시
- `cleanup()`: 플러그인 정리 시

## 사용 가능한 훅

- `pre_init` / `post_init`: 초기화 전/후
- `pre_render` / `post_render`: 렌더링 전/후
- `pre_save` / `post_save`: 저장 전/후
- `pre_delete` / `post_delete`: 삭제 전/후
- `filter_content`: 콘텐츠 필터링
- `filter_title`: 제목 필터링
- `user_login` / `user_logout`: 사용자 로그인/로그아웃
- `admin_menu`: 관리자 메뉴
- `dashboard_widget`: 대시보드 위젯

## 플러그인 설정

플러그인 설정은 `config` 속성을 통해 정의합니다:

```typescript
config = {
  enabled: true,
  priority: 50,
  settings: {
    apiKey: '',
    enableFeature: true
  }
};
```

## 플러그인 컨텍스트

플러그인은 컨텍스트를 통해 시스템과 상호작용합니다:

```typescript
// 로거 사용
context.logger.info('메시지');

// 설정 가져오기/저장하기
const value = context.getConfig('key');
await context.setConfig('key', value);

// 다른 플러그인 접근
const otherPlugin = context.getPlugin('other-plugin-id');

// 훅 실행
const results = await context.runHook('hook_name', data);
```

## 개발 팁

1. **에러 처리**: 모든 비동기 작업에 적절한 에러 처리를 추가하세요
2. **로깅**: 개발과 디버깅을 위해 적절한 로그를 남기세요
3. **성능**: 훅 콜백은 빠르게 실행되어야 합니다
4. **정리**: `cleanup()` 메서드에서 모든 리소스를 정리하세요
5. **버전 관리**: 시맨틱 버저닝을 사용하세요

## 테스트

플러그인을 테스트하려면:

1. 플러그인을 `/app/plugins/` 디렉토리에 배치
2. 애플리케이션 재시작
3. 관리자 패널에서 플러그인 활성화
4. 플러그인 기능 테스트

## 배포

플러그인을 배포하려면:

1. 필요한 모든 파일을 포함하는지 확인
2. `package.json`에 종속성 명시
3. 문서 작성
4. 버전 태그 지정
5. 플러그인 저장소에 업로드