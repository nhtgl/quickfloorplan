# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app

# Dependencies first, so a source-only change does not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# nginx-unprivileged listens on 8080 and runs as a non-root user out of the box.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

LABEL org.opencontainers.image.title="QuickFloorPlan" \
      org.opencontainers.image.description="Sketch a flat's walls, openings and rooms, and export a measured PDF. A measurement document, not a visualisation." \
      org.opencontainers.image.source="https://github.com/nhtgl/quickfloorplan" \
      org.opencontainers.image.licenses="MIT"

COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf docker/security-headers.conf /etc/nginx/conf.d/

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
