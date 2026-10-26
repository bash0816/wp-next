// SPDX-License-Identifier: GPL-3.0-only
// 無料枠の上限値。出典: docs/free-tier-limits.md (一次確認 2026-10-26)。
// 値を変更・推測で追加しないこと。再確認は docs 側で行う。

// R2 (Standard のみ無料) — https://developers.cloudflare.com/r2/pricing/ (取得日 2026-10-26)
// 注: 出典は "10 GB-month/月"。バイト換算は 10 * 1000^3 (10進GB) を採用。解釈: 保守的側に寄せた値。
export const R2_STORAGE_BYTES_PER_MONTH = 10 * 1000 * 1000 * 1000;
// R2 Class A 操作 (put/list 等) — https://developers.cloudflare.com/r2/pricing/ (取得日 2026-10-26)
export const R2_CLASS_A_PER_MONTH = 1_000_000;
// R2 Class B 操作 (get/head 等) — https://developers.cloudflare.com/r2/pricing/ (取得日 2026-10-26)
export const R2_CLASS_B_PER_MONTH = 10_000_000;

// D1 読取行数 (00:00 UTC リセット) — https://developers.cloudflare.com/d1/platform/pricing/ (取得日 2026-10-26)
export const D1_ROWS_READ_PER_DAY = 5_000_000;
// D1 書込行数 — https://developers.cloudflare.com/d1/platform/pricing/ (取得日 2026-10-26)
export const D1_ROWS_WRITTEN_PER_DAY = 100_000;

// Workers Free リクエスト — https://developers.cloudflare.com/workers/platform/limits/ (取得日 2026-10-26)
export const WORKERS_REQUESTS_PER_DAY = 100_000;
