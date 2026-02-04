ARG PNPM_VERSION=10.28.2  
ARG NODE_VERSION=20.13.1-alpine3.19

FROM node:${NODE_VERSION} AS build
ENV HOME=/opt/app
ARG PACKAGE_VERSION
ENV PACKAGE_VERSION=$PACKAGE_VERSION
RUN addgroup -g 101 app && adduser -u 100 -D -G app -s /bin/false app
WORKDIR $HOME
RUN chown app:app $HOME
USER root
RUN npm install -g pnpm@${PNPM_VERSION}
USER app
COPY --chown=app:app package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --chown=app:app . .
RUN pnpm build:docker
RUN pnpm install --prod --frozen-lockfile --ignore-scripts && \
    rm -rf .pnpm-store

FROM node:${NODE_VERSION}
RUN apk update && \
    apk upgrade --no-cache && \
    apk add --no-cache tini && \
    rm -rf /var/cache/apk/*
RUN addgroup -g 101 app && adduser -u 100 -D -G app -s /bin/false app
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
