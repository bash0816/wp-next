#!/usr/bin/env node
// v0.1 gate candidate generator.
// Inputs : fixtures/ref/themes/twentytwentyfive/{templates,parts,patterns}, docs/coverage/{blocks,template-hierarchy,rest-routes}.csv
// Output : docs/coverage/gates/v0.1.candidates.md (deterministic, no timestamps)
// Usage  : node tools/coverage/gate-candidates.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const THEME = join(ROOT, 'fixtures/ref/themes/twentytwentyfive');
const LEDGER = join(ROOT, 'docs/coverage');
const OUT = join(LEDGER, 'gates/v0.1.candidates.md');
const THEME_PREFIX = 'twentytwentyfive/';

// Root templates whose markup is scanned. The two parts are scanned as roots as well.
const ROOT_TEMPLATES = ['single', 'page', 'home', 'archive', 'search', '404', 'index'];
const ROOT_PARTS = ['header', 'footer'];
// Reference meta-blocks: expanded by recursion, never counted as block names.
const REFERENCE_BLOCKS = new Set(['core/pattern', 'core/template-part']);
// Template-hierarchy selection: a row is selected when its get_template_hierarchy chain
// contains one of these six templates (single, page, home, archive, search, 404, index).
const SIX = new Set(['single', 'page', 'home', 'archive', 'search', '404', 'index']);
// REST route-level selection: exact route match AND GET listed in methods.
const REST_ROUTES = [
  '/', '/wp/v2', '/wp/v2/posts', '/wp/v2/pages', '/wp/v2/media', '/wp/v2/users',
  '/wp/v2/categories', '/wp/v2/tags', '/wp/v2/taxonomies', '/wp/v2/types',
  '/wp/v2/statuses', '/wp/v2/search',
];

// Quote-aware CSV parser (RFC 4180 style, "" escapes inside quoted fields).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; ) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { quoted = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  const [header, ...data] = rows;
  return data.map((r) => Object.fromEntries(header.map((h, k) => [h, r[k] ?? ''])));
}

function readCsv(name) {
  return parseCsv(readFileSync(join(LEDGER, name), 'utf8'));
}

function uniqueByName(rows, label) {
  const map = new Map();
  for (const r of rows) {
    if (map.has(r.name)) throw new Error(`${label}: duplicate name ${r.name}`);
    map.set(r.name, r);
  }
  return map;
}

// Block openers only (closers "<!-- /wp:x -->" are excluded by the regex).
// Names without a namespace are core/.
function blockNamesIn(text) {
  const out = [];
  for (const m of text.matchAll(/<!--\s+wp:([a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)?)(?=[\s{/-])/g)) {
    out.push(m[1].includes('/') ? m[1] : `core/${m[1]}`);
  }
  return out;
}

// Traversal state (global across roots).
const sites = new Map(); // block name -> { direct: Set<file>, roots: Set<root> }
const patternFiles = new Set();
const partFiles = new Set();
const edges = new Set(); // "from -> to" for every resolved reference
const cycles = new Set();
const unresolved = new Set();
const rootReport = [];

function walkRoot(root) {
  const visited = new Set();
  const stack = [];
  const visit = (rel) => {
    if (stack.includes(rel)) {
      const i = stack.indexOf(rel);
      cycles.add([...stack.slice(i), rel].join(' -> '));
      return;
    }
    if (visited.has(rel)) return;
    visited.add(rel);
    const abs = join(THEME, rel);
    if (!existsSync(abs)) {
      unresolved.add(`${rel} (referenced from ${stack.at(-1) ?? root})`);
      return;
    }
    if (rel.startsWith('patterns/')) patternFiles.add(rel);
    if (rel.startsWith('parts/')) partFiles.add(rel);
    const text = readFileSync(abs, 'utf8');
    stack.push(rel);
    for (const name of blockNamesIn(text)) {
      if (REFERENCE_BLOCKS.has(name)) continue;
      const s = sites.get(name) ?? { direct: new Set(), roots: new Set() };
      s.direct.add(rel);
      s.roots.add(root);
      sites.set(name, s);
    }
    for (const m of text.matchAll(/<!--\s+wp:(pattern|template-part)\s+(\{[^}]*\})/g)) {
      const attrs = JSON.parse(m[2]);
      const slug = String(attrs.slug ?? '');
      // template-part slugs may be prefix-less (e.g. "header") and resolve to parts/<slug>.html.
      // pattern slugs must carry the theme prefix.
      const hasPrefix = slug.startsWith(THEME_PREFIX);
      if (m[1] === 'pattern' && !hasPrefix) {
        unresolved.add(`slug "${slug}" is outside ${THEME_PREFIX} (referenced from ${rel})`);
        continue;
      }
      const bare = hasPrefix ? slug.slice(THEME_PREFIX.length) : slug;
      const to = m[1] === 'pattern' ? `patterns/${bare}.php` : `parts/${bare}.html`;
      edges.add(`${rel} -> ${to}`);
      visit(to);
    }
    stack.pop();
  };
  visit(root);
  rootReport.push({ root, files: visited.size });
}

