const { parseInvoice } = require('./parser.js');
const assert = require('assert');

const head = 'AB11223344' + '1150703' + '9999' + '00000144' + '00000154' + '00000000' + '12345678' + 'ydXZt4LAN1UHN/j1juVcRA==';
assert.strictEqual(head.length, 77);

// 1. 單一 QR，品項完整（UTF-8 編碼 1）
let left = head + ':**********:2:2:1:洗衣精補充包:1:114:無糖麥茶:2:113:';
let r = parseInvoice(left, null);
assert.strictEqual(r.invoiceNo, 'AB11223344');
assert.strictEqual(r.isoDate, '2026-07-03');
assert.strictEqual(r.rocDate, '115/07/03');
assert.strictEqual(r.total, 340);
assert.strictEqual(r.sellerId, '12345678');
assert.strictEqual(r.items.length, 2);
assert.strictEqual(r.items[0].name, '洗衣精補充包');
assert.strictEqual(r.itemsSum, 114 + 226);
assert.strictEqual(r.needRight, false);

// 2. 左 QR 只含部分品項，需要右 QR
left = head + ':**********:1:2:1:洗衣精補充包:1:114:';
r = parseInvoice(left, null);
assert.strictEqual(r.needRight, true);
r = parseInvoice(left, '**:無糖麥茶:2:113:');
assert.strictEqual(r.needRight, false);
assert.strictEqual(r.items.length, 2);
assert.strictEqual(r.items[1].name, '無糖麥茶');
assert.strictEqual(r.items[1].qty, 2);
assert.strictEqual(r.items[1].price, 113);
assert.strictEqual(r.itemsSum, 340);
// 右側 QR 沒有前導冒號的寫法
r = parseInvoice(left, '**無糖麥茶:2:113:');
assert.strictEqual(r.items.length, 2);
assert.strictEqual(r.items[1].name, '無糖麥茶');
assert.strictEqual(r.itemsSum, 340);

// 3. Base64 編碼（2）
const b64 = s => Buffer.from(s, 'utf-8').toString('base64');
left = head + ':**********:1:1:2:' + b64('牛奶') + ':1:68:';
r = parseInvoice(left, null);
assert.strictEqual(r.items[0].name, '牛奶');

// 4. 非發票文字
assert.strictEqual(parseInvoice('https://example.com', null), null);

console.log('全部測試通過');
