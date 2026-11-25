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
# Reinstall from an empty node_modules to avoid leaving dev-only packages in
# node_modules/.pnpm, which would ship in the image.
RUN rm -rf node_modules && \
    pnpm install --prod --frozen-lockfile --ignore-scripts && \
    rm -rf .pnpm-store

FROM node:24.22.3-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5
RUN apk update && \
    apk upgrade --no-cache && \
    apk add --no-cache tini && \
    rm -rf /var/cache/apk/*
# The server only needs node. Remove the package managers that the base image ships.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg
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
