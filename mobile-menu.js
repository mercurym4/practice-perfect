(function(){
  const btn=document.querySelector('.mobile-menu-toggle');
  const nav=document.getElementById('site-nav');
  if(!btn||!nav)return;
  const close=()=>{document.body.classList.remove('menu-open');btn.setAttribute('aria-expanded','false');btn.setAttribute('aria-label','Open menu')};
  btn.addEventListener('click',()=>{
    const open=document.body.classList.toggle('menu-open');
    btn.setAttribute('aria-expanded',String(open));
    btn.setAttribute('aria-label',open?'Close menu':'Open menu');
  });
  nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  window.addEventListener('resize',()=>{if(window.innerWidth>980)close()});
})();
