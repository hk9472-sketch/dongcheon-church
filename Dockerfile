# ============================================================
# 동천교회 홈페이지 - Docker 프로덕션 빌드
# ============================================================

# ---- 1단계: 의존성 설치 ----
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --only=production

# ---- 2단계: 빌드 ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma 클라이언트 생성
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
RUN npx prisma generate 2>/dev/null || true

# Next.js 빌드
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- 3단계: 프로덕션 실행 ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# public 폴더 (업로드 파일, 스킨 프리뷰)
COPY --from=builder /app/public ./public

# Next.js standalone 빌드 결과
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma 마이그레이션 파일
COPY --from=builder /app/prisma ./prisma

# 업로드 디렉토리 생성
RUN mkdir -p /app/public/uploads && chown nextjs:nodejs /app/public/uploads
# 첨부파일 저장 디렉토리 (data/{boardSlug}/)
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
