# Tool: Claude Code (claude-sonnet-5-5), autonomous developer agent
# Prompt Summary: "Scaffold functional-codebase Express 5 + TypeScript service with health route, DB module, Docker setup"
# AI Contribution: 100% AI generated / 0% human refactored
# Human Modifications: none yet
# Verification: docker compose build && docker compose up (manual)
# Confidence: Medium

# Stage 1: install all deps and compile TypeScript.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Stage 2: small runtime image with production deps only.
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY mock-data ./mock-data
COPY migrations ./migrations
# Uploaded manuscripts are written here (mounted as a named volume in compose).
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
