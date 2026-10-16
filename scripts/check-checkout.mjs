import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSettings } from '../lib/settings.js';
import { createCheckout } from '../lib/checkout.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
console.log(JSON.stringify(await createCheckout({ root, settings: loadSettings(root) }).diagnostics(), null, 2));
