# ===========================================
# CodeB CMS - Production Dockerfile
# Remix + Express + Socket.IO + Prisma
# ===========================================

# Stage 1: Base
FROM node:25-alpine AS base
RUN apk add --no-cache curl dumb-init
WORKDIR /app

# Stage 2: Dependencies
FROM base AS deps
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY prisma ./prisma/

# 모든 의존성 설치 (devDependencies 포함 - 빌드에 필요)
RUN npm ci && \
    npx prisma generate && \
    npm cache clean --force

# Stage 3: Builder
FROM deps AS builder

COPY . .

ENV NODE_ENV=production

# TypeScript 빌드 & Remix 빌드
RUN npm run build

# Production 의존성만 남기기
RUN npm prune --production && \
    npx prisma generate

# Stage 4: Runner
FROM base AS runner

# 보안용 비루트 사용자
RUN addgroup -g 1001 -S nodejs && \
    adduser -S remix -u 1001 -G nodejs

# 프로덕션 파일 복사
COPY --from=builder --chown=remix:nodejs /app/build ./build
COPY --from=builder --chown=remix:nodejs /app/public ./public
COPY --from=builder --chown=remix:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=remix:nodejs /app/prisma ./prisma
COPY --from=builder --chown=remix:nodejs /app/package.json ./

# 엔트리포인트 스크립트
COPY --chown=remix:nodejs scripts/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# 디렉토리 생성
RUN mkdir -p /app/uploads /app/logs && \
    chown -R remix:nodejs /app

USER remix

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["dumb-init", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "start"]
