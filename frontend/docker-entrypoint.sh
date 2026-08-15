#!/bin/sh
set -eu

# Cloud Run injects PORT and we inject API_HOST from Terraform. Substituting only
# these two keeps nginx's own $variables ($request_uri, $remote_addr, ...) intact —
# a blanket envsubst would blank them out.
: "${PORT:=8080}"
: "${API_HOST:?API_HOST must be set to the API hostname, without a scheme}"

# A scheme or trailing slash here would produce "https://https://host" downstream,
# which nginx reports as an obscure resolver error. Fail loudly instead.
case "$API_HOST" in
  *://*) echo "API_HOST must not include a scheme: $API_HOST" >&2; exit 1 ;;
  */*)   echo "API_HOST must be a bare hostname: $API_HOST" >&2; exit 1 ;;
esac

envsubst '${PORT} ${API_HOST}' \
  < /etc/nginx/nginx.conf.template \
  > /etc/nginx/nginx.conf

nginx -t

echo "nginx listening on ${PORT}, proxying /api/ to https://${API_HOST}"
exec nginx -g 'daemon off;'
