# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Issue saves in collaborative mode no longer show conflict errors or redirects. Conflicts are handled silently by updating the lock version, allowing saves to proceed normally since Yjs CRDTs already handle merging in real-time.

### Added

- Optional HMAC-signed authentication between Redmine and the bundled Hocuspocus server:
  - Redmine generates short-lived, document-bound tokens signed with `YJS_TOKEN_SECRET`.
  - Hocuspocus verifies these tokens on connect and rejects unauthorized clients.
  - When `YJS_TOKEN_SECRET` is not set, Hocuspocus falls back to a development-only, insecure mode.

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

[Unreleased]: https://github.com/d-led/redmine_yjs/compare/v0.0.2...HEAD
[0.0.2]: https://github.com/d-led/redmine_yjs/releases/tag/v0.0.2
