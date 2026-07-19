FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY <<EOF /etc/nginx/conf.d/default.conf
server {
  listen 80;
  location / {
    root /usr/share/nginx/html;
    try_files \$uri \$uri/ /index.html;
  }
}
EOF
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
