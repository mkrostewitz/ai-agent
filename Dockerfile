# 1) Base image for building
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the source & build
COPY . .
RUN npm run build

# 2) Runtime image
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Copy only what we need for runtime
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

CMD ["npm", "start"]
