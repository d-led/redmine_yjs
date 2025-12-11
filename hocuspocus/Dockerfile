FROM node:20-slim

WORKDIR /app

# Install dependencies for building native modules (if needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create non-root user
RUN groupadd -g 1001 nodeuser && \
    useradd -u 1001 -g nodeuser -m nodeuser && \
    chown -R nodeuser:nodeuser /app

USER nodeuser

# Expose port
EXPOSE 8081

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8081/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Start Hocuspocus server
CMD ["node", "server.js"]
