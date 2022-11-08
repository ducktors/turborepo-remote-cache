FROM --platform=${TARGETPLATFORM} node:16.17.1-alpine3.16 as build

# set app basepath
ENV HOME=/home/app

# add app dependencies
COPY package.json $HOME/node/
COPY pnpm-lock.yaml $HOME/node/

# change workgin dir and install deps in quiet mode
WORKDIR $HOME/node

# enable pnpm and install deps
RUN corepack enable
RUN pnpm --ignore-scripts --frozen-lockfile install

# copy all app files
COPY . $HOME/node/

# compile typescript and build all production stuff
RUN pnpm build

# remove dev dependencies and files that are not needed in production
RUN rm -rf node_modules
RUN pnpm install --prod --frozen-lockfile --ignore-scripts
RUN rm -rf $PROJECT_WORKDIR/.pnpm-store

# start new image for lower size
FROM --platform=${TARGETPLATFORM} node:16.17.1-alpine3.16

# dumb-init registers signal handlers for every signal that can be caught
RUN apk update && apk add --no-cache dumb-init

# create use with no permissions
RUN addgroup -g 101 -S app && adduser -u 100 -S -G app -s /bin/false app

# set app basepath
ENV HOME=/home/app

# copy production complied node app to the new image
COPY --chown=app:app --from=build $HOME/node/ $HOME/node/

# run app with low permissions level user
USER app
WORKDIR $HOME/node

EXPOSE 3000

ENV NODE_ENV=production

ENTRYPOINT ["dumb-init"]
CMD ["node", "--enable-source-maps", "build/index.js"]
