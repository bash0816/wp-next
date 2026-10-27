// SPDX-License-Identifier: GPL-3.0-only
import type { DatabaseSync } from 'node:sqlite';
import type { Actor } from '@wpn/core/canView';
import { feedRoute, sitemapRoute } from './routes/feeds.js';
import { postRoute, searchRoute } from './routes/pages.js';
import { restPostsRoute } from './routes/rest.js';
import { mediaRoute } from './routes/media.js';
import { methodNotAllowed, notFound, serverError, staticResponse } from './respond.js';

export interface StaticAsset {
  readonly body: Uint8Array | string;
  readonly contentType: string;
}

export interface GateDeps {
  readonly db: Pick<DatabaseSync, 'prepare'>;
  readonly resolveActor: (req: Request) => Promise<Actor>;
  readonly staticAllowlist: ReadonlyMap<string, StaticAsset>;
  readonly siteUrl: string;
  readonly media?: { readonly store: { get(key: string): Promise<Uint8Array | null> } };
}

export interface RouteCtx {
  readonly method: string;
  readonly url: URL;
  readonly deps: GateDeps;
  readonly actor: Actor;
}

// 動的HTMLとして配信すると危険になる型は静的アセットに許可しない。
const FORBIDDEN_STATIC_TYPES: ReadonlySet<string> = new Set([
  'text/html',
  'application/json',
  'application/xml',
  'text/xml',
  'text/plain',
  'text/x-component',
]);

// 生のパス部分に対するトラバーサル・曖昧表現の検出。
const UNSAFE_PATH = /%2e|\.\.|\/\/|\\|%5c|%00|\0/i;

function rawPathOf(reqUrl: string): string {
  const withoutOrigin = /^[a-z][a-z0-9+.-]*:\/\/[^/]*(.*)$/i.exec(reqUrl)?.[1] ?? reqUrl;
  const q = withoutOrigin.indexOf('?');
  return q === -1 ? withoutOrigin : withoutOrigin.slice(0, q);
}

function validateAllowlist(allowlist: ReadonlyMap<string, StaticAsset>): void {
  for (const [path, asset] of allowlist) {
    const type = asset.contentType.split(';')[0]?.trim().toLowerCase() ?? '';
    if (FORBIDDEN_STATIC_TYPES.has(type)) {
      throw new Error(`静的アセット ${path} の contentType は許可されていません: ${type}`);
    }
  }
}

export function createHandler(deps: GateDeps): (req: Request) => Promise<Response> {
  validateAllowlist(deps.staticAllowlist);

  return async (req: Request): Promise<Response> => {
    const method = req.method.toUpperCase();
    try {
      const rawPath = rawPathOf(req.url);
      if (UNSAFE_PATH.test(rawPath)) return notFound(method);

      const url = new URL(req.url);
      const path = url.pathname;

      const asset = deps.staticAllowlist.get(path);
      const isDynamic =
        path === '/feed' ||
        path === '/sitemap.xml' ||
        path === '/search' ||
        path === '/wp-json/wp/v2/posts' ||
        path.startsWith('/media/') ||
        (path.startsWith('/p/') && path.length > '/p/'.length);

      if (asset === undefined && !isDynamic) return notFound(method);
      if (method !== 'GET' && method !== 'HEAD') return methodNotAllowed(method);

      if (asset !== undefined) return staticResponse(method, asset);

      if (path.startsWith('/media/')) {
        if (deps.media === undefined) return notFound(method);
        const mediaActor = await deps.resolveActor(req);
        const mediaCtx: RouteCtx = { method, url, deps, actor: mediaActor };
        return mediaRoute(mediaCtx, path.slice('/media/'.length), deps.media.store);
      }

      const actor = await deps.resolveActor(req);
      const ctx: RouteCtx = { method, url, deps, actor };

      if (path === '/feed') return feedRoute(ctx);
      if (path === '/sitemap.xml') return sitemapRoute(ctx);
      if (path === '/search') return searchRoute(ctx);
      if (path === '/wp-json/wp/v2/posts') return restPostsRoute(ctx);
      return postRoute(ctx, path.slice('/p/'.length));
    } catch {
      return serverError(method);
    }
  };
}

export async function handle(req: Request, deps: GateDeps): Promise<Response> {
  return createHandler(deps)(req);
}
