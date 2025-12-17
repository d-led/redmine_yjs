# Hocuspocus Yjs Sync Server

WebSocket server for Yjs collaborative editing, designed to work with the Redmine Yjs plugin.

## Published Docker Image

Pre-built images are available on GitHub Container Registry:

```bash
docker pull ghcr.io/d-led/redmine_yjs-hocuspocus:latest
docker run -p 8081:8081 ghcr.io/d-led/redmine_yjs-hocuspocus:latest
```

Available tags:
- `latest` - Latest stable release
- `main` - Latest from main branch
- `v1.0.0` - Specific version
- `sha-abc1234` - Specific commit

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

| Variable           | Default | Description                                                                                         |
|--------------------|---------|-----------------------------------------------------------------------------------------------------|
| `PORT`             | `8081`  | Server port                                                                                        |
| `HOCUSPOCUS_PORT`  | `8081`  | Alternative port variable                                                                          |
| `YJS_ENABLED`      | `1`     | Enable/disable server                                                                              |
| `YJS_TOKEN_SECRET` | _unset_ | Shared HMAC secret for verifying Redmine-issued tokens (`uid`/`login`/`doc`/`exp`) – recommended. |

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

- Direct mode: set Hocuspocus URL to something like `ws://localhost:8081/ws`.
- Proxy mode: set Hocuspocus URL to your Redmine host `/ws`, e.g. `wss://your-redmine-host/ws`, and enable "Proxy WebSocket through Redmine" in plugin settings.

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

## Authentication & Security

### HMAC-Signed Tokens from Redmine

When `YJS_TOKEN_SECRET` is set, Redmine and Hocuspocus share a secret used to sign
short-lived tokens. For each editable document, Redmine issues a token with payload:

```json
{
  "uid": 1,
  "login": "admin",
  "doc": "issue-1",
  "exp": 1734280000
}
```

This JSON is HMAC-SHA256 signed with `YJS_TOKEN_SECRET` and sent to the browser as a
compact `payload.signature` string (both parts base64url-encoded). The browser passes
this token as `token` to `HocuspocusProvider`. On connect, Hocuspocus:

- Verifies the HMAC signature.
- Checks `exp` is in the future.
- Checks `doc` matches the actual document name being opened.

If any check fails, the connection is rejected (`Unauthorized`). This prevents
spurious clients from connecting to other users' sessions even if they know the
Hocuspocus URL.

If `YJS_TOKEN_SECRET` is **not** set, Hocuspocus falls back to a development-only
mode that trusts plain JSON identity info from the browser. **Do not use this mode
in production.**

### Production Security

Two authentication layers:

1. **OAuth2 Proxy** (recommended): Authenticates users before accessing Redmine. WebSocket connections inherit the authenticated session. See `../auth-example/oauth2proxy/` for setup.
2. **YJS Token Authentication**: HMAC-signed tokens verify document access (requires `YJS_TOKEN_SECRET`).

Using an authenticating reverse proxy (e.g., OAuth2 Proxy, Traefik) provides:
- ✅ Same-origin requests (no CORS)
- ✅ Centralized authentication
- ✅ TLS termination
- ✅ Rate limiting and DDoS protection

#### Traefik (Recommended)

Route WebSocket traffic through Traefik on the same domain as Redmine:

```yaml
services:
  traefik:
    image: traefik:v2.10
    command:
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
    ports:
      - "80:80"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro

  redmine:
    image: redmine:6.0
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.redmine.rule=Host(`redmine.example.com`)"

  hocuspocus:
    image: ghcr.io/d-led/redmine_yjs-hocuspocus:latest
    labels:
      - "traefik.enable=true"
      # Route /ws/* to Hocuspocus
      - "traefik.http.routers.hocuspocus.rule=Host(`redmine.example.com`) && PathPrefix(`/ws`)"
      - "traefik.http.routers.hocuspocus.entrypoints=web"
      # Strip /ws prefix before forwarding
      - "traefik.http.middlewares.hocuspocus-strip.stripprefix.prefixes=/ws"
      - "traefik.http.routers.hocuspocus.middlewares=hocuspocus-strip"
      - "traefik.http.services.hocuspocus.loadbalancer.server.port=8081"
```

