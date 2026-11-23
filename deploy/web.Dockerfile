# syntax=docker/dockerfile:1
# Frontend build served by nginx (build context: frontend/, extra context `deploy`).
# The API is proxied under /api on the same origin, so the bundle calls /api/... .

FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV VITE_API_BASE_URL=/api
RUN npm run build

FROM nginx:1.29-alpine
COPY --from=deploy nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
