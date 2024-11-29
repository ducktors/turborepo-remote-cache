FROM node:20.18.1-alpine3.19 AS build

# set app basepath
ENV HOME=/home/app

# add app dependencies
COPY package.json $HOME/node/
COPY pnpm-lock.yaml $HOME/node/

# change working dir and install deps
WORKDIR $HOME/node

# enable pnpm and install deps
RUN corepack enable
RUN pnpm --ignore-scripts --frozen-lockfile install

# copy all app files
COPY . $HOME/node/

# compile typescript and build all production stuff
RUN pnpm build:docker

# remove dev dependencies and files that are not needed in production
RUN rm -rf node_modules
RUN pnpm install --prod --frozen-lockfile --ignore-scripts
RUN rm -rf $PROJECT_WORKDIR/.pnpm-store

# start new image for lower size
FROM node:20.13.1-alpine3.19

# Update OpenSSL and install dumb-init
RUN apk update && \
    apk upgrade openssl && \
    apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# create user with no permissions
RUN addgroup -g 101 app && adduser -u 100 -D -G app -s /bin/false app

# set app basepath
ENV HOME=/home/app

# copy production compiled node app to the new image
COPY --chown=app:app --from=build $HOME/node/ $HOME/node/

# run app with low permissions level user
USER app
WORKDIR $HOME/node

EXPOSE 3000

ENV NODE_ENV=production

ENTRYPOINT ["dumb-init"]
CMD ["node", "--enable-source-maps", "dist/index.js"]
