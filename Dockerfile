FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json
RUN npm ci
COPY src src
COPY public public
COPY server server
COPY shared shared
COPY index.html vite.config.ts tsconfig*.json ./
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server/src ./server/src
COPY server/migrations ./server/migrations
COPY shared/src ./shared/src
COPY scripts ./scripts
RUN mkdir -p /data/attachments && chown node:node /data/attachments
ENV ATTACHMENT_DIR=/data/attachments
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm","run","start","-w","@baloch/server"]
