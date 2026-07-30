FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY services/shipping-service/package.json services/shipping-service/package.json
RUN npm install --workspace=@order-system/shared-types --workspace=@order-system/shipping-service
COPY packages/shared-types packages/shared-types
COPY services/shipping-service/tsconfig.json services/shipping-service/nest-cli.json services/shipping-service/
COPY services/shipping-service/src services/shipping-service/src
RUN npm run build --workspace=@order-system/shared-types
RUN npm run build --workspace=@order-system/shipping-service
COPY services/shipping-service/migrations services/shipping-service/migrations
RUN cd services/shipping-service && npx tsc migrations/*.ts --outDir dist/migrations --module commonjs --target ES2021 --experimentalDecorators --emitDecoratorMetadata --esModuleInterop --skipLibCheck

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY services/shipping-service/package.json services/shipping-service/package.json
RUN npm install --workspace=@order-system/shared-types --workspace=@order-system/shipping-service --omit=dev
COPY --from=build /app/packages/shared-types/dist packages/shared-types/dist
COPY --from=build /app/services/shipping-service/dist services/shipping-service/dist
COPY --from=build /app/services/shipping-service/dist/migrations services/shipping-service/migrations
EXPOSE 3004
CMD ["node", "services/shipping-service/dist/main.js"]
