# Stage 1: Build minimal Vite frontend
FROM node:22-slim AS web-builder
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web ./
RUN npm run build

# Stage 2: Build single-binary Rust server
FROM rust:1-slim AS rust-builder
WORKDIR /app
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY migrations ./migrations
COPY seed/seed-bundle.json ./seed/seed-bundle.json
RUN cargo build --release -p toc-server

# Stage 3: Minimal runtime image
FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y ca-certificates curl fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
COPY --from=rust-builder /app/target/release/toc-server /app/toc-server
COPY --from=web-builder /app/web/dist /app/web/dist

ENV PORT=3001
ENV WEB_DIST_DIR=/app/web/dist
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/v1/health" || exit 1
CMD ["/app/toc-server"]
