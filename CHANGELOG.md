# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.5] - 2026-10-25

### Fixed

- The plugin's patches are applied again. Redmine evaluates plugin `init.rb`
  files from inside a `to_prepare` callback, so the `to_prepare` block the plugin
  registered itself only ever ran on the *next* reload — which production never
  does. As a result the helper was never registered (so **no HMAC token was ever
  generated**), and the wiki/issue stale-object patches were never applied.
  Patches are now applied at load time and re-applied on reload.
- HMAC tokens now name the same document the browser opens. The signed `doc`
  claim used to stop at `wiki-<project>-<page>` while the client opened
  `wiki-<project>-<page>-content_text`, so **every wiki collaboration connection
  was rejected** as soon as `YJS_TOKEN_SECRET` was configured. Document names are
  now derived in one place (`RedmineYjs::DocumentName`) and shipped to the
  browser in the page config.
- Hocuspocus now **fails closed**: with `YJS_TOKEN_SECRET` set, a connection
  without a valid signed token is refused. Previously an unsigned token was
  accepted with a warning, which made the secret advisory rather than enforced.
- Merging content saved by another user no longer duplicates the text both
  sides already had. The snapshot is reconciled into the live document with a
  minimal edit instead of being applied as a second CRDT state.
- Issue saves that hit a stale-object error now ask the browser to merge the
  document that actually exists (`issue-<id>`); the merge label used to include
  the field name and therefore matched no open collaboration.

### Changed

- Upgraded to `@hocuspocus/server` / `@hocuspocus/provider` 4.x, Yjs 13.6.33,
  esbuild 0.28, vitest 5 and Cucumber 13; the Hocuspocus images now build on
  Node 22.
- The Hocuspocus server answers `/health` through its own HTTP handler; the
  monkey-patched request handler and the removed `webSocketServer` hook are gone.

### Added

- `npm test` in `hocuspocus/` boots the real server and covers token
  verification, rejection of tokens for other documents, and two-client sync.
- `test/unit/document_name_test.rb` runs without Redmine:
  `ruby test/unit/document_name_test.rb`.
- `npm run build` (the script pointed at a non-existent `build.js`) now rebuilds
  both browser bundles, including `yjs-merge.js` from `src/merge.js`.

### Removed

- Unit tests that only re-asserted copies of the implementation
  (`document-naming.test.js`, `helpers.test.js`). The behaviour they pretended to
  cover now lives in tested modules.

## [0.0.4] - 2025-12-15

### Added

- Optional HMAC-signed authentication between Redmine and the bundled Hocuspocus server:
  - Redmine generates short-lived, document-bound tokens signed with a shared secret.
  - Hocuspocus verifies these tokens on connect and rejects unauthorized clients when a signed token is present.
  - When no signed token is provided, Hocuspocus logs a warning and falls back to the previous (insecure) behavior to keep development setups working.

### Changed

- Plugin settings now include a `Hocuspocus Token Secret` field that can override the `YJS_TOKEN_SECRET` environment variable for Redmine.
- E2E Docker Compose now preconfigures a demo `YJS_TOKEN_SECRET` shared between Redmine and Hocuspocus.

## [0.0.3] - 2025-12-15

### Changed

- Issue saves in collaborative mode no longer show conflict errors or redirects. Conflicts are handled silently by updating the lock version, allowing saves to proceed normally since Yjs CRDTs already handle merging in real-time.

## [0.0.2] - 2025-12-15

### Added

- Initial release with collaborative editing support
- Real-time sync with conflict-free merging (CRDT)
- User presence indicators with colored cursors
- Support for CKEditor and plain text editors
- Offline support with auto-sync on reconnect
- Hocuspocus WebSocket server integration
- Configuration UI in Redmine plugin settings
- Automatic asset copying on plugin load

### Changed

- Initial version bump from 0.0.1

[Unreleased]: https://github.com/d-led/redmine_yjs/compare/v0.0.5...HEAD
[0.0.5]: https://github.com/d-led/redmine_yjs/releases/tag/v0.0.5
[0.0.4]: https://github.com/d-led/redmine_yjs/releases/tag/v0.0.4
[0.0.3]: https://github.com/d-led/redmine_yjs/releases/tag/v0.0.3
[0.0.2]: https://github.com/d-led/redmine_yjs/releases/tag/v0.0.2
