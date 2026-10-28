// SPDX-License-Identifier: GPL-3.0-only
// 独自lint: packages/ と apps/ 配下の .ts ファイルを走査し、設計ルール違反を検出する。
// 依存なし。終了コード: 0=違反なし, 1=違反あり, 2=実行エラー(root不正・IO失敗など)。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCAN_DIRS = ['packages', 'apps'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.wrangler']);

const RULES = [
  {
    id: 'no-direct-post-status',
    message: 'post_status / postStatus の直接参照は禁止。canView 等の経由関数を使うこと',
    pattern: /\bpost_status\b|\bpostStatus\b/,
    allowed(rel) {
      return (
        rel === 'packages/core/src/canView.ts' ||
        rel === 'packages/db/src/visiblePosts.ts' ||
        rel === 'packages/db/src/latestPosts.ts' ||
        rel.startsWith('packages/db/src/schema') ||
        rel.endsWith('.test.ts')
      );
    },
  },
  {
    id: 'no-direct-r2',
    message: 'R2/S3 への直接アクセスは禁止。packages/storage/ 経由で行うこと',
    pattern: /@aws-sdk\/client-s3|\bR2Bucket\b|\benv\.\w*BUCKET\b/,
    allowed(rel) {
      return rel.startsWith('packages/storage/');
    },
  },
];

function parseArgs(argv) {
  const idx = argv.indexOf('--root');
  if (idx === -1) return DEFAULT_ROOT;
  const value = argv[idx + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error('--root には値が必要です');
  }
  return path.resolve(value);
}

function collectTsFiles(absDir, relDir, out) {
  const entries = readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectTsFiles(path.join(absDir, entry.name), `${relDir}/${entry.name}`, out);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(`${relDir}/${entry.name}`);
    }
  }
  return out;
}

function main() {
  let root;
  try {
    root = parseArgs(process.argv.slice(2));
    if (!statSync(root).isDirectory()) {
      throw new Error(`root がディレクトリではありません: ${root}`);
    }
  } catch (err) {
    process.stderr.write(`lint: ${err.message}\n`);
    return 2;
  }

  const files = [];
  try {
    for (const dir of SCAN_DIRS) {
      const abs = path.join(root, dir);
      let isDir = false;
      try {
        isDir = statSync(abs).isDirectory();
      } catch {
        isDir = false;
      }
      if (isDir) collectTsFiles(abs, dir, files);
    }
  } catch (err) {
    process.stderr.write(`lint: 走査中にエラー: ${err.message}\n`);
    return 2;
  }
  files.sort();

  const violations = [];
  try {
    for (const rel of files) {
      const lines = readFileSync(path.join(root, rel), 'utf8').split(/\r?\n/);
      for (const rule of RULES) {
        if (rule.allowed(rel)) continue;
        lines.forEach((line, i) => {
          if (rule.pattern.test(line)) {
            violations.push(`${rel}:${i + 1}: [${rule.id}] ${rule.message}`);
          }
        });
      }
    }
  } catch (err) {
    process.stderr.write(`lint: 読み込み中にエラー: ${err.message}\n`);
    return 2;
  }

  if (violations.length > 0) {
    process.stdout.write(violations.join('\n') + '\n');
    process.stdout.write(`lint: ${violations.length} 件の違反\n`);
    return 1;
  }
  process.stdout.write(`lint: OK (${files.length} ファイルを走査)\n`);
  return 0;
}

process.exitCode = main();
