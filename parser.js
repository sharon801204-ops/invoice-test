// 台灣電子發票 QR code 解析
// 左側 QR：前 77 碼固定欄位，其後以「:」分隔品項；右側 QR 以「**」開頭，接續左側的品項內容。

(function (root) {
  function decodeName(raw, encoding) {
    if (encoding === '2') {
      try {
        var bin = atob(raw);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder('utf-8').decode(bytes);
      } catch (e) { return raw; }
    }
    return raw;
  }

  function isRight(s) { return typeof s === 'string' && s.indexOf('**') === 0; }
  function isLeft(s) { return typeof s === 'string' && /^[A-Z]{2}\d{8}\d{7}/.test(s) && s.length >= 77; }

  function parseLeft(s) {
    if (!isLeft(s)) return null;
    var inv = s.slice(0, 10);
    var ymd = s.slice(10, 17);
    var y = parseInt(ymd.slice(0, 3), 10) + 1911;
    var m = parseInt(ymd.slice(3, 5), 10);
    var d = parseInt(ymd.slice(5, 7), 10);
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    var rest = s.slice(77);
    var f = rest.split(':');
    return {
      invoiceNo: inv,
      rocDate: ymd.slice(0, 3) + '/' + ymd.slice(3, 5) + '/' + ymd.slice(5, 7),
      isoDate: y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'),
      randomCode: s.slice(17, 21),
      salesAmount: parseInt(s.slice(21, 29), 16),
      total: parseInt(s.slice(29, 37), 16),
      buyerId: s.slice(37, 45),
      sellerId: s.slice(45, 53),
      countThisQr: parseInt(f[2], 10),
      countTotal: parseInt(f[3], 10),
      encoding: f[4],
      itemStream: f.slice(5).join(':')
    };
  }

  // left: 左側 QR 文字；right: 右側 QR 文字（可無）
  function parseInvoice(left, right) {
    var h = parseLeft(left);
    if (!h) return null;
    var stream = h.itemStream;
    if (right && isRight(right)) {
      var r = right.slice(2);
      if (r.charAt(0) === ':' && (!stream.length || stream.charAt(stream.length - 1) === ':')) r = r.slice(1);
      stream = stream + r;
    }
    var t = stream.split(':');
    if (t.length && t[t.length - 1] === '') t.pop();
    var items = [];
    for (var i = 0; i + 2 < t.length; i += 3) {
      var name = decodeName(t[i], h.encoding);
      var qty = parseFloat(t[i + 1]);
      var price = parseFloat(t[i + 2]);
      if (!name && isNaN(qty) && isNaN(price)) continue;
      items.push({ name: name, qty: isNaN(qty) ? null : qty, price: isNaN(price) ? null : price });
    }
    var sum = 0, complete = true;
    items.forEach(function (it) {
      if (it.qty == null || it.price == null) complete = false;
      else sum += Math.round(it.qty * it.price);
    });
    return {
      invoiceNo: h.invoiceNo,
      rocDate: h.rocDate,
      isoDate: h.isoDate,
      total: h.total,
      sellerId: h.sellerId,
      buyerId: h.buyerId,
      declaredItems: h.countTotal,
      items: items,
      itemsSum: sum,
      itemsComplete: complete && items.length >= (h.countTotal || 0),
      needRight: !isNaN(h.countThisQr) && !isNaN(h.countTotal) && h.countThisQr < h.countTotal && !(right && isRight(right))
    };
  }

  var api = { parseInvoice: parseInvoice, isLeft: isLeft, isRight: isRight };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EInvoice = api;
})(typeof window !== 'undefined' ? window : this);
