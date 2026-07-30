FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY services/order-service/package.json services/order-service/package.json
RUN npm install --workspace=@order-system/shared-types --workspace=@order-system/order-service
COPY packages/shared-types packages/shared-types
COPY services/order-service/tsconfig.json services/order-service/nest-cli.json services/order-service/
COPY services/order-service/src services/order-service/src
RUN npm run build --workspace=@order-system/shared-types
RUN npm run build --workspace=@order-system/order-service
COPY services/order-service/migrations services/order-service/migrations
RUN cd services/order-service && npx tsc migrations/*.ts --outDir dist/migrations --module commonjs --target ES2021 --experimentalDecorators --emitDecoratorMetadata --esModuleInterop --skipLibCheck

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY services/order-service/package.json services/order-service/package.json
RUN npm install --workspace=@order-system/shared-types --workspace=@order-system/order-service --omit=dev
COPY --from=build /app/packages/shared-types/dist packages/shared-types/dist
COPY --from=build /app/services/order-service/dist services/order-service/dist
COPY --from=build /app/services/order-service/dist/migrations services/order-service/migrations
EXPOSE 3001
CMD ["node", "services/order-service/dist/main.js"]
