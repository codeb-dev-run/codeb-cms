# 네이버 OAuth 설정 가이드

## 1. 네이버 개발자 센터 계정 설정

### 1.1 네이버 개발자 센터 접속
1. [네이버 개발자 센터](https://developers.naver.com) 접속
2. 네이버 계정으로 로그인

### 1.2 애플리케이션 등록
1. "Application" > "애플리케이션 등록" 클릭
2. 애플리케이션 정보 입력:
   - 애플리케이션 이름: CodeB CMS (또는 원하는 이름)
   - 사용 API: "네이버 아이디로 로그인" 선택
   - 환경 추가: PC 웹

## 2. 네이버 아이디로 로그인 설정

### 2.1 서비스 URL 설정
1. 서비스 URL 입력:
   - 개발: `http://localhost:3000`
   - 프로덕션: `https://yourdomain.com`

### 2.2 Callback URL 설정
1. 네이버 아이디로 로그인 Callback URL:
   - 개발: `http://localhost:3000/auth/naver/callback`
   - 프로덕션: `https://yourdomain.com/auth/naver/callback`

### 2.3 권한 설정
1. 필수 정보:
   - 회원 이름
   - 이메일 주소
   - 별명
   - 프로필 사진

2. 선택 정보:
   - 성별
   - 생일
   - 연령대
   - 휴대전화번호

## 3. 애플리케이션 정보 확인

### 3.1 Client ID & Secret 확인
1. "Application" > "내 애플리케이션" 메뉴
2. 생성한 애플리케이션 클릭
3. "애플리케이션 정보"에서 확인:
   - Client ID: `NAVER_CLIENT_ID`로 사용
   - Client Secret: `NAVER_CLIENT_SECRET`으로 사용

## 4. 환경 변수 설정

`.env` 파일에 다음 내용 추가:

```env
# 네이버 OAuth
NAVER_CLIENT_ID="발급받은_Client_ID"
NAVER_CLIENT_SECRET="발급받은_Client_Secret"
NAVER_REDIRECT_URI="http://localhost:3000/auth/naver/callback"
```

## 5. 테스트

### 5.1 개발 환경 테스트
1. 서버 실행: `npm run dev`
2. 브라우저에서 `/auth/naver` 접속
3. 네이버 로그인 진행
4. 정상적으로 콜백 처리되는지 확인

### 5.2 테스트 체크리스트
- [ ] 네이버 로그인 페이지로 리다이렉트
- [ ] 네이버 계정 인증 성공
- [ ] 콜백 URL로 정상 리턴
- [ ] 사용자 정보 정상 조회
- [ ] DB에 사용자 정보 저장
- [ ] 세션 생성 및 로그인 완료

## 6. 프로덕션 배포

### 6.1 프로덕션 설정
1. 네이버 개발자 센터에서 프로덕션 도메인 추가
2. 프로덕션 Callback URL 추가
3. 프로덕션 환경 변수 설정

### 6.2 검수 신청 (필요시)
1. 일일 사용자 수가 많은 경우 검수 필요
2. "애플리케이션 > 검수요청" 메뉴
3. 필요 서류 제출

### 6.3 보안 고려사항
- Client Secret은 절대 클라이언트에 노출하지 않기
- HTTPS 사용 필수
- State 파라미터로 CSRF 공격 방지
- 토큰 안전하게 저장 (Redis 세션 사용)

## 7. 트러블슈팅

### 문제: "invalid_request" 에러
**해결**: Callback URL이 등록된 것과 정확히 일치하는지 확인

### 문제: "invalid_client" 에러
**해결**: Client ID와 Client Secret이 올바른지 확인

### 문제: 사용자 정보를 받을 수 없음
**해결**: 권한 설정에서 필요한 정보를 체크했는지 확인

### 문제: "unauthorized" 에러
**해결**: 애플리케이션이 활성화 상태인지 확인

## 8. API 제한사항

### 8.1 호출 제한
- 1일 호출 제한: 1,000,000회 (검수 전: 25,000회)
- 초당 호출 제한: 10회

### 8.2 토큰 유효기간
- Access Token: 1시간
- Refresh Token: 1개월

## 9. 추가 기능

### 9.1 네이버 페이 연동
- 결제 기능 추가 시 네이버 페이 연동 가능
- 별도 계약 필요

### 9.2 네이버 클라우드 플랫폼
- SMS, 지도 등 추가 API 사용 가능
- 별도 신청 필요

### 9.3 네이버 애널리틱스
- 사용자 분석 도구 연동 가능

## 10. 참고 자료
- [네이버 개발자 센터](https://developers.naver.com)
- [네이버 로그인 API 명세](https://developers.naver.com/docs/login/api/)
- [네이버 로그인 개발가이드](https://developers.naver.com/docs/login/devguide/)
- [API 상태 확인](https://developers.naver.com/notice/api_status)