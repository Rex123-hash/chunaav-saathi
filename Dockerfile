# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy manifests first — leverages Docker layer cache
COPY package*.json ./

# Install production deps only; skip lifecycle scripts for security + speed
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

# ── Stage 2: final image ──────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Security: run as non-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nodeapp

WORKDIR /app

# Copy pruned node_modules from deps stage
COPY --from=deps --chown=nodeapp:nodejs /app/node_modules ./node_modules

# Copy application source
COPY --chown=nodeapp:nodejs src/ ./src/
COPY --chown=nodeapp:nodejs public/ ./public/
COPY --chown=nodeapp:nodejs package.json ./package.json

# Cloud Run standard port
EXPOSE 8080

# Switch to non-root user
USER nodeapp

# Health check — Cloud Run probes /health by default
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

ENV NODE_ENV=production \
    PORT=8080

CMD ["node", "src/index.js"]
