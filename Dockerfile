# Dockerfile for tempguru-mcp.
#
# Published to Docker Hub as tempguru/event-staffing via .github/workflows/docker.yml.
# Used by: Docker MCP Catalog, Glama, and any directory that prefers a buildable
# image over a remote-URL pointer.
#
# Production deploy continues to run on Vercel (Fluid Compute, App Router).
# This image is NOT the production runtime, it's a self-contained reference
# implementation. Connect to the live server directly at https://mcp.tempguru.co/mcp.
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

LABEL org.opencontainers.image.title="TempGuru Event Staffing MCP"
LABEL org.opencontainers.image.description="MCP server for W-2 event staffing data across 345 US/Canadian markets. Tools: plan_staffing, get_cities, get_roles, check_availability, get_role_pricing, get_compliance_by_state, get_rate_benchmark, request_quote."
LABEL org.opencontainers.image.vendor="Temporary Assistance Guru, Inc."
LABEL org.opencontainers.image.url="https://tempguru.co"
LABEL org.opencontainers.image.source="https://github.com/tempguru-co/tempguru-mcp"
LABEL org.opencontainers.image.documentation="https://mcp.tempguru.co/"
LABEL org.opencontainers.image.licenses="MIT"
LABEL mcp.server.name="co.tempguru/event-staffing"
LABEL mcp.server.transport="streamable-http"
LABEL mcp.server.url="https://mcp.tempguru.co/mcp"
LABEL mcp.server.tools="get_cities,get_roles,check_availability,get_role_pricing,get_compliance_by_state,request_quote"

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

# Health check, Glama and other scanners use this to know when the
# server is ready to accept requests.
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/v1/health || exit 1

CMD ["npm", "start"]
