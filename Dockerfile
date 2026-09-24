FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install

COPY frontend/package.json ./frontend/package.json
COPY frontend/bun.lock* ./frontend/
RUN cd frontend && bun install

COPY . .

RUN cd frontend && bun run build

ENV NODE_ENV=production
ENV port=3000

EXPOSE 3000

CMD ["bun", "run", "start"]
