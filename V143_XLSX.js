/* V143 – Đọc/ghi Excel (.xlsx) không cần thư viện ngoài.
 * GHI: mọi ô là chuỗi "inlineStr" → giữ nguyên số 0 đầu của số điện thoại và Excel KHÔNG bao giờ coi ô là công thức (chống tiêm công thức).
 * ĐỌC: giải nén bằng DecompressionStream của trình duyệt (Chrome/Edge/Safari 16.4+/Firefox 113+). */
(function () {
  'use strict';
  const enc = new TextEncoder(), dec = new TextDecoder('utf-8');
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const xmlEsc = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

  function zip(files) { // files: [{name, data:Uint8Array}] – lưu không nén (method 0)
    const parts = [], central = []; let offset = 0;
    const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
    for (const f of files) {
      const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const local = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0)]);
      parts.push(local, name, f.data);
      central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
      offset += local.length + name.length + size;
    }
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
    return new Blob([...parts, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function write(rows, sheetName) {
    const name = xmlEsc(String(sheetName || 'Sheet1').replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 31) || 'Sheet1');
    const widths = rows[0] ? rows[0].map((_, i) => Math.min(60, Math.max(10, ...rows.slice(0, 200).map(r => String(r[i] == null ? '' : r[i]).length + 2)))) : [];
    const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' +
      widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols><sheetData>' +
      rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => v === '' || v == null ? '' : `<c r="${colName(ci)}${ri + 1}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`).join('') + '</row>').join('') + '</sheetData></worksheet>';
    const files = [
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
      ['xl/worksheets/sheet1.xml', sheet]
    ].map(([n, x]) => ({ name: n, data: enc.encode(x) }));
    return zip(files);
  }

  async function inflate(bytes) { const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')); return new Uint8Array(await new Response(s).arrayBuffer()); }
  async function unzip(buf) {
    const b = new Uint8Array(buf), dv = new DataView(b.buffer, b.byteOffset, b.byteLength); let e = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('Tệp không phải Excel (.xlsx) hợp lệ.');
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = {};
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Tệp Excel bị hỏng.');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = dec.decode(b.subarray(p + 46, p + 46 + nl)); p += 46 + nl + el + cl;
      if (!/^(xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^\/]+\.xml))$/.test(name)) continue;  // chỉ đọc các phần cần thiết
      const lnl = dv.getUint16(lo + 26, true), lel = dv.getUint16(lo + 28, true), data = b.subarray(lo + 30 + lnl + lel, lo + 30 + lnl + lel + csize);
      if (csize > 50 * 1024 * 1024) throw new Error('Tệp Excel quá lớn.');
      out[name] = dec.decode(method === 0 ? data : method === 8 ? await inflate(data) : (() => { throw new Error('Kiểu nén Excel không hỗ trợ.'); })());
    }
    return out;
  }
  const colIndex = ref => { const m = /^([A-Z]+)/.exec(ref || ''); let n = 0; for (const ch of m ? m[1] : 'A') n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

  async function read(buf) {
    const f = await unzip(buf), P = new DOMParser();
    const doc = x => { const d = P.parseFromString(x, 'application/xml'); if (d.querySelector('parsererror')) throw new Error('Tệp Excel bị hỏng (XML).'); return d; };
    const shared = f['xl/sharedStrings.xml'] ? [...doc(f['xl/sharedStrings.xml']).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
    let target = null;
    if (f['xl/workbook.xml'] && f['xl/_rels/workbook.xml.rels']) {
      const first = doc(f['xl/workbook.xml']).getElementsByTagName('sheet')[0], rid = first && (first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
      const rel = [...doc(f['xl/_rels/workbook.xml.rels']).getElementsByTagName('Relationship')].find(r => r.getAttribute('Id') === rid);
      if (rel) target = 'xl/' + rel.getAttribute('Target').replace(/^\/?(xl\/)?/, '');
    }
    const key = (target && f[target]) ? target : Object.keys(f).find(k => /^xl\/worksheets\//.test(k));
    if (!key) throw new Error('Không tìm thấy trang tính trong tệp Excel.');
    const rows = [];
    for (const r of doc(f[key]).getElementsByTagName('row')) {
      const row = []; let any = false;
      for (const c of r.getElementsByTagName('c')) {
        const t = c.getAttribute('t'), idx = colIndex(c.getAttribute('r')); let v = '';
        if (t === 'inlineStr') v = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
        else { const ve = c.getElementsByTagName('v')[0]; v = ve ? ve.textContent : ''; if (t === 's') v = shared[+v] == null ? '' : shared[+v]; else if (t === 'b') v = v === '1' ? 'TRUE' : 'FALSE'; else if (t !== 'str' && t !== 'e' && v !== '') v = { num: v }; }
        row[idx] = v; if (v !== '' && v != null) any = true;
      }
      for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = '';
      rows.push(any ? row : []);
      if (rows.length > 20000) throw new Error('Tệp có quá nhiều dòng (tối đa 20.000).');
    }
    return rows;   // ô số được trả dạng {num:'...'} để nơi gọi tự quyết (ngày serial, số điện thoại…)
  }
  window.BALANG_XLSX = { write, read, _zip: zip, _crc32: crc32 };
})();
