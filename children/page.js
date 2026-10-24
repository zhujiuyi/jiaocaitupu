/* 孩子档案页。列表 / 新建 / 编辑 / 删除 / 设为当前。 */
(function () {
  'use strict';
  var CC = window.CnmChildren;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function $(id) { return document.getElementById(id); }

  var SUBJECT_NAME = { math: '数学', english: '英语', physics: '物理', chinese: '语文' };
  var GRADE_OPTS = ['', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  var GRADE_LABEL = { '': '未填', 1: '一年级', 2: '二年级', 3: '三年级', 4: '四年级', 5: '五年级', 6: '六年级',
    7: '七年级', 8: '八年级', 9: '九年级', 10: '高一', 11: '高二', 12: '高三' };

  var errBox = $('form-error');
  var form = $('child-form');
  var nameInput = $('f-name');
  var gradeSel = $('f-grade');
  var bookInput = $('f-textbook');
  var submitBtn = $('btn-save');
  var cancelBtn = $('btn-cancel');
  var listBox = $('child-list');
  var editingId = null;

  function showError(msg) {
    errBox.textContent = msg || '';
    errBox.hidden = !msg;
  }

  function fillGrades() {
    GRADE_OPTS.forEach(function (g) {
      var o = el('option', null, GRADE_LABEL[g]);
      o.value = g;
      gradeSel.appendChild(o);
    });
  }

  function resetForm() {
    editingId = null;
    nameInput.value = '';
    gradeSel.value = '';
    bookInput.value = '';
    submitBtn.textContent = '添加';
    cancelBtn.hidden = true;
    showError('');
  }

  function startEdit(c) {
    editingId = c.id;
    nameInput.value = c.name;
    gradeSel.value = c.grade == null ? '' : String(c.grade);
    bookInput.value = c.textbook || '';
    submitBtn.textContent = '保存修改';
    cancelBtn.hidden = false;
    showError('');
    nameInput.focus();
    nameInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function subjectChips(cid) {
    var by = CC.countBySubject(cid);
    var box = el('div', 'child-subjects');
    var any = false;
    Object.keys(SUBJECT_NAME).forEach(function (s) {
      var n = by[s] || 0;
      if (!n) return;
      any = true;
      var chip = el('span', 'chip chip-' + s, SUBJECT_NAME[s] + ' ' + n);
      box.appendChild(chip);
    });
    if (!any) box.appendChild(el('span', 'child-none', '错题本还是空的'));
    return box;
  }

  function card(c, isCurrent) {
    var box = el('div', 'child-card' + (isCurrent ? ' current' : ''));
    var head = el('div', 'child-head');
    var av = el('span', 'child-avatar', c.name.slice(0, 1));
    var meta = el('div', 'child-meta');
    var nm = el('strong', null, c.name);
    if (isCurrent) nm.appendChild(el('span', 'tag tag-current', '当前'));
    meta.appendChild(nm);
    var sub = [GRADE_LABEL[c.grade] || '未填年级', c.textbook || '未填教材'].join(' · ');
    meta.appendChild(el('span', 'child-sub', sub));
    head.appendChild(av);
    head.appendChild(meta);
    box.appendChild(head);
    box.appendChild(subjectChips(c.id));

    var acts = el('div', 'child-actions');
    if (!isCurrent) {
      var use = el('button', 'small', '设为当前');
      use.type = 'button';
      use.addEventListener('click', function () { CC.setCurrent(c.id); render(); });
      acts.appendChild(use);
    }
    var edit = el('button', 'small', '编辑');
    edit.type = 'button';
    edit.addEventListener('click', function () { startEdit(c); });
    acts.appendChild(edit);
    var del = el('button', 'small danger', '删除');
    del.type = 'button';
    del.addEventListener('click', function () {
      var n = Object.keys(CC.countBySubject(c.id)).reduce(function (a, k) {
        return a + CC.countBySubject(c.id)[k];
      }, 0);
      var msg = '删除「' + c.name + '」？';
      if (n) msg += '\n他的 ' + n + ' 条错题记录也会一起删掉，不能恢复。';
      if (!confirm(msg)) return;
      CC.remove(c.id);
      if (editingId === c.id) resetForm();
      render();
    });
    acts.appendChild(del);
    box.appendChild(acts);
    return box;
  }

  function render() {
    var kids = CC.list();
    var cur = CC.current();
    listBox.replaceChildren();
    if (!kids.length) {
      var empty = el('div', 'card empty');
      empty.appendChild(el('h2', null, '还没有孩子档案'));
      empty.appendChild(el('p', { class: 'muted' }, '在上面的表单里填一个昵称就能建第一个档案。建档后才能开始诊断，做错的题会自动记进错题本。'));
      listBox.appendChild(empty);
      updateHint();
      return;
    }
    kids.forEach(function (c) { listBox.appendChild(card(c, !!cur && cur.id === c.id)); });
    updateHint();
  }

  function updateHint() {
    var n = CC.list().length;
    var hint = $('child-count');
    hint.textContent = n ? '已建 ' + n + ' / ' + CC.MAX_CHILDREN + ' 个档案' : '';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var payload = {
      name: nameInput.value,
      grade: gradeSel.value === '' ? null : parseInt(gradeSel.value, 10),
      textbook: bookInput.value
    };
    var r = editingId ? CC.update(editingId, payload) : CC.add(payload);
    if (!r.ok) { showError(r.error); return; }
    resetForm();
    render();
  });

  cancelBtn.addEventListener('click', resetForm);

  fillGrades();
  render();
})();
