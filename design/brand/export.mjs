#!/usr/bin/env node
/* ============================================================
   FoodOS.ai — RASTER EXPORT
   Regenerates every PNG/ICO in this folder from the hand-authored
   SVG and HTML sources. Everything runs locally: headless Chrome
   does the rasterising, the ICO container is assembled here. No
   online converters, no network, no extra npm dependencies.

   Run:   node design/brand/export.mjs
   Needs: Google Chrome (or set CHROME=/path/to/chrome)

   Source -> output map
     favicon.svg       ->  favicon.ico (16/32/48), favicon-32.png
     logo-mark.svg     ->  apple-touch-icon.png (180),
                           icon-192.png, icon-512.png
     icon-maskable.svg ->  icon-maskable-512.png
     og-image.html     ->  og-image.png (1200x630)

   ONE DRAWING AT EVERY SIZE. There is no simplified small cut:
   favicon.svg, logo-mark.svg and icon-maskable.svg all carry the
   same chit path. favicon.svg exists only to add the dark-scheme
   keyline, and icon-maskable.svg only to inset the glyph for
   Android. assertOneDrawing() below compares the path data in all
   three and aborts the export if they have drifted apart, so the
   single drawing cannot silently become three. See README.md.
   ============================================================ */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TMP = mkdtempSync(join(tmpdir(), 'foodos-brand-'));

