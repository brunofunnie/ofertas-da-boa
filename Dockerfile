FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation poppler-utils && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=8000 DATABASE_PATH=/data/ofertas.sqlite3 CHROME_PATH=/usr/bin/chromium
USER node
EXPOSE 8000
CMD ["node", "server.js"]
