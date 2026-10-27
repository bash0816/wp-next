// SPDX-License-Identifier: GPL-3.0-only
import type { StaticAsset } from './handler.js';

const DYNAMIC_HEADERS: Readonly<Record<string, string>> = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie',
  'X-WPN-Class': 'private',
  'X-Content-Type-Options': 'nosniff',
};

// 動的レスポンス。HEAD は同じヘッダでボディを空にする。
// 文字列またはバイト列を本文にする。バイト列は staticResponse と同様に BodyInit として扱う。
export function dynamic(
  method: string,
  body: string | Uint8Array,
  contentType: string,
  status = 200,
  extra: Readonly<Record<string, string>> = {},
): Response {
  const headers = { ...DYNAMIC_HEADERS, 'Content-Type': contentType, ...extra };
  const payload = typeof body === 'string' ? body : (body as BodyInit);
  return new Response(method === 'HEAD' ? null : payload, { status, headers });
}

export function staticResponse(method: string, asset: StaticAsset): Response {
  const headers = {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-WPN-Class': 'static',
    'X-Content-Type-Options': 'nosniff',
    'Content-Type': asset.contentType,
  };
  // Uint8Array<ArrayBufferLike> は BodyInit に型上代入できないため、実行時に同一の値を BodyInit として扱う。
  const body = typeof asset.body === 'string' ? asset.body : (asset.body as BodyInit);
  return new Response(method === 'HEAD' ? null : body, { status: 200, headers });
}

// 存在しない・不可視の投稿を含め、すべて同一の404にする(存在有無を漏らさない)。
export function notFound(method: string): Response {
  return dynamic(method, 'Not Found', 'text/plain; charset=utf-8', 404);
}

export function methodNotAllowed(method: string): Response {
  return dynamic(method, 'Method Not Allowed', 'text/plain; charset=utf-8', 405, {
    Allow: 'GET, HEAD',
  });
}

export function serverError(method: string): Response {
  return dynamic(method, 'Internal Server Error', 'text/plain; charset=utf-8', 500);
}
