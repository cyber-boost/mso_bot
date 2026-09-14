# ---- Build stage ----
FROM node:22-slim AS build

WORKDIR /app

# Install deps first (cache layer). Use install (not ci): the committed lockfile
# can drift out of sync with the resolution that npm in this image produces
# (e.g. lru-cache), which makes strict `npm ci` fail. `npm install` reconciles.
COPY package.json package-lock.json ./
RUN npm install

# Copy source + platform chrome + scripts.
COPY ./ ./
# Exclude artifacts we don't need in the builder image.
# (.dockerignore already excludes node_modules, .output, .vercel)

# Build the production Nitro server (node-server preset -> .output/).
RUN npm run build

# ---- Runtime stage ----
FROM node:22-slim AS runtime

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
WORKDIR /app

# Only the built server + its bundled deps are needed at runtime.
COPY --from=build /app/.output .output

EXPOSE 8080

# Nitro node-server entrypoint. It reads PORT/HOST from the environment.
CMD ["node", ".output/server/index.mjs"]
