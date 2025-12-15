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

| Redmine Version | Plugin Version | Status                             |
|-----------------|----------------|------------------------------------|
| 6.0.x           | 1.0.0+         | ✅ Supported (tested)               |
| 6.1.x           | 1.0.0+         | ⚠️ Might work (sporadically tested) |
| 5.1.x           | 1.0.0+         | ⚠️ Might work (sporadically tested) |
| 5.0.x           | 1.0.0+         | ⚠️ Might work (sporadically tested) |
| 4.x and earlier | -              | ❌ Not supported                    |

## Prerequisites

### For Plugin Installation

The plugin itself requires **no additional prerequisites** beyond your existing Redmine installation:

- **Redmine**: 5.0+ (tested on 6.0.x)
- **Ruby**: 3.0+ (comes with Redmine 5.x/6.x)
- **Rails**: 6.1+ (comes with Redmine 5.x/6.x)

Assets are pre-built and included in the repository, so **Node.js is not required** for installation.

### For Full Functionality

To use collaborative editing, you also need:

- **Hocuspocus WebSocket Server**: A separate Node.js service (see [Hocuspocus Deployment](#hocuspocus-deployment))
  - **Node.js**: 18+ (only needed for running the Hocuspocus server, not for the plugin itself)
- **Browser**: Modern browsers with WebSocket support (Chrome, Firefox, Safari, Edge)

### For Development

If you want to modify and rebuild assets:

- **Node.js**: 18+
- **npm**: Comes with Node.js

## Installation

### 1. Install the Plugin

Simply checkout the plugin into your Redmine plugins directory:

```bash
cd /path/to/redmine/plugins
git clone https://github.com/your-org/redmine_yjs.git
```

The plugin will automatically copy its assets on first load. Then:

```bash
# Run migrations (if any)
cd /path/to/redmine
bundle exec rake redmine:plugins:migrate RAILS_ENV=production

# Restart Redmine
```

That's it! The plugin is now installed and ready to use.

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

| Variable           | Default       | Description                                                        |
| ------------------ | ------------- | ------------------------------------------------------------------ |
| `HOCUSPOCUS_URL`   | Auto-detected | Browser-facing WebSocket URL (direct or proxied)                  |
| `YJS_ENABLED`      | `1`           | Enable/disable collaborative editing (`1`/`0`)                     |
| `YJS_TOKEN_SECRET` | _unset_       | Shared HMAC secret for signing Hocuspocus auth tokens (recommended) |

The plugin auto-detects the Hocuspocus URL based on environment:

- Docker: `ws://localhost:3000/ws` (via Traefik)
- Production: `wss://hocuspocus.fly.dev`
- Development: `ws://localhost:8081`

### Manual Configuration

1. Go to **Administration → Plugins**
2. Click **Configure** on "Redmine Yjs Collaborative Editing"
3. Set the Hocuspocus WebSocket URL (browser-facing)
4. Optionally enable **Proxy WebSocket through Redmine (/ws)**
5. Enable/disable the plugin

### Hocuspocus Authentication

For secure deployments, set the same `YJS_TOKEN_SECRET` in **both**:

- Redmine (environment variable available to the app)
- Hocuspocus (`YJS_TOKEN_SECRET` in `hocuspocus` container or process)

When this secret is set:

- Redmine generates a short-lived, HMAC-signed token per user + document.
- The browser passes this token to Hocuspocus via the `token` field of `HocuspocusProvider`.
- Hocuspocus verifies:
  - Signature (HMAC-SHA256 over the JSON payload)
  - Expiry timestamp
  - That the token was issued for the exact document being opened.

If `YJS_TOKEN_SECRET` is **not** set, Hocuspocus falls back to a development-only mode that trusts plain JSON identity info from the browser. **Do not use this mode in production.**

## Usage

Once enabled, collaborative editing works automatically for:

- Issue descriptions and notes
- Wiki pages

**Visual indicators**:

- **Fixed status badge** (bottom-right corner): Colored text badge showing connection status
  - Green badge: "Collaboration active" - Connected and ready
  - Orange badge: "Syncing..." - Connecting to server
  - Red badge: "Disconnected" - Click to reconnect (changes saved locally)
- **Form widget** (below editor, when focused): Shows colored circle indicator (● green, ◐ orange, ○ red) with "Collaborative Editing" label and list of other active editors

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

### Quick Setup

Run the setup script to ensure everything is ready:

```bash
cd plugins/redmine_yjs
./scripts/setup.sh
```

This will:

- Check for Node.js/npm
- Install Node.js dependencies
- Build assets automatically
- Verify the setup

### Building Bundled Dependencies

**Option 1: Using build script (recommended)**

```bash
cd plugins/redmine_yjs
./scripts/build-js.sh
```

**Option 2: Using npm directly**

```bash
cd plugins/redmine_yjs
npm install
npm run build:deps
```

**Option 3: Using Rake (from Redmine root)**

```bash
# Build assets
bundle exec rake redmine_yjs:build_assets

# Copy assets to public directory
bundle exec rake redmine_yjs:copy_assets

# Or do both
bundle exec rake redmine_yjs:setup
```

**Option 4: Automatic (on plugin load)**
Assets are automatically built if missing when the plugin loads (requires Node.js).

### Version Management

```bash
./scripts/bump_version.sh patch      # 1.0.0 -> 1.0.1 (updates files, commits, tags)
./scripts/bump_version.sh minor      # 1.0.0 -> 1.1.0
./scripts/bump_version.sh major      # 1.0.0 -> 2.0.0
./scripts/bump_version.sh rc         # 1.0.0 -> 1.0.1-rc.0
./scripts/bump_version.sh release    # 1.0.0-rc.0 -> 1.0.0
./scripts/bump_version.sh patch --dry-run  # Preview changes without applying
```

The script automatically:

- Updates version in `init.rb`, `package.json`, and related files
- Updates `CHANGELOG.md` if present
- Updates all `package-lock.json` files
- Commits changes
- Creates a git tag
- Does NOT push (you push manually: `git push && git push --tags`)

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
│   ├── bump_version.sh    # Version bump, commit, and tag script
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
