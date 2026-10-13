# syntax=docker/dockerfile:1.7
# Build context is the repository root:  docker build -f apps/api/Dockerfile -t iskcon-api .

FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
# Dependency layer first so it is cached until a manifest changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/rules-engine/package.json packages/rules-engine/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @iskcon/api...
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @iskcon/api... build
# A self-contained production tree: compiled code plus production dependencies only.
RUN pnpm --filter @iskcon/api deploy --prod --legacy /out

FROM node:22-slim AS runtime
ENV NODE_ENV=production PORT=4000
RUN useradd --system --uid 10001 --create-home app
WORKDIR /app
COPY --from=build --chown=app:app /out ./
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Migrations run on start when RUN_MIGRATIONS_ON_BOOT=true (single instance), or as a separate job:
#   docker run --rm --env-file .env iskcon-api node dist/database/migrate.js
CMD ["node", "dist/main.js"]
