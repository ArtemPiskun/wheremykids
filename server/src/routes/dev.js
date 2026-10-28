import { OBLASTS } from '../alerts/oblasts.js';
import { applyStatus } from '../alerts/poller.js';

// Керування заглушкою тривог. Працює лише в режимі ALERTS_MODE=mock і з DEV_TOKEN.
// Сторінка: GET /dev/alerts?token=<DEV_TOKEN>
export function devRoutes(app, { pool, notifier, mockSource, devToken }) {
  const guard = async (req, reply) => {
    const token = req.query?.token ?? req.headers['x-dev-token'];
    if (!devToken || token !== devToken) return reply.code(403).send({ error: 'Потрібен DEV_TOKEN' });
  };

  app.get('/dev/alerts', { preHandler: guard }, async (req, reply) => {
    reply.type('text/html; charset=utf-8').send(page(req.query.token));
  });

  app.post('/dev/alerts', {
    preHandler: guard,
    schema: {
      body: {
        type: 'object',
        properties: {
          uid: { type: 'integer' },
          status: { type: 'string', enum: ['A', 'P', 'N'] },
          clear: { type: 'boolean' },
        },
      },
    },
  }, async (req) => {
    if (req.body.clear) mockSource.clear();
    else mockSource.set(req.body.uid, req.body.status);
    // Застосовуємо одразу, не чекаючи наступного опиту
    const changed = await applyStatus(pool, notifier, await mockSource.fetchStatusString());
    return { changed };
  });
}

function page(token) {
  const rows = OBLASTS.map((o) => `
    <tr><td>${o.title}</td><td>
      <button data-uid="${o.uid}" data-s="A">Тривога</button>
      <button data-uid="${o.uid}" data-s="P">Часткова</button>
      <button data-uid="${o.uid}" data-s="N">Відбій</button>
    </td></tr>`).join('');
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Заглушка тривог</title>
<style>
  body{font-family:system-ui,sans-serif;margin:16px;max-width:720px}
  td{padding:4px 8px;border-bottom:1px solid #ddd} button{margin:2px;padding:6px 10px;cursor:pointer}
  .A{background:#fdd} .P{background:#ffe7c2}
</style></head><body>
<h1>Заглушка тривог</h1>
<p>Тут можна вручну оголосити тривогу в області. Діти, що зараз у цій області, і їхні батьки отримають пуш, як від справжніх тривог.</p>
<p><button id="clear">Відбій усюди</button></p>
<table>${rows}</table>
<script>
const token = ${JSON.stringify(token)};
async function send(body){
  const r = await fetch('/dev/alerts?token='+encodeURIComponent(token), {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
  await refresh(); return r.json();
}
async function refresh(){
  const list = await (await fetch('/v1/alerts')).json();
  for (const a of list) {
    const row = document.querySelector('button[data-uid="'+a.uid+'"]').closest('tr');
    row.className = a.status;
  }
}
document.querySelectorAll('button[data-uid]').forEach(b => b.onclick = () => send({uid: +b.dataset.uid, status: b.dataset.s}));
document.getElementById('clear').onclick = () => send({clear: true});
refresh();
</script></body></html>`;
}
