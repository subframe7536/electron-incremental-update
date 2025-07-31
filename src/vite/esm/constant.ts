import { electronMajorVersion } from '../bytecode/utils'

const CJSShim = `
// -- CommonJS Shims --
import __cjs_url__ from 'node:url';
import __cjs_path__ from 'node:path';
import __cjs_mod__ from 'node:module';
var __filename = __cjs_url__.fileURLToPath(import.meta.url);
var __dirname = __cjs_path__.dirname(__filename);
var require = __cjs_mod__.createRequire(import.meta.url);
`

const CJSShim_electron_30 = `
// -- CommonJS Shims --
import __cjs_mod__ from 'node:module';
var __filename = import.meta.filename;
var __dirname = import.meta.dirname;
var require = __cjs_mod__.createRequire(import.meta.url);
`

export const shim = electronMajorVersion >= 30 ? CJSShim_electron_30 : CJSShim
