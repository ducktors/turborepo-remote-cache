ARG PNPM_VERSION=10.33.0

FROM node:24.22.3-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS build
ARG PNPM_VERSION
ENV HOME=/opt/app
ENV CI=true
ARG PACKAGE_VERSION
ENV PACKAGE_VERSION=$PACKAGE_VERSION
RUN addgroup -g 1001 app && adduser -u 1001 -D -G app -s /bin/false app
WORKDIR $HOME
RUN chown app:app $HOME
USER root
RUN npm install -g corepack@latest && corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
USER app
COPY --chown=app:app package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --chown=app:app . .
RUN pnpm build:docker
RUN pnpm install --prod --frozen-lockfile --ignore-scripts && \
    rm -rf .pnpm-store

FROM node:24.22.3-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5
RUN apk update && \
    apk upgrade --no-cache && \
    apk add --no-cache tini && \
    rm -rf /var/cache/apk/*
RUN addgroup -g 1001 app && adduser -u 1001 -D -G app -s /bin/false app
WORKDIR /opt/app
COPY --chown=app:app --from=build /opt/app/dist ./dist
COPY --chown=app:app --from=build /opt/app/node_modules ./node_modules
COPY --chown=app:app --from=build /opt/app/package.json ./
ARG PACKAGE_VERSION
ENV PACKAGE_VERSION=$PACKAGE_VERSION
USER app
ENV NODE_ENV=production
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--enable-source-maps", "dist/index.js"]
