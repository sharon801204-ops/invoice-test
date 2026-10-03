// 三份報表的排版（輸入後端 report 資料，輸出可列印的 HTML）
(function (root) {
  var ORG = '信望愛智能發展中心', SITE = '社區居住--后里家';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function n(v) { return Number(v).toLocaleString('en-US'); }
  function dash(v) { return v ? n(v) : '-'; }
  function who(p, mode) { return mode === 'name' && p.name ? p.name : p.code; }

  function signRow() {
    return '<div class="rp-sign"><span>記錄：</span><span>主管：</span></div>';
  }

  // ---------- ① 共用清單 ----------
  function shared(d, mode) {
    var cols = d.residents.concat(d.staff), nc = cols.length;
    var h = '<div class="rp rp-land"><div class="rp-title">' + ORG + '</div><div class="rp-title2">' + SITE + '　共用清單</div>';
    h += '<div class="rp-period">期別：<span>' + esc(d.label) + '</span></div>';
    h += '<table class="rp-t rp-share"><thead><tr><th rowspan="2" style="width:48px">個人/<br>共同</th><th rowspan="2" style="width:46px">日期</th>' +
      '<th rowspan="2" style="width:36px">分<br>類</th><th rowspan="2">物　　品</th><th rowspan="2" style="width:120px">購買<br>地點</th>' +
      '<th rowspan="2" style="width:64px">金　額</th><th colspan="' + (nc + 1) + '">共同支出</th></tr><tr><th style="width:40px">分攤<br>人數</th>';
    cols.forEach(function (p) { h += '<th style="width:56px">' + esc(who(p, mode)) + '</th>'; });
    h += '</tr></thead><tbody>';
    d.shared.rows.forEach(function (r) {
      h += '<tr><td class="c">' + esc(r.type) + '</td><td class="c">' + esc(r.date) + '</td><td class="c">' + esc(r.cat) + '</td><td>' + esc(r.item) +
        '</td><td class="c">' + esc(r.place) + '</td><td class="r">' + n(r.amount) + '</td><td class="c">' + (r.count === '' ? '' : r.count) + '</td>';
      cols.forEach(function (p) {
        var v = r.type === '共同' ? r.by[p.code] : null;
        h += '<td class="r">' + (v ? n(v) : '') + '</td>';
      });
      h += '</tr>';
    });
    h += '<tr class="rp-total"><td colspan="5" class="c">共同支出合計</td><td class="r">' + n(d.shared.sharedTotal) + '</td><td></td>';
    cols.forEach(function (p) { h += '<td class="r">' + n(d.shared.sharedByPerson[p.code] || 0) + '</td>'; });
    h += '</tr>';
    h += '<tr class="rp-legend"><td colspan="' + (6 + nc + 1) + '">' + d.cats.map(function (c) { return esc(c.no + c.name); }).join('　') + '</td></tr>';
    h += '</tbody></table>' + signRow() + '</div>';
    return h;
  }

  // ---------- ② 個人購物清單（每位住民一頁）----------
  function oneSheet(d, p, mode, boxes) {
    var key = d.period + '|' + p.code;
    var st = boxes[key] || {};
    var h = '<div class="rp rp-port"><div class="rp-title">' + ORG + '</div><div class="rp-title2">' + SITE + '　個人購物清單</div>';
    h += '<div class="rp-period">姓名： <span>' + esc(who(p, mode)) + '</span></div>';
    h += '<table class="rp-t rp-pers"><thead><tr><th style="width:48px">日期</th><th style="width:44px">分類</th><th>摘　　要</th>' +
      '<th style="width:130px">購買地點</th><th style="width:70px">收入</th><th style="width:70px">支出</th></tr></thead><tbody>';
    p.rows.forEach(function (r) {
      h += '<tr><td class="c">' + esc(r.date) + '</td><td class="c">' + esc(r.cat) + '</td><td>' + esc(r.item) + '</td><td class="c">' + esc(r.place) +
        '</td><td></td><td class="r">' + n(r.expense) + '</td></tr>';
    });
    // 類別小計
    d.cats.forEach(function (c, i) {
      h += '<tr class="rp-cat">' + (i === 0 ? '<td colspan="2" rowspan="' + d.cats.length + '" class="c rp-band">個人<br>支出<br>類別</td>' : '') +
        '<td colspan="2" class="c">' + esc(c.no + c.name) + '</td><td></td><td class="r">' + dash(p.catTotals[c.no]) + '</td></tr>';
    });
    // 計算
    var calc = [];
    calc.push(['07個人支出', '', n(p.personalExpense)]);
    calc.push(['共用支出', '', n(p.sharedExpense)]);
    calc.push(['上期結餘', n(p.opening), '']);
    p.incomes.forEach(function (i) { calc.push([i.label, n(i.amount), '']); });
    var rows = calc.length + 2;
    h += '<tr class="rp-calc"><td colspan="2" rowspan="' + rows + '" class="c rp-band2">計算</td>';
    calc.forEach(function (r, i) {
      var label = i === 0 ? d.range.mm + '/01~' + d.range.mm + '/' + d.range.lastDay + '個人支出'
        : i === 1 ? d.range.mm + '/01~' + d.range.mm + '/' + d.range.lastDay + '共用支出' : r[0];
      h += (i ? '<tr class="rp-calc">' : '') + '<td colspan="2" class="c b">' + esc(label) + '</td><td class="r">' + r[1] + '</td><td class="r">' + r[2] + '</td></tr>';
    });
    h += '<tr class="rp-calc"><td colspan="2" class="c b">' + d.range.mm + '月收入、支出總計</td><td class="r">' + n(p.incomeTotal) + '</td><td class="r">' + n(p.expenseTotal) + '</td></tr>';
    h += '<tr class="rp-calc"><td colspan="2" class="c b">' + d.range.mm + '月份累積餘額</td><td colspan="2" class="r b ' + (p.closing < 0 ? 'neg' : '') + '">' + n(p.closing) + '</td></tr>';
    // 勾選與簽章
    function box(id, text) {
      return '<label class="rp-box"><input type="checkbox" data-box="' + esc(key) + '|' + id + '"' + (st[id] ? ' checked' : '') + '> ' + text + '</label>';
    }
    h += '<tr class="rp-foot"><td colspan="2">' + box('carry', '餘額結轉<br>下月') + '</td><td>' + box('short', '餘額不足，補收差額') + '</td>' +
      '<td colspan="1">' + box('refund', '餘額賸餘，<br>退還差額') + '</td><td colspan="2" class="rp-parent">家長(屬)簽章：</td></tr>';
    h += '</tbody></table>' + signRow() + '</div>';
    return h;
  }
  function personal(d, mode, boxes, only) {
    var list = d.personal.filter(function (p) { return !only || p.code === only; });
    return list.map(function (p) { return oneSheet(d, p, mode, boxes); }).join('');
  }

  // ---------- ③ 財務管理支出明細表 ----------
  function summary(d, mode) {
    var res = d.residents, st = d.staff, S = d.summary;
    var h = '<div class="rp rp-land"><div class="rp-title">' + ORG + '</div><div class="rp-title2">' + SITE + '　' + esc(d.label) + '　財務管理支出明細表</div>';
    h += '<table class="rp-t rp-sum"><thead><tr><th>分類</th><th colspan="' + (res.length * 2 + st.length + 1) + '">支　出　金　額</th></tr>';
    h += '<tr><th>住民</th>';
    res.forEach(function (p) { h += '<th colspan="2">' + esc(who(p, mode)) + '</th>'; });
    st.forEach(function (p) { h += '<th>' + esc(who(p, mode)) + '</th>'; });
    h += '<th>單項</th></tr><tr><th>項目</th>';
    res.forEach(function () { h += '<th>共用</th><th>個人</th>'; });
    st.forEach(function () { h += '<th>共用</th>'; });
    h += '<th>合計</th></tr></thead><tbody>';
    S.rows.forEach(function (r) {
      h += '<tr><td class="b">' + esc(r.no + r.name) + '</td>';
      res.forEach(function (p) { var c = r.cells[p.code]; h += '<td class="r">' + n(c.shared) + '</td><td class="r">' + n(c.personal) + '</td>'; });
      st.forEach(function (p) { h += '<td class="r">' + n(r.cells[p.code].shared) + '</td>'; });
      h += '<td class="r">' + n(r.total) + '</td></tr>';
    });
    var colspan = res.length * 2 + st.length + 2;
    for (var i = 0; i < 3; i++) h += '<tr class="rp-blank"><td colspan="' + colspan + '">&nbsp;</td></tr>';
    h += '<tr class="rp-total"><td class="c">小　　計</td>';
    res.forEach(function (p) { h += '<td class="r">' + n(S.subtotal[p.code].shared) + '</td><td class="r">' + n(S.subtotal[p.code].personal) + '</td>'; });
    st.forEach(function (p) { h += '<td class="r">' + n(S.subtotal[p.code].shared) + '</td>'; });
    h += '<td class="r">' + n(S.grand) + '</td></tr>';
    h += '<tr class="rp-total"><td class="c">本月合計</td>';
    res.forEach(function (p) { h += '<td colspan="2" class="c">' + n(S.monthTotal[p.code]) + '</td>'; });
    st.forEach(function (p) { h += '<td class="c">' + n(S.monthTotal[p.code]) + '</td>'; });
    h += '<td class="r">' + n(S.grand) + '</td></tr></tbody></table>' + signRow() + '</div>';
    return h;
  }

  var api = { shared: shared, personal: personal, summary: summary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Report = api;
})(typeof window !== 'undefined' ? window : this);
