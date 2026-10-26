// SPDX-License-Identifier: GPL-3.0-only
// tools/lint/check.mjs を子プロセスとして実行し、終了コードと出力を観測する。
// フィクスチャは実行時に OS の一時ディレクトリへ生成する(リポジトリ内には置かない)。
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(here, 'check.mjs');

const created: string[] = [];

function makeRoot(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'wpn-lint-'));
  created.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

function runLint(root: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('lint: no-direct-post-status', () => {
  it('packages 配下の post_status 直接参照を違反として検出し exit 1 を返す', () => {
    const root = makeRoot({
      'packages/x/src/a.ts': 'export const s = row.post_status;\n',
    });
    const res = runLint(root);
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('packages/x/src/a.ts:1: [no-direct-post-status]');
  });

  it('camelCase の postStatus も違反として検出する', () => {
    const root = makeRoot({
      'packages/x/src/b.ts': 'const postStatus = 1;\n',
    });
    const res = runLint(root);
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('packages/x/src/b.ts:1: [no-direct-post-status]');
  });

  it('apps 配下も走査対象に含まれる', () => {
    const root = makeRoot({
      'apps/web/src/c.ts': 'const v = x.post_status;\n',
    });
    const res = runLint(root);
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('apps/web/src/c.ts:1: [no-direct-post-status]');
  });

  it('許可ファイル(canView.ts, db/src/schema*, *.test.ts)では exit 0 を返す', () => {
    const root = makeRoot({
      'packages/core/src/canView.ts': 'export const f = (p: { post_status: string }) => p.post_status;\n',
      'packages/db/src/schema.ts': 'export const t = { post_status: 1 };\n',
      'packages/db/src/schema/posts.ts': 'export const p = { postStatus: 1 };\n',
      'packages/core/src/foo.test.ts': 'const postStatus = "draft";\n',
    });
    const res = runLint(root);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain('[no-direct-post-status]');
  });

  it('許可リストの近似名(canViewHelper.ts, db/src/queries.ts)は除外されず違反になる', () => {
    const root = makeRoot({
      'packages/core/src/canViewHelper.ts': 'export const h = row.post_status;\n',
      'packages/db/src/queries.ts': 'export const q = row.post_status;\n',
    });
    const res = runLint(root);
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('packages/core/src/canViewHelper.ts:1: [no-direct-post-status]');
    expect(res.stdout).toContain('packages/db/src/queries.ts:1: [no-direct-post-status]');
  });
});

describe('lint: no-direct-r2', () => {
  const violatingFiles = {
    'packages/core/src/r.ts': 'import { S3Client } from "@aws-sdk/client-s3";\n',
    'apps/web/src/env.ts': 'export type Env = { MEDIA: R2Bucket };\n',
    'apps/web/src/use.ts': 'const b = env.MEDIA_BUCKET;\n',
  };

  it('core/apps から S3 import, R2Bucket 型, env.*BUCKET を違反として検出する', () => {
    const root = makeRoot(violatingFiles);
    const res = runLint(root);
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('packages/core/src/r.ts:1: [no-direct-r2]');
    expect(res.stdout).toContain('apps/web/src/env.ts:1: [no-direct-r2]');
    expect(res.stdout).toContain('apps/web/src/use.ts:1: [no-direct-r2]');
  });

  it('packages/storage/ 配下の同じ内容は許可され exit 0 を返す', () => {
    const root = makeRoot({
      'packages/storage/src/r2.ts': violatingFiles['packages/core/src/r.ts'],
      'packages/storage/src/types.ts': violatingFiles['apps/web/src/env.ts'],
      'packages/storage/src/access.ts': violatingFiles['apps/web/src/use.ts'],
    });
    const res = runLint(root);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain('[no-direct-r2]');
  });
});

describe('lint: 走査の挙動', () => {
  it('node_modules 配下は走査しない', () => {
    const root = makeRoot({
      'packages/x/node_modules/dep/bad.ts': 'const postStatus = 1;\n',
      'packages/x/src/ok.ts': 'export const ok = 1;\n',
    });
    const res = runLint(root);
    expect(res.status).toBe(0);
  });

  it('存在しない root を指定すると exit 2 を返す', () => {
    const root = makeRoot({});
    const res = runLint(path.join(root, 'does-not-exist'));
    expect(res.status).toBe(2);
  });
});