function selectTemplateRows(rows) {
  const selected = [];
  const excluded = [];
  for (const r of rows) {
    const m = /^get_template_hierarchy\("([^"]+)"\)\s*=>\s*(.+?)\s*;/.exec(r.notes);
    if (!m) { excluded.push({ r, why: 'no get_template_hierarchy chain in notes' }); continue; }
    const chain = m[2].split(',').map((s) => s.trim());
    if (chain.some((t) => SIX.has(t))) selected.push({ r, chain });
    else excluded.push({ r, why: `chain [${chain.join(', ')}] contains none of the six templates` });
  }
  return { selected, excluded };
}

function methodsOf(notes) {
  const head = notes.split(' endpoints=')[0];
  return head.replace(/^methods=/, '').split(/[;,]/).map((s) => s.trim()).filter(Boolean);
}

function main() {
  const blockRows = readCsv('blocks.csv');
  const tplRows = readCsv('template-hierarchy.csv');
  const restRows = readCsv('rest-routes.csv');
  const byName = uniqueByName(blockRows, 'blocks.csv');

  for (const r of ROOT_TEMPLATES) walkRoot(`templates/${r}.html`);
  for (const p of ROOT_PARTS) walkRoot(`parts/${p}.html`);

  // Step 1: blocks.
  const names = [...sites.keys()].sort();
  const matched = names.filter((n) => byName.has(n));
  const missing = names.filter((n) => !byName.has(n));
  const doneIds = matched.filter((n) => byName.get(n).status === 'done').map((n) => byName.get(n).id).sort();
  const todoIds = matched.filter((n) => byName.get(n).status !== 'done').map((n) => byName.get(n).id).sort();
  const blockIds = [...doneIds, ...todoIds].sort();
  const unusedLedger = blockRows.length - matched.length;
  const refRows = ['core/pattern', 'core/template-part'].map((n) => byName.get(n)).filter(Boolean);

  // Step 2: template hierarchy.
  const tpl = selectTemplateRows(tplRows);
  const tplIds = tpl.selected.map((s) => s.r.id);
  // A root template is covered when some selected row carries exactly that template name.
  const tplCovered = ROOT_TEMPLATES.filter((t) => !tpl.selected.some((s) => s.r.name === t));

  // Step 3: REST routes.
  const restSel = [];
  const restExcl = [];
  const restMissing = [];
  for (const route of REST_ROUTES) {
    const rows = restRows.filter((r) => r.name === route);
    if (rows.length === 0) { restMissing.push(route); continue; }
    for (const r of rows) {
      const methods = methodsOf(r.notes);
      if (methods.includes('GET')) restSel.push({ r, methods });
      else restExcl.push({ r, why: `methods [${methods.join(', ')}] has no GET` });
    }
  }
  const restIds = restSel.map((s) => s.r.id);

  // Step 4: markdown.
  const L = [];
  const push = (...xs) => L.push(...xs);
  push(
    '# v0.1 gate candidates (mechanical)',
    '',
    'Generated by `node tools/coverage/gate-candidates.mjs`. Do not edit by hand; regenerate instead.',
    '',
    'Inputs: `fixtures/ref/themes/twentytwentyfive/{templates,parts,patterns}`, `docs/coverage/{blocks,template-hierarchy,rest-routes}.csv`.',
    '',
    '## Counts',
    '',
    '| category | IDs | done | todo |',
    '| --- | ---: | ---: | ---: |',
    `| blocks (unique names used, reference meta-blocks excluded) | ${names.length} | ${doneIds.length} | ${todoIds.length} |`,
    `| blocks ledger-external (names not in blocks.csv) | ${missing.length} | - | - |`,
    `| template-hierarchy | ${tplIds.length} | - | ${tplIds.length} |`,
    `| rest-routes | ${restIds.length} | - | ${restIds.length} |`,
    '',
    '## Step 1: blocks',
    '',
    `- Unique block names used by the 7 templates and 2 parts, after recursive expansion: ${names.length}`,
    `- Matched to blocks.csv (candidate IDs): ${matched.length}; done: ${doneIds.length}; todo: ${todoIds.length}`,
    `- Ledger-external names (not in blocks.csv): ${missing.length}`,
    `- blocks.csv rows not used by the six templates (not candidates): ${unusedLedger}`,
    `- Reference meta-blocks (expanded, not counted): ${refRows.map((r) => `${r.name} -> ${r.id} (${r.status})`).join(', ')}`,
    '',
    `### Candidate block IDs (${blockIds.length})`,
    '',
    `done (${doneIds.length}): ${doneIds.join(', ') || '(none)'}`,
    '',
    `todo (${todoIds.length}): ${todoIds.join(', ') || '(none)'}`,
    '',
    '### Block usage origins',
    '',
    '`direct` = files that contain the marker; `roots` = entry templates/parts from which it is reached.',
    '',
    '| block | ledger id | status | direct | roots |',
    '| --- | --- | --- | --- | --- |',
    ...names.map((n) => {
      const s = sites.get(n);
      const row = byName.get(n);
      return `| ${n} | ${row ? row.id : '(ledger-external)'} | ${row ? row.status : '-'} | ${[...s.direct].sort().join('<br>')} | ${[...s.roots].sort().join(', ')} |`;
    }),
    '',
    '### Ledger-external block names',
    '',
    missing.length ? missing.map((n) => `- \`${n}\`: ${[...sites.get(n).direct].sort().join(', ')}`).join('\n') : '(none)',
    '',
    '## Step 2: template-hierarchy',
    '',
    'Selection rule: a row is selected when its `notes` begins with `get_template_hierarchy("<t>") => <chain>` and the chain contains one of `single, page, home, archive, search, 404, index`. Template-function rows (`get_*_template`) and `get_template_hierarchy` itself carry no chain in notes and are not selected.',
    '',
    `Selected (${tplIds.length}): ${tplIds.join(', ')}`,
    '',
    '| id | name | category | chain |',
    '| --- | --- | --- | --- |',
    ...tpl.selected.map((s) => `| ${s.r.id} | ${s.r.name} | ${s.r.category} | ${s.chain.join(', ')} |`),
    '',
    `Excluded (${tpl.excluded.length}): ${tpl.excluded.length} rows, reason counts: ${[...new Set(tpl.excluded.map((e) => e.why))].map((w) => `${w} (${tpl.excluded.filter((e) => e.why === w).length})`).join('; ')}`,
    '',
    `Root templates without a selected row: ${tplCovered.join(', ') || '(none)'}. \`singular\` has no chain row of its own; it appears only inside chains (tpl-001, tpl-002, tpl-008..tpl-011). Decision on whether to add tpl-031 get_singular_template is left to the user.`,
    '',
    '## Step 3: rest-routes',
    '',
    'Selection rule: route name exactly equal to one of the 12 listed routes, and `GET` present in the methods listed in notes. Route-level only; method x auth refinement is later work.',
    '',
    `Selected (${restIds.length}): ${restIds.join(', ')}`,
    '',
    '| id | route | methods |',
    '| --- | --- | --- |',
    ...restSel.map((s) => `| ${s.r.id} | ${s.r.name} | ${s.methods.join(', ')} |`),
    '',
    `Routes requested but not in rest-routes.csv: ${restMissing.join(', ') || '(none)'}`,
    '',
    `Excluded routes (listed route but no GET): ${restExcl.map((e) => `${e.r.id} ${e.r.name} (${e.why})`).join('; ') || '(none)'}`,
    '',
    '## Pattern recursion',
    '',
    `- Patterns processed via recursion (distinct \`patterns/*.php\`): ${patternFiles.size}`,
    `- Parts processed (distinct \`parts/*.html\`): ${partFiles.size}`,
    `- Resolved references (edges): ${edges.size}`,
    `- Roots: ${rootReport.map((r) => `${r.root} (${r.files} files)`).join(', ')}`,
    `- Cycles: ${cycles.size === 0 ? 'none' : cycles.size}`,
    ...[...cycles].map((c) => `  - ${c}`),
    `- Unresolved references: ${unresolved.size === 0 ? 'none' : unresolved.size}`,
    ...[...unresolved].map((u) => `  - ${u}`),
    '',
    '## Run steps',
    '',
    '1. `cd` to the repository root (`~/wp-next`).',
    '2. Confirm the inputs are unchanged: `git status --short` and `git diff --stat -- docs/coverage fixtures/ref`.',
    '3. Regenerate: `node tools/coverage/gate-candidates.mjs`. It overwrites this file only.',
    '4. Check the counts in the "Counts" table against the ledgers (`docs/coverage/*.csv`).',
    '',
  );

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, L.join('\n'));

  console.log(`blocks: unique=${names.length} matched=${matched.length} done=${doneIds.length} todo=${todoIds.length} external=${missing.length}`);
  console.log(`template-hierarchy: selected=${tplIds.length} (${tplIds.join(',')})`);
  console.log(`rest-routes: selected=${restIds.length} (${restIds.join(',')}) missing=${restMissing.join(',') || 'none'}`);
  console.log(`patterns processed=${patternFiles.size} parts processed=${partFiles.size} edges=${edges.size}`);
  console.log(`cycles=${cycles.size} unresolved=${unresolved.size}`);
  console.log(`wrote ${OUT}`);
}

main();
