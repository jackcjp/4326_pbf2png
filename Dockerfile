FROM node:10-buster AS builder

RUN export DEBIAN_FRONTEND=noninteractive \
  && apt-get -qq update \
  && apt-get -y --no-install-recommends install \
      apt-transport-https \
      curl \
      unzip \
      build-essential \
      python \
      libcairo2-dev \
      libgles2-mesa-dev \
      libgbm-dev \
      libllvm7 \
      libprotobuf-dev \
  && apt-get -y --purge autoremove \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

COPY . /usr/src/app
RUN unzip /usr/src/app/node_modules_bak.zip -d /usr/src/app/node_modules
RUN rm /usr/src/app/node_modules_bak.zip
ENV NODE_ENV="production"

RUN cd /usr/src/app && npm --registry https://registry.npm.taobao.org install --production
RUN npm rebuild --verbose sharp


FROM node:10-buster-slim AS final

RUN export DEBIAN_FRONTEND=noninteractive \
  && apt-get -qq update \
  && apt-get -y --no-install-recommends install \
      libgles2-mesa \
      libegl1 \
      xvfb \
      xauth \
  && apt-get -y --purge autoremove \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/src/app /app

ENV NODE_ENV="production"
ENV CHOKIDAR_USEPOLLING=1
ENV CHOKIDAR_INTERVAL=500

VOLUME /data
WORKDIR /data

EXPOSE 80

USER node:node

# ENTRYPOINT ["/app/docker-entrypoint.sh"]
# CMD ["-p", "80"]
