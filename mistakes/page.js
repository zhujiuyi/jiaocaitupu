/* 错题本页：按孩子 + 学科列出错题，抽题复习。 */
(function () {
  'use strict';
  var CC = window.CnmChildren;
  var SUBJECTS = [
    { key: 'math', name: '数学' },
    { key: 'english', name: '英语' },
    { key: 'physics', name: '物理' },
    { key: 'chinese', name: '语文' }
  ];
  var COUNTS = [4, 8, 12, 16, 20];
  var DEFAULT_COUNT = 8;
  var STATUS_LABEL = { weak: '薄弱', shaky: '不稳' };

  // 可能需要从图谱取知识点名与册章；数据按学科分别加载
  var topicsBySubject = {};   // { math: { id: topic } }
  var loading = {};

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function $(id) { return document.getElementById(id); }

  var params = new URLSearchParams(location.search);
  var subject = SUBJECTS.some(function (s) { return s.key === params.get('subject'); })
    ? params.get('subject') : 'math';

  var childId = params.get('child') || null;
  if (!childId || !CC.get(childId)) {
    var cur = CC.current();
    childId = cur ? cur.id : null;
  }

  /* ------------------------------ 知识点名 ------------------------------ */

  function topicName(id) {
    var map = topicsBySubject[subject];
    var t = map && map[id];
    return t ? t.name : id;
  }
  function topicChapter(id) {
    var map = topicsBySubject[subject];
    var t = map && map[id];
    if (!t) return '';
    return t.chapter || '';
  }

  function loadTopics() {
    if (topicsBySubject[subject] || loading[subject]) return loading[subject] || Promise.resolve();
    loading[subject] = fetch('../data/topics.json')
      .then(function (r) { return r.json(); })
      .then(function (all) {
        var pre = { math: 'cnm_', english: 'cne_', physics: 'cnp_', chinese: 'cnc_' }[subject];
        var map = {};
        all.forEach(function (t) {
          if (!pre || String(t.id).indexOf(pre) === 0 || t.subject === subject) {
            // cnm_ 前缀也包含数学；其余学科按自己的前缀
            if (String(t.id).indexOf(pre) === 0) map[t.id] = t;
          }
        });
        topicsBySubject[subject] = map;
      })
      .catch(function () { topicsBySubject[subject] = {}; });
    return loading[subject];
  }

  /* ------------------------------ 渲染 ------------------------------ */

  function renderSubjectTabs() {
    var box = $('subject-tabs');
    box.replaceChildren();
    SUBJECTS.forEach(function (s) {
      var n = el('button', 'stage-tab' + (s.key === subject ? ' on' : ''), s.name);
      n.type = 'button';
      n.setAttribute('role', 'tab');
      n.setAttribute('aria-selected', s.key === subject ? 'true' : 'false');
      n.addEventListener('click', function () {
        var q = new URLSearchParams(location.search);
        q.set('subject', s.key);
        if (childId) q.set('child', childId);
        location.search = q.toString();
      });
      box.appendChild(n);
    });
  }

  function renderChildSelect() {
    var sel = $('child-select');
    var kids = CC.list();
    sel.replaceChildren();
    if (!kids.length) {
      var o = el('option', null, '（还没有档案）');
      o.value = '';
      sel.appendChild(o);
      sel.disabled = true;
      return;
    }
    kids.forEach(function (c) {
      var o = el('option', null, c.name);
      o.value = c.id;
      sel.appendChild(o);
    });
    sel.value = childId || '';
    sel.disabled = false;
  }

  function renderStats() {
    var box = $('book-stats');
    box.replaceChildren();
    if (!childId) { box.hidden = true; return; }
    box.hidden = false;
    var st = CC.stats(childId, subject);
    [
      { n: st.total, label: '错题总数', cls: '' },
      { n: st.weak, label: '薄弱', cls: 'is-weak' },
      { n: st.shaky, label: '不稳', cls: '' },
      { n: st.pending, label: '待确认（下次必考）', cls: 'is-pending' }
    ].forEach(function (row) {
      var d = el('div', 'book-stat ' + row.cls);
      d.appendChild(el('b', null, String(row.n)));
      d.appendChild(el('span', null, row.label));
      box.appendChild(d);
    });
  }

  function renderStartBox(rows) {
    var box = $('start-box');
    box.replaceChildren();
    if (!rows.length) { box.hidden = true; return; }
    box.hidden = false;

    var left = el('div', 'grow');
    left.appendChild(el('h2', null, '开始复习'));
    left.appendChild(el('p', { class: 'muted small' }, '从错题本抽题测一遍。答错的知识点会加重，下次更常出；连续两次答对就移出错题本。'));
    box.appendChild(left);

    var sel = el('select', null);
    sel.id = 'count-select';
    COUNTS.forEach(function (n) {
      var o = el('option', null, n + ' 个知识点' + (n > rows.length ? '（只有 ' + rows.length + ' 个）' : ''));
      o.value = String(n);
      if (n === DEFAULT_COUNT) o.selected = true;
      sel.appendChild(o);
    });
    sel.setAttribute('aria-label', '本次复习的知识点数量');
    box.appendChild(sel);

    var btn = el('button', 'primary', '开始复习');
    btn.type = 'button';
    btn.id = 'btn-review';
    btn.addEventListener('click', function () {
      var n = Math.min(parseInt(sel.value, 10) || DEFAULT_COUNT, rows.length);
      var q = new URLSearchParams();
      q.set('subject', subject);
      q.set('mistakes', '1');
      q.set('limit', String(n));
      q.set('child', childId);
      location.href = '../diagnose/?' + q.toString();
    });
    box.appendChild(btn);
  }

  function rowNode(r, idx) {
    var row = el('div', 'book-row');
    var main = el('div', 'book-row-main');
    main.appendChild(el('div', 'book-row-name', topicName(r.id)));
    var chapter = topicChapter(r.id);
    if (chapter) main.appendChild(el('div', 'book-row-sub', chapter));

    var tags = el('div', 'book-row-tags');
    tags.appendChild(el('span', 'tag ' + (r.status === 'weak' ? 'tag-weak' : 'tag-shaky'),
      STATUS_LABEL[r.status] || r.status));
    if (r.correctStreak === 1) tags.appendChild(el('span', 'tag tag-pending', '已答对 1 次，下次必考'));
    tags.appendChild(el('span', 'tag', '答错 ' + (r.wrongCount || 1) + ' 次'));
    tags.appendChild(el('span', 'tag', '抽测 ' + (r.testCount || 0) + ' 次'));
    main.appendChild(tags);

    var acts = el('div', 'book-row-acts');
    var graph = el('a', 'small', '看图谱');
    graph.href = '../explore/?' + (subject === 'math' ? '' : 'subject=' + subject + '&') + '#' + r.id;
    acts.appendChild(graph);
    var one = el('a', 'small', '只测这个');
    one.href = '../diagnose/?subject=' + subject + '&target=' + encodeURIComponent(r.id) + '&child=' + childId;
    acts.appendChild(one);
    var del = el('button', 'small danger', '移出');
    del.type = 'button';
    del.addEventListener('click', function () {
      if (!confirm('把「' + topicName(r.id) + '」移出错题本？')) return;
      CC.removeOne(childId, subject, r.id);
      render();
    });
    acts.appendChild(del);

    row.appendChild(main);
    row.appendChild(acts);
    return row;
  }

  function renderList() {
    var box = $('book-list');
    var emptyBox = $('book-empty');
    box.replaceChildren();
    if (!childId) {
      emptyBox.hidden = false;
      emptyBox.replaceChildren();
      emptyBox.appendChild(el('h2', null, '还没有孩子档案'));
      emptyBox.appendChild(el('p', { class: 'muted' }, '先去建一个档案，诊断时做错的知识点才会记进错题本。'));
      var go = el('a', 'btn', '去建档案');
      go.href = '../children/';
      emptyBox.appendChild(go);
      box.hidden = true;
      return;
    }
    var rows = CC.listMistakes(childId, subject);
    if (!rows.length) {
      emptyBox.hidden = false;
      emptyBox.replaceChildren();
      emptyBox.appendChild(el('h2', null, '这门课的错题本是空的'));
      emptyBox.appendChild(el('p', { class: 'muted' }, '去做一次诊断，判为「薄弱」或「不稳」的知识点会自动出现在这里。'));
      var go2 = el('a', 'btn', '去诊断');
      go2.href = '../diagnose/?' + (subject === 'math' ? '' : 'subject=' + subject + '&') + 'child=' + childId;
      emptyBox.appendChild(go2);
      box.hidden = true;
      return;
    }
    emptyBox.hidden = true;
    box.hidden = false;
    rows.forEach(function (r, i) { box.appendChild(rowNode(r, i)); });
  }

  function render() {
    renderChildSelect();
    renderSubjectTabs();
    renderStats();
    var rows = childId ? CC.listMistakes(childId, subject) : [];
    renderStartBox(rows);
    renderList();
  }

  $('child-select').addEventListener('change', function () {
    var v = this.value;
    if (!v) return;
    childId = v;
    CC.setCurrent(v);
    var q = new URLSearchParams(location.search);
    q.set('child', v);
    history.replaceState(null, '', location.pathname + '?' + q.toString());
    render();
  });

  // 首次渲染后补上知识点名（需要 topics.json）
  document.addEventListener('book:names', render);
  render();
  loadTopics().then(function () {
    renderStats();
    renderStartBox(childId ? CC.listMistakes(childId, subject) : []);
    renderList();
  });
})();
