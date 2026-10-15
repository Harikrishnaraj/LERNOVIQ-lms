// Floating back-to-top button (LERNOVIQ website). Shown after the visitor scrolls down; a click
// scrolls smoothly to the top header. Styled with the site's brand colours. Keeps clear of content:
// it sits at the bottom-right, is small on phones, and respects reduced-motion preferences.
(function () {
  var SHOW_AFTER = 400; // px scrolled before the button appears
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var style = document.createElement('style');
  style.textContent = [
    '.lv-totop{position:fixed;right:20px;bottom:20px;z-index:1000;width:48px;height:48px;border-radius:999px;',
    'border:0;background:#0066FF;color:#FFFFFF;box-shadow:0 10px 24px -10px rgba(10,31,84,.55);cursor:pointer;',
    'display:flex;align-items:center;justify-content:center;font:700 22px/1 "Plus Jakarta Sans",Arial,sans-serif;',
    'opacity:0;visibility:hidden;transform:translateY(8px);transition:opacity .2s,transform .2s,background-color .2s,visibility .2s}',
    '.lv-totop.is-visible{opacity:1;visibility:visible;transform:none}',
    '.lv-totop:hover{background:#0052CC}',
    '.lv-totop:focus-visible{outline:3px solid #0066FF;outline-offset:3px}',
    '@media (max-width:600px){.lv-totop{right:14px;bottom:14px;width:44px;height:44px;font-size:20px}}',
    '@media (prefers-reduced-motion:reduce){.lv-totop{transition:none}}'
  ].join('');
  document.head.appendChild(style);

  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'lv-totop';
  button.setAttribute('aria-label', 'Back to top');
  button.title = 'Back to top';
  button.textContent = '↑';
  button.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  });

  function update() {
    var show = (window.scrollY || document.documentElement.scrollTop) > SHOW_AFTER;
    button.classList.toggle('is-visible', show);
  }

  function mount() {
    document.body.appendChild(button);
    window.addEventListener('scroll', update, { passive: true });
    update();
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
