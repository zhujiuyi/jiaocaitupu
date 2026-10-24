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
    renderBackupHint();
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

  /* ---------------------------------------------------------- 导出 / 导入 */

  var backupMsg = $('backup-msg');
  var backupHint = $('backup-hint');
  var fileInput = $('file-import');

  function say(msg, isErr) {
    backupMsg.hidden = !msg;
    backupMsg.textContent = msg || '';
    backupMsg.classList.toggle('err', !!isErr);
  }

  function stamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  $('btn-export').addEventListener('click', function () {
    var kids = CC.list();
    if (!kids.length) { say('还没有孩子档案，没什么可导出的。', true); return; }
    var data = CC.exportData();
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '知识图谱备份-' + stamp() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    var total = Object.keys(data.mistakes || {}).reduce(function (acc, cid) {
      return acc + Object.keys(data.mistakes[cid] || {}).reduce(function (a2, s) {
        return a2 + Object.keys(data.mistakes[cid][s] || {}).length;
      }, 0);
    }, 0);
    say('已导出 ' + data.children.length + ' 个孩子、' + total + ' 条错题记录。把文件保存好，到新设备上用「导入备份」还原。');
  });

  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(String(reader.result)); }
      catch (e) { say('读不出 JSON：文件可能损坏，或者选错了文件。', true); fileInput.value = ''; return; }

      var err = CC.validateBackup(data);
      if (err) { say('这个文件不能用：' + err, true); fileInput.value = ''; return; }

      var kids = CC.list();
      var hasLocal = kids.length > 0;
      // 本地没有档案时不用问，直接还原
      var mode = 'replace';
      if (hasLocal) {
        var incoming = data.children.length;
        var msg = '本地已有 ' + kids.length + ' 个孩子（' + kids.map(function (c) { return c.name; }).join('、') + '）。\n'
          + '备份文件里有 ' + incoming + ' 个孩子。\n\n'
          + '点「确定」= 覆盖：清空本地，完全按备份还原。\n'
          + '点「取消」= 合并：保留本地，把备份里多出来的孩子加进来（重名会自动改名）。\n\n'
          + '注意：操作不可撤销。';
        mode = confirm(msg) ? 'replace' : 'merge';
      }

      var r = CC.importData(data, mode);
      fileInput.value = '';
      if (!r.ok) { say('导入失败：' + r.error, true); return; }

      if (!hasLocal) {
        say('已导入 ' + r.added + ' 个孩子及其错题记录。');
      } else if (r.replaced) {
        say('已覆盖导入 ' + r.added + ' 个孩子及其错题记录。本地原有的档案已被替换。');
      } else {
        var bits = ['已合并：新增 ' + r.added + ' 个孩子'];
        if (r.skipped) bits.push('跳过 ' + r.skipped + ' 个（已存在或超过上限）');
        if (r.mistakesAdded) bits.push('补入 ' + r.mistakesAdded + ' 条错题');
        say(bits.join('，') + '。');
      }
      resetForm();
      render();
    };
    reader.onerror = function () { say('读取文件失败。', true); fileInput.value = ''; };
    reader.readAsText(file, 'utf-8');
  });

  function renderBackupHint() {
    var kids = CC.list();
    if (!kids.length) { backupHint.textContent = ''; return; }
    var total = 0;
    kids.forEach(function (c) {
      var by = CC.countBySubject(c.id);
      Object.keys(by).forEach(function (s) { total += by[s]; });
    });
    backupHint.textContent = '当前共 ' + kids.length + ' 个孩子、' + total + ' 条错题';
  }

  fillGrades();
  render();
  renderBackupHint();
})();
