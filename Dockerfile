# Dockerfile for tempguru-mcp — primarily so Glama can introspect a
# `/mcp/servers/` listing alongside the existing `/mcp/connectors/` one.
#
# Production deploy continues to run on Vercel (Fluid Compute, App Router).
# This Dockerfile is NOT the production runtime; it exists so that any
# directory or scanner that prefers buildable source can spin up a clone
# of the server and call /mcp/initialize against it.
#
# Two-stage build keeps the runtime image small. Final image runs
# `npm start` against the standard Next.js production build.

# ─── Stage 1: build ────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

# Install build deps first (cached layer)
COPY package.json package-lock.json* ./
RUN npm ci

# Then copy source and build
COPY . .
RUN npm run build

# ─── Stage 2: runtime ──────────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next.js's default (non-standalone) output needs the full node_modules
# tree at runtime. Trade-off: larger image, but no next.config change
# needed and Vercel deploy stays untouched.
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/content ./content
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

# Health check — Glama and other scanners use this to know when the
# server is ready to accept requests.
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/v1/health || exit 1

CMD ["npm", "start"]
