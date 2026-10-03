# The builder service image. The repo root's docker-compose.yml runs it next to the
# platform with the daemon socket mounted; for local dev it still runs on the host
# via `npm run dev`. git is the only binary the worker spawns.
FROM node:24-alpine

RUN apk add --no-cache git

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# Container default (the config default is the WSL tcp endpoint instead): talk to
# the mounted daemon socket. PLATFORM_API_URL is deployment wiring — compose sets it.
ENV DOCKER_HOST=unix:///var/run/docker.sock

CMD ["node", "src/main.ts"]
