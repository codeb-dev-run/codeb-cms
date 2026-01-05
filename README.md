# CodeB CMS

> QPS 10,000+ 지원 고성능 한국형 커뮤니티 플랫폼

## ✨ 주요 기능

### 🚀 QPS 10K 성능 최적화
- **N+1 쿼리 최적화**: Promise.all + 다층 캐싱
- **조회수 배치 처리**: Redis 카운터 + 5분 주기 DB 플러시
- **Connection Pooling**: Master-Replica 읽기/쓰기 분리
- **Rate Limiting**: 슬라이딩 윈도우 알고리즘
- **15+ DB 인덱스**: 복합 인덱스 최적화
- **CDN 캐시**: ETag, Cache-Control 최적화
- **실시간 메시지 배칭**: 50ms 윈도우 집계

### 🎯 핵심 기능
- **현대적 아키텍처**: Remix 2.16 기반 풀스택 애플리케이션
- **한국형 CMS**: 한국 사용자를 위한 최적화된 UI/UX
- **실시간 통신**: Centrifugo WebSocket 서버
- **소셜 로그인**: 카카오, 네이버 OAuth 통합
- **결제 시스템**: 토스페이먼츠 연동
- **SMS 알림**: 네이버 SENS 연동

### 🎮 참여 시스템
- **투표/설문**: 실시간 투표 이벤트
- **포인트 시스템**: 활동 보상 및 사용
- **리더보드**: 일간/주간/월간/전체 순위
- **추첨 이벤트**: 자동 당첨자 선정

### 📱 PWA 지원
- **오프라인 모드**: Service Worker 캐싱
- **설치 프롬프트**: 홈 화면 추가
- **푸시 알림**: Web Push 지원

### 📊 어드민 대시보드
- **성능 모니터링**: 실시간 QPS/레이턴시 추적
- **캐시 히트율**: Redis 성능 시각화
- **시스템 헬스**: DB/Redis/Centrifugo 상태
- **이벤트 관리**: 참여 이벤트 생성/관리
- **포인트 관리**: 지급/차감/이력 조회

### 🔒 보안
- **JWT 인증**: 안전한 토큰 기반 인증
- **CSRF 보호**: 토큰 기반 요청 검증
- **입력 검증**: Zod 스키마 기반
- **Rate Limiting**: API 호출 제한
- **보안 헤더**: CSP, HSTS, XSS 보호

## 🛠️ 기술 스택

### Frontend
- **Remix 2.16**: 풀스택 React 프레임워크
- **TypeScript**: 정적 타입 검사
- **Tailwind CSS**: 유틸리티 기반 CSS
- **Shadcn/ui**: 모던 UI 컴포넌트
- **Centrifuge-js**: 실시간 WebSocket 클라이언트

### Backend
- **Node.js**: 서버 런타임
- **Prisma**: 타입 안전 ORM
- **PostgreSQL**: 관계형 데이터베이스
- **Redis Cluster**: 분산 캐싱
- **Centrifugo**: 고성능 WebSocket 서버

### 인프라
- **Podman/Docker**: 컨테이너화
- **Caddy**: 리버스 프록시 & SSL
- **GitHub Actions**: CI/CD 파이프라인

## 📁 프로젝트 구조

```
codeb-cms/
├── app/
│   ├── components/        # React 컴포넌트
│   │   ├── admin/         # 어드민 컴포넌트
│   │   ├── events/        # 이벤트 컴포넌트
│   │   ├── pwa/           # PWA 컴포넌트
│   │   └── ui/            # UI 컴포넌트
│   ├── hooks/             # React 훅
│   ├── lib/               # 서버 라이브러리
│   │   ├── centrifugo/    # Centrifugo 연동
│   │   ├── cdn/           # CDN 최적화
│   │   ├── database/      # DB 연결 풀링
│   │   ├── middleware/    # Rate Limiting 등
│   │   ├── monitoring/    # 성능 모니터링
│   │   ├── performance/   # QPS 최적화
│   │   ├── points/        # 포인트 시스템
│   │   └── realtime/      # 실시간 부하분산
│   ├── routes/            # Remix 라우트
│   └── stores/            # 상태 관리
├── prisma/
│   ├── schema.prisma      # DB 스키마
│   └── migrations/        # 마이그레이션
├── public/
│   ├── manifest.json      # PWA 매니페스트
│   └── sw.js              # Service Worker
└── scripts/               # 유틸리티 스크립트
```

## 🚀 시작하기

### 1. 저장소 클론
```bash
git clone https://github.com/codeb-dev-run/codeb-cms.git
cd codeb-cms
```

### 2. 환경 변수 설정
```bash
cp .env.example .env
# .env 파일 편집
```

### 3. 의존성 설치
```bash
npm install
```

### 4. 데이터베이스 설정
```bash
npx prisma migrate dev
npx prisma db seed
```

### 5. 개발 서버 시작
```bash
npm run dev
```

## 🐳 프로덕션 배포

### CodeB 인프라 배포 (권장)
```bash
# 프로젝트 초기화
we workflow init codeb-cms --type nextjs --database --redis

# 배포
we deploy codeb-cms --environment production

# 도메인 설정
we domain setup cms.codeb.kr --ssl
```

### Docker 배포
```bash
docker build -t codeb-cms .
docker run -p 3000:3000 codeb-cms
```

## 📊 모니터링

### 성능 대시보드
- **어드민**: `/admin/performance`
- **API**: `/api/admin/performance`

### 헬스체크
```bash
curl http://localhost:3000/health
```

### 메트릭
- 요청/분 (RPM)
- 평균 응답시간
- P95/P99 레이턴시
- 캐시 히트율
- 에러율
- Rate Limit 차단 수

## 🧪 테스트

```bash
# 단위 테스트
npm run test

# E2E 테스트
npm run test:e2e

# 타입 체크
npm run type-check
```

## 📈 성능 지표

| 메트릭 | 목표 | 현재 |
|--------|------|------|
| QPS | 10,000+ | ✅ |
| 평균 응답시간 | < 200ms | ✅ |
| P99 레이턴시 | < 2s | ✅ |
| 캐시 히트율 | > 80% | ✅ |
| 에러율 | < 1% | ✅ |

## 📚 문서

- [개발 설정 가이드](docs/DEVELOPMENT_SETUP.md)
- [카카오 OAuth 설정](docs/kakao-oauth-setup.md)
- [네이버 OAuth 설정](docs/naver-oauth-setup.md)

## 라이선스

MIT License

## 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 문의

프로젝트 관련 문의사항은 [이슈](https://github.com/codeb-dev-run/codeb-cms/issues)를 통해 남겨주세요.
