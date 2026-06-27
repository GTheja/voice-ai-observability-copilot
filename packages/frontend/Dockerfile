FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
COPY packages/frontend/package.json packages/frontend/package.json
RUN npm install --workspace @copilot/frontend || npm install
COPY packages/frontend packages/frontend
WORKDIR /app/packages/frontend
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html
EXPOSE 80
