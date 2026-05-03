FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache \
    tesseract-ocr \
    tesseract-ocr-data-eng \
    ghostscript \
    poppler-utils \
    curl \
    postgresql-client \
    openssh-client \
    bash

# ─── Dependencies ──────────────────────────────
FROM base AS deps
COPY package*.json ./
RUN npm install --only=production --prefer-offline && npm cache clean --force

# ─── Builder ───────────────────────────────────
FROM base AS builder
COPY package*.json ./
RUN npm install --prefer-offline
COPY . .
RUN npm run build

# ─── Production ────────────────────────────────
FROM base AS production
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

RUN mkdir -p /app/uploads /app/backups /app/logs /app/ssh && \
    chmod 750 /app/uploads /app/backups /app/logs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "dist/main.js"]
