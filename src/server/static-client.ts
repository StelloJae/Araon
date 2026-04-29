import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

type AnyFastifyInstance = FastifyInstance<any, any, any, any, any>;

const API_PREFIXES = [
  '/credentials',
  '/stocks',
  '/themes',
  '/favorites',
  '/settings',
  '/runtime',
  '/import',
  '/master',
  '/events',
];

function pathFromRequestUrl(url: string): string {
  return new URL(url, 'http://127.0.0.1').pathname;
}

function isApiPath(pathname: string): boolean {
  return API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function looksLikeStaticAsset(pathname: string): boolean {
  return pathname.startsWith('/assets/') || /\.[A-Za-z0-9]{2,8}$/.test(pathname);
}

export async function registerStaticClient(app: AnyFastifyInstance, staticDir: string): Promise<void> {
  const root = resolve(staticDir);
  const indexPath = join(root, 'index.html');

  if (!existsSync(indexPath)) {
    throw new Error(`static client index.html not found at ${indexPath}`);
  }

  await app.register(fastifyStatic, {
    root,
    prefix: '/',
    wildcard: false,
  });

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    const pathname = pathFromRequestUrl(request.url);
    if (request.method === 'GET' && !isApiPath(pathname) && !looksLikeStaticAsset(pathname)) {
      return reply.type('text/html; charset=utf-8').sendFile('index.html');
    }
    return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
}
