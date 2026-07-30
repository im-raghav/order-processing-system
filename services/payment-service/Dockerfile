FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY services/payment-service/package.json services/payment-service/package.json
RUN npm install --workspace=@order-system/shared-types --workspace=@order-system/payment-service
COPY packages/shared-types packages/shared-types
COPY services/payment-service/tsconfig.json services/payment-service/nest-cli.json services/payment-service/
COPY services/payment-service/src services/payment-service/src
RUN npm run build --workspace=@order-system/shared-types
RUN npm run build --workspace=@order-system/payment-service
COPY services/payment-service/migrations services/payment-service/migrations
RUN cd services/payment-service && npx tsc migrations/*.ts --outDir dist/migrations --module commonjs --target ES2021 --experimentalDecorators --emitDecoratorMetadata --esModuleInterop --skipLibCheck

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY services/payment-service/package.json services/payment-service/package.json
RUN npm install --workspace=@order-system/shared-types --workspace=@order-system/payment-service --omit=dev
COPY --from=build /app/packages/shared-types/dist packages/shared-types/dist
COPY --from=build /app/services/payment-service/dist services/payment-service/dist
COPY --from=build /app/services/payment-service/dist/migrations services/payment-service/migrations
EXPOSE 3003
CMD ["node", "services/payment-service/dist/main.js"]
