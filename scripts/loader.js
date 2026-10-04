//Bookmarklet loader (readable version). Minified one-liner is in readme.md.
//Replace USER / REPO / BRANCH with your GitHub details.
javascript:(function(){
  var u='https://cdn.jsdelivr.net/gh/USER/REPO@BRANCH/scripts/main.js?t='+Date.now();
  var s=document.createElement('script');
  s.src=u;
  s.onerror=function(){
    //fallback: raw.githubusercontent serves text/plain, so fetch + eval instead of <script src>
    window.__ccBase='https://cdn.jsdelivr.net/gh/USER/REPO@BRANCH/';
    fetch('https://raw.githubusercontent.com/USER/REPO/BRANCH/scripts/main.js')
      .then(function(r){return r.text()})
      .then(function(t){(0,eval)(t)})
      .catch(function(e){alert('Load failed: '+e.message)});
  };
  document.body.appendChild(s);
})();
