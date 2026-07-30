#!/bin/sh
set -e

if [ -n "$BASIC_AUTH_USER" ] && [ -n "$BASIC_AUTH_PASSWORD" ]; then
  echo "Enabling HTTP Basic Auth for user '$BASIC_AUTH_USER'"
  HASH=$(openssl passwd -apr1 "$BASIC_AUTH_PASSWORD")
  echo "$BASIC_AUTH_USER:$HASH" > /etc/nginx/.htpasswd
  cp /etc/nginx/templates/nginx.auth.conf /etc/nginx/conf.d/default.conf
else
  echo "BASIC_AUTH_USER/BASIC_AUTH_PASSWORD not set - serving without a Basic Auth gate (fine for local docker-compose, NOT recommended for a public deployment)"
  cp /etc/nginx/templates/nginx.open.conf /etc/nginx/conf.d/default.conf
fi

exec nginx -g 'daemon off;'
