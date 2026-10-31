# Arise: one image that serves the API and the built PWA. Caddy (deploy/compose.yaml) terminates TLS in front of it.

FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci
COPY . .
RUN npm run build

FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=8787
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev -w backend --include-workspace-root && npm cache clean --force
COPY shared shared
COPY backend/src backend/src
COPY --from=build /app/frontend/dist frontend/dist
EXPOSE 8787
CMD ["node", "backend/src/server.ts"]
