FROM node:20-alpine

WORKDIR /app

# Install dependencies for building native modules (if needed)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create non-root user
RUN addgroup -g 1001 nodeuser && \
    adduser -D -u 1001 -G nodeuser nodeuser && \
    chown -R nodeuser:nodeuser /app

USER nodeuser

# Expose port
EXPOSE 8081

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8081/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Start Hocuspocus server
CMD ["node", "server.js"]
