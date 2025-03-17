FROM node:22-alpine

WORKDIR /usr/app
COPY . .

RUN npm install
RUN npm install -g tsx

# Directly call tsx to avoid npm eating the signals, e.g. SIGINT, SIGTERM, etc.
CMD ["tsx", "src/index.ts"]