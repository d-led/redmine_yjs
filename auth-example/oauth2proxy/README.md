# Redmine with OAuth2 Proxy and GitHub Authentication

This setup provides a complete Redmine instance secured behind OAuth2 Proxy with GitHub authentication, preconfigured for zero-touch onboarding.

## Features

- **OAuth2 Proxy**: GitHub OAuth2 authentication via `quay.io/oauth2-proxy/oauth2-proxy:v7.13.0`
- **redmine_proxyauth Plugin**: Automatically installed and configured to authenticate users via OAuth2 proxy headers
- **Auto-Admin Promotion**: Users with emails in `REDMINE_ADMIN_EMAILS` are automatically promoted to admin on first login
- **Fallback Admin Access**: Default admin user (login: `admin`) is always available for direct access
- **Zero-Touch Onboarding**: Preconfigured for seamless user provisioning

## Prerequisites

1. **GitHub OAuth App**
   - Create a GitHub OAuth application at https://github.com/settings/developers
   - Set "Authorization callback URL" to: `http://localhost:3000/oauth2/callback` (or your production URL)
   - Note the `Client ID` and `Client Secret`

2. **Environment Variables**: Create a `.env` file or set the following:

```bash
# Required: GitHub OAuth2 credentials
REDMINE_GITHUB_OAUTH2_PROXY_CLIENT_ID=your_client_id_here
REDMINE_GITHUB_OAUTH2_PROXY_CLIENT_SECRET=your_client_secret_here

# Optional: OAuth2 Proxy redirect URL (default: http://localhost:3000/oauth2/callback)
OAUTH2_PROXY_REDIRECT_URL=http://localhost:3000/oauth2/callback

# Optional: Cookie secret for OAuth2 Proxy (auto-generated if not set)
OAUTH2_PROXY_COOKIE_SECRET=$(openssl rand -base64 32 | head -c 32 | base64)

# Optional: Admin emails (comma-separated) - users will be auto-promoted to admin
REDMINE_ADMIN_EMAILS=user1@example.com,user2@example.com

# Optional: Admin password for fallback access (default: admin123)
REDMINE_ADMIN_PASSWORD=your_secure_password

# Optional: Secret key base for Rails (auto-generated if not set)
SECRET_KEY_BASE=$(rails secret)
```

## Quick Start

1. **Set up environment variables**:

```bash
export REDMINE_GITHUB_OAUTH2_PROXY_CLIENT_ID=your_client_id
export REDMINE_GITHUB_OAUTH2_PROXY_CLIENT_SECRET=your_client_secret
export REDMINE_ADMIN_EMAILS=admin@example.com
```

2. **Start the services** (using the start script):

```bash
cd auth-example/oauth2proxy
./start.sh
```

Or manually:

```bash
docker-compose up -d
```

