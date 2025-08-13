# syntax=docker/dockerfile:1

# -------- Base builder image --------
FROM node:22-alpine AS deps
WORKDIR /app

# If using pnpm or yarn, copy lockfiles to leverage caching
COPY package.json ./
COPY pnpm-lock.yaml* yarn.lock* package-lock.json* ./

# Install deps (default to npm if no lockfile)
RUN if [ -f pnpm-lock.yaml ]; then \
	corepack enable && corepack prepare pnpm@latest --activate && pnpm install --frozen-lockfile; \
	elif [ -f yarn.lock ]; then \
	corepack enable && corepack prepare yarn@stable --activate && yarn install --frozen-lockfile; \
	else \
	npm ci; \
	fi

# -------- Builder --------
FROM node:22-alpine AS builder
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build with the same package manager used in deps stage
RUN if [ -f pnpm-lock.yaml ]; then \
	corepack enable && corepack prepare pnpm@latest --activate && pnpm run build; \
	elif [ -f yarn.lock ]; then \
	corepack enable && corepack prepare yarn@stable --activate && yarn build; \
	else \
	npm run build; \
	fi

# -------- Runner (minimal) --------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Copy standalone build output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Ensure correct ownership
RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000

CMD ["node", "server.js"] 