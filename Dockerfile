# Luma Haven — build the static game, then serve it with nothing but Node.
#
#   docker build -t luma-haven .
#   docker run -p 4173:4173 luma-haven
#
# The runtime stage carries no dependencies at all: the game is a static
# bundle and server.mjs uses only the Node standard library.

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4173
ENV HOST=0.0.0.0

COPY --from=build /app/dist ./dist
COPY server.mjs ./

EXPOSE 4173
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
