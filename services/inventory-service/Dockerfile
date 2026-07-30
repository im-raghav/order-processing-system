FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY services/inventory-service/package.json services/inventory-service/package.json
RUN npm install --workspace=@order-system/shared-types --workspace=@order-system/inventory-service
COPY packages/shared-types packages/shared-types
COPY services/inventory-service/tsconfig.json services/inventory-service/nest-cli.json services/inventory-service/
COPY services/inventory-service/src services/inventory-service/src
RUN npm run build --workspace=@order-system/shared-types
RUN npm run build --workspace=@order-system/inventory-service
COPY services/inventory-service/migrations services/inventory-service/migrations
RUN cd services/inventory-service && npx tsc migrations/*.ts --outDir dist/migrations --module commonjs --target ES2021 --experimentalDecorators --emitDecoratorMetadata --esModuleInterop --skipLibCheck

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY services/inventory-service/package.json services/inventory-service/package.json
RUN npm install --workspace=@order-system/shared-types --workspace=@order-system/inventory-service --omit=dev
COPY --from=build /app/packages/shared-types/dist packages/shared-types/dist
COPY --from=build /app/services/inventory-service/dist services/inventory-service/dist
COPY --from=build /app/services/inventory-service/dist/migrations services/inventory-service/migrations
EXPOSE 3002
CMD ["node", "services/inventory-service/dist/main.js"]
