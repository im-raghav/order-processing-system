FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx ng build --configuration production

FROM nginx:1.27-alpine
RUN apk add --no-cache openssl
COPY --from=build /app/dist/order-console/browser /usr/share/nginx/html
COPY nginx.open.conf /etc/nginx/templates/nginx.open.conf
COPY nginx.auth.conf /etc/nginx/templates/nginx.auth.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
