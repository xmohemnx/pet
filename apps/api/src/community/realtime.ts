import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { Server, IncomingMessage } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { Client } from 'pg';
import { createClient } from 'redis';
import { z } from 'zod';
import { origin } from '../identity/auth.js';
import { requireSession } from '../identity/session.js';
import { database, transaction } from '../database.js';
import { conversationAccess } from './service.js';

const route = '/api/v1/social/realtime/socket';
let ready = () => false;
export function realtimeSettings() {
  const url = new URL(origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  if (process.env.APP_ENV === 'local')
    url.port = String(Number(process.env.API_PORT ?? 4000));
  url.pathname = route;
  return { enabled: ready(), url: url.toString() };
}
const packet = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe'), peerId: z.uuid() }).strict(),
  z.object({ type: z.literal('typing'), active: z.boolean() }).strict(),
]);
interface Connection {
  ws: WebSocket;
  request: IncomingMessage;
  actor: string;
  id: string;
  peer?: string;
  alive: boolean;
  chain: Promise<void>;
  pending: number;
  window: number;
  attempts: number;
}
@Injectable()
export class RealtimeGateway implements OnModuleDestroy {
  private stop: () => Promise<void> = async () => {};
  async onModuleDestroy() {
    await this.stop();
  }
  async start(server: Server) {
    const dburl = new URL(process.env.DATABASE_URL!);
    const ns =
      'petra:rt:' +
      createHash('sha256')
        .update(dburl.host + dburl.pathname)
        .digest('hex')
        .slice(0, 20);
    const redis = createClient({
      url: process.env.REDIS_URL,
      socket: { connectTimeout: 3000 },
    });
    const subscriber = redis.duplicate();
    const sockets = new Set<Connection>();
    const wss = new WebSocketServer({
      noServer: true,
      maxPayload: 1024,
      perMessageDeflate: false,
      handleProtocols: (protocols) =>
        protocols.has('petra-chat-v1') ? 'petra-chat-v1' : false,
    });
    let pg: Client | undefined,
      pgReady = false,
      closing = false,
      retry: ReturnType<typeof setTimeout> | undefined,
      pendingHandshakes = 0;
    const available = () =>
      !closing && pgReady && redis.isReady && subscriber.isReady;
    ready = available;
    const lease = (actor: string) => `${ns}:leases:${actor}`;
    const typing = (actor: string, peer: string) =>
      `${ns}:typing:${actor}:${peer}`;
    const closeAll = () => {
      for (const c of sockets) c.ws.close(1013, 'الاتصال غير متاح مؤقتاً');
    };
    redis.on('error', closeAll);
    subscriber.on('error', closeAll);
    await redis.connect();
    await subscriber.connect();
    const send = (c: Connection, data: object) => {
      if (c.ws.readyState === WebSocket.OPEN) {
        if (c.ws.bufferedAmount > 16384) c.ws.close(1008);
        else c.ws.send(JSON.stringify(data));
      }
    };
    const authorize = async (c: Connection) => {
      const session = await requireSession(c.request);
      if (session.user.id !== c.actor) throw new Error('session');
      if (c.peer)
        await transaction((db) => conversationAccess(db, c.actor, c.peer!));
    };
    const state = async (c: Connection) => {
      if (!c.peer) return;
      await authorize(c);
      const enabled =
        (
          await database.query(
            'SELECT presence_enabled FROM social_profiles WHERE user_id=$1',
            [c.peer],
          )
        ).rows[0]?.presence_enabled === true;
      const online = enabled
        ? (await redis.zCount(lease(c.peer), Date.now(), '+inf')) > 0
        : null;
      const writing =
        enabled && (await redis.exists(typing(c.peer, c.actor))) > 0;
      send(c, { type: 'status', online, typing: writing });
    };
    const enqueue = (c: Connection, work: () => Promise<void>) => {
      if (c.pending >= 4) {
        c.ws.close(1008);
        return;
      }
      c.pending++;
      c.chain = c.chain
        .then(async () => {
          if (c.ws.readyState === WebSocket.OPEN) await work();
        })
        .catch((error: unknown) => {
          const status =
            error && typeof error === 'object' && 'getStatus' in error
              ? (error as { getStatus(): number }).getStatus()
              : 503;
          if ([401, 403, 404].includes(status)) {
            send(c, { type: 'revoked' });
            c.ws.close(4403, 'انتهى إذن المحادثة');
          } else c.ws.close(1013, 'تعذر الاتصال مؤقتاً');
        })
        .finally(() => {
          c.pending--;
        });
    };
    const signalSchema = z
      .object({
        actor: z.uuid(),
        peer: z.uuid().nullable().optional(),
        kind: z.enum(['changed', 'policy', 'presence']),
      })
      .strict();
    const signal = (raw: string) => {
      let signal: z.infer<typeof signalSchema>;
      try {
        signal = signalSchema.parse(JSON.parse(raw));
      } catch {
        return;
      }
      for (const c of sockets) {
        if (!c.peer) continue;
        const relevant = signal.peer
          ? (c.actor === signal.actor && c.peer === signal.peer) ||
            (c.peer === signal.actor && c.actor === signal.peer)
          : c.actor === signal.actor || c.peer === signal.actor;
        if (relevant)
          enqueue(c, async () => {
            await authorize(c);
            send(c, { type: 'changed' });
            await state(c);
          });
      }
    };
    await subscriber.subscribe(`${ns}:signal`, signal);
    const publish = async (actor: string, peer?: string) => {
      await redis.publish(
        `${ns}:signal`,
        JSON.stringify({ actor, peer, kind: 'presence' }),
      );
    };
    const listen = async () => {
      if (closing) return;
      const client = new Client({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 3000,
        statement_timeout: 5000,
      });
      pg = client;
      let failed = false;
      const fail = () => {
        if (failed || closing) return;
        failed = true;
        pgReady = false;
        closeAll();
        void client.end().catch(() => {});
        retry = setTimeout(() => void listen(), 3000);
      };
      client.on('error', fail);
      client.on('end', fail);
      client.on('notification', (n) => {
        if (n.channel === 'petra_social_realtime' && n.payload)
          signal(n.payload);
      });
      try {
        await client.connect();
        await client.query('LISTEN petra_social_realtime');
        if (!failed) pgReady = true;
      } catch {
        fail();
      }
    };
    await listen();
    const renew = async (c: Connection) => {
      await authorize(c);
      if (!available()) throw new Error('unavailable');
      if (!c.alive) {
        c.ws.terminate();
        return;
      }
      c.alive = false;
      c.ws.ping();
      await redis.zAdd(lease(c.actor), {
        score: Date.now() + 45000,
        value: c.id,
      });
      await redis.expire(lease(c.actor), 60);
      await publish(c.actor);
      await state(c);
    };
    const timer = setInterval(() => {
      for (const c of sockets) enqueue(c, () => renew(c));
    }, 15000);
    const upgrade = async (
      req: IncomingMessage,
      socket: import('node:stream').Duplex,
      head: Buffer,
    ) => {
      if (req.url !== route) return;
      const reject = (status: number) => {
        if (!socket.destroyed)
          socket.end(
            `HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
          );
      };
      if (!available() || sockets.size >= 500 || pendingHandshakes >= 20)
        return reject(503);
      if (
        req.method !== 'GET' ||
        req.headers.origin !== origin ||
        req.headers['sec-websocket-protocol'] !== 'petra-chat-v1'
      )
        return reject(403);
      pendingHandshakes++;
      let actor: string | undefined,
        id: string | undefined,
        admitted = false;
      const deadline = setTimeout(() => socket.destroy(), 5000);
      try {
        const ip = createHash('sha256')
          .update(req.socket.remoteAddress ?? 'unknown')
          .digest('hex');
        const attempts = await redis.eval(
          "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n",
          { keys: [`${ns}:attempts:${ip}`], arguments: [] },
        );
        if (Number(attempts) > 30) return reject(429);
        actor = (await requireSession(req)).user.id;
        if (
          !(
            await database.query(
              'SELECT 1 FROM social_profiles WHERE user_id=$1',
              [actor],
            )
          ).rowCount
        )
          return reject(403);
        id = randomUUID();
        const admittedLease = await redis.eval(
          "redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',ARGV[1]); if redis.call('ZCARD',KEYS[1])>=3 then return 0 end; redis.call('ZADD',KEYS[1],ARGV[2],ARGV[3]); redis.call('EXPIRE',KEYS[1],60); return 1",
          {
            keys: [lease(actor)],
            arguments: [String(Date.now()), String(Date.now() + 45000), id],
          },
        );
        if (Number(admittedLease) !== 1) return reject(429);
        admitted = true;
        if (socket.destroyed) return;
        wss.handleUpgrade(req, socket, head, (ws) => {
          admitted = false;
          const c: Connection = {
            ws,
            request: req,
            actor: actor!,
            id: id!,
            alive: true,
            chain: Promise.resolve(),
            pending: 0,
            window: Date.now(),
            attempts: 0,
          };
          sockets.add(c);
          ws.on('error', () => ws.terminate());
          ws.on('pong', () => {
            c.alive = true;
          });
          ws.on('close', () => {
            sockets.delete(c);
            void (async () => {
              if (redis.isReady) {
                await redis.zRem(lease(c.actor), c.id);
                if (c.peer) await redis.del(typing(c.actor, c.peer));
                await publish(c.actor);
              }
            })().catch(() => {});
          });
          ws.on('message', (bytes, binary) => {
            if (binary) {
              ws.close(1003);
              return;
            }
            if (Date.now() - c.window >= 1000) {
              c.window = Date.now();
              c.attempts = 0;
            }
            if (++c.attempts > 8) {
              ws.close(1008);
              return;
            }
            let input: z.infer<typeof packet>;
            try {
              input = packet.parse(JSON.parse(bytes.toString()));
            } catch {
              ws.close(1008);
              return;
            }
            enqueue(c, async () => {
              await authorize(c);
              if (input.type === 'subscribe') {
                await transaction((db) =>
                  conversationAccess(db, c.actor, input.peerId),
                );
                if (c.peer) await redis.del(typing(c.actor, c.peer));
                c.peer = input.peerId;
                send(c, { type: 'subscribed' });
                await state(c);
              } else {
                if (!c.peer) throw new Error('subscribe');
                const enabled =
                  (
                    await database.query(
                      'SELECT presence_enabled FROM social_profiles WHERE user_id=$1',
                      [c.actor],
                    )
                  ).rows[0]?.presence_enabled === true;
                if (enabled && input.active)
                  await redis.set(typing(c.actor, c.peer), '1', { EX: 5 });
                else await redis.del(typing(c.actor, c.peer));
                await publish(c.actor, c.peer);
              }
            });
          });
          send(c, { type: 'ready' });
          void publish(c.actor).catch(() => {});
        });
      } catch {
        return reject(401);
      } finally {
        pendingHandshakes--;
        clearTimeout(deadline);
        if (admitted && actor && id)
          await redis.zRem(lease(actor), id).catch(() => {});
      }
    };
    const handler = (
      req: IncomingMessage,
      socket: import('node:stream').Duplex,
      head: Buffer,
    ) => {
      if (req.url?.split('?')[0] === route) {
        if (req.url !== route) {
          socket.destroy();
          return;
        }
        void upgrade(req, socket, head);
      } else socket.destroy();
    };
    server.on('upgrade', handler);
    this.stop = async () => {
      closing = true;
      pgReady = false;
      clearInterval(timer);
      if (retry) clearTimeout(retry);
      server.off('upgrade', handler);
      for (const c of sockets) c.ws.terminate();
      wss.close();
      await pg?.end().catch(() => {});
      await Promise.allSettled([subscriber.quit(), redis.quit()]);
    };
  }
}
