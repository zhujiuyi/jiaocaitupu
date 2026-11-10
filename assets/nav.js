/* 导航二级菜单：一级项（知识图谱 / 诊断）只展开菜单、不跳转，
   跳转只发生在点二级菜单里的具体学科。桌面靠 CSS :hover，同时支持点按；
   触屏没有 hover，完全靠点按。 */
(function () {
  'use strict';
  var subjects = window.CnmSubjects;
  var menuItems = document.querySelectorAll('.nav-item.has-menu');
  if (!menuItems.length) return;

  function triggerOf(item) { return item.querySelector(':scope > .nav-link'); }
  function menuOf(item) { return item.querySelector(':scope > .nav-menu'); }

  document.querySelectorAll('.nav-menu[data-group]').forEach(function (menu) {
    var base = menu.querySelector('.subject-link[data-subject="math"]');
    subjects.keys.forEach(function (subject) {
      if (!base || menu.querySelector('[data-subject="' + subject + '"]')) return;
      var link = base.cloneNode(false);
      link.dataset.subject = subject;
      link.classList.remove('on');
      link.setAttribute('href', subjects.withSubject(base.getAttribute('href'), subject));
      link.textContent = subjects.catalog[subject].name;
      menu.append(link);
    });
  });

  var pageLinks = Array.from(document.querySelectorAll('.site-nav a[href]:not(.subject-link), a.brand'),
    function (link) { return [link, link.getAttribute('href')]; });
  function setSubject(subject) {
    if (!subjects.known(subject)) subject = 'math';
    subjects.keys.forEach(function (key) {
      if (key !== 'math') document.body.classList.toggle('subject-' + key, key === subject);
    });
    document.querySelectorAll('.nav-menu[data-group] .subject-link').forEach(function (link) {
      var on = link.dataset.subject === subject;
      link.classList.toggle('on', on);
      if (on) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
    pageLinks.forEach(function (entry) {
      entry[0].setAttribute('href', subjects.withSubject(entry[1], subject));
    });
  }
  window.CnmNav = { setSubject: setSubject };
  setSubject(new URLSearchParams(location.search).get('subject'));

  function setOpen(item, open) {
    item.classList.toggle('open', open);
    var trigger = triggerOf(item);
    if (trigger) {
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      trigger.classList.toggle('active', open && trigger.dataset.wasActive === 'true');
    }
  }

  function closeAll(except) {
    menuItems.forEach(function (item) {
      if (item !== except) setOpen(item, false);
    });
  }

  menuItems.forEach(function (item) {
    var trigger = triggerOf(item);
    if (!trigger) return;
    trigger.setAttribute('aria-haspopup', 'true');
    if (!trigger.hasAttribute('aria-expanded')) trigger.setAttribute('aria-expanded', 'false');
    // 页面本身就在这一区时，保留 active 外观
    trigger.dataset.wasActive = trigger.classList.contains('active') ? 'true' : 'false';

    // 一级项只负责展开/收起，不跳转
    trigger.addEventListener('click', function (event) {
      event.preventDefault();
      var willOpen = !item.classList.contains('open');
      closeAll(item);
      setOpen(item, willOpen);
    });

    // 点菜单里的学科后收起
    menuOf(item).addEventListener('click', function (event) {
      if (event.target.closest('a')) setOpen(item, false);
    });

    // 键盘：Esc 收起并把焦点还给一级项
    item.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      setOpen(item, false);
      trigger.focus();
    });
  });

  // 点页面其它地方收起
  document.addEventListener('click', function (event) {
    if (event.target.closest('.nav-item.has-menu')) return;
    closeAll(null);
  });

  // 鼠标离开菜单区域后收起（仅桌面；触屏靠点按切换）
  if (window.matchMedia('(hover: hover)').matches) {
    menuItems.forEach(function (item) {
      item.addEventListener('mouseleave', function () {
        if (item.contains(document.activeElement)) return; // 键盘正在操作时不收
        setOpen(item, false);
      });
    });
  }
})();
