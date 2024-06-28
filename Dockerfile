FROM ubuntu:jammy AS builder

RUN sed -i 's/archive.ubuntu.com/mirrors.aliyun.com/g' /etc/apt/sources.list

ENV NODE_ENV="production"

RUN set -ex; \
    export DEBIAN_FRONTEND=noninteractive; \
    apt-get -qq update; \
    apt-get -y --no-install-recommends install \
      build-essential \
      ca-certificates \
      curl \
      gnupg \
      pkg-config \
      xvfb \
      libglfw3-dev \
      libuv1-dev \
      libjpeg-turbo8 \
      libicu70 \
      libcairo2-dev \
      libpango1.0-dev \
      libjpeg-dev \
      libgif-dev \
      librsvg2-dev \
      gir1.2-rsvg-2.0 \
      librsvg2-2 \
      librsvg2-common \
      libcurl4-openssl-dev \
      libpixman-1-dev \
      libpixman-1-0; \
    apt-get -y --purge autoremove; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/*;

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN mkdir -p /etc/apt/keyrings; \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg; \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list; \
    apt-get -qq update; \
    apt-get install -y nodejs; \
    npm i -g npm@latest; \
    apt-get -y remove curl gnupg; \
    apt-get -y --purge autoremove; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/*;

RUN mkdir -p /usr/src/app

WORKDIR /usr/src/app

COPY package.json /usr/src/app
COPY package-lock.json /usr/src/app
COPY node_modules_bak.zip /usr/src/app

RUN tar -xzf /usr/src/app/node_modules_bak.zip -C /usr/src/app/; \
    rm /usr/src/app/node_modules_bak.zip

RUN npm config set maxsockets 1; \
    npm config set fetch-retries 5; \
    npm config set fetch-retry-mintimeout 100000; \
    npm config set fetch-retry-maxtimeout 600000; \
    npm ci --omit=dev --registry=https://registry.npmmirror.com; \
    npm rebuild --verbose sharp; \
    chown -R root:root /usr/src/app;

FROM ubuntu:jammy AS final

RUN sed -i 's/archive.ubuntu.com/mirrors.aliyun.com/g' /etc/apt/sources.list

ENV \
    NODE_ENV="production" \
    CHOKIDAR_USEPOLLING=1 \
    CHOKIDAR_INTERVAL=500

RUN set -ex; \
    export DEBIAN_FRONTEND=noninteractive; \
    groupadd -r node; \
    useradd -r -g node node; \
    apt-get -qq update; \
    apt-get -y --no-install-recommends install \
      ca-certificates \
      curl \
      gnupg \
      xvfb \
      libglfw3 \
      libuv1 \
      libjpeg-turbo8 \
      libicu70 \
      libcairo2 \
      libgif7 \
      libopengl0 \
      libpixman-1-0 \
      libcurl4 \
      librsvg2-2 \
      libpango-1.0-0; \
      apt-get -y --purge autoremove; \
      apt-get clean; \
      rm -rf /var/lib/apt/lists/*;

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN mkdir -p /etc/apt/keyrings; \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg; \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list; \
    apt-get -qq update; \
    apt-get install -y nodejs build-essential; \
    npm i -g npm@latest --registry=https://registry.npmmirror.com;

COPY --from=builder /usr/src/app /usr/src/app

COPY ./server.js /usr/src/app
COPY ./serve_render.js /usr/src/app
COPY ./pbf2png-one.js /usr/src/app
COPY ./README.md /usr/src/app
COPY ./docker-entrypoint.sh /usr/src/app

WORKDIR /usr/src/app
RUN npm i --registry=https://registry.npmmirror.com
RUN apt-get -y remove curl gnupg build-essential; \
    apt-get -y --purge autoremove; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/*;

RUN mkdir -p /data && chown node:node /data
VOLUME /data
WORKDIR /data

EXPOSE 8080

USER root:root

ENTRYPOINT ["/usr/src/app/docker-entrypoint.sh"]

# HEALTHCHECK CMD node /usr/src/app/src/healthcheck.js
