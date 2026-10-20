/* 页面切换兜底：支持 View Transitions 的浏览器由 CSS 处理，
   其余浏览器在跳转前淡出当前页。 */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || 'startViewTransition' in document) return;

  function isHtmlTarget(url) {
    return /\.html?$/.test(url.pathname) || url.pathname === '/' || /\/$/.test(url.pathname);
  }

  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    var link = event.target.closest ? event.target.closest('a[href]') : null;
    if (!link) return;
    if (link.target && link.target !== '_self') return;
    if (link.hasAttribute('download')) return;

    var url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.href === location.href) return;
    if (url.hash && url.pathname === location.pathname && url.search === location.search) return;
    if (!isHtmlTarget(url)) return;

    event.preventDefault();
    document.documentElement.classList.add('is-leaving');
    window.setTimeout(function () {
      location.href = url.href;
    }, 150);
  });

  window.addEventListener('pageshow', function () {
    document.documentElement.classList.remove('is-leaving');
  });
})();
