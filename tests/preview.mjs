// Serve the production build with Pages rewrites for portable browser checks.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';
const root = resolve('dist');
const redirects = (await readFile(resolve(root, '_redirects'), 'utf8')).trim().split(/\r?\n/).map((line) => line.trim().split(/\s+/));
createServer(async (req, res) => {
  try {
    let pathname = new URL(req.url, 'http://localhost').pathname;
    const rewrite = redirects.find(([source, , code]) => code === '200' && (source.endsWith('*') ? pathname.startsWith(source.slice(0, -1)) : source === pathname));
    if (rewrite) pathname = rewrite[1];
    let path = resolve(root, '.' + pathname);
    const child = relative(root, path); if (child.startsWith('..') || isAbsolute(child)) throw new Error('Invalid path');
    try { if ((await stat(path)).isDirectory()) path += '/index.html'; } catch { path = resolve(root, 'index.html'); }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end(); }
}).listen(4322, '127.0.0.1', () => console.log('Build preview: http://127.0.0.1:4322'));
