import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

/**
 * WordPress パスワード検証器(検証のみ。再ハッシュ・ハッシュ生成は範囲外)。
 * 失敗・不正入力はすべて false を返し、例外を投げない(fail-closed)。
 */
export interface PasswordVerifier {
  verify(password: string, hash: string): Promise<boolean>;
}

// phpass 独自 base64 アルファベット
const ITOA64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const PHPASS_HASH_LENGTH = 34;

// --- 暗号プリミティブ(基盤差し替え時はこの2関数だけを置換する) ---

function md5Raw(data: Buffer): Buffer {
  return createHash('md5').update(data).digest();
}

function hmacSha384Base64(key: string, message: string): string {
  return createHmac('sha384', key).update(message, 'utf8').digest('base64');
}

// --- 比較 ---

function constantTimeEqualStrings(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// --- phpass ---

// phpass の encode64: 3バイト群を little-endian で 6bit 単位に分割する
function phpassEncode64(input: Buffer, count: number): string {
  let out = '';
  for (let i = 0; i < count; i += 3) {
    const n = Math.min(3, count - i);
    let v = 0;
    for (let k = 0; k < n; k++) v |= (input[i + k] ?? 0) << (8 * k);
    const chars = Math.ceil((n * 8) / 6);
    for (let k = 0; k < chars; k++) out += ITOA64[(v >> (6 * k)) & 0x3f];
  }
  return out;
}

function verifyPhpass(password: string, hash: string): boolean {
  if (hash.length !== PHPASS_HASH_LENGTH) return false;
  const countLog2 = ITOA64.indexOf(hash[3] ?? '');
  if (countLog2 < 7 || countLog2 > 30) return false;

  const salt = hash.slice(4, 12);
  const pw = Buffer.from(password, 'utf8');

  let h = md5Raw(Buffer.concat([Buffer.from(salt, 'utf8'), pw]));
  const iterations = 2 ** countLog2;
  for (let i = 0; i < iterations; i++) {
    h = md5Raw(Buffer.concat([h, pw]));
  }

  const computed = hash.slice(0, 12) + phpassEncode64(h, 16);
  return constantTimeEqualStrings(computed, hash);
}

// --- 公開API ---

export function createWpPasswordVerifier(): PasswordVerifier {
  return {
    async verify(password: string, hash: string): Promise<boolean> {
      try {
        if (typeof password !== 'string' || typeof hash !== 'string') return false;
        if (password.length === 0 || hash.length === 0) return false;

        // phpass ($P$ / $H$)
        if (hash.startsWith('$P$') || hash.startsWith('$H$')) {
          return verifyPhpass(password, hash);
        }

        // WP 6.8+: '$wp' + bcrypt(base64(HMAC-SHA384(key='wp-sha384', password)))
        if (hash.startsWith('$wp$2')) {
          const prehash = hmacSha384Base64('wp-sha384', password);
          return await bcrypt.compare(prehash, hash.slice(3));
        }

        // 素の bcrypt
        if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
          return await bcrypt.compare(password, hash);
        }

        return false;
      } catch {
        return false;
      }
    },
  };
}