Client connects to: `ws://redmine.example.com/ws/document-name`

#### nginx

```nginx
upstream hocuspocus {
    server hocuspocus:8081;
}

server {
    listen 80;
    server_name redmine.example.com;

    # Redmine
    location / {
        proxy_pass http://redmine:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Hocuspocus WebSocket
    location /ws/ {
        proxy_pass http://hocuspocus/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;  # WebSocket timeout
    }
}
```

#### Adding Authentication at the Proxy

To restrict WebSocket access to authenticated Redmine users:

**Option 1: Cookie-based (nginx auth_request)**

```nginx
location /ws/ {
    # Verify session cookie with Redmine
    auth_request /auth-check;
    
    proxy_pass http://hocuspocus/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

location = /auth-check {
    internal;
    proxy_pass http://redmine:3000/my/account;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header Cookie $http_cookie;
}
```

**Option 2: JWT validation (Traefik ForwardAuth)**

```yaml
labels:
  - "traefik.http.middlewares.auth.forwardauth.address=http://redmine:3000/api/auth/verify"
  - "traefik.http.routers.hocuspocus.middlewares=auth,hocuspocus-strip"
```

### CORS Configuration

When Hocuspocus is on a different origin than Redmine, browsers block WebSocket connections. Solutions:

1. **Same-origin proxy** (recommended) - Route through Traefik/nginx as shown above
2. **ActionCable proxy** - Enable in plugin settings to route through Redmine
3. **Direct connection** - Only works if both use the same domain

The Redmine plugin auto-detects the WebSocket URL:
- With proxy: `ws://redmine.example.com/ws` (same origin, no CORS)
- Direct: `ws://hocuspocus.example.com:8081` (requires same domain or CORS headers)

### TLS/SSL

For production, always use TLS:

```yaml
# Traefik with Let's Encrypt
labels:
  - "traefik.http.routers.hocuspocus.tls=true"
  - "traefik.http.routers.hocuspocus.tls.certresolver=letsencrypt"
```

Client URL becomes: `wss://redmine.example.com/ws/document-name`

### OAuth2 Proxy (oauth2-proxy)

For enterprise SSO (Azure AD, Google, Okta, etc.), use [oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy/) in front of both Redmine and Hocuspocus:

```
┌─────────────┐     ┌──────────────┐     ┌─────────┐
│   Browser   │────▶│ oauth2-proxy │────▶│ Redmine │
└─────────────┘     │              │     └─────────┘
                    │   (SSO)      │     ┌───────────┐
                    │              │────▶│ Hocuspocus│
                    └──────────────┘     └───────────┘
```

#### Docker Compose with oauth2-proxy

```yaml
services:
  oauth2-proxy:
    image: quay.io/oauth2-proxy/oauth2-proxy:v7.5.1
    command:
      - --http-address=0.0.0.0:4180
      - --upstream=http://redmine:3000
      - --upstream=http://hocuspocus:8081/ws
      # Azure AD example
      - --provider=azure
      - --client-id=${OAUTH_CLIENT_ID}
      - --client-secret=${OAUTH_CLIENT_SECRET}
      - --azure-tenant=${OAUTH_TENANT_ID}
      # Pass user info to upstreams
      - --set-xauthrequest=true
      - --pass-access-token=true
      - --pass-user-headers=true
      # Cookie settings
      - --cookie-secret=${COOKIE_SECRET}  # Generate: openssl rand -base64 32
      - --cookie-secure=true
      - --cookie-name=_oauth2_proxy
      # Email domain restriction (optional)
      - --email-domain=yourcompany.com
    ports:
      - "443:4180"
    environment:
      OAUTH2_PROXY_COOKIE_SECRET: ${COOKIE_SECRET}

  redmine:
    image: redmine:6.0
    environment:
      # Trust oauth2-proxy headers for user authentication
      REDMINE_AUTOLOGIN_COOKIE: _oauth2_proxy
    # Not exposed directly - only through oauth2-proxy

  hocuspocus:
    image: ghcr.io/d-led/redmine_yjs-hocuspocus:latest
    # Not exposed directly - only through oauth2-proxy
```

#### Redmine Configuration for OAuth2 Proxy Headers

Create an initializer to auto-login users based on oauth2-proxy headers:

