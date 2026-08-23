# Production Multi-Stage Dockerfile for CineConcert Ticket Booking Platform
# Stage 1: Build Frontend SPA
FROM node:22-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2: Build Backend Server
FROM node:22-alpine AS server-builder
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install
COPY server/ ./
RUN npm run build

# Stage 3: Production Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Copy Server Dependencies & Built Dist
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev

COPY --from=server-builder /app/server/dist ./dist
COPY --from=server-builder /app/server/src/db/schema.sql ./dist/db/schema.sql
COPY --from=client-builder /app/client/dist /app/client/dist

# Create persistent data directory for SQLite
RUN mkdir -p /app/server/data

VOLUME ["/app/server/data"]

EXPOSE 5000

CMD ["node", "dist/index.js"]
