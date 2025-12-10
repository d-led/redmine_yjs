/**
 * Entry point for bundling Yjs dependencies
 * This file imports the dependencies and exposes them as globals
 */

import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

// Expose as globals for use in yjs-collaboration.js
window.Y = Y;
window.HocuspocusProvider = HocuspocusProvider;

console.log('[Yjs Deps] Bundled dependencies loaded');

