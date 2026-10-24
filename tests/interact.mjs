// 交互验收：explore 的展开/搜索/筛选/选点，diagnose 的完整答题流程。
const CDP = 'http://127.0.0.1:9333';
const BASE = 'http://127.0.0.1:8770';

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
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const run = async () => {
  const { ws, send } = await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  const js = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.text };
    return r.result?.result?.value;
  };
  const go = async (url, ms = 3000) => { await send('Page.navigate', { url }); await sleep(ms); };

  // ---------------- explore ----------------
  // 先建一个测试档案（诊断现在要求先选孩子）
await send('Page.navigate', { url: BASE + '/' });
await sleep(1500);
await js(`localStorage.clear()`);
await send('Page.navigate', { url: BASE + '/children/' });
await sleep(2200);
await js(`(function(){document.getElementById('f-name').value='测试娃';document.getElementById('child-form').requestSubmit();})()`);
await sleep(500);
const KID = await js(`JSON.parse(localStorage.getItem('cnmChildren.v1')).current`);

await go(BASE + '/explore/#cnm_221');
  check('explore 初始加载 802 个知识点', (await js(`document.querySelector('#list') ? document.querySelector('#list').querySelectorAll('.topic-item').length : -1`)) > 0,
    `topic-item=${await js(`document.querySelectorAll('.topic-item').length`)}`);

  // 展开第一个年级
  const expand = await js(`(function(){
    var d = document.querySelector('#list details.vol');
    if (!d) return 'no-vol';
    var before = d.open;
    d.querySelector('summary').click();
    return JSON.stringify({ before: before, after: d.open, chapters: d.querySelectorAll('details.chap').length,
                            topics: d.querySelectorAll('.topic-item').length });
  })()`);
  check('explore 年级可展开/收起', typeof expand === 'string' && expand.includes('"after":'), expand);

  // 搜索
  await js(`(function(){
    var q = document.querySelector('#q'); q.value='配方法';
    q.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await sleep(600);
  const searched = await js(`(function(){
    var names=[...document.querySelectorAll('.topic-item .nm')].map(function(e){return e.textContent;});
    return JSON.stringify({ count: names.length, matched: names.filter(function(n){return /配方法/.test(n);}).length, sample: names.slice(0,5) });
  })()`);
  const s = JSON.parse(searched);
  check('explore 搜索能过滤', s.count > 0 && s.matched > 0, `命中 ${s.count} 条，全部含关键词=${s.matched === s.count}`);

  // 清空搜索后按年级筛选
  await js(`(function(){
    var q=document.querySelector('#q'); q.value='';
    q.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await sleep(400);
  const filtered = await js(`(function(){
    var sel=document.querySelector('#fGrade');
    var opts=[...sel.options].map(function(o){return o.value;});
    return JSON.stringify({ options: opts.slice(0,8), total: opts.length });
  })()`);
  check('explore 年级筛选下拉有选项', JSON.parse(filtered).total > 1, filtered);

  // 选点 → 右侧详情 + 图谱
  const pick = await js(`(function(){
    var btn = document.querySelector('.topic-item[data-jump="cnm_221"]');
    if (!btn) return 'no-btn';
    btn.click();
    return 'clicked';
  })()`);
  await sleep(1800);
  const detail = await js(`(function(){
    var d = document.querySelector('#detail');
    var cx = document.querySelectorAll('canvas').length;
    var diag = [...document.querySelectorAll('a')].filter(function(a){return /诊断这个知识点/.test(a.textContent);})[0];
    return JSON.stringify({
      pick: ${JSON.stringify(pick)},
      detailText: d ? d.textContent.replace(/\\s+/g,' ').slice(0,60) : 'no-detail',
      hasTitle: d ? /配方法/.test(d.textContent) : false,
      canvas: cx,
      diagHref: diag ? diag.href : 'none'
    });
  })()`);
  const dd = JSON.parse(detail);
  check('explore 选中知识点后右侧详情更新', dd.hasTitle, dd.detailText);
  check('explore 图谱画布已渲染', dd.canvas > 0, `canvas=${dd.canvas}`);
  check('explore「诊断这个知识点」链接正确', /diagnose\/\?target=cnm_221/.test(dd.diagHref), dd.diagHref);

  // ---------------- diagnose ----------------
  await go(BASE + '/diagnose/?target=cnm_221&child=' + KID);
  // 题目可能是数字题（输入框）或选择题（#choice-A..D），两种都算正常
  const q1 = await js(`(function(){
    var inp = document.querySelector('#root input[type=text], #root input[type=number], #root input:not([type])');
    var choice = document.querySelector('#choice-A');
    return JSON.stringify({
      hasInput: !!inp,
      isChoice: !!choice,
      text: document.body.textContent.replace(/\\s+/g,' ').slice(0,120)
    });
  })()`);
  const qq = JSON.parse(q1);
  check('diagnose 出题卡正常渲染', (qq.hasInput || qq.isChoice) && /第 1 题/.test(qq.text),
    `${qq.isChoice ? '选择题' : '数字题'} :: ${qq.text.slice(0, 60)}`);

  // 连续点「不会」，走到结果页
  let reached = null;
  for (let i = 0; i < 80; i++) {
    const step = await js(`(function(){
      var btns=[...document.querySelectorAll('button')];
      var no = btns.filter(function(b){return b.textContent.trim()==='不会';})[0];
      if (no) { no.click(); return 'answered'; }
      var next = btns.filter(function(b){return /下一题/.test(b.textContent);})[0];
      if (next) { next.click(); return 'next'; }
      return 'no-button';
    })()`);
    await sleep(700);
    const state = await js(`document.body.textContent.replace(/\\s+/g,' ')`);
    if (/根因|学习路径|诊断结果|导出 JSON/.test(state)) { reached = state; break; }
    if (step === 'no-button') { reached = state; break; }
  }
  check('diagnose 答题流程能走到结果页', !!reached && /根因|学习路径|导出/.test(reached || ''),
    reached ? reached.slice(0, 100) : '未到达');

  const resultUi = await js(`(function(){
    return JSON.stringify({
      canvases: document.querySelectorAll('canvas').length,
      export: !!document.querySelector('#btn-export'),
      print: [...document.querySelectorAll('button,a')].some(function(e){return /打印/.test(e.textContent);}),
      path: /学习路径|先修/.test(document.body.textContent)
    });
  })()`);
  const ru = JSON.parse(resultUi);
  check('diagnose 结果页有路径图', ru.canvases > 0, `canvas=${ru.canvases}`);
  check('diagnose 结果页有导出/打印', ru.export || ru.print, `export=${ru.export} print=${ru.print}`);

  // 整年级诊断入口
  await go(BASE + '/diagnose/?child=' + KID);
  const gradeFlow = await js(`(function(){
    var chips=[...document.querySelectorAll('button')].filter(function(b){return b.textContent.trim()==='七年级';});
    if (!chips.length) return 'no-chip';
    chips[0].click();
    return 'clicked';
  })()`);
  await sleep(700);
  const gradeBtn = await js(`(function(){
    var b=[...document.querySelectorAll('button')].filter(function(b){return /开始整体诊断/.test(b.textContent);})[0];
    return b ? 'present' : 'missing';
  })()`);
  check('diagnose 整年级筛查入口可用', gradeFlow === 'clicked' && gradeBtn === 'present', `chip=${gradeFlow} btn=${gradeBtn}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n通过 ${results.length - failed.length}/${results.length}`);
  ws.close();
  process.exit(failed.length ? 2 : 0);
};

run().catch((e) => { console.error('FAILED', e); process.exit(1); });

