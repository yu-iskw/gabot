FROM node:24.13.0-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages ./packages
COPY e2e ./e2e
COPY examples ./examples
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @gabot/app build

FROM node:24.13.0-bookworm-slim
RUN corepack enable
WORKDIR /app
COPY --from=build --chown=node:node /app /app
WORKDIR /app/packages/app
ENV PORT=3010
USER node
EXPOSE 3010
HEALTHCHECK --interval=10s --timeout=5s --retries=5 CMD node -e "fetch('http://127.0.0.1:3010').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist-server/serve.js"]
