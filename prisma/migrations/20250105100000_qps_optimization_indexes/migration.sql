-- QPS 10,000+ 지원을 위한 데이터베이스 인덱스 최적화
-- 읽기 성능 향상을 위한 복합 인덱스 추가

-- ============================================
-- 1. 게시물 관련 인덱스
-- ============================================

-- 카테고리별 최신 게시물 조회 (가장 빈번한 쿼리)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_posts_menu_published"
ON "posts" ("menuId", "publishedAt" DESC)
WHERE "status" = 'PUBLISHED';

-- 게시물 목록 페이지네이션 (커서 기반)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_posts_cursor"
ON "posts" ("menuId", "createdAt" DESC, "id");

-- 인기 게시물 조회
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_posts_popular"
ON "posts" ("menuId", "views" DESC, "likes" DESC)
WHERE "status" = 'PUBLISHED';

-- 검색 최적화 (GIN 인덱스)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_posts_search"
ON "posts" USING gin(to_tsvector('simple', "title" || ' ' || COALESCE("content", '')));

-- ============================================
-- 2. 댓글 관련 인덱스
-- ============================================

-- 게시물별 댓글 조회
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_comments_post_created"
ON "comments" ("postId", "createdAt" ASC);

-- 사용자별 댓글 조회
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_comments_user"
ON "comments" ("authorId", "createdAt" DESC);

-- ============================================
-- 3. 이벤트/참여 관련 인덱스
-- ============================================

-- 활성 이벤트 조회 (상태 + 종료일)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_events_active"
ON "participation_events" ("status", "endsAt" ASC)
WHERE "status" IN ('UPCOMING', 'OPEN');

-- 이벤트 타입별 조회
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_events_type_status"
ON "participation_events" ("type", "status", "createdAt" DESC);

-- 참여 조회 (이벤트 + 생성일)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_participations_event"
ON "participations" ("eventId", "createdAt" DESC);

-- 사용자별 참여 내역
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_participations_user"
ON "participations" ("userId", "createdAt" DESC);

-- 참여 통계 (이벤트별 선택지)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_participations_stats"
ON "participations" ("eventId", "choice");

-- ============================================
-- 4. 리더보드 관련 인덱스
-- ============================================

-- 기간별 순위 조회 (가장 빈번)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_leaderboard_period_rank"
ON "leaderboard_entries" ("period", "rank" ASC);

-- 포인트 기준 정렬
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_leaderboard_period_points"
ON "leaderboard_entries" ("period", "points" DESC);

-- ============================================
-- 5. 포인트/거래 관련 인덱스
-- ============================================

-- 사용자별 거래 내역
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_transactions_userpoints"
ON "point_transactions" ("userPointId", "createdAt" DESC);

-- 거래 타입별 조회
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_transactions_type"
ON "point_transactions" ("type", "createdAt" DESC);

-- 기간별 거래 통계
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_transactions_date"
ON "point_transactions" (DATE("createdAt"), "type");

-- ============================================
-- 6. 알림 관련 인덱스
-- ============================================

-- 사용자별 읽지 않은 알림
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_notifications_user_unread"
ON "notifications" ("userId", "createdAt" DESC)
WHERE "status" = 'PENDING';

-- 알림 타입별 조회
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_notifications_type"
ON "notifications" ("type", "createdAt" DESC);

-- ============================================
-- 7. 세션/인증 관련 인덱스
-- ============================================

-- 세션 조회 (만료되지 않은)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sessions_user_active"
ON "sessions" ("userId", "createdAt" DESC)
WHERE "expiresAt" > NOW();

-- OAuth 계정 조회
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_oauth_provider"
ON "oauth_accounts" ("provider", "providerAccountId");

-- ============================================
-- 8. 분석 쿼리 최적화
-- ============================================

-- 일별 게시물 통계
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_posts_daily_stats"
ON "posts" (DATE("createdAt"), "menuId");

-- 일별 참여 통계
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_participations_daily"
ON "participations" (DATE("createdAt"));

-- ============================================
-- 9. 기존 인덱스 최적화 (REINDEX)
-- ============================================

-- 프로덕션에서는 CONCURRENTLY 사용
-- REINDEX INDEX CONCURRENTLY idx_posts_menu_id;
-- REINDEX INDEX CONCURRENTLY idx_posts_author_id;

-- ============================================
-- 10. 통계 정보 업데이트
-- ============================================

-- 쿼리 플래너가 최적의 인덱스를 선택하도록
ANALYZE "posts";
ANALYZE "comments";
ANALYZE "participation_events";
ANALYZE "participations";
ANALYZE "leaderboard_entries";
ANALYZE "point_transactions";
ANALYZE "notifications";
ANALYZE "sessions";
