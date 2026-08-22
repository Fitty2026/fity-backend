FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm run prisma:generate

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ARG VCS_REF=unknown

ENV NODE_ENV=production

LABEL org.opencontainers.image.source="https://github.com/Fitty2026/fity-backend" \
      org.opencontainers.image.revision="${VCS_REF}"

RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
COPY public ./public
COPY src ./src
COPY scripts/seed-demo-closet.js ./scripts/seed-demo-closet.js
COPY deploy/smoke.mjs ./scripts/staging-smoke.mjs
COPY deploy/check-migrations.mjs ./scripts/check-migrations.mjs

RUN mkdir -p /app/var/images \
    && chown -R node:node /app

USER node

EXPOSE 3000

CMD ["node", "src/server.js"]
