# 카카오 OAuth 설정 가이드

## 1. 카카오 개발자 계정 설정

### 1.1 카카오 개발자 센터 접속
1. [Kakao Developers](https://developers.kakao.com) 접속
2. 카카오 계정으로 로그인

### 1.2 애플리케이션 생성
1. "내 애플리케이션" 클릭
2. "애플리케이션 추가하기" 클릭
3. 앱 정보 입력:
   - 앱 이름: CodeB CMS (또는 원하는 이름)
   - 사업자명: 회사명 또는 개인
   - 카테고리: 웹사이트

## 2. 앱 설정

### 2.1 앱 키 확인
1. 생성된 앱 클릭
2. "앱 키" 메뉴에서 다음 키 확인:
   - REST API 키: `KAKAO_CLIENT_ID`로 사용
   - JavaScript 키: 프론트엔드에서 SDK 사용 시 필요
   - Admin 키: 관리자 API 사용 시 필요

### 2.2 플랫폼 설정
1. "앱 설정" > "플랫폼" 메뉴
2. "Web 플랫폼 등록" 클릭
3. 사이트 도메인 입력:
   - 개발: `http://localhost:3000`
   - 프로덕션: `https://yourdomain.com`

### 2.3 Redirect URI 등록
1. "카카오 로그인" 메뉴
2. "Redirect URI 등록" 클릭
3. 다음 URI 추가:
   - 개발: `http://localhost:3000/auth/kakao/callback`
   - 프로덕션: `https://yourdomain.com/auth/kakao/callback`

## 3. 카카오 로그인 설정

### 3.1 카카오 로그인 활성화
1. "카카오 로그인" 메뉴
2. "활성화 설정" ON
3. "OpenID Connect 활성화" ON (선택사항)

### 3.2 동의 항목 설정
1. "카카오 로그인" > "동의항목" 메뉴
2. 필요한 항목 설정:
   - 프로필 정보(닉네임/프로필 사진): 필수 동의
   - 카카오계정(이메일): 선택 동의
   - 성별: 선택 동의 (필요시)
   - 연령대: 선택 동의 (필요시)
   - 생일: 선택 동의 (필요시)

### 3.3 보안 설정
1. "카카오 로그인" > "보안" 메뉴
2. Client Secret 생성:
   - "코드 생성" 클릭
   - 생성된 코드를 `KAKAO_CLIENT_SECRET`으로 사용
3. "Client Secret 사용" 상태 활성화

## 4. 환경 변수 설정

`.env` 파일에 다음 내용 추가:

```env
# 카카오 OAuth
KAKAO_CLIENT_ID="REST API 키"
KAKAO_CLIENT_SECRET="Client Secret 코드"
KAKAO_REDIRECT_URI="http://localhost:3000/auth/kakao/callback"
KAKAO_JAVASCRIPT_KEY="JavaScript 키" # 선택사항
```

## 5. 테스트

### 5.1 개발 환경 테스트
1. 서버 실행: `npm run dev`
2. 브라우저에서 `/auth/kakao` 접속
3. 카카오 로그인 진행
4. 정상적으로 콜백 처리되는지 확인

### 5.2 테스트 체크리스트
- [ ] 카카오 로그인 페이지로 리다이렉트
- [ ] 카카오 계정 인증 성공
- [ ] 콜백 URL로 정상 리턴
- [ ] 사용자 정보 정상 조회
- [ ] DB에 사용자 정보 저장
- [ ] 세션 생성 및 로그인 완료

## 6. 프로덕션 배포

### 6.1 프로덕션 설정
1. Kakao Developers에서 프로덕션 도메인 추가
2. 프로덕션 Redirect URI 추가
3. 프로덕션 환경 변수 설정

### 6.2 보안 고려사항
- Client Secret은 절대 클라이언트에 노출하지 않기
- HTTPS 사용 필수
- State 파라미터로 CSRF 공격 방지
- 토큰 안전하게 저장 (Redis 세션 사용)

## 7. 트러블슈팅

### 문제: "redirect_uri_mismatch" 에러
**해결**: Kakao Developers에서 등록한 Redirect URI와 정확히 일치하는지 확인

### 문제: "invalid_client" 에러
**해결**: Client ID와 Client Secret이 올바른지 확인

### 문제: 이메일 정보를 받을 수 없음
**해결**: 동의항목에서 이메일을 설정하고, 사용자가 동의했는지 확인

### 문제: 프로필 이미지가 표시되지 않음
**해결**: 프로필 이미지 URL이 HTTPS인지 확인, CORS 설정 확인

## 8. 추가 기능

### 8.1 카카오톡 메시지 API
- 카카오톡 메시지 전송 기능 추가 가능
- "카카오톡 메시지" 권한 필요

### 8.2 카카오페이 연동
- 결제 기능 추가 시 카카오페이 연동 가능
- 별도 심사 및 계약 필요

### 8.3 카카오 비즈니스
- 카카오톡 채널 연동
- 비즈니스 메시지 발송

## 9. 참고 자료
- [Kakao Developers 문서](https://developers.kakao.com/docs)
- [카카오 로그인 가이드](https://developers.kakao.com/docs/latest/ko/kakaologin/common)
- [REST API 레퍼런스](https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api)