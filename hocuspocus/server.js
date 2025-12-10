const { Server } = require('@hocuspocus/server');

// No database persistence needed - Redmine stores the final documents
// Hocuspocus only handles ephemeral real-time collaboration during editing

// Fly.io uses PORT env var, Docker Compose uses HOCUSPOCUS_PORT
const port = parseInt(process.env.PORT || process.env.HOCUSPOCUS_PORT || '8081', 10);

// Configure Hocuspocus server as per docs: https://tiptap.dev/docs/hocuspocus/guides/collaborative-editing
// Simple setup - just like the docs!
const server = new Server({
  // No extensions - ephemeral collaboration only, Redmine stores final documents
  timeout: 30000, // 30 second timeout for connections
  
  onUpgrade: async ({ request }) => {
    console.log(`[Hocuspocus] 🔄 onUpgrade hook called: ${request.method} ${request.url}`);
    console.log(`[Hocuspocus] 🔄 Request headers:`, Object.keys(request.headers));
    // Return true to allow the upgrade
    const result = true;
    console.log(`[Hocuspocus] 🔄 onUpgrade returning:`, result);
    return result;
  },
  
  onAuthenticate: async ({ token, documentName }) => {
    // Parse user info from JSON token sent by client
    let user = { id: 'anonymous', name: 'Anonymous' };
    
    if (token) {
      try {
        // Token is JSON: { id: "user_id", name: "User Name" }
        const parsed = JSON.parse(token);
        user = {
          id: parsed.id || 'anonymous',
          name: parsed.name || parsed.id || 'Anonymous',
        };
      } catch (e) {
        // Fallback: treat token as plain user ID (backwards compatibility)
        user = { id: token, name: token };
      }
    }
    
    console.log(`[Hocuspocus] ✅ Authenticating user: ${user.name} (${user.id}) for document: ${documentName}`);
    return { user };
  },
  
  onConnect: async ({ documentName, context }) => {
    const userId = context?.user?.id || 'unknown';
    const userName = context?.user?.name || 'Unknown';
    console.log(`[Hocuspocus] ✅ Client connected - User: ${userName} (${userId}), Document: ${documentName}`);
  },
  
  onDisconnect: async ({ documentName, context }) => {
    const userId = context?.user?.id || 'unknown';
    const userName = context?.user?.name || 'Unknown';
    console.log(`[Hocuspocus] 👋 Client disconnected - User: ${userName} (${userId}), Document: ${documentName}`);
  },
  
  // No onLoadDocument/onStoreDocument - ephemeral collaboration only
  // Redmine stores the final documents when users save
});

// Handle WebSocket errors to prevent crashes (see https://github.com/ueberdosis/hocuspocus/issues/392)
server.webSocketServer.on('error', (error) => {
  console.error(`[Hocuspocus] WebSocket server error:`, error);
  // Don't crash - just log the error
});

// Debug: Log all upgrade requests (will be attached after server.listen())

// Start Hocuspocus server
// HocuspocusProvider appends document name to URL: ws://host/ws/document-name
// Traefik forwards /ws/document-name to Hocuspocus
// Hocuspocus extracts document name from path (everything after first /)
server.listen(port).then(() => {
  console.log(`Hocuspocus server listening on port ${port}`);
  console.log(`WebSocket endpoint: ws://0.0.0.0:${port}/document-name (Traefik strips /ws prefix)`);
  console.log(`Mode: Ephemeral collaboration (no persistence - Redmine stores final documents)`);
  
  // Add health check and debug logging to Hocuspocus's HTTP server
  const httpServer = server.httpServer;
  if (httpServer) {
    // Debug: Log all upgrade requests
    httpServer.on('upgrade', (request, socket, head) => {
      console.log(`[Hocuspocus] 🔍 WebSocket upgrade request: ${request.method} ${request.url}`);
      console.log(`[Hocuspocus] 🔍 Headers:`, JSON.stringify(request.headers, null, 2));
    });
    
    // Intercept requests to add health check
    const originalEmit = httpServer.emit.bind(httpServer);
    httpServer.emit = function(event, ...args) {
      if (event === 'request') {
        const [req, res] = args;
        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('OK');
          return true;
        }
      }
      return originalEmit(event, ...args);
    };
    console.log(`Health check: http://0.0.0.0:${port}/health`);
  }
}).catch(console.error);
