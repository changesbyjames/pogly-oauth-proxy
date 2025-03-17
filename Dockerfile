FROM node:22-alpine
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable


WORKDIR /usr/app
COPY . .

RUN pnpm install
RUN pnpm add -g tsx

# Directly call tsx to avoid npm eating the signals, e.g. SIGINT, SIGTERM, etc.
CMD ["tsx", "src/index.ts"]