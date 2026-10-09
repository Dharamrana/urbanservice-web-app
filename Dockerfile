FROM oven/bun:1.3.10

WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY vendor ./vendor
RUN bun install

COPY . .
RUN bun run build

ENV NODE_ENV=production
ENV DATABASE_PATH=/tmp/urbanservice.db

EXPOSE 3000

CMD ["bun", "run", "start"]
