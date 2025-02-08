ARG PNPM_VERSION=9.15.5
ARG NODE_VERSION=20.13.1-alpine3.19

FROM node:${NODE_VERSION} AS build

# Use a more specific working directory
ENV HOME=/opt/app

# Create non-root user early in build stage
RUN addgroup -g 101 app && adduser -u 100 -D -G app -s /bin/false app

# Set ownership and permissions
WORKDIR $HOME
RUN chown app:app $HOME

# Switch to non-root user for build
USER app

# Add package files with specific ownership
COPY --chown=app:app package.json pnpm-lock.yaml ./

# Install pnpm and dependencies with specific version
RUN npm install -g pnpm@${PNPM_VERSION} && \
    pnpm install --frozen-lockfile --ignore-scripts

# Copy application code
COPY --chown=app:app . .

# Build application
RUN pnpm build:docker

# Clean up development dependencies
RUN pnpm install --prod --frozen-lockfile --ignore-scripts && \
    rm -rf .pnpm-store

# Production image
FROM node:${NODE_VERSION}

# Update system and install security packages
RUN apk update && \
    apk upgrade --no-cache && \
    apk add --no-cache dumb-init tini && \
    rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 101 app && adduser -u 100 -D -G app -s /bin/false app

# Set up application directory
WORKDIR /opt/app

# Copy only necessary files from build stage
COPY --chown=app:app --from=build /opt/app/dist ./dist
COPY --chown=app:app --from=build /opt/app/node_modules ./node_modules
COPY --chown=app:app --from=build /opt/app/package.json ./

# Set secure defaults
USER app
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=2048 --max-http-header-size=8192"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--enable-source-maps", "dist/index.js"]