```ruby
# config/initializers/oauth2_proxy.rb

# Auto-login users from oauth2-proxy headers
Rails.application.config.to_prepare do
  ApplicationController.class_eval do
    before_action :auto_login_from_oauth2_proxy

    private

    def auto_login_from_oauth2_proxy
      return if User.current.logged?
      
      # oauth2-proxy sets these headers
      email = request.headers['X-Forwarded-Email']
      user_name = request.headers['X-Forwarded-User']
      preferred_username = request.headers['X-Forwarded-Preferred-Username']
      
      return unless email.present?

      # Find or create user
      user = User.find_by(mail: email)
      
      unless user
        # Auto-create user from OAuth info
        login = preferred_username || email.split('@').first
        user = User.new(
          login: login,
          mail: email,
          firstname: user_name&.split(' ')&.first || login,
          lastname: user_name&.split(' ')&.last || '',
          auth_source_id: nil,
          status: User::STATUS_ACTIVE
        )
        user.random_password
        user.save(validate: false)
        Rails.logger.info "[OAuth2] Created user #{login} from proxy headers"
      end

      # Auto-login
      if user&.active?
        User.current = user
        start_user_session(user)
        Rails.logger.info "[OAuth2] Auto-logged in user #{user.login}"
      end
    end
  end
end
```

#### Hocuspocus Auth with OAuth2 Proxy

When oauth2-proxy is in front, Hocuspocus receives authenticated requests with user headers:

```javascript
// server.js - Enhanced auth with oauth2-proxy headers
onAuthenticate: async ({ request, token, documentName }) => {
  // Get user from oauth2-proxy headers (forwarded by proxy)
  const email = request.headers['x-forwarded-email'];
  const userName = request.headers['x-forwarded-user'];
  const preferredUsername = request.headers['x-forwarded-preferred-username'];
  
  if (email) {
    // Authenticated via oauth2-proxy
    return {
      user: {
        id: email,
        name: userName || preferredUsername || email.split('@')[0],
        email: email
      }
    };
  }
  
  // Fallback to token-based auth (for direct connections)
  if (token) {
    try {
      const parsed = JSON.parse(token);
      return { user: parsed };
    } catch (e) {
      return { user: { id: token, name: token } };
    }
  }
  
  // Reject unauthenticated connections in production
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Authentication required');
  }
  
  return { user: { id: 'anonymous', name: 'Anonymous' } };
}
```

#### Environment Variables for OAuth2 Proxy

```bash
# .env file
OAUTH_CLIENT_ID=your-azure-app-client-id
OAUTH_CLIENT_SECRET=your-azure-app-client-secret
OAUTH_TENANT_ID=your-azure-tenant-id
COOKIE_SECRET=$(openssl rand -base64 32)
```

#### Google OAuth Example

```yaml
oauth2-proxy:
  command:
    - --provider=google
    - --client-id=${GOOGLE_CLIENT_ID}
    - --client-secret=${GOOGLE_CLIENT_SECRET}
    - --email-domain=yourcompany.com
```

#### Benefits of OAuth2 Proxy

- ✅ Single sign-on across Redmine and Hocuspocus
- ✅ Centralized authentication (one login for all)
- ✅ Automatic user provisioning in Redmine
- ✅ Session management handled by proxy
- ✅ Works with any OAuth2/OIDC provider
- ✅ No CORS issues (same origin)

## Future: WebSocket via Redmine/Puma

> **Status:** Not yet implemented. This section documents potential approaches.

Running WebSocket directly through Redmine's Puma server would eliminate the need for a separate Hocuspocus service. Here are possible approaches:

### Option 1: ActionCable Proxy

Rails' built-in ActionCable can proxy WebSocket connections to Hocuspocus running as a subprocess or sidecar:

```ruby
# app/channels/yjs_channel.rb
class YjsChannel < ApplicationCable::Channel
  def subscribed
    @ws = Faye::WebSocket::Client.new("ws://localhost:8081/#{params[:document]}")
    
    @ws.on :message do |event|
      transmit(data: event.data)
    end
  end
  
  def receive(data)
    @ws.send(data['content'])
  end
end
```

**Pros:** Uses Rails conventions, automatic auth via ActionCable
**Cons:** Extra hop, requires managing Hocuspocus subprocess

