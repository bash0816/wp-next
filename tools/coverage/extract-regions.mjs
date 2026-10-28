// fixtures/ref/spike-blocks.html(single post ID5 の基準HTML)の <body> を領域に分解する。
// parse5 で解析し、各領域の元バイト列を sourceCodeLocation の offset で切り出す(再シリアライズしない)。
// 依存は packages/render の parse5 を createRequire で解決する(ルート node_modules には無い)。
//
// 領域:
//   skip-link.html   body 直下の a.skip-link
//   header.html      header.wp-block-template-part(親 .wp-site-blocks は含まない)
//   main-NN.html     main の直下の子要素(順番どおり)
//   footer.html      footer.wp-block-template-part
//   script-NN.html   body 直下の script(inline JS 等。別領域として記録)
//
// 使い方: node tools/coverage/extract-regions.mjs

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const requireFromRender = createRequire(join(root, 'packages/render/package.json'));
const { parse } = requireFromRender('parse5');

const SRC = join(root, 'fixtures/ref/spike-blocks.html');
const OUT_DIR = join(root, 'fixtures/ref/regions');

const src = readFileSync(SRC, 'utf8');
const doc = parse(src, { sourceCodeLocationInfo: true });

const attr = (n, name) => (n.attrs || []).find((a) => a.name === name)?.value ?? '';
const classes = (n) => attr(n, 'class').split(/\s+/).filter(Boolean);
const isEl = (n) => n.nodeName && !n.nodeName.startsWith('#');

const findFirst = (n, pred) => {
  if (pred(n)) return n;
  for (const c of n.childNodes || []) {
    const r = findFirst(c, pred);
    if (r) return r;
  }
  return null;
};

const body = findFirst(doc, (n) => n.nodeName === 'body');
if (!body) throw new Error('body が見つからない');
const bodyEls = body.childNodes.filter(isEl);

const one = (list, what) => {
  if (list.length !== 1) throw new Error(`${what}: ${list.length} 件(期待 1)`);
  return list[0];
};

const skipLink = one(
  bodyEls.filter((n) => n.nodeName === 'a' && classes(n).includes('skip-link')),
  'skip-link',
);
const siteBlocks = one(
  bodyEls.filter((n) => n.nodeName === 'div' && classes(n).includes('wp-site-blocks')),
  'wp-site-blocks',
);
const siteEls = siteBlocks.childNodes.filter(isEl);
const header = one(
  siteEls.filter((n) => n.nodeName === 'header' && classes(n).includes('wp-block-template-part')),
  'header.wp-block-template-part',
);
const main = one(siteEls.filter((n) => n.nodeName === 'main'), 'main');
const footer = one(
  siteEls.filter((n) => n.nodeName === 'footer' && classes(n).includes('wp-block-template-part')),
  'footer.wp-block-template-part',
);
const scripts = bodyEls.filter((n) => n.nodeName === 'script');
const mainChildren = main.childNodes.filter(isEl);

const slice = (n) => {
  const loc = n.sourceCodeLocation;
  if (!loc) throw new Error(`${n.nodeName}: location なし`);
  return src.slice(loc.startOffset, loc.endOffset);
};

const pad = (i) => String(i + 1).padStart(2, '0');
const regions = [
  { file: 'skip-link.html', kind: 'skip-link', node: skipLink },
  { file: 'header.html', kind: 'header', node: header },
  ...mainChildren.map((n, i) => ({ file: `main-${pad(i)}.html`, kind: `main>${n.nodeName}`, node: n })),
  { file: 'footer.html', kind: 'footer', node: footer },
  ...scripts.map((n, i) => ({ file: `script-${pad(i)}.html`, kind: 'script(body直下)', node: n })),
];

// 出力先を作り直す(旧い領域ファイルが残らないように、このスクリプトが生成する拡張子 .html のみ削除)
mkdirSync(OUT_DIR, { recursive: true });
for (const f of readdirSync(OUT_DIR)) if (f.endsWith('.html')) rmSync(join(OUT_DIR, f));

const rows = [];
for (const r of regions) {
  const html = slice(r.node);
  writeFileSync(join(OUT_DIR, r.file), html, 'utf8');
  rows.push({ file: r.file, kind: r.kind, bytes: Buffer.byteLength(html, 'utf8'), start: r.node.sourceCodeLocation.startOffset });
}

// 検証: 各領域が元文書内に丸ごと存在し、同名の領域が重ならないこと
for (const r of regions) {
  const html = slice(r.node);
  if (src.indexOf(html) < 0) throw new Error(`${r.file}: 元文書に一致しない`);
}
const sorted = [...rows].sort((a, b) => a.start - b.start);
for (let i = 1; i < sorted.length; i++) {
  const prevEnd = regions.find((r) => r.file === sorted[i - 1].file).node.sourceCodeLocation.endOffset;
  if (sorted[i].start < prevEnd) throw new Error(`${sorted[i].file} と ${sorted[i - 1].file} が重なる`);
}

console.log(`source: ${SRC} (${Buffer.byteLength(src, 'utf8')} bytes)`);
console.log(`regions: ${rows.length}`);
for (const r of rows) console.log(`${r.file}\t${r.kind}\t${r.bytes}`);
console.log(`out: ${OUT_DIR}`);
