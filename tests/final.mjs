// 完整诊断流程验收：走到结果页，检查根因/路径/图/导出/打印。
const CDP = 'http://127.0.0.1:9333';

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
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  const js = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value;

  // ---- 单点诊断：全部答不会，走到结果页 ----
  // 先清掉 localStorage（应用会"继续未清除的诊断"，残留存档会让流程从中间开始）
  await send('Page.navigate', { url: 'http://127.0.0.1:8770/' });
  await sleep(1200);
  await js(`localStorage.clear()`);
// 现在必须先有孩子档案才能诊断，这里建一个测试档案
await send('Page.navigate', { url: 'http://127.0.0.1:8770/children/' });
await sleep(2200);
await js(`(function(){document.getElementById('f-name').value='测试娃';document.getElementById('child-form').requestSubmit();})()`);
await sleep(500);
const KID = await js(`JSON.parse(localStorage.getItem('cnmChildren.v1')).current`);

  await send('Page.navigate', { url: 'http://127.0.0.1:8770/diagnose/?target=cnm_221&child=' + KID });
  await sleep(3200);

  let done = false;
  for (let i = 0; i < 80; i++) {
    const act = await js(`(function(){
      var bs=[...document.querySelectorAll('#root button')];
      var next = bs.filter(function(b){ return /下一题/.test(b.textContent); })[0];
      if (next) { next.click(); return 'next'; }
      var skip = document.querySelector('#btn-skip');
      if (skip) { skip.click(); return 'skip'; }
      var t = document.querySelector('#root').textContent;
      if (/根因|学习路径|导出 JSON/.test(t)) return 'done';
      return 'none';
    })()`);
    if (act === 'done') { done = true; break; }
    await sleep(450);
    const st = await js(`/根因|学习路径|导出 JSON/.test(document.querySelector('#root').textContent)`);
    if (st) { done = true; break; }
  }
  check('单点诊断能走到结果页', done, done ? '到达' : '30 轮内未到达');

  const res = await js(`(function(){
    var t = document.querySelector('#root').textContent.replace(/\\s+/g,' ');
    return JSON.stringify({
      canvases: document.querySelectorAll('canvas').length,
      export: !!document.querySelector('#btn-export'),
      print: [...document.querySelectorAll('#root button, #root a')].some(function(e){return /打印/.test(e.textContent);}),
      hasRoot: /根因/.test(t),
      hasPath: /学习路径/.test(t),
      hasUnstable: /不稳/.test(t),
      len: t.length
    });
  })()`);
  const r = JSON.parse(res);
  check('结果页有「根因」', r.hasRoot, res);
  check('结果页有「学习路径」', r.hasPath);
  check('结果页有不稳标注', r.hasUnstable);
  check('结果页路径图已渲染', r.canvases > 0, `canvas=${r.canvases}`);
  check('结果页有导出 JSON', r.export);
  check('结果页有打印', r.print);

  // ---- 整年级筛查 ----
  await send('Page.navigate', { url: 'http://127.0.0.1:8770/diagnose/?child=' + KID });
  await sleep(3000);
  const started = await js(`(function(){
    var chip=[...document.querySelectorAll('#root button')].filter(function(b){return b.textContent.trim()==='七年级';})[0];
    if (!chip) return 'no-chip';
    chip.click();
    return 'chip';
  })()`);
  await sleep(600);
  const begin = await js(`(function(){
    var b=[...document.querySelectorAll('#root button')].filter(function(b){return /开始整体诊断/.test(b.textContent);})[0];
    if (!b) return 'no-btn';
    b.click();
    return 'started';
  })()`);
  await sleep(1500);
  const screening = await js(`(function(){
    var t = document.querySelector('#root').textContent.replace(/\\s+/g,' ');
    return JSON.stringify({ started: ${JSON.stringify('x')}.length>0, text: t.slice(0,90),
      isScreening: /上限|题/.test(t), hasSkip: !!document.querySelector('#btn-skip') });
  })()`);
  const sc = JSON.parse(screening);
  check('整年级筛查能开始出题', started === 'chip' && begin === 'started' && sc.hasSkip, `${started}/${begin} :: ${sc.text.slice(0, 60)}`);

  const failed = results.filter((x) => !x.ok).length;
  console.log(`\n通过 ${results.length - failed}/${results.length}`);
  ws.close();
  process.exit(failed ? 2 : 0);
};
run().catch((e) => { console.error('FAILED', e); process.exit(1); });