const CHROME = process.env.CHROME
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** Rasterise an HTML file at an exact pixel size. */
function shoot(htmlPath, outPath, w, h) {
  execFileSync(CHROME, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--allow-file-access-from-files',
    '--force-device-scale-factor=1',
    '--default-background-color=00000000',
    // Headless Chrome reports prefers-color-scheme: dark by default,
    // which silently baked favicon.svg's dark-mode keyline into every
    // raster. The exports are the light cut; pin the scheme so they
    // stay that way. preferredColorScheme: 0 = dark, 1 = light.
    '--blink-settings=preferredColorScheme=1',
    `--window-size=${w},${h}`,
    `--screenshot=${outPath}`,
    `file://${htmlPath}`,
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
}

/**
 * Rasterise an SVG at an exact pixel size.
 * The SVG is inlined into a wrapper rather than referenced through
 * an <img>, so its internal <style> block applies exactly as it
 * will in the browser.
 */
function renderSvg(svgName, outPath, size) {
  const svg = readFileSync(join(HERE, svgName), 'utf8')
    // force the instance size; the source files carry their own
    // width/height for direct viewing
    .replace(/<svg([^>]*?)\swidth="[^"]*"/, '<svg$1')
    .replace(/<svg([^>]*?)\sheight="[^"]*"/, '<svg$1');

  const html =
    `<!DOCTYPE html><meta charset="utf-8"><style>` +
    `html,body{margin:0;padding:0;background:transparent}` +
    `svg{display:block;width:${size}px;height:${size}px}` +
    `</style>${svg}`;

  const wrapper = join(TMP, `${svgName}-${size}.html`);
  writeFileSync(wrapper, html);
  shoot(wrapper, outPath, size, size);
  return outPath;
}

/**
 * Assemble a PNG-compressed .ico. Every browser in our support
 * matrix and every Windows since Vista reads PNG entries, and it
 * keeps the file an order of magnitude smaller than BMP entries.
 */
function buildIco(pngPaths, outPath) {
  const images = pngPaths.map((p) => readFileSync(p));
  const count = images.length;

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type: 1 = icon
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;

  images.forEach((png, i) => {
    // PNG IHDR: width and height are big-endian u32 at bytes 16 and 20
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    const e = 16 * i;
    dir.writeUInt8(w >= 256 ? 0 : w, e + 0);
    dir.writeUInt8(h >= 256 ? 0 : h, e + 1);
    dir.writeUInt8(0, e + 2);      // palette size: 0 = not paletted
    dir.writeUInt8(0, e + 3);      // reserved
    dir.writeUInt16LE(1, e + 4);   // colour planes
    dir.writeUInt16LE(32, e + 6);  // bits per pixel
    dir.writeUInt32LE(png.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });

  writeFileSync(outPath, Buffer.concat([header, dir, ...images]));
  return outPath;
}

/**
 * The symbol is one drawing. Three files carry it — the icon, the
 * favicon and the maskable source — and nothing but a check stops
 * them drifting apart over time, so here is the check. The glyph
 * is the path whose data starts at the chit's top-left corner.
 */
function assertOneDrawing() {
  const glyphOf = (name) => {
    const src = readFileSync(join(HERE, name), 'utf8');
    const m = src.match(/d="(M18 14[^"]*)"/);
    if (!m) {
      throw new Error(
        `${name}: no chit path found. If the symbol was redrawn, update ` +
        `all three of logo-mark.svg, favicon.svg and icon-maskable.svg.`);
    }
    // collapse the pretty-printed whitespace before comparing
    return m[1].replace(/\s+/g, ' ').trim();
  };

  const ref = glyphOf('logo-mark.svg');
  for (const name of ['favicon.svg', 'icon-maskable.svg']) {
    if (glyphOf(name) !== ref) {
      throw new Error(
        `${name} has drifted from logo-mark.svg.\n` +
        `  logo-mark.svg : ${ref}\n` +
        `  ${name.padEnd(14)}: ${glyphOf(name)}\n` +
        `The symbol is one drawing at every size — make them match.`);
    }
  }
  console.log('  one-drawing check          all three glyphs identical\n');
}

/**
 * Only three of the eleven SVGs get rasterised here, so a broken
 * one can sit in the folder indefinitely without anyone noticing —
 * logo.svg, the primary file, shipped unrenderable for exactly
 * that reason. SVG is XML, and XML forbids "--" inside a comment,
 * which is easy to write by accident in a rule of dashes. Chrome
 * rejects the whole file when it happens.
 */
function assertWellFormed() {
  const names = readdirSync(HERE).filter((f) => f.endsWith('.svg')).sort();
  const bad = [];

  for (const name of names) {
    const src = readFileSync(join(HERE, name), 'utf8');
    for (const m of src.matchAll(/<!--([\s\S]*?)-->/g)) {
      if (m[1].includes('--')) {
        const line = src.slice(0, m.index).split('\n').length;
        bad.push(`${name}:${line} comment contains "--"`);
      }
    }
    if (!src.trimEnd().endsWith('</svg>')) bad.push(`${name} does not end with </svg>`);
  }

  if (bad.length) {
    throw new Error(`malformed SVG:\n  ${bad.join('\n  ')}\n` +
      `XML comments cannot contain "--". Use "=" for rules of dashes.`);
  }
  console.log(`  xml check                  ${names.length} SVGs well-formed`);
}

const out = (name) => join(HERE, name);
const done = [];

try {
  assertWellFormed();
  assertOneDrawing();

  // ---- small sizes ---------------------------------------------
  const ico16 = renderSvg('favicon.svg', join(TMP, 'f16.png'), 16);
  const ico32 = renderSvg('favicon.svg', join(TMP, 'f32.png'), 32);
  const ico48 = renderSvg('favicon.svg', join(TMP, 'f48.png'), 48);
  done.push(buildIco([ico16, ico32, ico48], out('favicon.ico')));
  done.push(renderSvg('favicon.svg', out('favicon-32.png'), 32));

  // Check-only, not shipped: icons-check.html shows every size at
  // its true pixel size. Displaying favicon-32.png at 16 CSS px
  // would show the browser's smooth downscale instead, which is
  // kinder than what actually lands in the tab. These two are the
  // other entries inside favicon.ico, rendered out so the page can
  // show the .ico's real contents.
  done.push(renderSvg('favicon.svg', out('favicon-16.png'), 16));
  done.push(renderSvg('favicon.svg', out('favicon-48.png'), 48));

  // ---- app icons: the mark, full bleed -------------------------
  done.push(renderSvg('logo-mark.svg', out('apple-touch-icon.png'), 180));
  done.push(renderSvg('logo-mark.svg', out('icon-192.png'), 192));
  done.push(renderSvg('logo-mark.svg', out('icon-512.png'), 512));

  // ---- Android adaptive icon: glyph inset to the safe circle ---
  done.push(renderSvg('icon-maskable.svg', out('icon-maskable-512.png'), 512));

  // ---- social card --------------------------------------------
  shoot(join(HERE, 'og-image.html'), out('og-image.png'), 1200, 630);
  done.push(out('og-image.png'));

  for (const f of done) {
    const size = readFileSync(f).length;
    console.log(`  ${f.replace(`${HERE}/`, '').padEnd(24)} ${String(size).padStart(7)} bytes`);
  }
  console.log(`\n${done.length} files written to design/brand/`);
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
