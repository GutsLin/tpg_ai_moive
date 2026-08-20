FROM node:24-bookworm-slim AS build

ENV COREPACK_NPM_REGISTRY=https://registry.npmjs.org/

RUN corepack enable

WORKDIR /app/backend

COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml backend/tsconfig.json ./

RUN pnpm config set registry https://registry.npmjs.org/ \
  && pnpm install --frozen-lockfile

COPY backend/src ./src

RUN pnpm build
RUN pnpm prune --prod

FROM node:24-bookworm-slim AS runtime

WORKDIR /app/backend

ENV NODE_ENV=production

COPY --from=build /app/backend/package.json ./
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist

EXPOSE 3000

CMD ["node", "dist/app.js"]
