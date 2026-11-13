# syntax=docker/dockerfile:1

# LibreOffice is the whole reason this service exists, and it is a Debian-shaped
# dependency — the Alpine build the rest of the stack uses has no working
# headless Impress. So this one image is Debian, and it is the only place in the
# repo that carries a ~700MB office suite. Keeping it out of the API image is
# the entire point of the service being separate.
FROM node:22-bookworm-slim

WORKDIR /app

# libreoffice-impress rather than libreoffice: the meta-package drags in Writer,
# Calc, Base and Java for about twice the size, and all that is needed here is
# the thing that opens a deck. The fonts matter — without them LibreOffice
# substitutes, and a converted deck comes out with the wrong line breaks.
RUN apt-get update \
  && apt-get install --no-install-recommends -y \
    libreoffice-impress \
    libreoffice-writer \
    fonts-liberation \
    fonts-dejavu-core \
    fonts-noto-core \
    dumb-init \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=8080
# LibreOffice writes its profile under HOME. The server overrides this per
# conversion, but a sane default keeps a stray invocation out of /.
ENV HOME=/tmp

COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY src ./src

USER node

EXPOSE 8080
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
