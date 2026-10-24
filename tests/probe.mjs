// 用 Chrome DevTools Protocol 精确测量页面横向溢出情况。
// 输入：已用 --remote-debugging-port 启动的 Chrome。
// 输出：每个页面 / 每个视口宽度下，scrollWidth 与超出视口的元素清单。

const CDP = 'http://127.0.0.1:9333';
const TARGETS = [
  { name: 'home', url: 'http://127.0.0.1:8770/' },
  { name: 'explore', url: 'http://127.0.0.1:8770/explore/#cnm_221' },
  { name: 'diagnose', url: 'http://127.0.0.1:8770/diagnose/?target=cnm_221' },
];
const VIEWPORTS = [
  { w: 390, h: 844, mobile: true },
  { w: 768, h: 900, mobile: false },
  { w: 1280, h: 900, mobile: false },
];

const PROBE = `(function(){
  var vw = document.documentElement.clientWidth;
  var sw = document.documentElement.scrollWidth;
  var bsw = document.body ? document.body.scrollWidth : 0;
  var items = [];
  var all = document.querySelectorAll('body *');
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right <= vw + 1 && r.width <= vw + 1) continue;
    var cs = getComputedStyle(el);
    var cls = (typeof el.className === 'string' && el.className.trim())
      ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
    items.push({
      sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls,
      w: Math.round(r.width),
      right: Math.round(r.right),
      minWidth: cs.minWidth,
      cssWidth: cs.width,
      display: cs.display,
      overflowX: cs.overflowX,
      parent: el.parentElement ? (el.parentElement.tagName.toLowerCase() + (el.parentElement.id ? '#' + el.parentElement.id : '')) : null
    });
  }
  return JSON.stringify({ vw: vw, scrollWidth: sw, bodyScrollWidth: bsw, offenders: items.slice(0, 30) });
})()`;

async function cdp() {
  const list = await (await fetch(CDP + '/json/list')).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else events.push(msg);
  };
  const send = (method, params = {}) =>
    new Promise((res) => { const myId = ++id; pending.set(myId, res); ws.send(JSON.stringify({ id: myId, method, params })); });
  return { ws, send, events };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  const { ws, send } = await cdp();
  await send('Page.enable');
  await send('Runtime.enable');
  const results = [];

  for (const vp of VIEWPORTS) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile,
    });
    for (const t of TARGETS) {
      await send('Page.navigate', { url: t.url });
      await sleep(2500);
      const res = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
      const raw = res.result?.result?.value;
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (_) { parsed = { error: String(raw).slice(0, 200) }; }
      results.push({ viewport: vp.w, page: t.name, ...parsed });
    }
  }

  for (const r of results) {
    const overflow = r.scrollWidth - r.vw;
    const flag = overflow > 1 ? 'OVERFLOW' : 'ok      ';
    console.log(`\n[${flag}] vw=${r.vw} page=${r.page} scrollWidth=${r.scrollWidth} bodyScrollWidth=${r.bodyScrollWidth ?? '-'}`);
    if (r.offenders && r.offenders.length) {
      for (const o of r.offenders.slice(0, 8)) {
        console.log(`    - ${o.sel}  宽=${o.w} right=${o.right} min-width=${o.minWidth} css-width=${o.cssWidth} display=${o.display}`);
      }
      if (r.offenders.length > 8) console.log(`    ... 共 ${r.offenders.length} 个（截断显示前 8）`);
    }
  }
  ws.close();
};

run().catch((e) => { console.error('FAILED', e); process.exit(1); });
