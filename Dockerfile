# 드래곤볼 스플렌더 LAN 서버 이미지 (멀티스테이지)
# 1) 빌드: 단일 HTML(dist/dragonball-splendor.html) 생성
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 2) 런타임: 릴레이 서버(ws)만 설치하고 dist + server 복사
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev          # 런타임 의존성(ws)만 설치
COPY --from=build /app/dist ./dist
COPY server ./server
ENV PORT=5178
EXPOSE 5178
CMD ["node", "server/relay.mjs"]