### Option 2: Rack Middleware WebSocket Proxy

Mount a Rack middleware that handles `/ws` routes and proxies to Hocuspocus:

```ruby
# lib/yjs_websocket_proxy.rb
class YjsWebsocketProxy
  def initialize(app)
    @app = app
  end
  
  def call(env)
    if env['PATH_INFO'].start_with?('/ws') && Faye::WebSocket.websocket?(env)
      ws = Faye::WebSocket.new(env)
      backend = Faye::WebSocket::Client.new("ws://localhost:8081#{env['PATH_INFO'].sub('/ws', '')}")
      
      ws.on(:message) { |e| backend.send(e.data) }
      backend.on(:message) { |e| ws.send(e.data) }
      
      ws.rack_response
    else
      @app.call(env)
    end
  end
end

# config/application.rb
config.middleware.use YjsWebsocketProxy
```

**Pros:** Transparent proxy, single port
**Cons:** Still requires Hocuspocus process, adds latency

### Option 3: Native Ruby Yjs Server

Implement Yjs CRDT sync directly in Ruby using ActionCable:

```ruby
# app/channels/yjs_sync_channel.rb
class YjsSyncChannel < ApplicationCable::Channel
  def subscribed
    @doc_name = params[:document]
    stream_from "yjs:#{@doc_name}"
    
    # Send current state to new client
    if state = Rails.cache.read("yjs:#{@doc_name}:state")
      transmit(type: 'sync', data: state)
    end
  end
  
  def receive(data)
    case data['type']
    when 'update'
      # Broadcast Yjs update to all clients
      ActionCable.server.broadcast("yjs:#{@doc_name}", data)
      # Merge into cached state
      merge_yjs_update(@doc_name, data['update'])
    when 'awareness'
      ActionCable.server.broadcast("yjs:#{@doc_name}", data)
    end
  end
  
  private
  
  def merge_yjs_update(doc_name, update)
    # Would need Ruby Yjs CRDT implementation
    # or call out to Node.js for merge
  end
end
```

**Pros:** Single process, native Rails auth, no external dependencies
**Cons:** Requires Ruby CRDT implementation (complex), or Node.js subprocess for merges

### Option 4: Puma Plugin with Embedded Node.js

Run Hocuspocus as a Puma plugin/worker:

```ruby
# config/puma/hocuspocus.rb
class HocuspocusPlugin
  def start(launcher)
    @pid = spawn('node', 'hocuspocus/server.js', 
                 chdir: Rails.root.to_s,
                 out: '/dev/null', err: '/dev/null')
    Process.detach(@pid)
  end
  
  def stop
    Process.kill('TERM', @pid) if @pid
  end
end

Puma::Plugin.create do
  def start(launcher)
    HocuspocusPlugin.new.start(launcher)
  end
end
```

**Pros:** Single deployment, managed lifecycle
**Cons:** Still separate process, requires Node.js

### Recommendation

For now, the **reverse proxy approach** (Traefik/nginx) is recommended because:

1. Battle-tested WebSocket handling
2. No custom code to maintain
3. Easy TLS termination
4. Clear separation of concerns

A native Ruby implementation would be ideal but requires significant effort to implement Yjs CRDT merging correctly. The [y-rb](https://github.com/y-crdt/y-rb) project (Ruby bindings for Yrs/Yjs) could enable this in the future.

## Architecture

The server uses:
- **@hocuspocus/server** - Yjs WebSocket server implementation
- **No persistence** - Ephemeral collaboration only
- **No real auth** - User info for presence display only (see security warning above)

When users connect:
1. Client sends user info (id, name) - unverified, for presence display only
2. Hocuspocus creates/joins document room
3. Yjs syncs changes between connected clients
4. When user saves in Redmine, the content is persisted to the database

## References

- [Hocuspocus Documentation](https://tiptap.dev/docs/hocuspocus/)
- [Yjs Documentation](https://docs.yjs.dev/)
- [y-rb](https://github.com/y-crdt/y-rb) - Ruby bindings for Yjs (potential future integration)
- [ActionCable Guide](https://guides.rubyonrails.org/action_cable_overview.html) - Rails WebSocket support
