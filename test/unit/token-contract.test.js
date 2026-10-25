/**
 * The contract between the two halves of the plugin: Redmine (Ruby) signs a
 * token, the Hocuspocus server (Node) verifies it. Everything else about
 * authentication is only as good as this agreement - the base64url alphabet,
 * the HMAC input being the exact payload bytes, and the `doc` claim naming the
 * document the client opens.
 *
 * Ruby signs here for real (lib/redmine_yjs/token.rb); nothing is re-implemented.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { authenticate, verifyToken } = require('../../hocuspocus/auth.js');

const PLUGIN_ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

const SECRET = 'a-secret-only-redmine-and-hocuspocus-know';
const DOCUMENT = 'wiki-1-2-content_text';
const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);

function rubyIssuedToken({ document = DOCUMENT, secret = SECRET, now = NOW } = {}) {
  const script = [
    "require 'redmine_yjs/token'",
    'print RedmineYjs::Token.issue(',
    "  user_id: 42, login: 'alice',",
    `  document: ${JSON.stringify(document)},`,
    `  secret: ${JSON.stringify(secret)},`,
    `  now: Time.at(${Math.floor(now / 1000)})`,
    ')'
  ].join('\n');

  return execFileSync('ruby', ['-I', path.join(PLUGIN_ROOT, 'lib'), '-e', script], {
    encoding: 'utf8'
  }).trim();
}

function verify(token, { secret = SECRET, documentName = DOCUMENT, now = NOW } = {}) {
  return verifyToken(token, { secret, documentName, now });
}

describe('token contract: Ruby signs, Node verifies', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts the token Redmine issued for that document', () => {
    const result = verify(rubyIssuedToken());

    expect(result).toEqual({
      ok: true,
      payload: { uid: 42, login: 'alice', doc: DOCUMENT, exp: Math.floor(NOW / 1000) + 600 }
    });
  });

  it('identifies the user behind the token', () => {
    const user = authenticate({
      token: rubyIssuedToken(),
      secret: SECRET,
      documentName: DOCUMENT,
      now: NOW
    });

    expect(user).toEqual({ id: '42', name: 'alice' });
  });

  it('refuses the same token for another document', () => {
    const result = verify(rubyIssuedToken(), { documentName: 'issue-7' });

    expect(result).toEqual({ ok: false, reason: 'document_mismatch' });
  });

  it('refuses the token once its ten minutes are over', () => {
    const issued = rubyIssuedToken();
    const elevenMinutesLater = NOW + 11 * 60 * 1000;

    expect(verify(issued, { now: elevenMinutesLater })).toEqual({
      ok: false,
      reason: 'token_expired'
    });
  });

  it('refuses a token signed with a secret the server does not know', () => {
    const issued = rubyIssuedToken({ secret: 'a-secret-from-another-deployment' });

    expect(verify(issued)).toEqual({ ok: false, reason: 'signature_mismatch' });
  });
});
