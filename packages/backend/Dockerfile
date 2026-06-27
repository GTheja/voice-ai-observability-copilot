FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/backend/package.json packages/backend/package.json
RUN npm install --workspaces --include-workspace-root --omit=dev || npm install
COPY packages/shared packages/shared
COPY packages/backend packages/backend
WORKDIR /app/packages/backend
EXPOSE 8080
CMD ["node", "src/server.js"]
