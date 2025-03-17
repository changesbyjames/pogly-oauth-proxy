FROM node:22-alpine

WORKDIR /usr/app
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json src ./

CMD ["npm", "start"]
