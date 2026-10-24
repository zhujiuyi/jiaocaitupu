// 页面健康检查：控制台报错、JS 异常、4xx/5xx 请求、加载失败。
const CDP = 'http://127.0.0.1:9333';
const TARGETS = [
  { name: 'home', url: 'http://127.0.0.1:8770/' },
  { name: 'explore', url: 'http://127.0.0.1:8770/explore/' },
  { name: 'explore-graph', url: 'http://127.0.0.1:8770/explore/#cnm_221' },
  { name: 'diagnose', url: 'http://127.0.0.1:8770/diagnose/' },
  { name: 'diagnose-target', url: 'http://127.0.0.1:8770/diagnose/?target=cnm_221' },
  { name: 'english-home', url: 'http://127.0.0.1:8770/?subject=english' },
  { name: 'english-diagnose', url: 'http://127.0.0.1:8770/diagnose/?subject=english' },
];

async function connect() {
  const list = await (await fetch(CDP + '/json/list')).json();
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const sink = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) sink.push(m);
  };
  const send = (method, params = {}) =>
    new Promise((res) => { const myId = ++id; pending.set(myId, res); ws.send(JSON.stringify({ id: myId, method, params })); });
  return { ws, send, sink };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  const { ws, send, sink } = await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  let problems = 0;
  for (const t of TARGETS) {
    sink.length = 0;
    await send('Page.navigate', { url: t.url });
    await sleep(3200);

    const errors = [];
    for (const m of sink) {
      if (m.method === 'Log.entryAdded') {
        const e = m.params.entry;
        if (e.level === 'error' || e.level === 'warning') {
          errors.push(`[${e.level}] ${e.text} ${e.url || ''}`.trim());
        }
      }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        errors.push(`[exception] ${d.exception?.description || d.text}`);
      }
      if (m.method === 'Network.responseReceived') {
        const r = m.params.response;
        if (r.status >= 400) errors.push(`[http ${r.status}] ${r.url}`);
      }
      if (m.method === 'Network.loadingFailed') {
        errors.push(`[netfail] ${m.params.errorText} ${m.params.requestId}`);
      }
    }

    const uniq = [...new Set(errors)];
    if (uniq.length) problems += uniq.length;
    console.log(`\n=== ${t.name} (${t.url}) — ${uniq.length ? uniq.length + ' 个问题' : '干净'}`);
    uniq.forEach((e) => console.log('   ' + e));
  }

  console.log(`\n总计问题：${problems}`);
  ws.close();
};

run().catch((e) => { console.error('FAILED', e); process.exit(1); });
