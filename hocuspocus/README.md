# Hocuspocus Yjs Sync Server

WebSocket server for Yjs collaborative editing, designed to work with the Redmine Yjs plugin.

## Overview

This is an **ephemeral** Hocuspocus server - it handles real-time collaboration but does NOT persist document state. Redmine stores the final documents when users save.

**Key features:**
- ✅ Real-time Yjs CRDT synchronization
- ✅ User presence awareness
- ✅ Ephemeral collaboration (no database needed)
- ✅ Health check endpoint
- ✅ Docker-ready

## Quick Start

### Docker

```bash
docker build -t redmine-hocuspocus .
docker run -p 8081:8081 redmine-hocuspocus
```

### Node.js

```bash
npm install
npm start
```

### Health Check

```bash
curl http://localhost:8081/health
# → OK
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8081` | Server port |
| `HOCUSPOCUS_PORT` | `8081` | Alternative port variable |
| `YJS_ENABLED` | `1` | Enable/disable server |

## Deploy to Fly.io

### Prerequisites

1. Install [flyctl](https://fly.io/docs/hands-on/install-flyctl/)
2. Login: `flyctl auth login`

### Deploy

```bash
# Create app
flyctl apps create my-hocuspocus --org personal

# Deploy
flyctl deploy --dockerfile Dockerfile.fly

# Get WebSocket URL
flyctl status
# → Use: wss://my-hocuspocus.fly.dev
```

Configure in Redmine: **Administration → Plugins → Redmine Yjs → Configure**

Set Hocuspocus URL: `wss://my-hocuspocus.fly.dev`

## Docker Compose Example

```yaml
services:
  hocuspocus:
    build: ./path/to/hocuspocus
    ports:
      - "8081:8081"
    environment:
      PORT: 8081
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:8081/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 10s
      timeout: 5s
      retries: 3
```

## Logs

```bash
# Docker
docker logs <container_name>

# Fly.io
flyctl logs -a my-hocuspocus
```

## Troubleshooting

### Connection Issues

1. Check if server is running:
   ```bash
   curl http://localhost:8081/health
   ```

2. Check logs for errors

3. Verify firewall/network allows WebSocket connections

### WebSocket Not Connecting

1. Ensure the URL uses correct protocol (`ws://` or `wss://`)
2. Check browser console for CORS or connection errors
3. Verify Redmine plugin configuration matches Hocuspocus URL

## Architecture

The server uses:
- **@hocuspocus/server** - Yjs WebSocket server implementation
- **No persistence** - Ephemeral collaboration only
- **Token-based auth** - User info passed from Redmine client

When users connect:
1. Client sends user info (id, name) as token
2. Hocuspocus creates/joins document room
3. Yjs syncs changes between connected clients
4. When user saves in Redmine, the content is persisted to the database

## References

- [Hocuspocus Documentation](https://tiptap.dev/docs/hocuspocus/)
- [Yjs Documentation](https://docs.yjs.dev/)
