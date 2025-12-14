# Redmine Yjs Collaborative Editing Plugin

Real-time collaborative editing for Redmine using [Yjs](https://github.com/yjs/yjs) CRDTs and [Hocuspocus](https://github.com/ueberdosis/hocuspocus) WebSocket server.

## What Problem Does This Solve?

This plugin addresses a long-standing feature request for real-time collaborative editing in Redmine, as discussed in [Feature #10568](https://www.redmine.org/issues/10568). Multiple users can now edit wiki pages, issue descriptions, and notes simultaneously with live synchronization—similar to Google Docs.

## Features

- Real-time sync with conflict-free merging (CRDT)
- User presence indicators with colored cursors
- Works with CKEditor and plain text editors
- Offline support with auto-sync on reconnect
- Ephemeral collaboration (Redmine stores final documents)

## Compatibility

| Redmine Version | Plugin Version | Status                   |
|-----------------|----------------|--------------------------|
| 6.0.x           | 1.0.0+         | ✅ Supported (tested)    |
| 6.1.x           | 1.0.0+         | ⚠️ Might work (untested) |
| 5.1.x           | 1.0.0+         | ⚠️ Might work (untested) |
| 5.0.x           | 1.0.0+         | ⚠️ Might work (untested) |
| 4.x and earlier | -              | ❌ Not supported         |

### Requirements

- **Ruby**: 3.0+ (same as Redmine 5.x/6.x)
- **Rails**: 6.1+ (same as Redmine 5.x/6.x)
- **Node.js**: 18+ (for Hocuspocus server)
- **Browser**: Modern browsers with WebSocket support

## Installation

### 1. Install the Plugin

```bash
cd /path/to/redmine/plugins
git clone https://github.com/your-org/redmine_yjs.git

# Copy assets (Redmine 6.x)
mkdir -p ../public/plugin_assets/redmine_yjs
cp -r redmine_yjs/assets/* ../public/plugin_assets/redmine_yjs/

# Run migrations
cd /path/to/redmine
bundle exec rake redmine:plugins:migrate RAILS_ENV=production

# Restart Redmine
```

### 2. Deploy Hocuspocus Server

**Important**: This plugin requires a separate Hocuspocus WebSocket server. You must deploy and maintain this backend service.

**Security Recommendation**: Put an authenticating proxy (e.g., nginx with authentication, Traefik, or similar) in front of both Redmine and the Hocuspocus server to ensure only authenticated users can access the collaboration features.

#### Quick Start (Docker)

```bash
docker run -p 8081:8081 ghcr.io/d-led/redmine_yjs-hocuspocus:latest
```

Or in Docker Compose:

```yaml
services:
  hocuspocus:
    image: ghcr.io/d-led/redmine_yjs-hocuspocus:latest
    ports:
      - "8081:8081"
```

#### Other Deployment Options

- **Build locally**: `cd redmine_yjs/hocuspocus && docker build -t hocuspocus . && docker run -p 8081:8081 hocuspocus`
- **Standalone Node.js**: `cd redmine_yjs/hocuspocus && npm install && npm start`
- **Fly.io**: `cd redmine_yjs/hocuspocus && ./fly-deploy.sh`

See [Hocuspocus Deployment](#hocuspocus-deployment) for detailed instructions.

### 3. Configure the Plugin

Set the Hocuspocus WebSocket URL:
- **Administration → Plugins → Redmine Yjs → Configure**
- Or via environment variable: `HOCUSPOCUS_URL=wss://your-hocuspocus.example.com`

## Configuration

### Environment Variables

| Variable         | Default       | Description                                    |
|------------------|---------------|------------------------------------------------|
| `HOCUSPOCUS_URL` | Auto-detected | WebSocket URL for Hocuspocus server            |
| `YJS_ENABLED`    | `1`           | Enable/disable collaborative editing (`1`/`0`) |

The plugin auto-detects the Hocuspocus URL based on environment:
- Docker: `ws://localhost:3000/ws` (via Traefik)
- Production: `wss://hocuspocus.fly.dev`
- Development: `ws://localhost:8081`

### Manual Configuration

1. Go to **Administration → Plugins**
2. Click **Configure** on "Redmine Yjs Collaborative Editing"
3. Set the Hocuspocus WebSocket URL
4. Enable/disable the plugin

## Usage

Once enabled, collaborative editing works automatically for:
- Issue descriptions and notes
- Wiki pages
- Any textarea fields

**Visual indicators**:
- 🟢 Green dot: Connected and syncing
- 🟠 Orange dot: Connecting...
- 🔴 Red dot: Disconnected (changes saved locally)

## Hocuspocus Deployment

The `hocuspocus/` directory contains a ready-to-deploy Hocuspocus server.

### Docker

```bash
cd hocuspocus
docker build -t redmine-hocuspocus .
docker run -p 8081:8081 redmine-hocuspocus
```

### Docker Compose

```yaml
services:
  hocuspocus:
    build: ./plugins/redmine_yjs/hocuspocus
    ports:
      - "8081:8081"
    environment:
      PORT: 8081
```

### Fly.io

```bash
cd hocuspocus
flyctl apps create my-hocuspocus --org personal
flyctl deploy --config fly.toml
# Use: wss://my-hocuspocus.fly.dev
```

### Health Check

```bash
curl http://localhost:8081/health  # → OK
```

## Development

### Building Bundled Dependencies

```bash
cd plugins/redmine_yjs
npm install
npm run build:deps
```

### Version Management

```bash
./scripts/tag-version.sh patch      # 1.0.0 -> 1.0.1
./scripts/tag-version.sh minor      # 1.0.0 -> 1.1.0
./scripts/tag-version.sh major      # 1.0.0 -> 2.0.0
./scripts/tag-version.sh --dry-run  # Preview changes
```

## Testing

### Ruby Unit Tests

```bash
# From Redmine root directory
cd /path/to/redmine

# Setup test database
RAILS_ENV=test bundle exec rake db:drop db:create db:migrate redmine:plugins:migrate

# Run all plugin tests
RAILS_ENV=test bundle exec rake test TEST="plugins/redmine_yjs/test/**/*_test.rb"

# Run specific test
RAILS_ENV=test bundle exec rake test TEST=plugins/redmine_yjs/test/unit/redmine_yjs_test.rb
```

### E2E Tests (Playwright/Cucumber)

Tests concurrent editing with two browser sessions:

```bash
cd plugins/redmine_yjs/test/e2e

# Run all tests (starts Docker, runs tests, cleans up)
./scripts/run-tests.sh

# Run with visible browser
./scripts/run-tests.sh --visible

# See test/e2e/README.md for details
```

### Manual Testing

```bash
# Start development stack
docker-compose up -d

# Open same issue in multiple browser windows
# Changes should sync in real-time
```

## Troubleshooting

**WebSocket Connection Issues**
- Check Hocuspocus is running: `curl http://localhost:8081/health`
- Check browser console for WebSocket errors
- Verify `HOCUSPOCUS_URL` matches your deployment

**Plugin Not Loading**
- Check Redmine logs for errors
- Verify plugin is in `plugins/` directory
- Run `bundle exec rake redmine:plugins:migrate`
- Restart Redmine

**Debugging**
- Hocuspocus logs: `docker logs redmine_hocuspocus`
- Browser DevTools → Network → WS to check WebSocket connection status

## File Structure

```
redmine_yjs/
├── app/
│   ├── assets/             # Additional assets (if needed)
│   ├── channels/           # ActionCable channels (if used)
│   └── views/              # ERB templates for settings
│       ├── layouts/        # Layout partials
│       └── settings/       # Settings views
├── assets/
│   ├── javascripts/        # Yjs client-side code
│   └── stylesheets/        # Collaboration UI styles
├── config/
│   └── locales/            # I18n translations
├── hocuspocus/             # Hocuspocus WebSocket server
│   ├── Dockerfile
│   ├── Dockerfile.fly
│   ├── fly-deploy.sh
│   ├── server.js
│   └── package.json
├── lib/
│   └── redmine_yjs/        # Ruby modules and patches
├── scripts/
│   ├── tag-version.sh      # Version bump script
│   ├── run_all_tests.sh    # Run all tests
│   ├── start_test_services.sh
│   └── stop_test_services.sh
├── src/
│   └── deps-entry.js       # Entry point for bundled dependencies
├── test/
│   ├── unit/               # Ruby unit tests
│   ├── integration/        # Ruby integration tests
│   └── e2e/                # Playwright/Cucumber tests
├── init.rb                 # Plugin registration
├── package.json            # Node.js dependencies
└── README.md
```

## License

MIT License - See [LICENSE](LICENSE) for details.

## References

- [Redmine Plugin Tutorial](https://www.redmine.org/projects/redmine/wiki/plugin_tutorial)
- [Yjs Documentation](https://docs.yjs.dev/)
- [Hocuspocus Documentation](https://tiptap.dev/docs/hocuspocus/)
