# The YCP app image: the platform backend serving the API and the built frontend
# from one origin. The build context is the repo root (`docker build .`, or the
# docker-compose.yml next to this file). The builder service has its own image —
# builder-service-backend/Dockerfile.

# Stage 1 — build the frontend bundle.
FROM node:24-alpine AS frontend-build

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Stage 2 — the platform backend plus the built UI. Node strips types natively, so
# the backend has no build step. Runs as root on purpose: the mounted daemon socket
# is root-owned.
FROM node:24-alpine

WORKDIR /app

COPY platform-backend/package.json platform-backend/package-lock.json ./
RUN npm ci --omit=dev

COPY platform-backend/src ./src
COPY --from=frontend-build /frontend/dist ./frontend-dist

# Container defaults (the config defaults suit local dev on Windows instead): listen
# on every interface — the published port decides who can reach it — talk to the
# mounted daemon socket, and serve the UI.
ENV HOST=0.0.0.0 \
    DOCKER_HOST=unix:///var/run/docker.sock \
    STATIC_DIR=/app/frontend-dist

EXPOSE 3000

CMD ["node", "src/server.ts"]
