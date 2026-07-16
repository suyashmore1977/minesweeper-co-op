# Stage 1: Build the React frontend
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the React frontend using Vite
RUN npm run build

# Stage 2: Production release image
FROM node:20-slim

WORKDIR /app

# Copy package descriptors and install only production dependencies
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production

# Copy built assets and server code from builder stage
COPY --from=builder /app/server.js ./
COPY --from=builder /app/dist ./dist

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server.js"]
