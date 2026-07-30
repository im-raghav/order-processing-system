FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY services/notification-service/package.json services/notification-service/package.json
RUN npm install --workspace=@order-system/shared-types --workspace=@order-system/notification-service
COPY packages/shared-types packages/shared-types
COPY services/notification-service/tsconfig.json services/notification-service/nest-cli.json services/notification-service/
COPY services/notification-service/src services/notification-service/src
RUN npm run build --workspace=@order-system/shared-types
RUN npm run build --workspace=@order-system/notification-service
COPY services/notification-service/migrations services/notification-service/migrations
RUN cd services/notification-service && npx tsc migrations/*.ts --outDir dist/migrations --module commonjs --target ES2021 --experimentalDecorators --emitDecoratorMetadata --esModuleInterop --skipLibCheck

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY services/notification-service/package.json services/notification-service/package.json
RUN npm install --workspace=@order-system/shared-types --workspace=@order-system/notification-service --omit=dev
COPY --from=build /app/packages/shared-types/dist packages/shared-types/dist
COPY --from=build /app/services/notification-service/dist services/notification-service/dist
COPY --from=build /app/services/notification-service/dist/migrations services/notification-service/migrations
EXPOSE 3005
CMD ["node", "services/notification-service/dist/main.js"]
