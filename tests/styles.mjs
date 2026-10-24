// 针对本次验收提出的 5 个样式问题做断言，改完后复跑即可看出是否修好。
// 通过阈值写在每项 PASS 条件里；输出同时打印原始测量值，便于对方自查。
const CDP = 'http://127.0.0.1:9333';
const BASE = process.env.BASE || 'http://127.0.0.1:8770';

async function connect() {
  const list = await (await fetch(CDP + '/json/list')).json();
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const myId = ++id; pending.set(myId, res); ws.send(JSON.stringify({ id: myId, method, params })); });
  return { ws, send };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const run = async () => {
  const { ws, send } = await connect();
  await send('Page.enable'); await send('Runtime.enable');
  const js = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value;

  // ---- 1. 诊断页页脚贴底（数字题，卡片较短的情况）----
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE + '/diagnose/?target=cnm_221&seed=a' });
  await sleep(2600);
  // ---- 1. 页脚已移除：三页都不应再有 .site-footer ----
  const footerState = [];
  for (const p of ['/', '/explore/', '/diagnose/']) {
    await send('Page.navigate', { url: BASE + p });
    await sleep(2200);
    footerState.push(await js(`!!document.querySelector('.site-footer')`));
  }
  check('三页均已移除页脚', footerState.every(function (v) { return v === false; }),
    `首页/图谱/诊断 = ${JSON.stringify(footerState)}`);

  // ---- 2. explore 年级行有展开标记 ----
  await send('Page.navigate', { url: BASE + '/explore/' });
  await sleep(3000);
  const marker = JSON.parse(await js(`(function(){
    var el=document.querySelector('details.vol > summary');
    if(!el) return JSON.stringify({err:'no vol'});
    var cs=getComputedStyle(el);
    var mk=getComputedStyle(el,'::marker');
    var bf=getComputedStyle(el,'::before');
    return JSON.stringify({
      display: cs.display, listStyle: cs.listStyleType,
      markerContent: mk.content, beforeContent: bf.content
    });
  })()`));
  const hasMarker = marker.display === 'list-item' || marker.beforeContent !== 'none';
  check('年级行有展开/收起标记', hasMarker,
    `display=${marker.display} ::marker=${marker.markerContent} ::before=${marker.beforeContent}`);

  // ---- 3. 移动端触控尺寸 ≥44px ----
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: BASE + '/' });
  await sleep(2500);
  const tap = JSON.parse(await js(`(function(){
    function h(el){ return el ? Math.round(el.getBoundingClientRect().height) : null; }
    var nav = document.querySelector('.nav-link');
    var demo = [...document.querySelectorAll('a')].filter(function(a){return /先看一遍演示/.test(a.textContent);})[0];
    return JSON.stringify({ nav: h(nav), demo: h(demo) });
  })()`));
  check('移动端导航触控 ≥44px', tap.nav >= 44, `nav-link=${tap.nav}px, 演示链接=${tap.demo}px`);

  // ---- 4. 首页 h1 高亮短语不跨行 ----
  const hero = JSON.parse(await js(`(function(){
    var hi=document.querySelector('.hero h1 .hi');
    if(!hi) return JSON.stringify({err:'no .hi'});
    var r=hi.getClientRects();
    return JSON.stringify({ rects:r.length, ws:getComputedStyle(hi).whiteSpace, text:hi.textContent });
  })()`));
  check('首页大标题高亮短语不拆行', hero.rects === 1, `.hi 占 ${hero.rects} 行, white-space=${hero.ws}`);

  // ---- 5. 「三步」编号与标题间距 ----
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE + '/' });
  await sleep(2500);
  const stepGap = JSON.parse(await js(`(function(){
    var no=document.querySelector('.steps .step-no');
    var h3=document.querySelector('.steps h3');
    if(!no||!h3) return JSON.stringify({err:'no steps'});
    var a=no.getBoundingClientRect(), b=h3.getBoundingClientRect();
    return JSON.stringify({ gap: Math.round(b.top - a.bottom) });
  })()`));
  check('「三步」编号与标题间距合理（≤24px）', stepGap.gap <= 24, `实测 ${stepGap.gap}px`);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n样式问题：${results.length - failed}/${results.length} 已符合预期`);
  ws.close();
  process.exit(failed ? 2 : 0);
};
run().catch((e) => { console.error('FAILED', e); process.exit(1); });
