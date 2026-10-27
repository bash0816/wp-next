// SPDX-License-Identifier: GPL-3.0-only
import { createHmac } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { createWpPasswordVerifier } from './passwordVerifier.js';

// phpass 公式テストベクタ(記憶由来。独立実装 node:crypto で検証済み: 2048 回反復の MD5 ベース)
const PHPASS_HASH = '$P$9IQRaTwmfeRo7ud9Fh4E2PdI0S3r.L0';
// 上記と同一アルゴリズムの $H$ 接頭辞版
const PHPASS_HASH_H = '$H$9IQRaTwmfeRo7ud9Fh4E2PdI0S3r.L0';
// 日本語パスワード用 phpass ベクタ(同アルゴリズム、独立実装で生成・検証済み: 512 回反復)
const PHPASS_JP_PASSWORD = '日本語パスワード';
const PHPASS_JP_HASH = '$P$7JpSalt01MQnCUjXoCac.Y8oj1YvCi0';

// テスト高速化のため cost は 4 を使う
const COST = 4;

// WP 6.8+ の事前ハッシュ: base64(HMAC-SHA384(key='wp-sha384', message=password))
function wpPrehash(password: string): string {
  return createHmac('sha384', 'wp-sha384').update(password, 'utf8').digest('base64');
}

// WP 6.8+ 形式: '$wp' + bcrypt('$2y$...')。bcrypt の入力は事前ハッシュ
function makeWpHash(password: string): string {
  const bcryptHash = bcrypt.hashSync(wpPrehash(password), COST).replace(/^\$2[aby]\$/, '$2y$');
  return `$wp${bcryptHash}`;
}

// 素の bcrypt: 生のパスワードを直接ハッシュ
function makePlainBcrypt(password: string, prefix: '$2a$' | '$2b$' | '$2y$'): string {
  return bcrypt.hashSync(password, COST).replace(/^\$2[aby]\$/, prefix);
}

describe('createWpPasswordVerifier', () => {
  const verifier = createWpPasswordVerifier();

  describe('phpass ($P$ / $H$)', () => {
    it('正しいパスワードで true を返す', async () => {
      await expect(verifier.verify('test12345', PHPASS_HASH)).resolves.toBe(true);
    });

    it('1文字違うパスワードで false を返す', async () => {
      await expect(verifier.verify('test12346', PHPASS_HASH)).resolves.toBe(false);
    });

    it('$H$ 接頭辞のハッシュも正しいパスワードで true を返す', async () => {
      await expect(verifier.verify('test12345', PHPASS_HASH_H)).resolves.toBe(true);
    });

    it('日本語(マルチバイト)パスワードの正誤を区別する', async () => {
      await expect(verifier.verify(PHPASS_JP_PASSWORD, PHPASS_JP_HASH)).resolves.toBe(true);
      await expect(verifier.verify(`${PHPASS_JP_PASSWORD}x`, PHPASS_JP_HASH)).resolves.toBe(false);
    });
  });

  describe('WP 6.8+ ($wp + bcrypt(HMAC-SHA384 事前ハッシュ))', () => {
    const wpHash = makeWpHash('correct horse');

    it('ハッシュが $wp$2y$ 形式で生成されている(テストベクタの前提確認)', () => {
      expect(wpHash.startsWith('$wp$2y$')).toBe(true);
    });

    it('正しいパスワードで true を返す', async () => {
      await expect(verifier.verify('correct horse', wpHash)).resolves.toBe(true);
    });

    it('誤ったパスワードで false を返す', async () => {
      await expect(verifier.verify('correct horse!', wpHash)).resolves.toBe(false);
    });

    it('日本語パスワードの正誤を区別する', async () => {
      const jpHash = makeWpHash('パスワード日本語');
      await expect(verifier.verify('パスワード日本語', jpHash)).resolves.toBe(true);
      await expect(verifier.verify('パスワード日本', jpHash)).resolves.toBe(false);
    });

    it('72バイトを超えるパスワードでも例外を投げず、先頭72バイトが同じでも以降が違えば false', async () => {
      const prefix = 'a'.repeat(80);
      const hashA = makeWpHash(`${prefix}X`);
      await expect(verifier.verify(`${prefix}X`, hashA)).resolves.toBe(true);
      await expect(verifier.verify(`${prefix}Y`, hashA)).resolves.toBe(false);
    });
  });

  describe('素の bcrypt ($2a$ / $2b$ / $2y$)', () => {
    it.each(['$2a$', '$2b$', '$2y$'] as const)('%s 接頭辞で正しいパスワードは true、誤りは false', async (prefix) => {
      const hash = makePlainBcrypt('plain-secret', prefix);
      await expect(verifier.verify('plain-secret', hash)).resolves.toBe(true);
      await expect(verifier.verify('plain-secreT', hash)).resolves.toBe(false);
    });

    it('日本語パスワードの正誤を区別する', async () => {
      const hash = makePlainBcrypt('日本語のパス', '$2y$');
      await expect(verifier.verify('日本語のパス', hash)).resolves.toBe(true);
      await expect(verifier.verify('日本語の', hash)).resolves.toBe(false);
    });

    it('72バイトを超えるパスワードで例外を投げず、先頭72バイトが一致すれば true(bcrypt 仕様: 72バイトで切り捨て)', async () => {
      const prefix = 'b'.repeat(72);
      const hash = makePlainBcrypt(`${prefix}X`, '$2b$');
      await expect(verifier.verify(`${prefix}X`, hash)).resolves.toBe(true);
      await expect(verifier.verify(`${prefix}Y`, hash)).resolves.toBe(true);
    });
  });

  describe('境界・fail-closed(すべて false、例外を投げない)', () => {
    const validBcrypt = makePlainBcrypt('secret', '$2b$');
    const validWp = makeWpHash('secret');

    it.each([
      ['空のハッシュ', ''],
      ['未知形式 argon2id', '$argon2id$v=19$m=65536,t=4,p=1$c2FsdA$aGFzaA'],
      ['未知形式 plain', 'plain'],
      ['接頭辞のみ $P$', '$P$'],
      ['長さ不足の phpass', '$P$9IQRaTwmfe'],
      ['接頭辞のみ $wp', '$wp'],
      ['長さ不足の bcrypt', '$2b$04$short'],
    ])('%s は false', async (_label, hash) => {
      await expect(verifier.verify('secret', hash)).resolves.toBe(false);
    });

    it('空のパスワードは正しいハッシュ(phpass / bcrypt / WP)に対して false', async () => {
      await expect(verifier.verify('', PHPASS_HASH)).resolves.toBe(false);
      await expect(verifier.verify('', validBcrypt)).resolves.toBe(false);
      await expect(verifier.verify('', validWp)).resolves.toBe(false);
    });
  });
});
