FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json
RUN npm ci
COPY src src
COPY public public
COPY server server
COPY shared shared
COPY scripts scripts
COPY index.html vite.config.ts tsconfig*.json ./
RUN npm run build
EXPOSE 3000
CMD ["npm","run","start","-w","@baloch/server"]
