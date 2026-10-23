FROM oven/bun:1.4.4-slim AS build
WORKDIR /app
COPY . .
RUN bun install
RUN bun run build

FROM oven/bun:1.4.4-slim
WORKDIR /app
COPY --from=build /app/.next/standalone .
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
CMD ["bun", "server.js"]
