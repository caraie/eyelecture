# syntax=docker/dockerfile:1

# ---- Stage 1: build the Angular bundle ---------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# The production configuration has Google Fonts inlining disabled, so the build
# needs no outbound network — which is what makes it work in a sandboxed builder.
RUN npm run build -- --configuration production

# ---- Stage 2: serve with nginx -----------------------------------------------
FROM nginx:1.27-alpine AS runtime

# envsubst ships in gettext; the base image does not include it.
RUN apk add --no-cache gettext

COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.d/eyelecture-entrypoint.sh

# nginx must be able to rewrite its own config at boot, and the stock image owns
# these paths as root. Grant the unprivileged user just what it needs.
RUN chmod +x /docker-entrypoint.d/eyelecture-entrypoint.sh \
 && touch /etc/nginx/nginx.conf \
 && chown -R nginx:nginx /etc/nginx /usr/share/nginx/html \
 && chmod 644 /etc/nginx/nginx.conf.template

ENV PORT=8080

USER nginx
EXPOSE 8080

ENTRYPOINT ["/docker-entrypoint.d/eyelecture-entrypoint.sh"]
