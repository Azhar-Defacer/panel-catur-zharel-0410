//this is quite possibly the most disgusting piece of code i've ever written.
//Works both as a Chrome extension content script AND as a bookmarklet / javascript: loader (mobile Chrome).
(function() {
  //prevent double injection (e.g. bookmarklet tapped twice, or extension + bookmarklet)
  if (window.__chesscheatLoaded) {
    var host = document.getElementById("chesscheat_host");
    if (host) host.style.display = host.style.display == "none" ? "block" : "none";
    return;
  }
  window.__chesscheatLoaded = true;

  /* ---------- assets (icon.png) ---------- */
  var scriptSrc = document.currentScript && document.currentScript.src;
  var assetBase = window.__ccBase
    || (scriptSrc && /scripts\/main\.js/.test(scriptSrc) ? scriptSrc.replace(/scripts\/main\.js.*$/, "") : "");
  var iconUrl = (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL("icon.png")
    : assetBase + "icon.png";

  /* ---------- settings (saved in localStorage) ---------- */
  var defaults = { depth: 15, color: "#ff3b3b", opacity: 0.5, autoStart: false, posX: null, posY: null };
  var settings = Object.assign({}, defaults);
  try { Object.assign(settings, JSON.parse(localStorage.getItem("chesscheat_settings") || "{}")); } catch (e) { }
  function saveSettings() {
    try { localStorage.setItem("chesscheat_settings", JSON.stringify(settings)); } catch (e) { }
  }

  /* ---------- engine / chess logic ---------- */
  var hackRunning = false;
  var engine = null;
  var getPlays = null;
  var lastFen = "";
  var ui = {}; //filled in by buildUI()

  function setStatus(text) { if (ui.status) ui.status.textContent = text; }

  function clearHighlights() {
    document.querySelectorAll(".cheat-highlight").forEach(function(el) { el.remove(); });
  }

  //generate FEN string from board,
  function getFenString() {
    let fen_string = ""
    for (var i = 8; i >= 1; i--) {
      for (var j = 1; j <= 8; j++) {
        let position = `${j}${i}`
        //for every new row on the chessboard
        if (j == 1 && i != 8) {
          fen_string += "/"
        }
        let piece_in_position = document.querySelectorAll(`.piece.square-${position}`)[0]?.classList ?? null
        //get piece name by shortest class
        if (piece_in_position != null) {
          for (var item of piece_in_position.values()) {
            if (item.length == 2) {
              piece_in_position = item
            }
          }
        }
        //if position is empty
        if (piece_in_position == null) {
          //if previous position is empty, sum up numbers
          let previous_char = fen_string.split("").pop()
          if (!isNaN(Number(previous_char))) {
            fen_string = fen_string.substring(0, fen_string.length - 1)
            fen_string += Number(previous_char) + 1
          }
          else {
            fen_string += "1"
          }
        }
        else if (piece_in_position?.split("")[0] == "b") {
          fen_string += piece_in_position.split("")[1]
        }
        else if (piece_in_position?.split("")[0] == "w") {
          fen_string += piece_in_position.split("")[1].toUpperCase()
        }
      }
    }
    return fen_string
  }

  function startHack() {
    if (hackRunning) return;
    const chessboard = document.querySelector("wc-chess-board") || document.querySelector("chess-board");
    if (!chessboard) {
      setStatus("Chessboard not found. Open a game first.");
      return;
    }
    var player_colour = chessboard.classList.contains("flipped") ? "b" : "w";

    //find the stockfish engine bundled with chess.com (file hash in the name can change)
    let engineUrl = "/bundles/app/js/vendor/jschessengine/stockfish.asm.1abfa10c.js"
    try {
      const found = performance.getEntriesByType("resource").map(function(r) { return r.name; })
        .find(function(n) { return /jschessengine\/stockfish[^/]*\.js/.test(n); })
      if (found) engineUrl = found
    } catch (e) { }
    try {
      engine = new Worker(engineUrl)
    } catch (e) {
      setStatus("Could not start engine: " + e.message);
      return;
    }
    hackRunning = true;
    setRunningUI(true);
    setStatus("Calculating best move...");

    function search() {
      lastFen = getFenString() + ` ${player_colour}`
      engine.postMessage("stop")
      engine.postMessage(`position fen ${lastFen}`)
      engine.postMessage(`go depth ${settings.depth}`)
    }
    search();
    //listen for when moves are made
    getPlays = setInterval(function() {
      if (!lastFen) { search(); return; }
      if (getFenString() + ` ${player_colour}` != lastFen) search();
    }, 300)
    //exposed so changing depth in settings re-runs the search
    startHack.research = function() { lastFen = ""; };

    engine.onmessage = function(event) {
      if (typeof event.data != "string") return;
      var score = event.data.match(/score (cp|mate) (-?\d+)/);
      if (score) {
        var v = Number(score[2]);
        ui.eval.textContent = score[1] == "mate" ? ("Mate in " + Math.abs(v)) : ((v >= 0 ? "+" : "") + (v / 100).toFixed(2));
      }
      if (event.data.startsWith('bestmove')) {
        const bestMove = event.data.split(' ')[1];
        if (!bestMove || bestMove == "(none)") { setStatus("No legal moves."); return; }
        const char_map = { "a": 1, "b": 2, "c": 3, "d": 4, "e": 5, "f": 6, "g": 7, "h": 8 }
        console.log('Best move:', bestMove);
        ui.best.textContent = bestMove.slice(0, 2) + " \u2192 " + bestMove.slice(2, 4);
        setStatus("Depth " + settings.depth + " \u00b7 tap the engine button to stop");
        //create cheat squares on the board
        clearHighlights();
        const a = bestMove.split("");
        [`${char_map[a[0]]}${a[1]}`, `${char_map[a[2]]}${a[3]}`].forEach(function(sq) {
          const h = document.createElement("div");
          h.className = `highlight cheat-highlight square-${sq}`
          h.style = `background:${settings.color};opacity:${settings.opacity};pointer-events:none`
          chessboard.appendChild(h)
        })
      }
    }
  }

  function stopHack() {
    if (!hackRunning) return;
    //stop listening for moves effectively stoping stockfish
    clearInterval(getPlays);
    if (engine) engine.terminate();
    engine = null;
    clearHighlights();
    hackRunning = false;
    setRunningUI(false);
    setStatus("Stopped.");
    ui.best.textContent = "\u2014";
    ui.eval.textContent = "\u2014";
  }

  /* ---------- UI (shadow DOM so chess.com CSS can't break it) ---------- */
  var css = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-tap-highlight-color: transparent; }
    .fab { position: fixed; width: 54px; height: 54px; border-radius: 50%; border: 2px solid rgba(129,182,76,.9);
      background: radial-gradient(circle at 30% 25%, #3a3836, #1f1e1c); box-shadow: 0 6px 18px rgba(0,0,0,.5), 0 0 0 0 rgba(129,182,76,.6);
      display: flex; align-items: center; justify-content: center; padding: 0; cursor: pointer; touch-action: none;
      z-index: 2147483647; transition: transform .15s ease, box-shadow .2s ease; user-select: none; }
    .fab:active { transform: scale(.92); }
    .fab img { width: 34px; height: 34px; border-radius: 8px; pointer-events: none; -webkit-user-drag: none; }
    .fab .fallback { font-size: 26px; color: #fff; line-height: 1; }
    .fab.running { animation: pulse 1.8s infinite; border-color: #81b64c; }
    .fab .dot { position: absolute; top: 2px; right: 2px; width: 12px; height: 12px; border-radius: 50%; background: #6b6b6b; border: 2px solid #1f1e1c; }
    .fab.running .dot { background: #81b64c; }
    @keyframes pulse { 0% { box-shadow: 0 6px 18px rgba(0,0,0,.5), 0 0 0 0 rgba(129,182,76,.55); } 70% { box-shadow: 0 6px 18px rgba(0,0,0,.5), 0 0 0 14px rgba(129,182,76,0); } 100% { box-shadow: 0 6px 18px rgba(0,0,0,.5), 0 0 0 0 rgba(129,182,76,0); } }

    .panel { position: fixed; width: min(320px, 92vw); color: #eee; z-index: 2147483646;
      background: rgba(32,31,29,.92); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(255,255,255,.1); border-radius: 18px; padding: 14px; box-shadow: 0 18px 50px rgba(0,0,0,.6);
      opacity: 0; transform: translateY(8px) scale(.97); pointer-events: none; transition: opacity .18s ease, transform .18s ease; }
    .panel.open { opacity: 1; transform: none; pointer-events: auto; }
    .head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .head img { width: 28px; height: 28px; border-radius: 7px; }
    .title { font-weight: 700; font-size: 16px; flex: 1; letter-spacing: .2px; }
    .title small { display: block; font-weight: 400; font-size: 11px; color: #9a9a96; }
    .x { background: rgba(255,255,255,.08); color: #ddd; border: 0; border-radius: 10px; width: 30px; height: 30px; font-size: 18px; cursor: pointer; }

    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
    .stat { background: rgba(0,0,0,.28); border-radius: 12px; padding: 8px 10px; }
    .stat label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .8px; color: #8c8c88; }
    .stat span { font-size: 18px; font-weight: 700; color: #a6d96a; font-variant-numeric: tabular-nums; }

    .toggle { width: 100%; border: 0; border-radius: 12px; padding: 12px; font-size: 15px; font-weight: 700; color: #fff; cursor: pointer;
      background: linear-gradient(135deg, #81b64c, #5e9130); box-shadow: 0 4px 0 #46701f; transition: transform .1s ease, box-shadow .1s ease; }
    .toggle:active { transform: translateY(3px); box-shadow: 0 1px 0 #46701f; }
    .toggle.running { background: linear-gradient(135deg, #e05a4f, #b8342a); box-shadow: 0 4px 0 #8a2119; }
    .toggle.running:active { box-shadow: 0 1px 0 #8a2119; }

    .section { margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.08); }
    .row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; font-size: 13px; }
    .row > label { width: 78px; color: #b8b8b4; flex-shrink: 0; }
    .row input[type=range] { flex: 1; accent-color: #81b64c; min-width: 0; }
    .row .val { width: 34px; text-align: right; font-variant-numeric: tabular-nums; color: #fff; }
    .row input[type=color] { width: 44px; height: 30px; border: 0; background: none; padding: 0; }
    .swatches { display: flex; gap: 6px; flex: 1; }
    .sw { width: 22px; height: 22px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
    .sw.sel { border-color: #fff; }
    .switch { margin-left: auto; position: relative; width: 44px; height: 24px; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .switch i { position: absolute; inset: 0; background: #555; border-radius: 24px; transition: .2s; }
    .switch i:before { content: ""; position: absolute; width: 18px; height: 18px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: .2s; }
    .switch input:checked + i { background: #81b64c; }
    .switch input:checked + i:before { transform: translateX(20px); }
    .status { margin-top: 10px; font-size: 11px; color: #8c8c88; text-align: center; min-height: 14px; }
    .warn { font-size: 10px; color: #8c8c88; margin-top: 4px; }
  `;

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function iconNode(cls) {
    var img = el("img", cls);
    img.alt = "";
    img.src = iconUrl;
    img.onerror = function() {
      var f = el("span", "fallback", "\u265e");
      if (img.parentNode) img.parentNode.replaceChild(f, img);
    };
    return img;
  }

  function setRunningUI(running) {
    if (!ui.fab) return;
    ui.fab.classList.toggle("running", running);
    ui.toggle.classList.toggle("running", running);
    ui.toggle.textContent = running ? "\u25a0  Stop engine" : "\u25b6  Start engine";
  }

  function buildUI() {
    var host = el("div");
    host.id = "chesscheat_host";
    var root = host.attachShadow({ mode: "open" });
    var style = el("style"); style.textContent = css; root.appendChild(style);

    //floating draggable button
    var fab = el("button", "fab");
    fab.title = "Chess Cheat";
    fab.appendChild(iconNode());
    fab.appendChild(el("span", "dot"));
    root.appendChild(fab);

    //settings panel
    var panel = el("div", "panel");
    var head = el("div", "head");
    head.appendChild(iconNode());
    head.appendChild(el("div", "title", "Chess Cheat<small>Stockfish assistant</small>"));
    var x = el("button", "x", "&times;");
    head.appendChild(x);
    panel.appendChild(head);

    var stats = el("div", "stats");
    stats.innerHTML = '<div class="stat"><label>Best move</label><span id="best">\u2014</span></div><div class="stat"><label>Evaluation</label><span id="eval">\u2014</span></div>';
    panel.appendChild(stats);

    var toggle = el("button", "toggle", "\u25b6  Start engine");
    panel.appendChild(toggle);

    var sec = el("div", "section");
    sec.innerHTML =
      '<div class="row"><label>Depth</label><input type="range" id="depth" min="1" max="30" step="1"><span class="val" id="depthv"></span></div>' +
      '<div class="row"><label>Highlight</label><div class="swatches" id="sw"></div><input type="color" id="color"></div>' +
      '<div class="row"><label>Opacity</label><input type="range" id="op" min="0.1" max="1" step="0.05"><span class="val" id="opv"></span></div>' +
      '<div class="row"><label>Auto start</label><label class="switch"><input type="checkbox" id="auto"><i></i></label></div>' +
      '<div class="warn">High depth (25+) can make your phone slow or freeze.</div>';
    panel.appendChild(sec);
    var status = el("div", "status", "Ready.");
    panel.appendChild(status);
    root.appendChild(panel);
    document.body.appendChild(host);

    ui.fab = fab; ui.toggle = toggle; ui.status = status;
    ui.best = root.getElementById("best"); ui.eval = root.getElementById("eval");

    //--- settings wiring
    var depth = root.getElementById("depth"), depthv = root.getElementById("depthv");
    var op = root.getElementById("op"), opv = root.getElementById("opv");
    var color = root.getElementById("color"), auto = root.getElementById("auto");
    depth.value = settings.depth; depthv.textContent = settings.depth;
    op.value = settings.opacity; opv.textContent = Math.round(settings.opacity * 100) + "%";
    color.value = settings.color; auto.checked = !!settings.autoStart;

    depth.oninput = function() {
      settings.depth = Number(depth.value); depthv.textContent = depth.value; saveSettings();
      if (hackRunning && startHack.research) startHack.research();
    };
    function applyColor(c) {
      settings.color = c; color.value = c; saveSettings();
      root.querySelectorAll(".sw").forEach(function(s) { s.classList.toggle("sel", s.dataset.c == c); });
      document.querySelectorAll(".cheat-highlight").forEach(function(h) { h.style.background = c; });
    }
    ["#ff3b3b", "#ffb020", "#81b64c", "#3b9bff", "#c15cff"].forEach(function(c) {
      var s = el("span", "sw"); s.style.background = c; s.dataset.c = c;
      s.onclick = function() { applyColor(c); };
      root.getElementById("sw").appendChild(s);
    });
    color.oninput = function() { applyColor(color.value); };
    applyColor(settings.color);
    op.oninput = function() {
      settings.opacity = Number(op.value); opv.textContent = Math.round(settings.opacity * 100) + "%"; saveSettings();
      document.querySelectorAll(".cheat-highlight").forEach(function(h) { h.style.opacity = settings.opacity; });
    };
    auto.onchange = function() { settings.autoStart = auto.checked; saveSettings(); };
    toggle.onclick = function() { hackRunning ? stopHack() : startHack(); };

    //--- positioning + drag (tap = open/close panel, drag = move button)
    function place() {
      var w = window.innerWidth, h = window.innerHeight;
      var fx = settings.posX == null ? w - 70 : Math.min(Math.max(0, settings.posX), w - 54);
      var fy = settings.posY == null ? h - 150 : Math.min(Math.max(0, settings.posY), h - 54);
      fab.style.left = fx + "px"; fab.style.top = fy + "px";
      //panel opens above the button if there is room, else below; kept inside the screen
      var pw = panel.offsetWidth || 320, ph = panel.offsetHeight || 380;
      var px = Math.min(Math.max(8, fx + 54 - pw), w - pw - 8);
      var py = fy - ph - 10 >= 8 ? fy - ph - 10 : Math.min(fy + 64, Math.max(8, h - ph - 8));
      panel.style.left = px + "px"; panel.style.top = py + "px";
    }
    function openPanel(open) {
      panel.classList.toggle("open", open);
      if (open) place();
    }
    var drag = null;
    fab.addEventListener("pointerdown", function(e) {
      drag = { sx: e.clientX, sy: e.clientY, ox: fab.offsetLeft, oy: fab.offsetTop, moved: false };
      fab.setPointerCapture(e.pointerId);
    });
    fab.addEventListener("pointermove", function(e) {
      if (!drag) return;
      var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
      if (drag.moved) {
        settings.posX = drag.ox + dx; settings.posY = drag.oy + dy; place();
      }
    });
    fab.addEventListener("pointerup", function() {
      if (!drag) return;
      if (drag.moved) saveSettings(); else openPanel(!panel.classList.contains("open"));
      drag = null;
    });
    x.onclick = function() { openPanel(false); };
    window.addEventListener("resize", place);
    place();

    if (settings.autoStart) setTimeout(startHack, 500);
  }

  buildUI();
})();
