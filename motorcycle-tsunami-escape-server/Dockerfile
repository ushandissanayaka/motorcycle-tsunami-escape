# Motorcycle Tsunami Escape backend (Colyseus) -> Bloxity Legion
# Built by .github/workflows/deploy.yml and pushed to GHCR; Legion pulls and runs it.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Dependencies first so they are cached between builds.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# profiles.json is written here at runtime; the node user must own it.
RUN mkdir -p data && chown -R node:node /app
USER node

ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
ENV PORT=2567
EXPOSE 2567

CMD ["node", "src/index.js"]