3. **Access Redmine**:
   - Via OAuth2 Proxy: http://localhost:3000 (will redirect to GitHub for authentication)
   - WebSocket connections: Automatically routed to Hocuspocus via `/ws/*` path
   - Direct access (fallback): Not exposed by default (use OAuth2 Proxy)

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────┐
│   Browser   │────▶│ oauth2-proxy │────▶│ Redmine │
└─────────────┘     │  (GitHub)    │     └─────────┘
                    │              │     ┌───────────┐
                    │              │────▶│ Hocuspocus│
                    └──────────────┘     └───────────┘
                          │
                          ├─ /ws/* → Hocuspocus:8081
                          └─ /* → Redmine:3001
```

- **OAuth2 Proxy** (port 3000, exposed): Handles GitHub OAuth2 authentication and routes requests:
  - `/ws/*` → Hocuspocus (WebSocket server for collaborative editing)
  - `/*` → Redmine (main application)
- **Redmine** (port 3001, internal): Main application, not directly exposed
- **Hocuspocus** (port 8081, internal): WebSocket server for collaborative editing, not directly exposed

## Security

Two authentication layers:

1. **OAuth2 Proxy**: Authenticates users via GitHub (or other OAuth2/OIDC providers). All requests, including WebSocket connections to Hocuspocus, must pass through authenticated sessions.
2. **YJS Token Authentication**: HMAC-signed tokens verify document access. Set `YJS_TOKEN_SECRET` in both Redmine and Hocuspocus for token-based verification.

WebSocket connections to `/ws/*` inherit the OAuth2 proxy session, ensuring only authenticated users can collaborate.

## How It Works

1. **User Access**: User navigates to http://localhost:3000
2. **OAuth2 Authentication**: OAuth2 Proxy redirects to GitHub for authentication
3. **Header Forwarding**: After successful authentication, OAuth2 Proxy forwards requests to Redmine with:
   - `X-Auth-Request-Access-Token`: Access token (used by redmine_proxyauth)
   - `X-Forwarded-User`: GitHub username
   - `X-Forwarded-Email`: User email
4. **User Provisioning**: redmine_proxyauth plugin:
   - Extracts user email from the access token
   - Creates user if doesn't exist
   - Logs user in automatically
5. **Auto-Admin**: Rails initializer checks if user email is in `REDMINE_ADMIN_EMAILS` and promotes to admin
6. **WebSocket Security**: WebSocket connections to `/ws/*` use the same authenticated session, with additional YJS token verification if `YJS_TOKEN_SECRET` is configured

## Configuration Details

### OAuth2 Proxy Configuration

The OAuth2 Proxy is configured with:

- **Provider**: GitHub
- **Headers**: Sets `X-Auth-Request-Access-Token` for redmine_proxyauth plugin
- **Path-based Routing**:
  - `/ws/*` → `http://hocuspocus:8081/ws` (WebSocket connections for collaborative editing)
  - `/*` → `http://redmine:3001` (all other requests)
- **Ports**:
  - OAuth2 Proxy: `3000` (exposed, entry point)
  - Redmine: `3001` (internal, behind proxy)
  - Hocuspocus: `8081` (internal, accessed via `/ws/*`)
- **Cookie Security**: Configured for development (set `OAUTH2_PROXY_COOKIE_SECURE=true` for production)

**Note**: The `/ws` prefix is preserved when forwarding to Hocuspocus. Ensure your Hocuspocus configuration can handle paths starting with `/ws` if needed.

### Redmine Configuration

- **redmine_proxyauth Plugin**: Automatically installed from https://github.com/FES-Ehemalige/redmine_proxyauth
- **Auto-Admin Initializer**: Promotes users to admin based on email list
- **Fallback Admin**: Default admin user always available for direct access

### User Management

- **New Users**: Automatically created on first OAuth2 login
- **Admin Promotion**: Users with emails in `REDMINE_ADMIN_EMAILS` are promoted to admin
- **Existing Users**: Users already in database are promoted to admin if email matches

## Production Deployment

For production, update the following:

1. **Set secure cookie secret**:

```bash
export OAUTH2_PROXY_COOKIE_SECRET=$(openssl rand -base64 32 | head -c 32 | base64)
```

2. **Update redirect URL**:

```bash
export OAUTH2_PROXY_REDIRECT_URL=https://your-domain.com/oauth2/callback
```

3. **Enable secure cookies** (in docker-compose.yml):

```yaml
OAUTH2_PROXY_COOKIE_SECURE: "true"
```

4. **Use HTTPS**: Set up TLS termination (e.g., Traefik, nginx) in front of OAuth2 Proxy

5. **Set strong secrets**:

```bash
export SECRET_KEY_BASE=$(rails secret)
export REDMINE_ADMIN_PASSWORD=$(openssl rand -base64 32)
```

## Troubleshooting

### OAuth2 Proxy not starting

- Check that `REDMINE_GITHUB_OAUTH2_PROXY_CLIENT_ID` and `REDMINE_GITHUB_OAUTH2_PROXY_CLIENT_SECRET` are set
- Verify GitHub OAuth app callback URL matches `OAUTH2_PROXY_REDIRECT_URL`

### "No Authentication-Token found" error

- **Ensure you're accessing via OAuth2 Proxy**: Access `http://localhost:3000` (not `http://localhost:3001`)
- **Authenticate through GitHub**: You should be redirected to GitHub for authentication first
- **Check OAuth2 Proxy logs**: `docker-compose logs oauth2-proxy` to see if authentication succeeded
- **Verify headers are being set**: After authentication, oauth2-proxy should set `X-Auth-Request-Access-Token` header
- **Check Redmine logs**: `docker-compose logs redmine` for any plugin errors
- **Verify plugin is installed**: `docker-compose exec redmine ls plugins/` should show `redmine_proxyauth`
- **Test header manually**: Use browser dev tools to check if `X-Auth-Request-Access-Token` header is present in requests

### Users not being created

- Check Redmine logs: `docker-compose logs redmine`
- Verify `X-Auth-Request-Access-Token` header is being set by OAuth2 Proxy
- Check redmine_proxyauth plugin is installed: `docker-compose exec redmine ls plugins/`

### Users not promoted to admin

- Verify `REDMINE_ADMIN_EMAILS` is set correctly (comma-separated, no spaces)
- Check Rails logs for auto-admin promotion messages
- Manually promote via Rails console: `docker-compose exec redmine rails runner "User.find_by_mail('user@example.com').update(admin: true)"`

### Cannot access Redmine directly

- Direct access is intentionally restricted - use OAuth2 Proxy at port 3000
- For fallback access, Redmine runs internally on port 3001 (not exposed by default)

## Files

- `docker-compose.yml`: Service definitions for Redmine, Hocuspocus, and OAuth2 Proxy
- `Dockerfile.redmine`: Redmine image with redmine_yjs and redmine_proxyauth plugins
- `entrypoint.sh`: Initialization script that sets up database, users, and admin configuration
- `config/initializers/auto_admin.rb`: Rails initializer for auto-promoting users to admin

## References

- [OAuth2 Proxy Documentation](https://oauth2-proxy.github.io/oauth2-proxy/)
- [redmine_proxyauth Plugin](https://github.com/FES-Ehemalige/redmine_proxyauth)
- [GitHub OAuth Apps](https://github.com/settings/developers)
