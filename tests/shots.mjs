// 生成 README 用的一套截图，写入仓库根的 screenshots/。
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CDP = 'http://127.0.0.1:9333';
const BASE = 'http://127.0.0.1:8770';
// tests/ 的父目录 = 仓库根
const OUT = join(dirname(dirname(fileURLToPath(import.meta.url))), 'screenshots') + '/';

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

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const { ws, send } = await connect();
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  const js = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value;

  const vp = async (w, h, mobile = false) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  };
  let saved = 0;
  const shot = async (name, { full = false, scrollTo = null } = {}) => {
    if (scrollTo) { await js(`document.querySelector('${scrollTo}')?.scrollIntoView({block:'start'})`); await sleep(700); }
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
    const buf = Buffer.from(r.result.data, 'base64');
    writeFileSync(OUT + name, buf);
    saved++;
    console.log(`  ${name}  (${Math.round(buf.length / 1024)} KB)`);
    return buf.length;
  };
  const go = async (url, ms = 3000) => { await send('Page.navigate', { url }); await sleep(ms); };

  // 清掉可能残留的诊断存档
  await vp(1280, 900);
  await go(BASE + '/', 1200);
  await js(`localStorage.clear()`);

  console.log('== 桌面端 1280 ==');
  // 1 首页首屏
  await go(BASE + '/');
  await shot('01-home.png');

  // 2 首页整页
  await shot('02-home-full.png', { full: true });

  // 3 知识图谱（选中配方法）
  await go(BASE + '/explore/#cnm_221', 3800);
  await shot('03-explore.png');

  // 4 图谱右侧详情（先修/课标/样题）
  await shot('04-explore-detail.png', { scrollTo: '#detail .rel, #detail .sample, #detail h2' });

  // 5 诊断起始页
  await go(BASE + '/diagnose/');
  await shot('05-diagnose-start.png');

  // 6/7 答题 + 解析：找一个选择题的 seed
  let seedUsed = null;
  for (const s of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    await go(`${BASE}/diagnose/?target=cnm_221&seed=${s}`, 2600);
    const isChoice = await js(`!!document.querySelector('#choice-A')`);
    if (isChoice) { seedUsed = s; break; }
  }
  if (!seedUsed) {
    // 没找到选择题就退回默认随机
    await go(`${BASE}/diagnose/?target=cnm_221`, 2800);
  }
  console.log(`  选择题 seed=${seedUsed}`);
  await shot('06-diagnose-question.png');

  // 点一个选项并提交
  await js(`document.querySelector('#choice-D')?.click()`);
  await sleep(400);
  await js(`document.querySelector('#btn-submit')?.click()`);
  await sleep(900);
  await shot('07-diagnose-feedback.png');

  // 8/9 结果页（demo 模式：薄弱 + 不稳 都出现）
  await go(`${BASE}/diagnose/?target=cnm_221&demo=1`, 3600);
  await shot('08-diagnose-result.png');
  await shot('09-diagnose-result-graph.png', { scrollTo: '#root canvas' });

  // 10 英语首页
  await go(`${BASE}/?subject=english`, 3000);
  await shot('10-english-home.png');

  console.log('== 移动端 390 ==');
  await vp(390, 844, true);
  await go(BASE + '/', 3000);
  await shot('11-mobile-home.png', { full: true });

  await go(BASE + '/explore/#cnm_221', 4200);
  await shot('12-mobile-explore.png', { full: true });

  await go(BASE + '/diagnose/?target=cnm_221', 3200);
  await shot('13-mobile-diagnose.png');

  // 新能力：初中英语 + 带内联 SVG 图示的题目
  console.log('== 新能力 ==');
  await vp(1280, 900);
  await go(BASE + '/explore/?subject=english#cne_j001', 4200);
  await shot('14-english-junior.png');
  await go(`${BASE}/diagnose/?target=cnm_p023&seed=a`, 3200);
  await shot('15-diagnose-figure.png');

  // 物理
  await vp(1280, 900);
  await go(BASE + '/?subject=physics', 3200);
  await shot('16-physics-home.png');
  await go(BASE + '/explore/?subject=physics#cnp_050', 4200);
  await shot('17-physics-explore.png');

  // 语文
  await vp(1280, 900);
  await go(BASE + '/?subject=chinese', 3200);
  await shot('18-chinese-home.png');
  await go(BASE + '/explore/?subject=chinese#cnc_p001', 4200);
  await shot('19-chinese-explore.png');

  // ---- 孩子档案 / 错题本（20–26）----
  // 先造两个孩子的档案 + 若干错题，否则这些页面是空态
  console.log('== 档案与错题本 ==');
  await vp(1280, 900);
  await go(BASE + '/children/', 2400);
  await js(`localStorage.clear()`);
  await go(BASE + '/children/', 2400);
  await js(`(function(){
    const C = window.CnmChildren;
    const a = C.add({ name: '小明', grade: 7, textbook: '人教A版' }).child;
    const b = C.add({ name: '小红', grade: 8, textbook: '人教A版' }).child;
    C.setCurrent(a.id);
    ['cnm_221','cnm_220','cnm_318','cnm_118','cnm_045'].forEach(function (x, i) {
      C.recordResult(a.id, 'math', x, i % 2 ? 'weak' : 'shaky');
    });
    C.recordResult(a.id, 'english', 'cne_j012', 'weak');
    C.recordResult(a.id, 'physics', 'cnp_p005', 'weak');
    // 切到 8 年级再攒几条，用来演示「按年级分本」
    C.update(a.id, { name: '小明', grade: 8, textbook: '人教A版' });
    ['cnm_319','cnm_320'].forEach(function (x) { C.recordResult(a.id, 'math', x, 'weak'); });
    ['cnm_221','cnm_045'].forEach(function (x) { C.recordResult(b.id, 'math', x, 'weak'); });
  })()`);
  await go(BASE + '/children/', 2600);
  await shot('20-children.png');

  // 错题本（小明 = 当前孩子，8 年级）
  const kid = await js(`JSON.parse(localStorage.getItem('cnmChildren.v1')).current`);
  await go(BASE + '/mistakes/?subject=math&child=' + kid, 3000);
  await shot('21-mistakes.png');

  // 诊断页「这次测谁」卡片
  await go(BASE + '/diagnose/?child=' + kid, 3200);
  await shot('22-diagnose-child.png');

  // 错题本移动端
  await vp(390, 844, true);
  await go(BASE + '/mistakes/?subject=math&child=' + kid, 3000);
  await shot('23-mistakes-mobile.png');

  // 导出/导入备份卡片（点一下导出，让提示出现）
  await vp(1280, 900);
  await go(BASE + '/children/', 2600);
  await js(`document.getElementById('btn-export').click()`);
  await sleep(700);
  await shot('24-children-backup.png');

  // 按年级分本：档案页显示「其他年级 N 条」
  await go(BASE + '/children/', 2600);
  await shot('25-children-grades.png');

  // 错题本顶部提示当前年级与旧年级条数
  await go(BASE + '/mistakes/?subject=math&child=' + kid, 3000);
  await shot('26-mistakes-grade.png');

  // 收尾：清掉为截图造的假数据，避免污染下次手工验证
  await js(`localStorage.clear()`);

  console.log(`\n共生成 ${saved} 张`);
  ws.close();
};
run().catch((e) => { console.error('FAILED', e); process.exit(1); });
