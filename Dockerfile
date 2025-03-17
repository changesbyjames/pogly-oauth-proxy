FROM node:22-alpine

WORKDIR /usr/app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src

CMD ["npx", "tsx", "src/index.ts"]
