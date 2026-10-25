/**
 * End-to-end behaviour of the bundled Hocuspocus server: it boots, answers the
 * health check, refuses clients that cannot prove they may open a document, and
 * syncs edits between two authenticated clients.
 *
 * Run with `npm test` in hocuspocus/.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

const SECRET = 'e2e-shared-secret';
const DOCUMENT = 'wiki-1-2-content_text';
const PORT = 18081;
const SERVER_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

function signedToken({ doc = DOCUMENT, uid = 1, login = 'alice' } = {}) {
  const payload = JSON.stringify({ uid, login, doc, exp: Math.floor(Date.now() / 1000) + 600 });
  const signature = createHmac('sha256', SECRET).update(payload).digest();

  return `${Buffer.from(payload).toString('base64url')}.${signature.toString('base64url')}`;
}

function provider(name = DOCUMENT, token = signedToken()) {
  const document = new Y.Doc();

  return {
    document,
    provider: new HocuspocusProvider({
      url: `ws://127.0.0.1:${PORT}`,
      name,
      token,
      document,
      WebSocketPolyfill: WebSocket,
    }),
  };
}

function waitForSync(client) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timed out waiting for sync')), 5000);

    client.provider.on('synced', () => {
      clearTimeout(timeout);
      resolve();
    });
    client.provider.on('authenticationFailed', () => {
      clearTimeout(timeout);
      reject(new Error('authentication failed'));
    });
  });
}

function waitForAuthenticationFailure(client) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('connection was not rejected')), 5000);

    client.provider.on('authenticationFailed', () => {
      clearTimeout(timeout);
      resolve();
    });
    client.provider.on('synced', () => {
      clearTimeout(timeout);
      reject(new Error('connection was accepted'));
    });
  });
}

describe('Hocuspocus server', () => {
  let server;

  before(async () => {
    server = spawn(process.execPath, [join(SERVER_DIR, 'server.js')], {
      env: { ...process.env, PORT: String(PORT), YJS_TOKEN_SECRET: SECRET },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await Promise.race([
      once(server.stdout, 'data'),
      once(server, 'exit').then(([code]) => {
        throw new Error(`server exited early with code ${code}`);
      }),
    ]);
  });

  after(async () => {
    server?.kill('SIGTERM');
    await once(server, 'exit');
  });

  test('answers the health check', async () => {
    const response = await fetch(`http://127.0.0.1:${PORT}/health`);

    assert.equal(response.status, 200);
  });

  test('syncs edits between two clients holding valid tokens', async () => {
    const alice = provider();
    const bob = provider();

    try {
      await waitForSync(alice);
      await waitForSync(bob);

      alice.document.getText('content').insert(0, 'hello from alice');

      await new Promise((resolve) => setTimeout(resolve, 300));

      assert.equal(bob.document.getText('content').toString(), 'hello from alice');
    } finally {
      alice.provider.destroy();
      bob.provider.destroy();
    }
  });

  test('refuses a client whose token belongs to another document', async () => {
    const intruder = provider(DOCUMENT, signedToken({ doc: 'issue-7' }));

    try {
      await waitForAuthenticationFailure(intruder);
    } finally {
      intruder.provider.destroy();
    }
  });

  test('refuses a client without a token', async () => {
    const intruder = provider(DOCUMENT, '');

    try {
      await waitForAuthenticationFailure(intruder);
    } finally {
      intruder.provider.destroy();
    }
  });
});
