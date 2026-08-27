FROM node:24-bookworm-slim AS build

RUN npm config set registry https://registry.npmmirror.com/ && npm install -g pnpm@11.19.0

WORKDIR /app/backend

COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml backend/tsconfig.json ./

RUN pnpm config set registry https://registry.npmmirror.com/ \
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
