(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var API = (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '';
  var pass = '', cfg = null;
  var VIEWS = ['login', 'home', 'scan', 'edit', 'done', 'records', 'reports', 'overview'];

  function show(v) {
    VIEWS.forEach(function (x) { $('v-' + x).classList.toggle('hidden', x !== v); });
    document.body.classList.toggle('wide', v === 'reports' || v === 'overview');
    window.scrollTo(0, 0);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return '$' + Number(n).toLocaleString('en-US'); }
  function rocLabel(p) { return p.slice(0, 3) + '年' + p.slice(3) + '月'; }
  function rocDate(iso) { return (+iso.slice(0, 4) - 1911) + '年' + iso.slice(5, 7) + '月' + iso.slice(8, 10) + '日'; }
  function msg(el, text, cls) { el.textContent = text; el.className = 'msg ' + (cls || ''); }

  // ---------- 與後端溝通 ----------
  function api(action, data) {
    if (!API) return Promise.resolve({ ok: false, error: 'no_api', message: '尚未設定系統網址（請管理者填寫 config.js）' });
    return fetch(API, { method: 'POST', body: JSON.stringify(Object.assign({ action: action, pass: pass }, data || {})) })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: 'network', message: '連不上系統，請檢查手機網路後再試' }; });
  }

  // ---------- 名冊 ----------
  function activeRoster(date) {
    return cfg.roster.filter(function (p) { return (!p.joined || date >= p.joined) && (!p.left || date <= p.left); });
  }
  function plabel(p) { return p.name ? p.code + ' ' + p.name : p.code; }
  function pname(code) {
    var p = cfg.roster.filter(function (x) { return x.code === code; })[0];
    return p ? plabel(p) : code;
  }

  // ---------- 登入 ----------
  function tryLogin(p, remember) {
    pass = p;
    return api('config').then(function (res) {
      if (!res.ok) { pass = ''; return res; }
      cfg = res;
      try { if (remember) localStorage.setItem('mm_pass', p); } catch (e) {}
      goHome();
      return res;
    });
  }
  $('btn-login').onclick = function () {
    var p = $('pass').value;
    if (!p) return;
    var b = $('btn-login'); b.disabled = true;
    tryLogin(p, $('remember').checked).then(function (res) {
      b.disabled = false;
      if (!res.ok) { var m = $('login-msg'); m.classList.remove('hidden'); msg(m, res.message, 'bad'); }
    });
  };
  $('pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('btn-login').click(); });
  $('btn-logout').onclick = function () {
    try { localStorage.removeItem('mm_pass'); } catch (e) {}
    pass = ''; cfg = null; $('pass').value = ''; show('login');
  };

  function goHome() {
    $('home-sub').textContent = '今天是 ' + rocDate(cfg.today);
    show('home');
    // 本月統計卡（非同步載入，失敗就維持「–」）
    var per = String(+cfg.today.slice(0, 4) - 1911) + cfg.today.slice(5, 7);
    $('hc-title').textContent = '本月（' + rocLabel(per) + '）已登記';
    api('list', { period: per }).then(function (res) {
      if (!res.ok) return;
      $('hc-n').textContent = res.rows.length;
      $('hc-s').textContent = money(res.sumShared);
      $('hc-p').textContent = money(res.sumPersonal);
    });
  }

  // ---------- 掃描 ----------
  var video = $('video'), stream = null, scanning = false, canvas = document.createElement('canvas');
  var ctx2d = canvas.getContext('2d', { willReadFrequently: true });
  var sLeft = null, sRight = null, pending = false;

  function decodeText(code) {
    try {
      if (code.binaryData && code.binaryData.length)
        return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(code.binaryData));
    } catch (e) {
      try { return new TextDecoder('big5').decode(new Uint8Array(code.binaryData)); } catch (e2) {}
    }
    return code.data;
  }
  function scanImageData(img) {
    var found = [];
    for (var n = 0; n < 3; n++) {
      var code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
      if (!code) break;
      found.push(decodeText(code));
      var l = code.location, xs = [l.topLeftCorner.x, l.topRightCorner.x, l.bottomLeftCorner.x, l.bottomRightCorner.x],
        ys = [l.topLeftCorner.y, l.topRightCorner.y, l.bottomLeftCorner.y, l.bottomRightCorner.y];
      var x0 = Math.max(0, Math.floor(Math.min.apply(null, xs)) - 4), x1 = Math.min(img.width, Math.ceil(Math.max.apply(null, xs)) + 4);
      var y0 = Math.max(0, Math.floor(Math.min.apply(null, ys)) - 4), y1 = Math.min(img.height, Math.ceil(Math.max.apply(null, ys)) + 4);
      for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++) {
        var i = (y * img.width + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = 255;
      }
    }
    return found;
  }
  function scanCanvas(c, w, h) {
    var out = [];
    [[0, w], [0, Math.round(w * 0.5)], [Math.round(w * 0.5), w], [0, Math.round(w * 0.56)], [Math.round(w * 0.44), w]].forEach(function (r) {
      scanImageData(c.getImageData(r[0], 0, r[1] - r[0], h)).forEach(function (t) { if (out.indexOf(t) < 0) out.push(t); });
    });
    return out;
  }
  function accept(t) {
    if (EInvoice.isLeft(t)) { if (!sLeft) sLeft = t; return true; }
    if (EInvoice.isRight(t)) { if (!sRight) sRight = t; return true; }
    return false;
  }
  // 回傳 'none' | 'wait' | 'done'
  function evaluate() {
    var m = $('scan-msg');
    if (!sLeft) { msg(m, '還沒掃到左邊的 QR code。', 'warn'); return 'none'; }
    var r = EInvoice.parseInvoice(sLeft, sRight);
    if (!r) { msg(m, '這個 QR code 不是電子發票。', 'warn'); sLeft = null; return 'none'; }
    scanned = r;
    if (r.needRight) {
      pending = true;
      msg(m, '已讀到日期與金額（' + money(r.total) + '）。這張還有更多品項，請對準右邊的 QR code。', 'warn');
      $('btn-go').classList.remove('hidden');
      return 'wait';
    }
    pending = false;
    return 'done';
  }
  var scanned = null;

  function loop() {
    if (!scanning) return;
    if (video.readyState >= 2 && video.videoWidth) {
      var w = Math.min(video.videoWidth, 1280), h = Math.round(video.videoHeight * w / video.videoWidth);
      canvas.width = w; canvas.height = h; ctx2d.drawImage(video, 0, 0, w, h);
      var before = (sLeft ? 1 : 0) + (sRight ? 1 : 0);
      scanCanvas(ctx2d, w, h).forEach(accept);
      if ((sLeft ? 1 : 0) + (sRight ? 1 : 0) !== before) {
        var st = evaluate();
        if (st === 'done') { stopCam(); openEditor(scanned); return; }
      }
    }
    setTimeout(function () { requestAnimationFrame(loop); }, 120);
  }
  function stopCam() {
    scanning = false;
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null;
    $('video-wrap').classList.add('hidden'); $('btn-cam').classList.remove('hidden');
  }
  function resetScan() {
    sLeft = sRight = null; pending = false; scanned = null;
    $('btn-go').classList.add('hidden');
    msg($('scan-msg'), '按「打開鏡頭」開始。');
  }
  $('btn-scan').onclick = function () { resetScan(); show('scan'); };
  $('btn-scan-back').onclick = function () { stopCam(); goHome(); };
  $('btn-cam').onclick = function () {
    if (!pending) { sLeft = sRight = null; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      msg($('scan-msg'), '這個瀏覽器沒有開放鏡頭，請改用拍照，或回首頁用「手動記一筆」。', 'warn'); return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false })
      .then(function (s) {
        stream = s; video.srcObject = s; video.play();
        $('video-wrap').classList.remove('hidden'); $('btn-cam').classList.add('hidden');
        scanning = true; msg($('scan-msg'), '鏡頭已開啟，請對準發票左邊的 QR code。'); loop();
      })
      .catch(function () { msg($('scan-msg'), '鏡頭打不開。請確認有按「允許」，或改用拍照。', 'warn'); });
  };
  $('file').onchange = function (ev) {
    var f = ev.target.files[0]; if (!f) return;
    if (!pending) { sLeft = sRight = null; }
    msg($('scan-msg'), '讀取中…');
    var url = URL.createObjectURL(f), im = new Image();
    im.onload = function () {
      [1600, 1000, 2400].some(function (maxW) {
        var w = Math.min(im.naturalWidth, maxW), h = Math.round(im.naturalHeight * w / im.naturalWidth);
        canvas.width = w; canvas.height = h; ctx2d.drawImage(im, 0, 0, w, h);
        scanCanvas(ctx2d, w, h).forEach(accept);
        return !!sLeft && !EInvoice.parseInvoice(sLeft, sRight).needRight;
      });
      URL.revokeObjectURL(url);
      var st = evaluate();
      if (st === 'done') openEditor(scanned);
      else if (st === 'none') msg($('scan-msg'), '照片裡讀不到發票 QR code。請靠近一點、光線亮一點再拍一次。', 'warn');
      ev.target.value = '';
    };
    im.onerror = function () { msg($('scan-msg'), '照片打不開。', 'warn'); };
    im.src = url;
  };
  $('btn-go').onclick = function () { stopCam(); if (scanned) openEditor(scanned); };

  // ---------- 登記畫面 ----------
  var E = null; // { invoice, date, place, lines }
  function newLine(o) {
    return Object.assign({ type: null, catNo: 0, item: '', amount: 0, person: '', participants: null, tail: '' }, o || {});
  }
  function resolvedParts(L) {
    var act = activeRoster(E.date).map(function (p) { return p.code; });
    return L.participants === null ? act : act.filter(function (c) { return L.participants.indexOf(c) >= 0; });
  }
  function tailInfo(L) {
    var parts = resolvedParts(L), n = parts.length;
    if (!n || !(L.amount > 0)) return { parts: parts, tailAmt: 0, base: 0 };
    var base = Math.round(L.amount / n);
    return { parts: parts, base: base, tailAmt: L.amount - base * n };
  }

  function openEditor(inv) {
    var date = inv ? inv.isoDate : cfg.today;
    var item = '';
    if (inv && inv.items.length) {
      item = inv.items.map(function (i) { return i.name; }).filter(Boolean).slice(0, 3).join('、').slice(0, 40);
    }
    E = { invoice: inv, date: date, place: '', lines: [newLine({ amount: inv ? inv.total : 0, item: item })] };
    $('edit-title').textContent = inv ? '登記發票' : '手動記一筆';
    $('e-date').value = date;
    $('e-place').value = '';
    $('e-invoice').textContent = inv ? ('發票 ' + inv.invoiceNo.slice(0, 2) + '-' + inv.invoiceNo.slice(2) + '　總額 ' + money(inv.total)) : '';
    $('btn-splititems').classList.toggle('hidden', !(inv && inv.items.length > 1));
    renderLines();
    show('edit');
    if (inv && inv.sellerId) {
      api('lookupStore', { sellerId: inv.sellerId }).then(function (res) {
        if (!res.ok || !res.store || !E || E.invoice !== inv) return;
        if (!$('e-place').value) { $('e-place').value = res.store.place; E.place = res.store.place; }
        var L = E.lines[0];
        if (L && !L.type && !L.catNo && E.lines.length === 1) {
          if (res.store.type === '個人' || res.store.type === '共同') L.type = res.store.type;
          L.catNo = res.store.catNo || 0;
          renderLines();
        }
      });
    }
  }

  function customSum(L) {
    var s = 0;
    Object.keys(L.custom || {}).forEach(function (k) { s += L.custom[k] > 0 ? L.custom[k] : 0; });
    return s;
  }
  function customCls(L) { return customSum(L) === L.amount && L.amount > 0 ? 'ok' : 'warn'; }
  function customText(L) {
    var s = customSum(L), d = L.amount - s;
    if (!(L.amount > 0)) return '請先在下面填這一列的金額';
    return d === 0 ? '已分配完畢 ✔　合計 ' + money(s) + ' 等於金額' : '尚未分配完畢：合計 ' + money(s) + '，' + (d > 0 ? '還差 ' : '多了 ') + money(Math.abs(d));
  }

  function renderLines() {
    var act = activeRoster(E.date);
    var residents = act.filter(function (p) { return p.role === '住民'; });
    var cats = cfg.categories.filter(function (c) { return c.no !== cfg.incomeCat; });
    var html = '';
    E.lines.forEach(function (L, i) {
      html += '<div class="line" data-i="' + i + '"><div class="row"><b>第 ' + (i + 1) + ' 列</b>' +
        (E.lines.length > 1 ? '<button class="small bad" data-act="del">刪除此列</button>' : '') + '</div>';
      html += '<label class="f">類型</label><div class="seg">' +
        '<button data-act="type" data-v="個人" class="' + (L.type === '個人' ? 'on' : '') + '">個人</button>' +
        '<button data-act="type" data-v="共同" class="' + (L.type === '共同' ? 'on' : '') + '">共用</button></div>';
      if (L.type === '個人') {
        html += '<label class="f">哪一位住民</label><div class="chips">';
        residents.forEach(function (p) {
          html += '<button data-act="person" data-v="' + esc(p.code) + '" class="' + (L.person === p.code ? 'on' : '') + '">' + esc(plabel(p)) + '</button>';
        });
        html += '</div>';
      } else if (L.type === '共同' && L.custom) {
        html += '<label class="f">自訂每人金額（空白或 0＝不分攤）</label>';
        act.forEach(function (p) {
          html += '<div class="row" style="margin-top:6px"><span>' + esc(plabel(p)) + '</span>' +
            '<input type="number" inputmode="numeric" data-custom="' + esc(p.code) + '" style="width:130px" value="' + (L.custom[p.code] || '') + '"></div>';
        });
        html += '<div class="msg ' + customCls(L) + '" data-customsum style="margin-top:8px">' + customText(L) + '</div>';
        html += '<div style="display:flex;gap:8px;margin-top:8px"><button class="small sec" data-act="custom">重新平均分配</button><button class="small sec" data-act="even">改回平均分模式</button></div>';
      } else if (L.type === '共同') {
        var ti = tailInfo(L);
        html += '<label class="f">誰分攤（點一下可取消或加入）</label><div class="chips">';
        act.forEach(function (p) {
          html += '<button data-act="part" data-v="' + esc(p.code) + '" class="' + (ti.parts.indexOf(p.code) >= 0 ? 'on' : '') + '">' + esc(plabel(p)) + '</button>';
        });
        html += '</div>';
        if (ti.parts.length && L.amount > 0) {
          var tl = L.tail && ti.parts.indexOf(L.tail) >= 0 ? L.tail : ti.parts[ti.parts.length - 1];
          html += '<table class="tbl"><tr><th>對象</th><th class="r">分攤金額</th></tr>';
          var tot = 0;
          ti.parts.forEach(function (c) {
            var v = ti.base + (c === tl ? ti.tailAmt : 0); tot += v;
            html += '<tr><td>' + esc(pname(c)) + '</td><td class="r">' + money(v) +
              (c === tl && ti.tailAmt !== 0 ? ' <span class="tag">含尾差 ' + (ti.tailAmt > 0 ? '+' : '') + ti.tailAmt + '</span>' : '') + '</td></tr>';
          });
          html += '<tr class="sumrow"><td>合計（' + ti.parts.length + ' 人）</td><td class="r">' + money(tot) + '</td></tr></table>';
          html += '<div class="msg ok" style="margin-top:8px">' + (tot === L.amount ? '已分配完畢 ✔　合計等於金額 ' + money(L.amount) : '尚未分配完畢') + '</div>';
          if (ti.tailAmt !== 0) {
            html += '<div class="sub" style="margin-top:6px">尾差 ' + (ti.tailAmt > 0 ? '+' : '') + ti.tailAmt + ' 元歸給：<select data-field="tail">';
            ti.parts.forEach(function (c) { html += '<option value="' + esc(c) + '"' + (c === tl ? ' selected' : '') + '>' + esc(pname(c)) + '</option>'; });
            html += '</select></div>';
          }
        } else if (L.type === '共同') {
          html += '<div class="msg warn" style="margin-top:8px">請先填金額，並選好誰分攤</div>';
        }
        html += '<button class="small sec" data-act="custom" style="margin-top:8px">自訂每人金額（不平均分）</button>';
      }
      html += '<label class="f">分類</label><div class="grid">';
      cats.forEach(function (c) {
        html += '<button data-act="cat" data-v="' + c.no + '" class="' + (L.catNo === c.no ? 'on' : '') + '">' + c.no + ' ' + esc(c.name) + '</button>';
      });
      html += '</div>';
      html += '<label class="f">摘要（買了什麼）</label><input type="text" data-field="item" maxlength="100" value="' + esc(L.item) + '">';
      html += '<label class="f">金額</label><input type="number" inputmode="numeric" data-field="amount" value="' + (L.amount || '') + '"></div>';
    });
    $('e-lines').innerHTML = html;
    updateSum();
  }

  function updateSum() {
    var total = E.lines.reduce(function (a, L) { return a + (L.amount > 0 ? L.amount : 0); }, 0);
    var el = $('e-sum');
    if (E.invoice) {
      var rest = E.invoice.total - total;
      if (rest === 0) msg(el, '發票總額 ' + money(E.invoice.total) + '　已全部分配 ✔', 'ok');
      else msg(el, '發票總額 ' + money(E.invoice.total) + '　已分配 ' + money(total) + '　' + (rest > 0 ? '還差 ' : '多了 ') + money(Math.abs(rest)), 'warn');
    } else msg(el, '合計 ' + money(total));
  }

  $('e-lines').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    var card = b.closest('.line'); if (!card) return;
    var i = +card.getAttribute('data-i'), L = E.lines[i], v = b.getAttribute('data-v'), act = b.getAttribute('data-act');
    if (act === 'type') { L.type = v; }
    else if (act === 'person') { L.person = v; }
    else if (act === 'cat') { L.catNo = +v; }
    else if (act === 'part') {
      var cur = resolvedParts(L), at = cur.indexOf(v);
      if (at >= 0) cur.splice(at, 1); else cur.push(v);
      L.participants = cur; L.tail = '';
    }
    else if (act === 'del') { E.lines.splice(i, 1); }
    else if (act === 'custom') {
      var ti2 = tailInfo(L), cu = {};
      ti2.parts.forEach(function (c) { cu[c] = ti2.base; });
      if (ti2.parts.length && ti2.tailAmt) {
        var tl2 = L.tail && ti2.parts.indexOf(L.tail) >= 0 ? L.tail : ti2.parts[ti2.parts.length - 1];
        cu[tl2] += ti2.tailAmt;
      }
      L.custom = cu;
    }
    else if (act === 'even') {
      L.participants = Object.keys(L.custom || {}).filter(function (c) { return L.custom[c] > 0; });
      if (!L.participants.length) L.participants = null;
      L.custom = null; L.tail = '';
    }
    else return;
    renderLines();
  });
  $('e-lines').addEventListener('input', function (ev) {
    var t = ev.target, card = t.closest('.line'); if (!card) return;
    var L = E.lines[+card.getAttribute('data-i')], f = t.getAttribute('data-field'), cc = t.getAttribute('data-custom');
    if (cc) {
      L.custom[cc] = t.value === '' ? 0 : Number(t.value);
      var box = card.querySelector('[data-customsum]');
      if (box) { box.className = 'msg ' + customCls(L); box.textContent = customText(L); }
      return;
    }
    if (f === 'item') L.item = t.value;
    else if (f === 'amount') { L.amount = t.value === '' ? 0 : Number(t.value); updateSum(); }
  });
  $('e-lines').addEventListener('change', function (ev) {
    var t = ev.target, card = t.closest('.line'); if (!card) return;
    var L = E.lines[+card.getAttribute('data-i')], f = t.getAttribute('data-field');
    if (f === 'tail') L.tail = t.value;
    if (f === 'amount') renderLines(); // 更新每人金額與尾差
  });
  $('e-date').addEventListener('change', function () {
    var d = $('e-date').value; if (!d) return;
    E.date = d;
    var act = activeRoster(d).map(function (p) { return p.code; });
    E.lines.forEach(function (L) {
      if (L.person && act.indexOf(L.person) < 0) L.person = '';
      if (L.participants) L.participants = L.participants.filter(function (c) { return act.indexOf(c) >= 0; });
      if (L.custom) Object.keys(L.custom).forEach(function (c) { if (act.indexOf(c) < 0) delete L.custom[c]; });
    });
    renderLines();
  });
  $('e-place').addEventListener('input', function () { E.place = $('e-place').value; });

  $('btn-addline').onclick = function () {
    var rest = E.invoice ? E.invoice.total - E.lines.reduce(function (a, L) { return a + (L.amount > 0 ? L.amount : 0); }, 0) : 0;
    E.lines.push(newLine({ amount: rest > 0 ? rest : 0 }));
    renderLines();
  };
  $('btn-splititems').onclick = function () {
    var first = E.lines[0];
    E.lines = E.invoice.items.map(function (it) {
      return newLine({ type: first.type, person: first.person, participants: first.participants, catNo: first.catNo,
        item: it.name, amount: Math.round((it.qty || 1) * (it.price || 0)) });
    });
    renderLines();
  };
  $('btn-edit-back').onclick = function () { E = null; goHome(); };

  function buildRequest() {
    var place = $('e-place').value.trim(), date = $('e-date').value;
    if (!date) return { error: '請選日期' };
    if (!place) return { error: '請填購買地點' };
    var lines = [];
    for (var i = 0; i < E.lines.length; i++) {
      var L = E.lines[i], at = '第 ' + (i + 1) + ' 列：';
      if (!L.type) return { error: at + '請選「個人」或「共用」' };
      if (L.type === '個人' && !L.person) return { error: at + '請選哪一位住民' };
      var parts = resolvedParts(L), custom = null;
      if (L.type === '共同' && L.custom) {
        custom = {}; parts = [];
        Object.keys(L.custom).forEach(function (c) {
          var v = L.custom[c];
          if (v > 0) { custom[c] = v; parts.push(c); }
          else if (v < 0 || (v && Math.floor(v) !== v)) custom = false;
        });
        if (custom === false) return { error: at + '每人金額要是 0 以上的整數' };
        if (!parts.length) return { error: at + '請至少填一位的金額' };
        if (customSum(L) !== L.amount) return { error: at + '每人金額加總 ' + money(customSum(L)) + '，要等於 ' + money(L.amount) };
      }
      if (L.type === '共同' && !parts.length) return { error: at + '請選誰分攤' };
      if (!L.catNo) return { error: at + '請選分類' };
      if (!L.item.trim()) return { error: at + '請填摘要' };
      if (!(L.amount > 0) || Math.floor(L.amount) !== L.amount) return { error: at + '金額要是大於 0 的整數' };
      var out = { type: L.type, date: date, catNo: L.catNo, item: L.item.trim(), place: place, amount: L.amount,
        person: L.type === '個人' ? L.person : '', participants: L.type === '共同' ? parts : [],
        tail: L.type === '共同' ? (L.tail && parts.indexOf(L.tail) >= 0 ? L.tail : parts[parts.length - 1]) : '' };
      if (custom) out.custom = custom;
      lines.push(out);
    }
    var req = { lines: lines };
    if (E.invoice) {
      var sum = lines.reduce(function (a, l) { return a + l.amount; }, 0);
      if (sum !== E.invoice.total) return { error: '各列金額加總 ' + money(sum) + '，要等於發票總額 ' + money(E.invoice.total) };
      req.invoice = { no: E.invoice.invoiceNo, sellerId: E.invoice.sellerId, total: E.invoice.total };
    }
    return { req: req };
  }

  $('btn-save').onclick = function () {
    var built = buildRequest();
    if (built.error) { msg($('e-sum'), built.error, 'bad'); return; }
    var b = $('btn-save'); b.disabled = true;
    function send(allowDup) {
      var req = Object.assign({}, built.req); if (allowDup) req.allowDuplicate = true;
      return api('save', req).then(function (res) {
        if (res.ok) { finish(res); return; }
        if (res.error === 'duplicate') {
          if (confirm('這張發票已經登記過了（序號 ' + res.serials.join('、') + '）。\n確定要再登記一次嗎？')) return send(true);
          return;
        }
        msg($('e-sum'), res.message || '儲存失敗', 'bad');
      });
    }
    send(false).then(function () { b.disabled = false; });
  };

  function finish(res) {
    var periods = {};
    res.serials.forEach(function (s) { periods[s.period] = true; });
    var one = Object.keys(periods).length === 1;
    $('done-serials').textContent = res.serials.map(function (s) { return one ? s.serial : rocLabel(s.period) + ' ' + s.serial; }).join('、');
    $('done-note').textContent = one ? ('期別：' + rocLabel(res.serials[0].period)) : '';
    E = null;
    show('done');
  }
  $('btn-again').onclick = function () { resetScan(); show('scan'); };
  $('btn-done-home').onclick = goHome;
  $('btn-manual').onclick = function () { openEditor(null); };

  // ---------- 紀錄 ----------
  var R = { period: '', periods: [] };
  function loadRecords(period) {
    api('list', { period: period || undefined }).then(function (res) {
      if (!res.ok) { alert(res.message || '讀取失敗'); return; }
      R.period = res.period; R.periods = res.periods;
      $('p-label').textContent = rocLabel(res.period);
      $('rec-sum').innerHTML = '共用合計 <b>' + money(res.sumShared) + '</b>　個人合計 <b>' + money(res.sumPersonal) + '</b>　共 ' + res.rows.length + ' 筆';
      var h = '';
      res.rows.forEach(function (r) {
        h += '<div class="rec"><div class="row"><b>#' + r.serial + '　' + esc(r.item) + '</b><b>' + money(r.amount) + '</b></div>' +
          '<div class="t">' + r.date.slice(5).replace('-', '/') + '　' + (r.type === '個人' ? '個人 ' + esc(pname(r.person)) : '共用 ' + r.count + ' 人') +
          '　' + esc(r.catName) + '　' + esc(r.place) +
          '　<button class="small bad" data-id="' + esc(r.id) + '" data-s="' + r.serial + '">刪除</button></div></div>';
      });
      $('rec-list').innerHTML = h || '<div class="sub">這個月還沒有紀錄。</div>';
    });
  }
  $('btn-records').onclick = function () { show('records'); loadRecords(''); };
  $('btn-rec-back').onclick = goHome;
  $('p-prev').onclick = function () { var i = R.periods.indexOf(R.period); if (i >= 0 && i < R.periods.length - 1) loadRecords(R.periods[i + 1]); };
  $('p-next').onclick = function () { var i = R.periods.indexOf(R.period); if (i > 0) loadRecords(R.periods[i - 1]); };
  $('rec-list').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-id]'); if (!b) return;
    if (!confirm('確定要刪除第 ' + b.getAttribute('data-s') + ' 筆嗎？\n（刪除後不會出現在報表，但試算表裡仍保留作廢紀錄）')) return;
    api('void', { id: b.getAttribute('data-id') }).then(function (res) {
      if (!res.ok) alert(res.message || '刪除失敗'); loadRecords(R.period);
    });
  });

  // ---------- 報表 ----------
  var RS = { period: '', kind: 'shared', mode: 'code', who: '', data: null, boxes: {} };
  function periodOfIso(iso) { return String(+iso.slice(0, 4) - 1911) + iso.slice(5, 7); }
  function shiftPeriod(p, d) {
    var y = +p.slice(0, 3), m = +p.slice(3) + d;
    while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; }
    return String(y) + (m < 10 ? '0' : '') + m;
  }
  function loadReport(period) {
    RS.period = period; $('r-label').textContent = rocLabel(period);
    $('rep-out').innerHTML = '<div class="sub" style="padding:20px">讀取中…</div>';
    api('report', { period: period }).then(function (res) {
      if (!res.ok) { $('rep-out').innerHTML = ''; alert(res.message || '讀取失敗'); return; }
      RS.data = res;
      var sel = $('r-who'); sel.innerHTML = '<option value="">全部住民（每人一頁）</option>' +
        res.residents.map(function (p) { return '<option value="' + esc(p.code) + '">' + esc(p.name ? p.code + ' ' + p.name : p.code) + '</option>'; }).join('');
      sel.value = RS.who;
      $('r-checks').innerHTML = res.checks.map(function (c) { return '<div class="msg ' + (c.ok ? 'ok' : 'bad') + '" style="margin-top:6px">' + (c.ok ? '✔ ' : '✘ ') + esc(c.text) + '</div>'; }).join('');
      renderReport();
    });
  }
  function renderReport() {
    var d = RS.data; if (!d) return;
    [].forEach.call($('r-kinds').querySelectorAll('button'), function (b) { b.classList.toggle('on', b.getAttribute('data-rk') === RS.kind); });
    $('r-whowrap').classList.toggle('hidden', RS.kind !== 'personal');
    $('rep-out').innerHTML = RS.kind === 'shared' ? Report.shared(d, RS.mode)
      : RS.kind === 'personal' ? Report.personal(d, RS.mode, RS.boxes, RS.who) : Report.summary(d, RS.mode);
  }
  $('btn-reports').onclick = function () { show('reports'); loadReport(RS.period || periodOfIso(cfg.today)); };
  $('r-back').onclick = goHome;
  $('r-prev').onclick = function () { loadReport(shiftPeriod(RS.period, -1)); };
  $('r-next').onclick = function () { loadReport(shiftPeriod(RS.period, 1)); };
  $('r-kinds').addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (!b) return; RS.kind = b.getAttribute('data-rk'); renderReport(); });
  $('r-who').onchange = function () { RS.who = $('r-who').value; renderReport(); };
  $('r-mode').onchange = function () { RS.mode = $('r-mode').value; renderReport(); };
  $('r-print').onclick = function () { window.print(); };
  $('rep-out').addEventListener('change', function (ev) {
    var t = ev.target, k = t.getAttribute && t.getAttribute('data-box'); if (!k) return;
    var parts = k.split('|'), key = parts[0] + '|' + parts[1];
    RS.boxes[key] = RS.boxes[key] || {}; RS.boxes[key][parts[2]] = t.checked;
  });

  // ---------- 總覽 ----------
  var OV = { period: '' };
  function loadOverview(period) {
    OV.period = period; $('o-label').textContent = rocLabel(period);
    $('o-body').innerHTML = '<div class="sub" style="padding:20px">讀取中…</div>';
    api('overview', { period: period }).then(function (o) {
      if (!o.ok) { $('o-body').innerHTML = ''; alert(o.message || '讀取失敗'); return; }
      renderOverview(o);
    });
  }
  function pdisp(p) { return p.name ? p.code + ' ' + p.name : p.code; }
  function renderOverview(o) {
    var total = o.sumShared + o.sumPersonal, bad = o.checks.filter(function (c) { return !c.ok; });
    var h = '<div class="ov-grid">' +
      '<div class="kpi"><div class="l">登記筆數</div><div class="v">' + o.count + '</div></div>' +
      '<div class="kpi"><div class="l">共用合計</div><div class="v">' + money(o.sumShared) + '</div></div>' +
      '<div class="kpi"><div class="l">個人合計</div><div class="v">' + money(o.sumPersonal) + '</div></div>' +
      '<div class="kpi"><div class="l">本月支出總計</div><div class="v">' + money(total) + '</div></div>' +
      '<div class="kpi ' + (o.negative ? 'warn' : 'ok') + '"><div class="l">餘額不足的住民</div><div class="v">' + o.negative + ' 位</div></div>' +
      '<div class="kpi ' + (bad.length ? 'bad' : 'ok') + '"><div class="l">對帳</div><div class="v">' + (bad.length ? '✘ ' + bad.length + ' 項異常' : '✔ 全部通過') + '</div></div></div>';

    // 住民表
    h += '<div class="ov-card" style="margin-bottom:12px"><h3>每位住民的收支與餘額</h3><table class="ov-t"><tr><th>住民</th><th>個人支出</th><th>共用分攤</th><th>本月支出</th><th>本月收入</th><th>上期結餘</th><th>累積餘額</th></tr>';
    o.people.forEach(function (p) {
      h += '<tr><td><b>' + esc(pdisp(p)) + '</b></td><td>' + money(p.personal) + '</td><td>' + money(p.shared) + '</td><td>' + money(p.total) +
        '</td><td>' + money(p.income) + '</td><td>' + money(p.opening) + '</td><td class="' + (p.closing < 0 ? 'neg' : 'pos') + '">' +
        (p.closing < 0 ? '−' + money(-p.closing) + '<span class="flag">不足，需補收</span>' : money(p.closing)) + '</td></tr>';
    });
    o.staff.forEach(function (p) {
      h += '<tr class="staff"><td>' + esc(pdisp(p)) + '</td><td>–</td><td>' + money(p.shared) + '</td><td>' + money(p.shared) + '</td><td>–</td><td>–</td><td>–</td></tr>';
    });
    h += '</table></div>';

    // 分類占比 ＋ 趨勢
    var cats = o.cats.filter(function (c) { return c.total > 0; }).sort(function (a, b) { return b.total - a.total; });
    var maxc = cats.length ? cats[0].total : 1;
    h += '<div class="ov-two"><div class="ov-card"><h3>各分類支出</h3>';
    if (!cats.length) h += '<div class="sub">這個月還沒有支出。</div>';
    cats.forEach(function (c) {
      var pct = total ? Math.round(c.total * 100 / total) : 0;
      h += '<div class="cb"><div>' + esc(c.no + ' ' + c.name) + '</div><div class="bar"><i style="width:' + Math.max(2, Math.round(c.total * 100 / maxc)) + '%"></i></div><div class="a">' + money(c.total) + '<span>' + pct + '%</span></div></div>';
    });
    h += '</div><div class="ov-card"><h3>近 6 個月（共用＋個人）</h3>';
    var maxs = 1; o.series.forEach(function (s) { maxs = Math.max(maxs, s.shared + s.personal); });
    h += '<div class="trend">';
    o.series.forEach(function (s) {
      var tot = s.shared + s.personal, hh = Math.round(tot * 140 / maxs);
      var hp = tot ? Math.round(hh * s.personal / tot) : 0, hs = hh - hp;
      h += '<div class="col"><div class="num">' + (tot ? money(tot) : '') + '</div><div class="stack" style="height:' + hh + 'px"><i class="ts" style="height:' + hs + 'px"></i><i class="tp" style="height:' + hp + 'px"></i></div><div class="lab">' + esc(s.label) + '</div></div>';
    });
    h += '</div><div class="legend"><span><i style="background:#1a6ed8"></i>個人</span><span><i style="background:#8fd0c6"></i>共用</span></div></div></div>';

    // 對帳
    h += '<div class="ov-card"><h3>對帳檢查</h3>' + o.checks.map(function (c) {
      return '<div class="msg ' + (c.ok ? 'ok' : 'bad') + '" style="margin-top:6px">' + (c.ok ? '✔ ' : '✘ ') + esc(c.text) + '</div>';
    }).join('') + '<div style="display:flex;gap:10px;margin-top:12px;max-width:420px"><button class="sec" id="o-to-report">前往產出這個月的報表</button><button class="sec" id="o-to-records">看這個月的紀錄</button></div></div>';
    $('o-body').innerHTML = h;
    $('o-to-report').onclick = function () { RS.period = OV.period; show('reports'); loadReport(OV.period); };
    $('o-to-records').onclick = function () { show('records'); loadRecords(OV.period); };
  }
  $('btn-overview').onclick = function () { show('overview'); loadOverview(OV.period || periodOfIso(cfg.today)); };
  $('o-back').onclick = goHome;
  $('o-prev').onclick = function () { loadOverview(shiftPeriod(OV.period, -1)); };
  $('o-next').onclick = function () { loadOverview(shiftPeriod(OV.period, 1)); };

  // ---------- 啟動 ----------
  var saved = '';
  try { saved = localStorage.getItem('mm_pass') || ''; } catch (e) {}
  if (saved) {
    tryLogin(saved, true).then(function (res) { if (!res.ok) { try { localStorage.removeItem('mm_pass'); } catch (e) {} show('login'); } });
  } else show('login');
})();
