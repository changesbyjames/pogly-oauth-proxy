FROM node:22-slim

WORKDIR /usr/app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN touch .env

CMD ["npm", "start"]
