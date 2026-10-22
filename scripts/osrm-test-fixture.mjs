// Synthetic protocol fixture, never a live routing provider or production fallback.
import { createServer } from 'node:http';
const db = new URL(process.env.DATABASE_URL ?? 'invalid:');
if (
  process.env.APP_ENV !== 'local' ||
  !['127.0.0.1', 'localhost'].includes(db.hostname) ||
  !/^\/petra_e2e_\d+$/.test(db.pathname)
)
  throw new Error('Isolated E2E environment required');
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/health') return res.end('{"fixture":"synthetic-osrm"}');
  const match = /^\/route\/v1\/driving\/([0-9.,;-]+)\?/.exec(req.url ?? '');
  if (!match) {
    res.writeHead(404);
    return res.end('{}');
  }
  const [a, b] = match[1].split(';').map((p) => p.split(',').map(Number));
  if (!a || !b) {
    res.writeHead(400);
    return res.end('{}');
  }
  if (a[1] === 34) return res.end('{"code":"NoRoute"}');
  if (a[1] === 35)
    return res.end(
      '{"code":"Ok","routes":[{"distance":1000,"duration":30,"geometry":{"type":"LineString","coordinates":[[999,33],[44,33]]}}]}',
    );
  if (a[1] === 36) return res.end(' '.repeat(1024 * 1024 + 1));
  res.end(
    JSON.stringify({
      code: 'Ok',
      routes: [
        {
          distance: 12345.2,
          duration: 1240.1,
          geometry: {
            type: 'LineString',
            coordinates: [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b],
          },
        },
      ],
    }),
  );
});
server.listen(4199, '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => server.close(() => process.exit(0)));
