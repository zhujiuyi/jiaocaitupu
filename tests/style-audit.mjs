// 样式客观体检：文字对比度、移动端触控尺寸、页脚是否贴底、标题层级。
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

// 在页面里算对比度、抓触控尺寸
const AUDIT = `(function(){
  function parseColor(c){
    var m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    var p = m[1].split(',').map(function(s){return parseFloat(s);});
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function lum(c){
    function f(v){ v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }
    return 0.2126*f(c.r) + 0.7152*f(c.g) + 0.0722*f(c.b);
  }
  function ratio(fg, bg){
    var a = lum(fg), b = lum(bg);
    var hi = Math.max(a,b), lo = Math.min(a,b);
    return (hi + 0.05) / (lo + 0.05);
  }
  function bgOf(el){
    var node = el;
    while (node && node !== document.documentElement) {
      var cs = getComputedStyle(node);
      var c = parseColor(cs.backgroundColor);
      if (c && c.a > 0.5) return c;
      node = node.parentElement;
    }
    var bodyBg = parseColor(getComputedStyle(document.body).backgroundColor);
    return bodyBg && bodyBg.a > 0.5 ? bodyBg : { r: 255, g: 255, b: 255, a: 1 };
  }
  function brief(el){
    var cls = (typeof el.className === 'string' && el.className.trim())
      ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls;
  }

  var lowContrast = [];
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  var seen = new Set();
  var n;
  while ((n = walker.nextNode())) {
    var txt = n.textContent.trim();
    if (!txt) continue;
    var el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    var cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.1) continue;
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    var fg = parseColor(cs.color);
    if (!fg) continue;
    var bg = bgOf(el);
    // 处理半透明前景
    if (fg.a < 1) {
      fg = { r: fg.r*fg.a + bg.r*(1-fg.a), g: fg.g*fg.a + bg.g*(1-fg.a), b: fg.b*fg.a + bg.b*(1-fg.a), a: 1 };
    }
    var cr = ratio(fg, bg);
    var size = parseFloat(cs.fontSize);
    var bold = parseInt(cs.fontWeight, 10) >= 700;
    var large = size >= 24 || (bold && size >= 18.66);
    var need = large ? 3 : 4.5;
    if (cr < need) {
      lowContrast.push({ sel: brief(el), text: txt.slice(0, 22), ratio: Math.round(cr*100)/100, need: need, size: size });
    }
  }

  var small = [];
  var interactives = document.querySelectorAll('a[href], button, input, select, summary, textarea');
  for (var i = 0; i < interactives.length; i++) {
    var e = interactives[i];
    var r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    var cs2 = getComputedStyle(e);
    if (cs2.visibility === 'hidden' || cs2.display === 'none') continue;
    if (r.width < 44 || r.height < 44) {
      small.push({ sel: brief(e), w: Math.round(r.width), h: Math.round(r.height), text: (e.textContent||'').trim().slice(0,18) });
    }
  }

  var footer = document.querySelector('.site-footer, footer');
  var fr = footer ? footer.getBoundingClientRect() : null;

  return JSON.stringify({
    lowContrast: lowContrast.slice(0, 14),
    lowContrastCount: lowContrast.length,
    smallTargets: small.slice(0, 14),
    smallTargetCount: small.length,
    footerBottom: fr ? Math.round(fr.bottom) : null,
    viewportH: window.innerHeight,
    docH: document.documentElement.scrollHeight,
    h1: document.querySelectorAll('h1').length,
    h2: document.querySelectorAll('h2').length
  });
})()`;

const run = async () => {
  const { ws, send } = await connect();
  await send('Page.enable'); await send('Runtime.enable');
  const js = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value;

  const pages = [
    { name: 'home', url: BASE + '/' },
    { name: 'explore', url: BASE + '/explore/#cnm_221' },
    { name: 'diagnose', url: BASE + '/diagnose/?target=cnm_221' },
  ];

  for (const vp of [{ w: 390, h: 844, mobile: true }, { w: 1280, h: 900, mobile: false }]) {
    await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile });
    for (const p of pages) {
      await send('Page.navigate', { url: p.url });
      await sleep(3000);
      const raw = await js(AUDIT);
      const d = JSON.parse(raw);
      console.log(`\n########## ${p.name} @ ${vp.w}px`);
      console.log(`对比度不足: ${d.lowContrastCount} 处 | 触控 <44px: ${d.smallTargetCount} 个 | 页脚底部 ${d.footerBottom} / 视口 ${d.viewportH} | h1=${d.h1} h2=${d.h2}`);
      if (d.lowContrast.length) {
        console.log('  低对比度样本:');
        d.lowContrast.forEach((c) => console.log(`    ${c.ratio}:1 (需 ${c.need}) ${c.sel}  ${c.size}px  "${c.text}"`));
      }
      if (d.smallTargets.length) {
        console.log('  触控过小样本:');
        d.smallTargets.forEach((s) => console.log(`    ${s.w}x${s.h} ${s.sel}  "${s.text}"`));
      }
    }
  }
  ws.close();
};
run().catch((e) => { console.error('FAILED', e); process.exit(1); });
