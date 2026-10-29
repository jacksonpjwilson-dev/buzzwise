// Visual theme switch. Default is the Halloween theme (v1.12).
// Set the env var BUZZWISE_THEME=neon to restore the original "Neon Game Show" look
// (pages are served without halloween.css and without the body.halloween class).
// For a one-off preview you can also add ?theme=neon or ?theme=halloween to any page URL.
const fs = require('fs');
const path = require('path');
const THEMES = ['halloween', 'neon'];
const DEFAULT = THEMES.includes(process.env.BUZZWISE_THEME) ? process.env.BUZZWISE_THEME : 'halloween';
const cache = new Map();
function render(file, theme, transform) {
  const key = file + '|' + theme;
  if (cache.has(key)) return cache.get(key);
  let html = fs.readFileSync(file, 'utf8');
  if (transform) html = transform(html);
  if (theme === 'neon') {
    html = html.replace('<link rel="stylesheet" href="/halloween.css">', '').replace(/(<body class="[^"]*?)\s*\bhalloween\b/, '$1');
  }
  cache.set(key, html);
  return html;
}
function pick(req) { const q = req.query && req.query.theme; return THEMES.includes(q) ? q : DEFAULT; }
// Express handler that serves an HTML page in the active theme.
function page(file, transform) { return (req, res) => res.type('html').send(render(file, pick(req), transform)); }
module.exports = { page, render, DEFAULT, THEMES };
