FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY services/coordinator/package.json services/coordinator/package.json
RUN npm install --workspace=@order-system/shared-types --workspace=@order-system/coordinator
COPY packages/shared-types packages/shared-types
COPY services/coordinator/tsconfig.json services/coordinator/nest-cli.json services/coordinator/
COPY services/coordinator/src services/coordinator/src
RUN npm run build --workspace=@order-system/shared-types
RUN npm run build --workspace=@order-system/coordinator
COPY services/coordinator/migrations services/coordinator/migrations
RUN cd services/coordinator && npx tsc migrations/*.ts --outDir dist/migrations --module commonjs --target ES2021 --experimentalDecorators --emitDecoratorMetadata --esModuleInterop --skipLibCheck

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY services/coordinator/package.json services/coordinator/package.json
RUN npm install --workspace=@order-system/shared-types --workspace=@order-system/coordinator --omit=dev
COPY --from=build /app/packages/shared-types/dist packages/shared-types/dist
COPY --from=build /app/services/coordinator/dist services/coordinator/dist
COPY --from=build /app/services/coordinator/dist/migrations services/coordinator/migrations
EXPOSE 3000
CMD ["node", "services/coordinator/dist/main.js"]
