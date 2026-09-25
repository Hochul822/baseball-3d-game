// Builds the game and inlines all JS/CSS into one self-contained HTML file.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

execSync('npx vite build', { stdio: 'inherit' });
const dist = 'dist';
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = readdirSync(join(dist, 'assets'));
for (const f of assets) {
  const code = readFileSync(join(dist, 'assets', f), 'utf8');
  if (f.endsWith('.js')) {
    const safe = code.replace(/<\/script/gi, '<\\/script');
    html = html.replace(new RegExp(`<script[^>]*src="[^"]*${f}"[^>]*></script>`), () => '');
    html = html.replace('</body>', () => `<script type="module">\n${safe}\n</script>\n</body>`);
  } else if (f.endsWith('.css')) {
    html = html.replace(new RegExp(`<link[^>]*href="[^"]*${f}"[^>]*>`), () => `<style>\n${code}\n</style>`);
  }
}
// drop any leftover modulepreload hints
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
writeFileSync('baseball.html', html);
console.log('wrote baseball.html', (html.length / 1024).toFixed(0) + ' KB');
