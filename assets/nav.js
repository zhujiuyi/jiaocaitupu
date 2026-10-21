/* 导航二级菜单：触屏没有 hover，改为点按「知识图谱 / 诊断」展开，
   再点一次或点页面其它地方收起。桌面端仍交给 CSS :hover。 */
(function () {
  'use strict';
  var menus = document.querySelectorAll('.nav-item.has-menu');
  if (!menus.length) return;
  var coarse = window.matchMedia('(hover: none)').matches;

  function closeAll(except) {
    menus.forEach(function (item) {
      if (item === except) return;
      item.classList.remove('open');
      var trigger = item.querySelector(':scope > .nav-link');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }

  menus.forEach(function (item) {
    var trigger = item.querySelector(':scope > .nav-link');
    if (!trigger) return;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-haspopup', 'true');

    // 触屏：点一级项不跳转，先展开菜单
    trigger.addEventListener('click', function (event) {
      if (!coarse) return;                 // 桌面保持原来的直接跳转
      event.preventDefault();
      var willOpen = !item.classList.contains('open');
      closeAll(item);
      item.classList.toggle('open', willOpen);
      trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });

    // 键盘：Esc 收起
    item.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      item.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    });
  });

  document.addEventListener('click', function (event) {
    if (event.target.closest('.nav-item.has-menu')) return;
    closeAll(null);
  });
})();
