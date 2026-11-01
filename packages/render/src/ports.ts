// SPDX-License-Identifier: GPL-3.0-only
// port 型の実体は @wpn/core/ports にある(render と db の双方が参照するため)。ここは再 export のみ。
export type { PostCtx, ContentPort, QueryItem, QueriesPort } from '@wpn/core/ports';
