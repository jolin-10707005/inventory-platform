/* 此檔為 script.js 用 Babel 預先編譯 JSX 產生，瀏覽器直接執行、不再即時轉譯。
 * 请勿手動編輯本檔——改 script.js 後重新編譯即可（見 scripts/compile.js 或專案說明）。
 */
/* ============================================================
 * 日翊外盤平台 - 前端核心邏輯（React + Tailwind 原型）
 * 功能模組：
 *   1. 下載區   DownloadZone  - 下載各店鋪盤點主檔 / 庫存檔 / 盤點手冊
 *   2. 填寫區   FillZone      - 記錄盤點作業時間 / 件數人數 / 特殊狀況 / 照片
 *   3. 上傳區   UploadZone    - 上傳客戶主檔並依店鋪格式產製各店主檔（庫存檔）
 *   4. 數據分析區 AnalysisZone - 作業效率分析 + 請款資料（依品牌/店鋪單價）
 *   5. 維護區   MaintainZone  - 品牌 / 店鋪名單 / 盤點人員 / 單價設定（Excel 匯入或單筆新增）
 * 權限：盤點人員僅可使用「下載區 / 填寫區」，管理者可使用全部功能
 * 資料：透過 api.js 存取（localStorage 或 Google Sheets/Drive，可切換）
 *       // TODO: 未來改接日翊資料庫時，只需修改 api.js（見 openspec/api-interface.json）
 *
 * ⚠ 這是原始碼（含 JSX）；瀏覽器實際載入、執行的是編譯過的 script.compiled.js（app.html 指定）。
 *   改完這支檔案後，務必重新編譯（Babel + @babel/preset-react，classic runtime）產生新的
 *   script.compiled.js 再推送，否則線上畫面不會反映這次修改。
 * ============================================================ */

const {
  useState,
  useEffect,
  useMemo,
  useRef
} = React;

/* ---------------- Mock Data（範例資料，禁止填入真實個資） ---------------- */
const CURRENT_MONTH = "2026-07";
const seedDB = {
  brands: [{
    id: "B01",
    name: "歐聖"
  }, {
    id: "B02",
    name: "英斯伯"
  }, {
    id: "B03",
    name: "歐都納"
  }],
  stores: [{
    id: "S001",
    brandId: "B01",
    month: CURRENT_MONTH,
    code: "AS-001",
    name: "微風本館 JV",
    div: "一部",
    dept: "北一課",
    category: "JV",
    enName: "JV BREEZE MAIN",
    warehouse: "1"
  }, {
    id: "S002",
    brandId: "B01",
    month: CURRENT_MONTH,
    code: "AS-002",
    name: "微風南山 JV",
    div: "一部",
    dept: "北一課",
    category: "JV",
    enName: "JV BREEZE NANSHAN",
    warehouse: "1"
  }, {
    id: "S003",
    brandId: "B01",
    month: CURRENT_MONTH,
    code: "AS-003",
    name: "桃園統領 JV",
    div: "二部",
    dept: "中區課",
    category: "JV",
    enName: "JV GLORIA TAOYUAN",
    warehouse: "1"
  }, {
    id: "S004",
    brandId: "B02",
    month: CURRENT_MONTH,
    code: "IB-001",
    name: "英斯伯-信義店",
    dept: "北一課"
  }, {
    id: "S005",
    brandId: "B02",
    month: CURRENT_MONTH,
    code: "IB-002",
    name: "英斯伯-板橋店",
    dept: "北二課"
  }, {
    id: "S006",
    brandId: "B03",
    month: CURRENT_MONTH,
    code: "AT-001",
    name: "歐都納-南港店",
    dept: "北一課"
  }, {
    id: "S007",
    brandId: "B03",
    month: CURRENT_MONTH,
    code: "AT-002",
    name: "歐都納-新竹店",
    dept: "北二課"
  }],
  staff: [{
    id: "P001",
    brandId: "B01",
    month: CURRENT_MONTH,
    div: "一部",
    dept: "北一課",
    empNo: "E001",
    name: "王小明（範例）",
    title: "資深專員"
  }, {
    id: "P002",
    brandId: "B01",
    month: CURRENT_MONTH,
    div: "一部",
    dept: "北二課",
    empNo: "E002",
    name: "李小華（範例）",
    title: "專員"
  }, {
    id: "P003",
    brandId: "B02",
    month: CURRENT_MONTH,
    div: "一部",
    dept: "北一課",
    empNo: "E003",
    name: "張小美（範例）",
    title: "專員"
  }, {
    id: "P004",
    brandId: "B03",
    month: CURRENT_MONTH,
    div: "二部",
    dept: "台中課",
    empNo: "E004",
    name: "陳小強（範例）",
    title: "課長"
  }],
  // 單價設定：一個品牌一個價。priceType = "piece"（依件數）或 "hour"（依人時）
  // 英斯伯(B02)另有 docFee(文件處理費)、otFee(超時費)，每場加收
  // 歐聖(B01)另有 costRate(專員成本，元/時)，供作業分析「損益分析」分頁算成本/毛利
  prices: [{
    brandId: "B01",
    priceType: "piece",
    unitPrice: 2.2,
    minCharge: 5000,
    whFee: 500,
    costRate: 315
  }, {
    brandId: "B02",
    priceType: "hour",
    unitPrice: 320,
    docFee: 500,
    otFee: 200
  }, {
    brandId: "B03",
    priceType: "piece",
    unitPrice: 0.6
  }],
  // 填寫區作業紀錄（範本 6 時間點：進店/存貨開始/存貨結束/找差異開始/找差異結束/離店）
  records: [{
    id: "R001",
    brandId: "B01",
    storeId: "S001",
    month: CURRENT_MONTH,
    date: "2026-07-05",
    headcount: 2,
    pieces: 688,
    arriveTime: "7:50",
    countStart: "8:00",
    countEnd: "8:55",
    diffStart: "9:00",
    diffEnd: "9:05",
    leaveTime: "9:15",
    special: "",
    photos: [],
    filledBy: "王小明（範例）"
  }, {
    id: "R002",
    brandId: "B02",
    storeId: "S004",
    month: CURRENT_MONTH,
    date: "2026-07-06",
    headcount: 3,
    pieces: 2841,
    arriveTime: "7:55",
    countStart: "8:00",
    countEnd: "10:04",
    diffStart: "10:10",
    diffEnd: "10:22",
    leaveTime: "10:45",
    special: "",
    photos: [],
    filledBy: "張小美（範例）"
  }],
  uploads: [],
  // 上傳區：客戶主檔上傳紀錄
  aliases: [],
  // 店名對應記憶（庫存檔用）：{ brandId, key(正規化欄標題), storeId }
  categoryAliases: [],
  // 種類對應記憶（主檔用，跟店鋪對應分開存）：{ brandId, key(正規化欄標題), category }
  manuals: [],
  // 盤點手冊：{ brandId, fileName, fileUrl, uploadedAt }（一品牌一份，不分店鋪種類）
  layouts: [],
  // Layout 圖：{ storeId, month, fileName, fileUrl, uploadedAt }（一店一份，只列主店不含分倉，原檔存 Drive）
  countTotals: [],
  // 盤點總表：{ storeId, month, fileName, fileUrl, total, uploadedAt }（一店一檔，原檔存 Drive，只擷取「合計盤點總數」）
  opsMargins: [] // 作業分析「損益分析」歷史毛利%：{ brandId, storeId, month, marginPercent }，每次匯出時存當月各店毛利%，供下個月匯出時查「上期毛利%」
};

/* ---------------- 資料存取（透過 api.js 抽象層） ----------------
 * 維護類資料（單一管理者編輯）→ 整表覆蓋（ADMIN_TABS）
 * 盤點/上傳紀錄（多裝置同時新增）→ 逐筆 append，避免互相覆蓋
 */
const ADMIN_TABS = ["brands", "stores", "staff", "prices", "aliases", "categoryAliases", "manuals", "layouts", "countTotals", "opsMargins"];
const ALL_TABS = [...ADMIN_TABS, "records", "uploads"];
function seed() {
  return JSON.parse(JSON.stringify(seedDB));
}

/* ---------------- 共用工具 ---------------- */
function uid(prefix) {
  return prefix + Math.random().toString(36).slice(2, 8).toUpperCase();
}

// 計算作業時數（跨夜自動 +24h）
function calcHours(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return Math.round(mins / 60 * 100) / 100;
}

// "YYYY-MM-DD" → Excel 日期序號（1899-12-30 為第 0 天，含 1900 閏年 bug 修正的標準算法）；轉出檔要用真正的日期格式，不能是純文字
function dateToExcelSerial(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((d.getTime() - epoch) / 86400000);
}
// "H:MM" 文字時間 → Excel 時間序號（一天的比例 0~1），轉出檔要用真正的時間格式
function timeStrToFrac(timeStr) {
  const m = String(timeStr || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return (Number(m[1]) * 60 + Number(m[2])) / 1440;
}

// 後端（Google Sheets 純文字格式）讀回的數值/布林為字串，統一轉型
function num(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}
function truthy(v) {
  return v === true || v === 1 || v === "1" || v === "true" || v === "TRUE" || v === "是";
}

// 欄位篩選：filters 為 { 欄位鍵: 關鍵字 }，全部符合（不分大小寫子字串）才保留
function matchFilters(row, filters) {
  return Object.keys(filters).every(k => {
    const kw = filters[k];
    if (!kw) return true;
    return String(row[k] == null ? "" : row[k]).toLowerCase().includes(String(kw).toLowerCase());
  });
}

/* ---------------- Excel（.xlsx）匯入 / 匯出（SheetJS） ---------------- */
// 防公式注入：字串開頭為 = + - @ 時加前綴 '（即使 xlsx 以文字寫入仍多一層保險）
function safeCell(v) {
  if (typeof v === "string" && /^[=+\-@]/.test(v)) return "'" + v;
  return v == null ? "" : v;
}

// 匯出 .xlsx；aoa = 二維陣列（第一列為表頭）
// opts.asText = true 時，所有儲存格強制為文字格式（主檔／庫存檔需求）
function exportXLSX(filename, sheetName, aoa, opts) {
  const asText = opts && opts.asText;
  const clean = aoa.map(row => row.map(v => asText ? v == null ? "" : String(v) : safeCell(v)));
  const ws = XLSX.utils.aoa_to_sheet(clean);
  if (asText) {
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cell = ws[XLSX.utils.encode_cell({
          r: R,
          c: C
        })];
        if (cell) {
          cell.t = "s";
          cell.z = "@";
        }
      }
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (sheetName || "工作表1").slice(0, 31));
  XLSX.writeFile(wb, filename);
}

// 由二維陣列建工作表；儲存格 {f:"公式", v:快取值, z:數字格式} 寫成 Excel 公式（保留公式、開檔即顯示值、編輯可重算）；
// {v:數字, z:數字格式} 用於日期/時間等「非公式但要用特定格式顯示」的欄位（z 例："yyyy-mm-dd"、"h:mm"）
function wsFromMatrix(matrix) {
  const ws = {};
  let maxC = 0;
  matrix.forEach((row, r) => row.forEach((cell, c) => {
    const a = XLSX.utils.encode_cell({
      r,
      c
    });
    if (cell && typeof cell === "object" && "f" in cell) {
      ws[a] = {
        t: cell.t || "n",
        f: cell.f,
        v: cell.v == null ? 0 : cell.v
      };
      if (cell.z) ws[a].z = cell.z;
    } else if (cell && typeof cell === "object" && "z" in cell) {
      ws[a] = {
        t: "n",
        v: cell.v == null ? 0 : cell.v,
        z: cell.z
      };
    } else if (typeof cell === "number") ws[a] = {
      t: "n",
      v: cell
    };else ws[a] = {
      t: "s",
      v: cell == null ? "" : String(cell)
    };
    if (c > maxC) maxC = c;
  }));
  ws["!ref"] = XLSX.utils.encode_range({
    s: {
      r: 0,
      c: 0
    },
    e: {
      r: Math.max(0, matrix.length - 1),
      c: maxC
    }
  });
  return ws;
}

// 標準主檔／庫存檔輸出欄位（順序、名稱需與客戶範本一致；庫存數量為數量欄）
const MASTER_COLS = ["商品編號", "barcode", "舊商品編號2", "物品名稱", "庫存數量", "品項平均成本"];
const QTY_COL = "庫存數量";
const CODE_COL = "商品編號"; // A 欄，不可重複

// 日翊盤點中心組織（部別、課別；順序即顯示/報表順序）
const ORG = [{
  div: "一部",
  depts: ["北一課", "北二課", "北三課", "北四課", "桃竹課"]
}, {
  div: "二部",
  depts: ["台中課", "嘉南課", "高屏課"]
}, {
  div: "業務部",
  depts: ["業務課", "訓練課"]
}];
const DEPT_TO_DIV = {};
ORG.forEach(o => o.depts.forEach(d => {
  DEPT_TO_DIV[d] = o.div;
}));
const DEPT_ORDER = ORG.reduce((a, o) => a.concat(o.depts), []);
const deptRank = d => {
  const i = DEPT_ORDER.indexOf(d);
  return i < 0 ? 999 : i;
};
// 課別下拉選項依組織順序排序
function distinctDepts(rows, key) {
  return Array.from(new Set(rows.map(r => String(r[key] == null ? "" : r[key])).filter(v => v !== ""))).sort((a, b) => deptRank(a) - deptRank(b) || a.localeCompare(b));
}

// 歐聖客戶主檔為「寬表」：固定商品欄 + 其後每欄一個店鋪/倉別
const OSHENG_FIXED_COLS = ["商品條碼", "STYLENUMBER", "STYLE_NAME", "尺寸", "顏色", "零售價"];
const isOshengBrand = brand => !!brand && brand.name === "歐聖";

// 是否為整數字串
function isIntStr(v) {
  const s = String(v == null ? "" : v).trim();
  return s === "" || /^-?\d+$/.test(s);
}

// 從客戶檔名解析日期，例 "TW JEW_6Jan26-原" → "20260106"（找不到回空字串）
const MON3 = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12
};
function parseDateFromName(fn) {
  const m = String(fn || "").match(/(\d{1,2})\s*([A-Za-z]{3,})\s*(\d{2,4})/);
  if (!m) return "";
  const d = +m[1],
    mo = MON3[m[2].slice(0, 3).toLowerCase()],
    y = m[3].length <= 2 ? 2000 + +m[3] : +m[3];
  if (!mo) return "";
  return "" + y + String(mo).padStart(2, "0") + String(d).padStart(2, "0");
}
// 找第一個重複值（找不到回傳 null）
function firstDup(arr) {
  const seen = new Set();
  for (const x of arr) {
    const k = String(x);
    if (seen.has(k)) return k;
    seen.add(k);
  }
  return null;
}
// 店名正規化後比對（英文店名 ← 客戶檔欄標題，容許大小寫/空白/底線/連字差異）
function normName(s) {
  return String(s == null ? "" : s).toLowerCase().replace(/[\s_\-\.]+/g, "");
}
function findStoreByEnName(stores, header) {
  const h = normName(header);
  if (!h) return null;
  let s = stores.find(x => normName(x.enName) === h);
  if (s) return s;
  s = stores.find(x => x.enName && (normName(x.enName).includes(h) || h.includes(normName(x.enName))));
  return s || null;
}

// 讀取上傳的 .xlsx / .xls；回傳 { headers:[...], rows:[{欄名:值}] }
function readXLSX(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, {
          type: "array"
        });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          defval: "",
          raw: false
        });
        const headers = (aoa[0] || []).map(h => String(h).trim()).filter(h => h !== "");
        const rows = aoa.slice(1).filter(r => r.some(c => String(c).trim() !== "")).map(r => {
          const o = {};
          headers.forEach((h, i) => {
            o[h] = r[i] == null ? "" : r[i];
          });
          return o;
        });
        resolve({
          headers,
          rows
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// 讀取 .xlsx / .xls 為原始二維陣列（不做表頭對應），供掃描檔案中固定文字標籤（如「合計盤點總數」）用
function readXLSXMatrix(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, {
          type: "array"
        });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws, {
          header: 1,
          defval: "",
          raw: false
        }));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// 在二維陣列中找指定文字標籤，回傳其右邊相鄰欄的數字（找不到回 null）；盤點總表用此擷取「合計盤點總數」
function findLabeledTotal(aoa, label) {
  for (const row of aoa) {
    for (let i = 0; i < row.length - 1; i++) {
      if (String(row[i]).trim() === label) {
        const n = Number(String(row[i + 1]).trim());
        return isNaN(n) ? null : n;
      }
    }
  }
  return null;
}

// 將後端回傳的 base64 內容觸發瀏覽器下載（mime 預設 zip）
function downloadBase64File(filename, base64, mime) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: mime || "application/zip"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function downloadBase64Zip(filename, base64) {
  downloadBase64File(filename, base64, "application/zip");
}

// 批次下載一批「一檔一店」的原始檔案：雲端模式交由後端打包成單一 zip（避免瀏覽器端抓 Drive 檔案的 CORS 限制）；
// 本機開發模式（無 Drive）則改為依序逐個觸發下載
async function bulkDownloadFiles(list, zipBaseName, toast, asLayoutPdf) {
  if (list.length === 0) {
    toast("本月尚無已上傳的檔案");
    return;
  }
  if (InventoryAPI.cloud()) {
    try {
      const z = await InventoryAPI.zipFiles(list.map(l => ({
        fileUrl: l.fileUrl,
        fileName: l.fileName
      })), zipBaseName, asLayoutPdf);
      if (z) {
        downloadBase64Zip(z.filename, z.base64);
        toast(`已下載本月 ${list.length} 份檔案（zip）✔`);
        return;
      }
    } catch (err) {
      toast("打包下載失敗，請確認網路後再試");
      return;
    }
  }
  list.forEach((l, i) => {
    setTimeout(() => {
      const a = document.createElement("a");
      a.href = l.fileUrl;
      a.download = l.fileName;
      a.target = "_blank";
      a.rel = "noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }, i * 400); // 間隔觸發，降低瀏覽器擋下多重下載的機率
  });
  toast(`已觸發下載本月 ${list.length} 份檔案`);
}

/* ---------------- 共用元件 ---------------- */
// 欄位篩選輸入框（放在表頭下方一列）
function FilterInput({
  value,
  onChange,
  placeholder
}) {
  return /*#__PURE__*/React.createElement("input", {
    value: value || "",
    onChange: e => onChange(e.target.value),
    placeholder: placeholder || "篩選…",
    className: "w-full px-2 py-1 border border-slate-200 rounded text-xs font-normal text-slate-700 focus:ring-1 focus:ring-blue-400 outline-none"
  });
}

// 下拉選單式篩選（選項為該欄不重複值）
function FilterSelect({
  value,
  onChange,
  options
}) {
  return /*#__PURE__*/React.createElement("select", {
    value: value || "",
    onChange: e => onChange(e.target.value),
    className: "w-full px-2 py-1 border border-slate-200 rounded text-xs font-normal text-slate-700 bg-white focus:ring-1 focus:ring-blue-400 outline-none"
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "全部"), options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o,
    value: o
  }, o)));
}
// 取某欄不重複值（排序）供下拉選單
function distinctVals(rows, key) {
  return Array.from(new Set(rows.map(r => String(r[key] == null ? "" : r[key])).filter(v => v !== ""))).sort();
}

// 依店名排序：分倉命名為「主店名_倉別」，字串排序會讓主店與分倉自然相鄰
function sortStoresByName(arr) {
  return [...arr].sort((a, b) => String(a.name).localeCompare(String(b.name), "zh-Hant"));
}

// 依盤點日期→店號排序（主檔下載區使用）
function sortStoresByDateCode(arr) {
  return [...arr].sort((a, b) => {
    const d = String(a.auditDate || "").localeCompare(String(b.auditDate || ""));
    if (d !== 0) return d;
    return String(a.code || "").localeCompare(String(b.code || ""));
  });
}

// 產生不重複、合法的 Excel 分頁名稱（≤31字元、去除非法字元），供多分頁匯出使用
function makeSheetNamer() {
  const used = new Set();
  return base => {
    const clean = String(base || "sheet").replace(/[:\\/?*[\]]/g, "_");
    let name = clean.slice(0, 31) || "sheet";
    let i = 1;
    while (used.has(name)) {
      i++;
      const suf = "_" + i;
      name = clean.slice(0, 31 - suf.length) + suf;
    }
    used.add(name);
    return name;
  };
}
function Toast({
  msg
}) {
  if (!msg) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "toast bg-slate-800 text-white text-sm px-5 py-3 rounded-xl shadow-lg"
  }, msg);
}
function SectionCard({
  title,
  subtitle,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-2xl shadow-sm border border-slate-200 p-6 fade-in"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-lg font-bold text-slate-800"
  }, title), subtitle && /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-500 mt-1"
  }, subtitle), /*#__PURE__*/React.createElement("div", {
    className: "mt-4"
  }, children));
}

// 品牌 → 店鋪 連動選擇器（平台規則：各區域先選品牌再選店鋪）
function BrandStoreSelect({
  db,
  brandId,
  storeId,
  month,
  onBrand,
  onStore,
  showStore = true
}) {
  const stores = db.stores.filter(s => s.brandId === brandId && s.month === month);
  return /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-3"
  }, /*#__PURE__*/React.createElement("select", {
    value: brandId,
    onChange: e => onBrand(e.target.value),
    className: "px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "— 請選擇品牌 —"), db.brands.map(b => /*#__PURE__*/React.createElement("option", {
    key: b.id,
    value: b.id
  }, b.name))), showStore && /*#__PURE__*/React.createElement("select", {
    value: storeId,
    onChange: e => onStore(e.target.value),
    disabled: !brandId,
    className: "px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white disabled:bg-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "— 請選擇店鋪 —"), stores.map(s => /*#__PURE__*/React.createElement("option", {
    key: s.id,
    value: s.id
  }, s.code, " ", s.name))));
}

/* ============================================================
 * 1. 主檔下載：各店盤點主檔 / 庫存檔 / 盤點手冊
 * ============================================================ */
function DownloadZone({
  db,
  month,
  setMonth,
  toast
}) {
  const [brandId, setBrandId] = useState("");
  const [busy, setBusy] = useState("");
  const [filters, setFilters] = useState({});
  const setF = (k, v) => setFilters(p => ({
    ...p,
    [k]: v
  }));
  const index = db.mastersIndex || [];
  const brand = db.brands.find(b => b.id === brandId);
  const osheng = isOshengBrand(brand);

  // 歐聖主檔以「店鋪種類」為單位（storeId=CAT::種類）；其他品牌主檔為單店
  const masterKey = s => osheng ? "CAT::" + (s.category || "") : s.id;
  const has = (storeId, type) => index.some(m => m.storeId === storeId && m.month === month && m.type === type);

  // 分倉標示：分倉列顯示倉別後綴（如「台中三井_Destroy」→「Destroy」），主店列顯示「主店」
  const whLabel = s => s.isSub ? s.name.slice(s.name.lastIndexOf("_") + 1) : "主店";
  const baseStores = db.stores.filter(s => s.brandId === brandId && s.month === month).map(s => ({
    ...s,
    whLabel: whLabel(s),
    masterStatus: has(masterKey(s), "master") ? "可下載" : "尚未產製",
    stockStatus: has(s.id, "stock") ? "可下載" : "尚未產製"
  }));
  const stores = sortStoresByDateCode(baseStores.filter(s => matchFilters(s, filters)));

  // 下載：輸出上傳時已重建好的標準格式（全部文字）；主檔取店鋪種類、庫存檔取單店
  const download = async (store, type) => {
    const label = type === "master" ? "主檔" : "庫存檔";
    const key = type === "master" ? masterKey(store) : store.id;
    const namePart = type === "master" && osheng ? store.category || store.name : store.name;
    setBusy(store.id + type);
    try {
      const m = await InventoryAPI.getMaster(key, month, type);
      if (!m || !m.columns || m.columns.length === 0) {
        toast(`查無此${label}，請重新整理或請管理者上傳`);
        return;
      }
      const rows = m.rows.map(r => m.columns.map(c => r[c] == null ? "" : r[c]));
      let filename;
      if (type === "stock") {
        // 庫存檔：店號店名-結轉用-庫存件數（庫存件數＝該店庫存數量欄加總）
        // 祥豐倉（category==="祥豐倉"）例外：只要「店名-結轉用-件數」，不加店號
        const totalQty = m.rows.reduce((a, r) => a + num(r[QTY_COL]), 0);
        const prefix = store.category === "祥豐倉" ? "" : store.code || "";
        filename = `${prefix}${store.name}-結轉用-${totalQty}.xlsx`;
      } else {
        const idxEntry = index.find(x => x.storeId === key && x.month === month && x.type === type);
        const dateStr = idxEntry && idxEntry.srcDate ? idxEntry.srcDate : new Date().toISOString().slice(0, 10).replace(/-/g, "");
        filename = `${brand ? brand.name : ""}盤點用${label}-${namePart}-${dateStr}.xlsx`;
      }
      exportXLSX(filename, label, [m.columns, ...rows], {
        asText: true
      });
      toast(`已下載 ${namePart} ${label}（${m.rows.length} 筆）`);
    } catch (e) {
      toast("下載失敗，請確認網路後再試");
    } finally {
      setBusy("");
    }
  };
  const cell = (s, type) => (type === "master" ? has(masterKey(s), "master") : has(s.id, "stock")) ? /*#__PURE__*/React.createElement("button", {
    disabled: busy === s.id + type,
    onClick: () => download(s, type),
    className: "px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white rounded-lg"
  }, busy === s.id + type ? "下載中…" : "⬇ 下載") : /*#__PURE__*/React.createElement("span", {
    className: "text-slate-400"
  }, "尚未產製");
  return /*#__PURE__*/React.createElement(SectionCard, {
    title: "📥 主檔下載",
    subtitle: "下載各盤點店鋪的盤點主檔、庫存檔（Excel）及盤點手冊；各欄用選單篩選"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-3 items-center"
  }, /*#__PURE__*/React.createElement(BrandStoreSelect, {
    db: db,
    brandId: brandId,
    month: month,
    onBrand: setBrandId,
    showStore: false
  }), /*#__PURE__*/React.createElement("input", {
    type: "month",
    value: month,
    onChange: e => setMonth(e.target.value),
    title: "盤點月份",
    className: "px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
  })), brand && (() => {
    const manual = (db.manuals || []).find(m => m.brandId === brandId);
    return /*#__PURE__*/React.createElement("div", {
      className: "mt-4 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-2xl"
    }, "📘"), /*#__PURE__*/React.createElement("div", {
      className: "flex-1"
    }, /*#__PURE__*/React.createElement("div", {
      className: "font-medium text-slate-800"
    }, brand.name, " 盤點手冊"), /*#__PURE__*/React.createElement("div", {
      className: "text-xs text-slate-500"
    }, manual ? `品牌通用作業手冊（PDF）・上傳日期 ${manual.uploadedAt}` : "尚未上傳手冊，請至維護區上傳")), manual ? /*#__PURE__*/React.createElement("a", {
      href: manual.fileUrl,
      target: "_blank",
      rel: "noreferrer",
      className: "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
    }, "下載手冊") : /*#__PURE__*/React.createElement("button", {
      disabled: true,
      className: "px-4 py-2 bg-slate-300 text-white text-sm rounded-lg cursor-not-allowed"
    }, "尚未上傳"));
  })(), brandId && /*#__PURE__*/React.createElement("div", {
    className: "table-scroll mt-4"
  }, /*#__PURE__*/React.createElement("table", {
    className: "w-full text-sm"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    className: "text-left text-slate-500 border-b"
  }, /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "盤點日期"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "店鋪代碼"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "店鋪名稱"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "主責課"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "店鋪種類"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "分倉"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "盤點主檔"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "庫存檔")), /*#__PURE__*/React.createElement("tr", {
    className: "border-b"
  }, /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.auditDate,
    onChange: v => setF("auditDate", v),
    options: distinctVals(baseStores, "auditDate")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.code,
    onChange: v => setF("code", v),
    options: distinctVals(baseStores, "code")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.name,
    onChange: v => setF("name", v),
    options: distinctVals(baseStores, "name")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.dept,
    onChange: v => setF("dept", v),
    options: distinctDepts(baseStores, "dept")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.category,
    onChange: v => setF("category", v),
    options: distinctVals(baseStores, "category")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.whLabel,
    onChange: v => setF("whLabel", v),
    options: distinctVals(baseStores, "whLabel")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.masterStatus,
    onChange: v => setF("masterStatus", v),
    options: ["可下載", "尚未產製"]
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.stockStatus,
    onChange: v => setF("stockStatus", v),
    options: ["可下載", "尚未產製"]
  })))), /*#__PURE__*/React.createElement("tbody", null, stores.map(s => /*#__PURE__*/React.createElement("tr", {
    key: s.id,
    className: "border-b last:border-0"
  }, /*#__PURE__*/React.createElement("td", {
    className: "py-3 pr-4"
  }, s.auditDate || "—"), /*#__PURE__*/React.createElement("td", {
    className: "py-3 pr-4 font-mono"
  }, s.code), /*#__PURE__*/React.createElement("td", {
    className: "py-3 pr-4"
  }, s.name), /*#__PURE__*/React.createElement("td", {
    className: "py-3 pr-4"
  }, s.dept || "—"), /*#__PURE__*/React.createElement("td", {
    className: "py-3 pr-4"
  }, s.category || "—"), /*#__PURE__*/React.createElement("td", {
    className: "py-3 pr-4"
  }, s.isSub ? /*#__PURE__*/React.createElement("span", {
    className: "text-amber-600"
  }, s.whLabel) : "主店"), /*#__PURE__*/React.createElement("td", {
    className: "py-3 pr-4"
  }, cell(s, "master")), /*#__PURE__*/React.createElement("td", {
    className: "py-3 pr-4"
  }, cell(s, "stock")))), stores.length === 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: "8",
    className: "py-6 text-center text-slate-400"
  }, "查無符合條件的店鋪"))))), !brandId && /*#__PURE__*/React.createElement("p", {
    className: "mt-4 text-sm text-slate-400"
  }, "請先選擇品牌以顯示店鋪檔案清單"));
}

/* ============================================================
 * 1b. 盤點總表上傳：盤點人員上傳實地盤點後的實盤數量表
 *     比照主檔下載區（品牌+月份、店鋪列表含分倉、依盤點日期→店號排序）
 *     每家店（含分倉）只保留最新一份，重新上傳覆蓋舊檔
 * ============================================================ */
// 盤點總表摘要值固定標籤（檔案最後幾列的固定格式，位置隨資料筆數變動，逐列掃描比對）
const COUNT_TOTAL_LABEL = "合計盤點總數";
function CountUploadZone({
  db,
  setDB,
  month,
  setMonth,
  toast
}) {
  const [brandId, setBrandId] = useState("");
  const [filters, setFilters] = useState({});
  const setF = (k, v) => setFilters(p => ({
    ...p,
    [k]: v
  }));
  const [busy, setBusy] = useState("");
  const [downloadingAll, setDownloadingAll] = useState(false);
  const brand = db.brands.find(b => b.id === brandId);
  const countOf = storeId => (db.countTotals || []).find(c => c.storeId === storeId && c.month === month);
  const baseStores = db.stores.filter(s => s.brandId === brandId && s.month === month).map(s => ({
    ...s,
    countStatus: countOf(s.id) ? "已上傳" : "尚未上傳"
  }));
  const stores = sortStoresByDateCode(baseStores.filter(s => matchFilters(s, filters)));

  // 本月總表下載：一店一檔，不合併，交由伺服器端打包成 zip（或本機模式依序下載）
  const downloadAllCounts = async () => {
    const list = (db.countTotals || []).filter(c => c.month === month && db.stores.some(s => s.id === c.storeId && s.brandId === brandId));
    setDownloadingAll(true);
    try {
      await bulkDownloadFiles(list, `${brand ? brand.name : ""}盤點總表_${month}`, toast);
    } finally {
      setDownloadingAll(false);
    }
  };

  // 上傳盤點總表：保留原始 Excel 檔存進 Drive（一店一檔，不解析內容），只擷取「合計盤點總數」供顯示/請款參考
  const onUpload = store => e => {
    const f = e.target.files[0];
    if (!f) return;
    if (!/\.(xlsx|xls)$/i.test(f.name)) {
      toast("僅接受 Excel 檔（.xlsx / .xls）");
      e.target.value = "";
      return;
    }
    setBusy(store.id);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const aoa = await readXLSXMatrix(f);
        const total = findLabeledTotal(aoa, COUNT_TOTAL_LABEL);
        const url = await InventoryAPI.uploadCountSheet(reader.result, f.name, brand ? brand.name : "");
        const rec = {
          storeId: store.id,
          month,
          fileName: f.name,
          fileUrl: url,
          total,
          uploadedAt: new Date().toISOString().slice(0, 10)
        };
        setDB(d => ({
          ...d,
          countTotals: [...(d.countTotals || []).filter(c => !(c.storeId === store.id && c.month === month)), rec]
        }));
        toast(total == null ? `已上傳「${store.name}」盤點總表，但找不到「${COUNT_TOTAL_LABEL}」，請確認檔案格式` : `已上傳「${store.name}」盤點總表（合計盤點總數 ${total}）✔`);
      } catch (err) {
        toast("上傳失敗，請確認網路或檔案格式");
      } finally {
        setBusy("");
        e.target.value = "";
      }
    };
    reader.readAsDataURL(f);
  };
  return /*#__PURE__*/React.createElement(SectionCard, {
    title: "📋 盤點總表上傳",
    subtitle: "盤點人員上傳實地盤點後的實盤數量表（Excel）；分倉各自獨立上傳，重新上傳會取代舊檔"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-3 items-center"
  }, /*#__PURE__*/React.createElement(BrandStoreSelect, {
    db: db,
    brandId: brandId,
    month: month,
    onBrand: setBrandId,
    showStore: false
  }), /*#__PURE__*/React.createElement("input", {
    type: "month",
    value: month,
    onChange: e => setMonth(e.target.value),
    title: "盤點月份",
    className: "px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
  }), /*#__PURE__*/React.createElement("button", {
    onClick: downloadAllCounts,
    disabled: downloadingAll || !brandId,
    className: "px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white text-sm rounded-lg"
  }, downloadingAll ? "下載中…" : "⬇ 本月總表下載")), brandId && /*#__PURE__*/React.createElement("div", {
    className: "table-scroll mt-4"
  }, /*#__PURE__*/React.createElement("table", {
    className: "w-full text-sm"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    className: "text-left text-slate-500 border-b"
  }, /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "盤點日期"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "店鋪代碼"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "店鋪名稱"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "主責課"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "店鋪種類"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "狀態"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "操作")), /*#__PURE__*/React.createElement("tr", {
    className: "border-b"
  }, /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.auditDate,
    onChange: v => setF("auditDate", v),
    options: distinctVals(baseStores, "auditDate")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.code,
    onChange: v => setF("code", v),
    options: distinctVals(baseStores, "code")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.name,
    onChange: v => setF("name", v),
    options: distinctVals(baseStores, "name")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.dept,
    onChange: v => setF("dept", v),
    options: distinctDepts(baseStores, "dept")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.category,
    onChange: v => setF("category", v),
    options: distinctVals(baseStores, "category")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.countStatus,
    onChange: v => setF("countStatus", v),
    options: ["已上傳", "尚未上傳"]
  })), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, stores.map(s => {
    const c = countOf(s.id);
    return /*#__PURE__*/React.createElement("tr", {
      key: s.id,
      className: "border-b last:border-0"
    }, /*#__PURE__*/React.createElement("td", {
      className: "py-3 pr-4"
    }, s.auditDate || "—"), /*#__PURE__*/React.createElement("td", {
      className: "py-3 pr-4 font-mono"
    }, s.code), /*#__PURE__*/React.createElement("td", {
      className: "py-3 pr-4"
    }, s.name), /*#__PURE__*/React.createElement("td", {
      className: "py-3 pr-4"
    }, s.dept || "—"), /*#__PURE__*/React.createElement("td", {
      className: "py-3 pr-4"
    }, s.category || "—"), /*#__PURE__*/React.createElement("td", {
      className: "py-3 pr-4"
    }, c ? /*#__PURE__*/React.createElement("span", {
      className: "text-emerald-600"
    }, "已上傳", c.total != null ? `（合計 ${c.total}）` : "（無總數）") : /*#__PURE__*/React.createElement("span", {
      className: "text-slate-400"
    }, "尚未上傳")), /*#__PURE__*/React.createElement("td", {
      className: "py-3 pr-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2"
    }, /*#__PURE__*/React.createElement("label", {
      className: "inline-block px-3 py-1.5 text-white text-sm rounded-lg cursor-pointer " + (busy === s.id ? "bg-slate-400" : "bg-blue-600 hover:bg-blue-700")
    }, busy === s.id ? "上傳中…" : "⬆ 上傳", /*#__PURE__*/React.createElement("input", {
      type: "file",
      accept: ".xlsx,.xls",
      className: "hidden",
      disabled: busy === s.id,
      onChange: onUpload(s)
    })), c && /*#__PURE__*/React.createElement("a", {
      href: c.fileUrl,
      target: "_blank",
      rel: "noreferrer",
      className: "px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg"
    }, "⬇ 下載"))));
  }), stores.length === 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: "7",
    className: "py-6 text-center text-slate-400"
  }, "查無符合條件的店鋪"))))), !brandId && /*#__PURE__*/React.createElement("p", {
    className: "mt-4 text-sm text-slate-400"
  }, "請先選擇品牌以顯示店鋪清單"));
}

/* ============================================================
 * 0. Layout 圖：上傳／下載各店鋪賣場配置圖（Excel 原檔，保留視覺配置不解析）
 *    只列主店（不含分倉，因分倉是同一實體店鋪的虛擬切分）
 * ============================================================ */
function LayoutZone({
  db,
  setDB,
  month,
  setMonth,
  toast
}) {
  const [brandId, setBrandId] = useState("");
  const [filters, setFilters] = useState({});
  const setF = (k, v) => setFilters(p => ({
    ...p,
    [k]: v
  }));
  const [busy, setBusy] = useState("");
  const [dlBusy, setDlBusy] = useState("");
  const [downloadingAll, setDownloadingAll] = useState(false);
  const brand = db.brands.find(b => b.id === brandId);
  const layoutOf = storeId => (db.layouts || []).find(l => l.storeId === storeId && l.month === month);
  const baseStores = db.stores.filter(s => s.brandId === brandId && s.month === month && !s.isSub) // 只列主店，不含分倉
  .map(s => ({
    ...s,
    layoutStatus: layoutOf(s.id) ? "已上傳" : "尚未上傳"
  }));
  const stores = sortStoresByDateCode(baseStores.filter(s => matchFilters(s, filters)));
  const onUpload = store => e => {
    const f = e.target.files[0];
    if (!f) return;
    if (!/\.(xlsx|xls)$/i.test(f.name)) {
      toast("僅接受 Excel 檔（.xlsx / .xls）");
      e.target.value = "";
      return;
    }
    setBusy(store.id);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const url = await InventoryAPI.uploadLayout(reader.result, f.name, brand ? brand.name : "");
        const rec = {
          storeId: store.id,
          month,
          fileName: f.name,
          fileUrl: url,
          uploadedAt: new Date().toISOString().slice(0, 10)
        };
        setDB(d => ({
          ...d,
          layouts: [...(d.layouts || []).filter(l => !(l.storeId === store.id && l.month === month)), rec]
        }));
        toast(`已上傳「${store.name}」Layout 圖 ✔`);
      } catch (err) {
        toast("上傳失敗，請確認網路或檔案格式");
      } finally {
        setBusy("");
        e.target.value = "";
      }
    };
    reader.readAsDataURL(f);
  };

  // 單店下載：上傳的是 Excel，下載時交由後端把「賣場+倉庫 LAYOUT」那張分頁轉成 PDF 後回傳
  const downloadOne = async (store, l) => {
    setDlBusy(store.id);
    try {
      const pdf = await InventoryAPI.layoutPdf(l.fileUrl, l.fileName);
      if (pdf) {
        downloadBase64File(pdf.filename, pdf.base64, "application/pdf");
        toast(`已下載「${store.name}」Layout 圖（PDF）✔`);
      } else {
        // 本機開發模式（無後端轉檔）：直接下載原始檔
        const a = document.createElement("a");
        a.href = l.fileUrl;
        a.download = l.fileName;
        a.target = "_blank";
        a.rel = "noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      toast("下載失敗，請確認網路後再試");
    } finally {
      setDlBusy("");
    }
  };

  // 本月總表下載：一店一檔，不合併；交由伺服器端把每張 Layout 轉成 PDF 再打包成 zip（本機模式依序下載原檔）
  const downloadAll = async () => {
    const list = (db.layouts || []).filter(l => l.month === month && db.stores.some(s => s.id === l.storeId && s.brandId === brandId));
    setDownloadingAll(true);
    try {
      await bulkDownloadFiles(list, `${brand ? brand.name : ""}Layout圖_${month}`, toast, true);
    } finally {
      setDownloadingAll(false);
    }
  };
  return /*#__PURE__*/React.createElement(SectionCard, {
    title: "🗺️ Layout 圖",
    subtitle: "上傳／下載各店鋪賣場配置圖（Excel 原檔）；只列主店，不含分倉"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-3 items-center"
  }, /*#__PURE__*/React.createElement(BrandStoreSelect, {
    db: db,
    brandId: brandId,
    month: month,
    onBrand: setBrandId,
    showStore: false
  }), /*#__PURE__*/React.createElement("input", {
    type: "month",
    value: month,
    onChange: e => setMonth(e.target.value),
    title: "盤點月份",
    className: "px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
  }), /*#__PURE__*/React.createElement("button", {
    onClick: downloadAll,
    disabled: downloadingAll || !brandId,
    className: "px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white text-sm rounded-lg"
  }, downloadingAll ? "下載中…" : "⬇ 本月總表下載")), brandId && /*#__PURE__*/React.createElement("div", {
    className: "table-scroll mt-4"
  }, /*#__PURE__*/React.createElement("table", {
    className: "w-full text-sm"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    className: "text-left text-slate-500 border-b"
  }, /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "盤點日期"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "店鋪代碼"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "店鋪名稱"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "主責課"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "狀態"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "操作")), /*#__PURE__*/React.createElement("tr", {
    className: "border-b"
  }, /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.auditDate,
    onChange: v => setF("auditDate", v),
    options: distinctVals(baseStores, "auditDate")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.code,
    onChange: v => setF("code", v),
    options: distinctVals(baseStores, "code")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.name,
    onChange: v => setF("name", v),
    options: distinctVals(baseStores, "name")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.dept,
    onChange: v => setF("dept", v),
    options: distinctDepts(baseStores, "dept")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.layoutStatus,
    onChange: v => setF("layoutStatus", v),
    options: ["已上傳", "尚未上傳"]
  })), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, stores.map(s => {
    const l = layoutOf(s.id);
    return /*#__PURE__*/React.createElement("tr", {
      key: s.id,
      className: "border-b last:border-0"
    }, /*#__PURE__*/React.createElement("td", {
      className: "py-3 pr-4"
    }, s.auditDate || "—"), /*#__PURE__*/React.createElement("td", {
      className: "py-3 pr-4 font-mono"
    }, s.code), /*#__PURE__*/React.createElement("td", {
      className: "py-3 pr-4"
    }, s.name), /*#__PURE__*/React.createElement("td", {
      className: "py-3 pr-4"
    }, s.dept || "—"), /*#__PURE__*/React.createElement("td", {
      className: "py-3 pr-4"
    }, l ? /*#__PURE__*/React.createElement("span", {
      className: "text-emerald-600"
    }, "已上傳") : /*#__PURE__*/React.createElement("span", {
      className: "text-slate-400"
    }, "尚未上傳")), /*#__PURE__*/React.createElement("td", {
      className: "py-3 pr-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2"
    }, /*#__PURE__*/React.createElement("label", {
      className: "inline-block px-3 py-1.5 text-white text-sm rounded-lg cursor-pointer " + (busy === s.id ? "bg-slate-400" : "bg-blue-600 hover:bg-blue-700")
    }, busy === s.id ? "上傳中…" : "⬆ 上傳", /*#__PURE__*/React.createElement("input", {
      type: "file",
      accept: ".xlsx,.xls",
      className: "hidden",
      disabled: busy === s.id,
      onChange: onUpload(s)
    })), l && /*#__PURE__*/React.createElement("button", {
      onClick: () => downloadOne(s, l),
      disabled: dlBusy === s.id,
      className: "px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white text-sm rounded-lg"
    }, dlBusy === s.id ? "轉檔中…" : "⬇ 下載PDF"))));
  }), stores.length === 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: "6",
    className: "py-6 text-center text-slate-400"
  }, "查無符合條件的店鋪"))))), !brandId && /*#__PURE__*/React.createElement("p", {
    className: "mt-4 text-sm text-slate-400"
  }, "請先選擇品牌以顯示店鋪清單"));
}

/* ============================================================
 * 2. 填寫區：作業時間 / 件數人數 / 特殊狀況 / 紙本報表照片
 * ============================================================ */
function FillZone({
  db,
  setDB,
  month,
  setMonth,
  user,
  toast
}) {
  const empty = {
    brandId: "",
    storeId: "",
    date: "",
    headcount: "",
    pieces: "",
    arriveTime: "",
    countStart: "",
    countEnd: "",
    diffStart: "",
    diffEnd: "",
    leaveTime: "",
    special: "",
    photos: []
  };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm(f => ({
    ...f,
    [k]: v
  }));
  const onPhotos = e => {
    const files = Array.from(e.target.files).slice(0, 6);
    Promise.all(files.map(f => new Promise(res => {
      const r = new FileReader();
      r.onload = () => res({
        name: f.name,
        dataUrl: r.result
      });
      r.readAsDataURL(f);
    }))).then(photos => set("photos", [...form.photos, ...photos].slice(0, 6)));
  };

  // 資料驗證規則：必填欄位檢查
  const validate = () => {
    const err = {};
    if (!form.brandId) err.brandId = "請選擇品牌";
    if (!form.storeId) err.storeId = "請選擇店鋪";
    if (!form.date) err.date = "請選擇盤點日期";
    if (!form.countStart || !form.countEnd) err.count = "請填寫存貨開始與結束盤點時間";
    if (!form.headcount || Number(form.headcount) <= 0) err.headcount = "人數須大於 0";
    if (!form.pieces || Number(form.pieces) <= 0) err.pieces = "件數須大於 0";
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  // 存貨盤點耗時（時數）與人時、效率預覽
  const countHrs = calcHours(form.countStart, form.countEnd);
  const eff = countHrs > 0 && Number(form.headcount) > 0 && Number(form.pieces) > 0 ? Math.round(Number(form.pieces) / (countHrs * Number(form.headcount))) : 0;
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!validate()) {
      toast("尚有欄位未通過驗證，請檢查紅字提示");
      return;
    }
    setSaving(true);
    toast("儲存中…");
    try {
      const photos = [];
      for (const p of form.photos) {
        const url = await InventoryAPI.uploadPhoto(p.dataUrl, p.name);
        photos.push(InventoryAPI.cloud() ? {
          name: p.name,
          url
        } : {
          name: p.name
        });
      }
      const rec = {
        id: uid("R"),
        brandId: form.brandId,
        storeId: form.storeId,
        month,
        date: form.date,
        headcount: Number(form.headcount),
        pieces: Number(form.pieces),
        arriveTime: form.arriveTime,
        countStart: form.countStart,
        countEnd: form.countEnd,
        diffStart: form.diffStart,
        diffEnd: form.diffEnd,
        leaveTime: form.leaveTime,
        special: form.special,
        photos,
        filledBy: user
      };
      const next = {
        ...db,
        records: [...db.records, rec]
      };
      setDB(next);
      await InventoryAPI.appendRow(next, "records", rec);
      setForm(empty);
      setErrors({});
      toast("盤點作業紀錄已儲存 ✔");
    } catch (e) {
      toast("儲存失敗，請確認網路或稍後再試");
    } finally {
      setSaving(false);
    }
  };
  const [filters, setFilters] = useState({});
  const setFilt = (k, v) => setFilters(p => ({
    ...p,
    [k]: v
  }));
  const allRecords = db.records.filter(r => r.month === month).map(r => {
    const store = db.stores.find(s => s.id === r.storeId);
    const brand = db.brands.find(b => b.id === r.brandId);
    return {
      ...r,
      brandName: brand ? brand.name : "",
      storeName: store ? store.name : "",
      storeCode: store ? store.code : "",
      dept: store ? store.dept : "",
      piecesNum: num(r.pieces)
    };
  });
  const myRecords = allRecords.filter(r => matchFilters(r, filters));
  const Err = ({
    k
  }) => errors[k] ? /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-red-600 mt-1"
  }, errors[k]) : null;
  const inputCls = "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none";
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-6"
  }, /*#__PURE__*/React.createElement(SectionCard, {
    title: "📝 盤點作業情況紀錄",
    subtitle: "記錄盤點作業時間、件數人數、特殊狀況及紙本報表照片"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-3 items-center"
  }, /*#__PURE__*/React.createElement(BrandStoreSelect, {
    db: db,
    brandId: form.brandId,
    storeId: form.storeId,
    month: month,
    onBrand: v => setForm(f => ({
      ...f,
      brandId: v,
      storeId: ""
    })),
    onStore: v => set("storeId", v)
  }), /*#__PURE__*/React.createElement("input", {
    type: "month",
    value: month,
    onChange: e => setMonth(e.target.value),
    title: "盤點月份",
    className: "px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
  })), /*#__PURE__*/React.createElement(Err, {
    k: "brandId"
  }), /*#__PURE__*/React.createElement(Err, {
    k: "storeId"
  })), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-3 gap-4"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-sm text-slate-600"
  }, "盤點日期 *"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: form.date,
    onChange: e => set("date", e.target.value),
    className: inputCls
  }), /*#__PURE__*/React.createElement(Err, {
    k: "date"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-sm text-slate-600"
  }, "盤點人數 *"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "1",
    value: form.headcount,
    onChange: e => set("headcount", e.target.value),
    className: inputCls,
    placeholder: "例：2"
  }), /*#__PURE__*/React.createElement(Err, {
    k: "headcount"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-sm text-slate-600"
  }, "實盤件數 *"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "1",
    value: form.pieces,
    onChange: e => set("pieces", e.target.value),
    className: inputCls,
    placeholder: "例：688"
  }), /*#__PURE__*/React.createElement(Err, {
    k: "pieces"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 md:grid-cols-3 gap-4"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-sm text-slate-600"
  }, "進店時間"), /*#__PURE__*/React.createElement("input", {
    type: "time",
    value: form.arriveTime,
    onChange: e => set("arriveTime", e.target.value),
    className: inputCls
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-sm text-slate-600"
  }, "存貨開始盤點 *"), /*#__PURE__*/React.createElement("input", {
    type: "time",
    value: form.countStart,
    onChange: e => set("countStart", e.target.value),
    className: inputCls
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-sm text-slate-600"
  }, "存貨結束盤點 *"), /*#__PURE__*/React.createElement("input", {
    type: "time",
    value: form.countEnd,
    onChange: e => set("countEnd", e.target.value),
    className: inputCls
  }), /*#__PURE__*/React.createElement(Err, {
    k: "count"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-sm text-slate-600"
  }, "找差異開始"), /*#__PURE__*/React.createElement("input", {
    type: "time",
    value: form.diffStart,
    onChange: e => set("diffStart", e.target.value),
    className: inputCls
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-sm text-slate-600"
  }, "找差異結束"), /*#__PURE__*/React.createElement("input", {
    type: "time",
    value: form.diffEnd,
    onChange: e => set("diffEnd", e.target.value),
    className: inputCls
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-sm text-slate-600"
  }, "盤點人員離店"), /*#__PURE__*/React.createElement("input", {
    type: "time",
    value: form.leaveTime,
    onChange: e => set("leaveTime", e.target.value),
    className: inputCls
  }))), /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm text-slate-600"
  }, "存貨盤點耗時：", /*#__PURE__*/React.createElement("b", null, countHrs > 0 ? `${countHrs} 小時` : "—"), "\u3000｜\u3000預估盤點效率：", /*#__PURE__*/React.createElement("b", null, eff > 0 ? `${eff.toLocaleString()} 件/H/人` : "—")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-sm text-slate-600"
  }, "特殊狀況說明"), /*#__PURE__*/React.createElement("textarea", {
    rows: "3",
    value: form.special,
    onChange: e => set("special", e.target.value),
    className: inputCls,
    placeholder: "例：冷凍櫃區域燈光不足、部分商品無條碼需手key…"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-sm text-slate-600"
  }, "紙本報表照片（最多 6 張）"), /*#__PURE__*/React.createElement("input", {
    type: "file",
    accept: "image/*",
    multiple: true,
    onChange: onPhotos,
    className: "block mt-1 text-sm text-slate-500 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
  }), form.photos.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-2 mt-2"
  }, form.photos.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "relative"
  }, /*#__PURE__*/React.createElement("img", {
    src: p.dataUrl,
    className: "photo-thumb",
    alt: p.name
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => set("photos", form.photos.filter((_, j) => j !== i)),
    className: "absolute -top-2 -right-2 bg-red-500 text-white w-5 h-5 rounded-full text-xs"
  }, "✕"))))), /*#__PURE__*/React.createElement("button", {
    onClick: submit,
    disabled: saving,
    className: "px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-medium rounded-lg"
  }, saving ? "儲存中…" : "儲存盤點紀錄"))), /*#__PURE__*/React.createElement(SectionCard, {
    title: "🗂 本月盤點作業紀錄",
    subtitle: `${month} 共 ${myRecords.length} 筆（各欄用選單篩選）`
  }, /*#__PURE__*/React.createElement("div", {
    className: "table-scroll"
  }, /*#__PURE__*/React.createElement("table", {
    className: "w-full text-sm whitespace-nowrap"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    className: "text-left text-slate-500 border-b"
  }, /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "日期"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "主責課"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "店號"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "店名"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "盤點人數"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "實盤件數"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "進店"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "存貨開始"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "存貨結束"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "找差異開始"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "找差異結束"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "離店"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "特殊狀況"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "填寫人")), /*#__PURE__*/React.createElement("tr", {
    className: "border-b"
  }, /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.date,
    onChange: v => setFilt("date", v),
    options: distinctVals(allRecords, "date")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.dept,
    onChange: v => setFilt("dept", v),
    options: distinctDepts(allRecords, "dept")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.storeCode,
    onChange: v => setFilt("storeCode", v),
    options: distinctVals(allRecords, "storeCode")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.storeName,
    onChange: v => setFilt("storeName", v),
    options: distinctVals(allRecords, "storeName")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.headcount,
    onChange: v => setFilt("headcount", v),
    options: distinctVals(allRecords, "headcount")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.piecesNum,
    onChange: v => setFilt("piecesNum", v),
    options: distinctVals(allRecords, "piecesNum")
  })), /*#__PURE__*/React.createElement("th", {
    colSpan: "6"
  }), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.special,
    onChange: v => setFilt("special", v),
    options: distinctVals(allRecords, "special")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.filledBy,
    onChange: v => setFilt("filledBy", v),
    options: distinctVals(allRecords, "filledBy")
  })))), /*#__PURE__*/React.createElement("tbody", null, myRecords.map(r => /*#__PURE__*/React.createElement("tr", {
    key: r.id,
    className: "border-b last:border-0"
  }, /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, r.date), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, r.dept || "—"), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4 font-mono"
  }, r.storeCode), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, r.storeName), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, r.headcount), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, r.piecesNum.toLocaleString()), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4 font-mono"
  }, r.arriveTime || "—"), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4 font-mono"
  }, r.countStart || "—"), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4 font-mono"
  }, r.countEnd || "—"), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4 font-mono"
  }, r.diffStart || "—"), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4 font-mono"
  }, r.diffEnd || "—"), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4 font-mono"
  }, r.leaveTime || "—"), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4 max-w-[200px] truncate",
    title: r.special
  }, r.special || "—"), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, r.filledBy))), myRecords.length === 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: "14",
    className: "py-6 text-center text-slate-400"
  }, "查無符合條件的紀錄")))))));
}

/* ============================================================
 * 3. 上傳區：上傳客戶主檔 → 依店鋪及盤點程式格式產製各店主檔（庫存檔）
 * ============================================================ */
function UploadZone({
  db,
  setDB,
  month,
  toast,
  brandId
}) {
  const [fileType, setFileType] = useState("master"); // master=盤點前主檔(數量帶0), stock=盤點當日庫存檔(帶客戶數量)
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null); // { headers, rows }
  const [storeCol, setStoreCol] = useState(""); // 哪一欄對應店鋪
  const [matchBy, setMatchBy] = useState("code"); // 以店鋪代碼或名稱對應
  const [colMap, setColMap] = useState({}); // 標準欄位 → 客戶檔來源欄
  const [colStore, setColStore] = useState({}); // 歐聖：客戶檔店名欄 → storeId（庫存檔用，自動比對＋手動調整）
  const [colCat, setColCat] = useState({}); // 歐聖：客戶檔店名欄 → 店鋪種類（主檔用；主檔以種類為單位，主店與分倉視為同一種類）
  const [busy, setBusy] = useState(false);
  const isStock = fileType === "stock";
  const stores = sortStoresByName(db.stores.filter(s => s.brandId === brandId && s.month === month));
  const brand = db.brands.find(b => b.id === brandId);
  const aliases = db.aliases || [];

  // 解析店名欄 → 店鋪：先查記憶(aliases)，再用英文店名/中文名模糊比對
  const resolveStore = header => {
    const key = normName(header);
    const a = aliases.find(x => x.brandId === brandId && x.key === key);
    if (a) {
      const s = stores.find(x => x.id === a.storeId);
      if (s) return s;
    }
    return findStoreByEnName(stores, header);
  };

  // 解析店名欄 → 店鋪種類：只查記憶(categoryAliases)，主檔以種類為單位、不需模糊比對到特定店鋪
  const resolveCategory = header => {
    const key = normName(header);
    const a = (db.categoryAliases || []).find(x => x.brandId === brandId && x.key === key);
    return a ? a.category : "";
  };

  // 依標準欄位自動猜測對應的來源欄
  const guessMap = headers => {
    const rules = {
      "商品編號": /商品編號|品號|貨號|item|sku/i,
      "barcode": /barcode|條碼|國際條碼|ean/i,
      "舊商品編號2": /舊.*編號|old/i,
      "物品名稱": /品名|物品名稱|名稱|品項名稱|name/i,
      "庫存數量": /數量|庫存|存量|qty|stock/i,
      "品項平均成本": /成本|平均成本|單價|cost|price/i
    };
    const map = {};
    MASTER_COLS.forEach(c => {
      map[c] = headers.find(h => rules[c].test(h)) || "";
    });
    return map;
  };

  // 選檔後立即解析 Excel，讀出表頭供對應
  const onFile = async e => {
    const f = e.target.files[0];
    if (!f) return;
    if (!/\.(xlsx|xls)$/i.test(f.name)) {
      toast("僅接受 Excel 檔（.xlsx / .xls）");
      e.target.value = "";
      return;
    }
    setFile(f);
    setParsed(null);
    setStoreCol("");
    setColStore({});
    setColCat({});
    try {
      const {
        headers,
        rows
      } = await readXLSX(f);
      if (headers.length === 0 || rows.length === 0) {
        toast("檔案沒有可讀取的資料列");
        return;
      }
      setParsed({
        headers,
        rows
      });
      const guess = headers.find(h => /店|門市|store|shop|代碼|code/i.test(h));
      setStoreCol(guess || headers[0]);
      setColMap(guessMap(headers));
      // 歐聖：對每個店名/倉別欄做自動比對，預填對應下拉（庫存檔→店鋪；主檔→種類，兩者都先算好，切換用途不用重上傳）
      if (isOshengBrand(brand)) {
        const cs = {};
        const cc = {};
        headers.filter(h => !OSHENG_FIXED_COLS.includes(h)).forEach(h => {
          const s = resolveStore(h);
          cs[h] = s ? s.id : "";
          cc[h] = resolveCategory(h);
        });
        setColStore(cs);
        setColCat(cc);
      }
    } catch (err) {
      toast("Excel 解析失敗，請確認檔案格式");
    }
  };
  const osheng = isOshengBrand(brand);

  // 共用驗證：商品編號(A欄)不可重複、庫存數量(E欄)須整數。回傳錯誤訊息或 null
  const validateRows = rows => {
    if (firstDup(rows.map(r => r[CODE_COL]))) return "主檔商品編號重複";
    for (const r of rows) {
      if (!isIntStr(r[QTY_COL])) return "庫存數量須為整數";
    }
    return null;
  };

  // 寫入上傳紀錄與索引、記憶店名對應、提示、清空
  // 同檔名重新上傳：先移除同檔名的舊上傳紀錄（主檔資料已於 produce 前用 deleteMastersByFile 清除）
  const finalize = async (addedIdx, matched, unmatched, label, newAliases, newCategoryAliases) => {
    const uploadRec = {
      id: uid("U"),
      brandId,
      month,
      type: fileType,
      fileName: file.name,
      storeCount: matched,
      rowCount: parsed.rows.length,
      uploadedAt: new Date().toISOString().slice(0, 10)
    };
    const idx = (db.mastersIndex || []).filter(m => !addedIdx.some(a => a.storeId === m.storeId && a.month === m.month && a.type === m.type) && !(m.srcFile === file.name && m.month === month)); // 同檔名舊索引一併移除
    const uploads = [...db.uploads.filter(u => !(u.fileName === file.name && u.month === month && u.brandId === brandId)), uploadRec];
    const mergedAliases = [...(db.aliases || []), ...(newAliases || [])];
    const mergedCategoryAliases = [...(db.categoryAliases || []), ...(newCategoryAliases || [])];
    const next = {
      ...db,
      uploads,
      mastersIndex: [...idx, ...addedIdx],
      aliases: mergedAliases,
      categoryAliases: mergedCategoryAliases
    };
    setDB(next);
    await InventoryAPI.saveTabs(next, ["uploads"]); // 整批覆蓋上傳紀錄（含清除同檔名舊紀錄）
    let msg = `已產製 ${matched} 個${label}（來源 ${parsed.rows.length} 筆）✔`;
    if (unmatched.length) msg += `；${unmatched.length} 個未對應（例：${unmatched.slice(0, 2).join("、")}）`;
    if (newAliases && newAliases.length) msg += `；已記住 ${newAliases.length} 筆店名對應`;
    if (newCategoryAliases && newCategoryAliases.length) msg += `；已記住 ${newCategoryAliases.length} 筆種類對應`;
    toast(msg);
    setFile(null);
    setParsed(null);
    setStoreCol("");
    setColMap({});
    setColStore({});
    setColCat({});
  };

  // 一般品牌：依 storeCol 切分、colMap 對應
  const produceGeneric = async () => {
    const label = isStock ? "庫存檔" : "主檔";
    if (!storeCol) {
      toast("請選擇對應店鋪的欄位");
      return;
    }
    if (isStock && !colMap[QTY_COL]) {
      toast("庫存檔必須指定「庫存數量」對應的來源欄");
      return;
    }
    const groups = {};
    parsed.rows.forEach(r => {
      const key = String(r[storeCol]).trim();
      (groups[key] = groups[key] || []).push(r);
    });
    const toStd = src => {
      const o = {};
      MASTER_COLS.forEach(c => {
        if (c === QTY_COL) {
          o[c] = isStock ? String(src[colMap[c]] == null ? "" : src[colMap[c]]).trim() : "0";
          return;
        }
        const from = colMap[c];
        o[c] = from ? String(src[from] == null ? "" : src[from]) : "";
      });
      return o;
    };
    const datasets = [];
    const unmatched = [];
    for (const key of Object.keys(groups)) {
      const store = stores.find(s => String(matchBy === "code" ? s.code : s.name).trim() === key);
      if (!store) {
        if (key) unmatched.push(key);
        continue;
      }
      const rows = groups[key].map(toStd);
      const err = validateRows(rows);
      if (err) {
        toast(`${err}（店鋪 ${store.code}）`);
        return;
      }
      datasets.push({
        storeId: store.id,
        rows
      });
    }
    if (datasets.length === 0) {
      toast("沒有可對應的店鋪，請確認切分欄與名單");
      return;
    }
    const srcDate = parseDateFromName(file.name);
    await InventoryAPI.deleteMastersByFile(file.name, month); // 同檔名先清空舊產出
    const addedIdx = [];
    for (const d of datasets) {
      await InventoryAPI.putMaster({
        storeId: d.storeId,
        month,
        type: fileType,
        srcDate,
        srcFile: file.name,
        columns: MASTER_COLS,
        rows: d.rows
      });
      addedIdx.push({
        storeId: d.storeId,
        month,
        type: fileType
      });
    }
    await finalize(addedIdx, datasets.length, unmatched, label);
  };

  // 歐聖：寬表；商品欄固定、其後每欄一個店鋪/倉別
  const produceOsheng = async () => {
    if (!parsed.headers.includes("商品條碼")) {
      toast("此檔缺少『商品條碼』欄，非歐聖主檔格式");
      return;
    }
    const storeCols = parsed.headers.filter(h => !OSHENG_FIXED_COLS.includes(h));
    if (storeCols.length === 0) {
      toast("找不到店鋪/倉別欄");
      return;
    }
    const mapRow = (src, qty) => ({
      "商品編號": String(src["商品條碼"] == null ? "" : src["商品條碼"]).trim(),
      "barcode": String(src["商品條碼"] == null ? "" : src["商品條碼"]).trim(),
      "舊商品編號2": "",
      "物品名稱": ["STYLENUMBER", "顏色", "尺寸"].map(k => String(src[k] == null ? "" : src[k]).trim()).filter(Boolean).join("-"),
      "品項平均成本": String(src["零售價"] == null ? "" : src["零售價"]).trim(),
      "庫存數量": qty
    });

    // 記住手動對應：把本次每個「已選店鋪」的欄標題存成 alias（下次自動套用）
    const learnAliases = () => {
      const cur = db.aliases || [];
      const add = [];
      storeCols.forEach(h => {
        const sid = colStore[h];
        if (sid) {
          const key = normName(h);
          if (!cur.some(x => x.brandId === brandId && x.key === key && x.storeId === sid)) add.push({
            brandId,
            key,
            storeId: sid
          });
        }
      });
      return add;
    };
    // 記住手動對應：把本次每個「已選種類」的欄標題存成 categoryAlias（下次自動套用；主檔專用，跟店鋪 alias 分開存）
    const learnCategoryAliases = () => {
      const cur = db.categoryAliases || [];
      const add = [];
      storeCols.forEach(h => {
        const cat = colCat[h];
        if (cat) {
          const key = normName(h);
          if (!cur.some(x => x.brandId === brandId && x.key === key && x.category === cat)) add.push({
            brandId,
            key,
            category: cat
          });
        }
      });
      return add;
    };
    const chosen = h => stores.find(s => s.id === colStore[h]) || null;
    if (!isStock) {
      // 主檔：全部商品、數量0；主檔以「種類」為單位產製，主店與分倉視為同一種類，不需細分到單店
      const rows = parsed.rows.map(r => mapRow(r, "0"));
      const err = validateRows(rows);
      if (err) {
        toast(err);
        return;
      }
      const cats = new Set();
      storeCols.forEach(h => {
        const cat = colCat[h];
        if (cat) cats.add(cat);
      });
      if (cats.size === 0) {
        toast("找不到店鋪種類：請在下方為店名欄選擇對應種類");
        return;
      }
      const srcDate = parseDateFromName(file.name);
      await InventoryAPI.deleteMastersByFile(file.name, month); // 同檔名先清空舊產出
      const addedIdx = [];
      for (const cat of cats) {
        await InventoryAPI.putMaster({
          storeId: "CAT::" + cat,
          month,
          type: "master",
          srcDate,
          srcFile: file.name,
          columns: MASTER_COLS,
          rows
        });
        addedIdx.push({
          storeId: "CAT::" + cat,
          month,
          type: "master"
        });
      }
      await finalize(addedIdx, cats.size, [], `主檔（種類：${Array.from(cats).join("、")}）`, [], learnCategoryAliases());
    } else {
      // 庫存檔：每個店名/倉別欄各一份，數量帶該欄（先驗證整數）
      for (const h of storeCols) {
        for (const src of parsed.rows) {
          if (!isIntStr(src[h])) {
            toast(`庫存數量須為整數（欄「${h}」）`);
            return;
          }
        }
      }
      // 檢查：一家店只能對應一個客戶庫存欄（單倉別店鋪；多倉別請用各自的店鋪列），避免覆蓋
      const chosenCounts = {};
      storeCols.forEach(h => {
        const sid = colStore[h];
        if (sid) chosenCounts[sid] = (chosenCounts[sid] || 0) + 1;
      });
      for (const sid of Object.keys(chosenCounts)) {
        if (chosenCounts[sid] > 1) {
          const st = stores.find(s => s.id === sid);
          toast(`「${st ? st.code + " " + st.name : sid}」被對應到 ${chosenCounts[sid]} 個庫存欄，一家店只能對應一個庫存檔（多倉別請分列不同店鋪）`);
          return;
        }
      }
      // 商品基本資料（商品編號/物品名稱/成本）每個店鋪都一樣，只組一次；各店鋪只留自己的數量陣列——
      // 避免像過去「每個店鋪各自重送整份商品列」，商品數量一多、乘上店鋪數就爆量，單次請求太大會在半路被擋掉(CORS-like 失敗)
      const baseRows = parsed.rows.map(src => [String(src["商品條碼"] == null ? "" : src["商品條碼"]).trim(), ["STYLENUMBER", "顏色", "尺寸"].map(k => String(src[k] == null ? "" : src[k]).trim()).filter(Boolean).join("-"), String(src["零售價"] == null ? "" : src["零售價"]).trim()]);
      if (firstDup(baseRows.map(r => r[0]))) {
        toast("主檔商品編號重複");
        return;
      }
      const batchStores = [];
      const unmatched = [];
      for (const h of storeCols) {
        const store = chosen(h);
        if (!store) {
          unmatched.push(h);
          continue;
        }
        const qty = parsed.rows.map(src => String(src[h] == null || src[h] === "" ? "0" : src[h]).trim());
        batchStores.push({
          storeId: store.id,
          qty
        });
      }
      if (batchStores.length === 0) {
        toast("尚未對應任何店鋪，請在下方為店名欄選擇對應店鋪");
        return;
      }
      const srcDate = parseDateFromName(file.name);
      await InventoryAPI.deleteMastersByFile(file.name, month); // 同檔名先清空舊產出
      const addedStoreIds = await InventoryAPI.putMasterBatch({
        month,
        type: "stock",
        srcDate,
        srcFile: file.name,
        baseRows,
        stores: batchStores
      });
      const addedIdx = addedStoreIds.map(sid => ({
        storeId: sid,
        month,
        type: "stock"
      }));
      await finalize(addedIdx, addedStoreIds.length, unmatched, "庫存檔", learnAliases());
    }
  };
  const produce = async () => {
    if (!brandId) {
      toast("請先選擇品牌");
      return;
    }
    if (!parsed) {
      toast("請先上傳並解析客戶檔（Excel）");
      return;
    }
    if (stores.length === 0) {
      toast("此品牌本月尚無店鋪名單，請先至維護區建立");
      return;
    }
    setBusy(true);
    try {
      osheng ? await produceOsheng() : await produceGeneric();
    } catch (e) {
      toast("產製失敗，請確認網路後再試");
    } finally {
      setBusy(false);
    }
  };
  const history = db.uploads.filter(u => u.month === month);
  const sel = "px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none";

  // 清除一筆錯誤上傳：刪除該檔已產製的主檔/庫存檔，並移除上傳紀錄
  const [removing, setRemoving] = useState("");
  const removeUpload = async u => {
    if (!confirm(`確定要刪除「${u.fileName}」這筆上傳，以及它已產製的主檔／庫存檔嗎？`)) return;
    setRemoving(u.id);
    try {
      await InventoryAPI.deleteMastersByFile(u.fileName, u.month);
      const next = {
        ...db,
        uploads: db.uploads.filter(x => x.id !== u.id),
        mastersIndex: (db.mastersIndex || []).filter(m => !(m.srcFile === u.fileName && m.month === u.month))
      };
      setDB(next);
      await InventoryAPI.saveTabs(next, ["uploads"]);
      toast("已刪除該筆上傳與其產製資料 ✔");
    } catch (e) {
      toast("刪除失敗，請確認網路後再試");
    } finally {
      setRemoving("");
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-6"
  }, /*#__PURE__*/React.createElement(SectionCard, {
    title: "📤 上傳客戶主檔",
    subtitle: "盤點前的檔案做主檔（數量帶0）、盤點當日的檔案做庫存檔（帶客戶數量）；兩者皆用客戶檔完整重建為標準格式"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-3 items-center"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-sm text-slate-600"
  }, "目前品牌：", /*#__PURE__*/React.createElement("b", null, brand ? brand.name : "（請於上方選擇品牌）"), osheng && /*#__PURE__*/React.createElement("span", {
    className: "ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs"
  }, "歐聖專屬格式")), /*#__PURE__*/React.createElement("select", {
    value: fileType,
    onChange: e => setFileType(e.target.value),
    className: sel
  }, /*#__PURE__*/React.createElement("option", {
    value: "master"
  }, "用途：盤點前主檔（庫存數量帶 0）"), /*#__PURE__*/React.createElement("option", {
    value: "stock"
  }, "用途：盤點當日庫存檔（帶入客戶數量）"))), /*#__PURE__*/React.createElement("div", {
    className: "border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-4xl mb-2"
  }, "📄"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mb-3"
  }, "上傳客戶提供的檔案（Excel：.xlsx / .xls）— 目前用途：", /*#__PURE__*/React.createElement("b", null, isStock ? "盤點當日庫存檔" : "盤點前主檔")), /*#__PURE__*/React.createElement("input", {
    type: "file",
    accept: ".xlsx,.xls",
    onChange: onFile,
    className: "mx-auto block text-sm text-slate-500 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"
  }), file && parsed && /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-emerald-600 mt-2"
  }, "✔ ", file.name, "：讀到 ", parsed.headers.length, " 欄、", parsed.rows.length, " 筆資料")), parsed && osheng && (() => {
    const storeCols = parsed.headers.filter(h => !OSHENG_FIXED_COLS.includes(h));
    const categoryOptions = distinctVals(stores, "category"); // 本品牌本月實際出現過的種類（動態，非寫死）
    const matchedCnt = isStock ? storeCols.filter(h => colStore[h]).length : storeCols.filter(h => colCat[h]).length;
    return /*#__PURE__*/React.createElement("div", {
      className: "bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-slate-700 space-y-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "space-y-1"
    }, /*#__PURE__*/React.createElement("p", {
      className: "font-medium"
    }, "歐聖固定規則（自動套用）："), /*#__PURE__*/React.createElement("p", {
      className: "text-xs"
    }, "商品編號＝barcode＝", /*#__PURE__*/React.createElement("b", null, "商品條碼"), "；物品名稱＝", /*#__PURE__*/React.createElement("b", null, "STYLENUMBER＋顏色＋尺寸"), "；品項平均成本＝", /*#__PURE__*/React.createElement("b", null, "零售價"), "；舊商品編號2 空白。", isStock ? "庫存數量帶各店欄數字（須整數）。" : "主檔庫存數量帶 0。")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
      className: "text-sm font-medium mb-2"
    }, isStock ? `店名對應（自動比對 ${matchedCnt}/${storeCols.length}；可手動調整，送出後記住下次自動套用）` : `店鋪種類對應（自動比對 ${matchedCnt}/${storeCols.length}；主檔以種類為單位產製，主店與分倉視為同一種類，可手動調整，送出後記住下次自動套用）`), /*#__PURE__*/React.createElement("div", {
      className: "max-h-72 overflow-y-auto border border-amber-200 rounded-lg bg-white"
    }, /*#__PURE__*/React.createElement("table", {
      className: "w-full text-xs"
    }, /*#__PURE__*/React.createElement("thead", {
      className: "sticky top-0 bg-slate-50"
    }, /*#__PURE__*/React.createElement("tr", {
      className: "text-left text-slate-500 border-b"
    }, /*#__PURE__*/React.createElement("th", {
      className: "py-1.5 px-2"
    }, "客戶檔店名欄"), /*#__PURE__*/React.createElement("th", {
      className: "py-1.5 px-2"
    }, isStock ? "對應店鋪（種類）" : "對應種類"))), /*#__PURE__*/React.createElement("tbody", null, storeCols.map(h => /*#__PURE__*/React.createElement("tr", {
      key: h,
      className: "border-b last:border-0 " + ((isStock ? colStore[h] : colCat[h]) ? "" : "bg-red-50")
    }, /*#__PURE__*/React.createElement("td", {
      className: "py-1 px-2 font-mono"
    }, h), /*#__PURE__*/React.createElement("td", {
      className: "py-1 px-2"
    }, isStock ? /*#__PURE__*/React.createElement("select", {
      value: colStore[h] || "",
      onChange: e => setColStore({
        ...colStore,
        [h]: e.target.value
      }),
      className: "w-full px-2 py-1 border rounded " + (colStore[h] ? "border-slate-200" : "border-red-300")
    }, /*#__PURE__*/React.createElement("option", {
      value: ""
    }, "— 未對應 —"), stores.map(s => /*#__PURE__*/React.createElement("option", {
      key: s.id,
      value: s.id
    }, s.code, " ", s.name, s.category ? `（${s.category}）` : ""))) : /*#__PURE__*/React.createElement("select", {
      value: colCat[h] || "",
      onChange: e => setColCat({
        ...colCat,
        [h]: e.target.value
      }),
      className: "w-full px-2 py-1 border rounded " + (colCat[h] ? "border-slate-200" : "border-red-300")
    }, /*#__PURE__*/React.createElement("option", {
      value: ""
    }, "— 未對應 —"), categoryOptions.map(c => /*#__PURE__*/React.createElement("option", {
      key: c,
      value: c
    }, c)))))))))));
  })(), parsed && !osheng && /*#__PURE__*/React.createElement("div", {
    className: "bg-white border border-slate-200 rounded-xl p-4 space-y-4"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-medium text-slate-700 mb-2"
  }, "① 店鋪切分"), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-3 items-center text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600"
  }, "以此欄對應店鋪："), /*#__PURE__*/React.createElement("select", {
    value: storeCol,
    onChange: e => setStoreCol(e.target.value),
    className: sel
  }, parsed.headers.map(h => /*#__PURE__*/React.createElement("option", {
    key: h,
    value: h
  }, h))), /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600"
  }, "比對店鋪："), /*#__PURE__*/React.createElement("select", {
    value: matchBy,
    onChange: e => setMatchBy(e.target.value),
    className: sel
  }, /*#__PURE__*/React.createElement("option", {
    value: "code"
  }, "店鋪代碼"), /*#__PURE__*/React.createElement("option", {
    value: "name"
  }, "店鋪名稱")))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-medium text-slate-700 mb-2"
  }, "② 欄位對應（標準輸出欄 ← 客戶檔欄位）"), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-2 gap-2 text-sm"
  }, MASTER_COLS.map(c => {
    const qtyForMaster = c === QTY_COL && !isStock;
    return /*#__PURE__*/React.createElement("div", {
      key: c,
      className: "flex items-center gap-2"
    }, /*#__PURE__*/React.createElement("span", {
      className: "w-28 text-slate-600 shrink-0"
    }, c, c === QTY_COL && isStock && /*#__PURE__*/React.createElement("span", {
      className: "text-red-500"
    }, "*")), /*#__PURE__*/React.createElement("select", {
      value: qtyForMaster ? "" : colMap[c] || "",
      disabled: qtyForMaster,
      onChange: e => setColMap({
        ...colMap,
        [c]: e.target.value
      }),
      className: sel + " flex-1 disabled:bg-slate-100"
    }, /*#__PURE__*/React.createElement("option", {
      value: ""
    }, qtyForMaster ? "（主檔固定帶 0）" : "（空白）"), parsed.headers.map(h => /*#__PURE__*/React.createElement("option", {
      key: h,
      value: h
    }, h))));
  })), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-slate-400 mt-2"
  }, isStock ? "庫存檔：「庫存數量」為必填來源欄，帶入客戶數量。" : "主檔：「庫存數量」一律帶 0（不需對應來源欄）。"))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: produce,
    disabled: busy || !parsed,
    className: "px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-medium rounded-lg"
  }, busy ? "產製中…" : isStock ? "⚙ 依店鋪切分並產製各店庫存檔" : "⚙ 依店鋪切分並產製各店主檔"), brandId && /*#__PURE__*/React.createElement("span", {
    className: "text-sm text-slate-500"
  }, "本品牌本月 ", stores.length, " 家店鋪")))), /*#__PURE__*/React.createElement(SectionCard, {
    title: "🗂 本月上傳紀錄",
    subtitle: `${month}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "table-scroll"
  }, /*#__PURE__*/React.createElement("table", {
    className: "w-full text-sm"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    className: "text-left text-slate-500 border-b"
  }, /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "上傳日期"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "品牌"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "用途"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "檔案名稱"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "產製店鋪數"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "資料筆數"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "操作"))), /*#__PURE__*/React.createElement("tbody", null, history.map(u => /*#__PURE__*/React.createElement("tr", {
    key: u.id,
    className: "border-b last:border-0"
  }, /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, u.uploadedAt), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, db.brands.find(b => b.id === u.brandId)?.name), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, u.type === "stock" ? "盤點當日庫存檔" : "盤點前主檔"), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4 font-mono"
  }, u.fileName), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, u.storeCount), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, u.rowCount != null ? num(u.rowCount).toLocaleString() : "—"), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => removeUpload(u),
    disabled: removing === u.id,
    className: "text-red-500 hover:underline disabled:text-slate-400"
  }, removing === u.id ? "刪除中…" : "清除")))), history.length === 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: "7",
    className: "py-6 text-center text-slate-400"
  }, "本月尚無上傳紀錄")))))));
}

/* ============================================================
 * 4. 數據分析區：作業效率分析 + 請款資料
 *    [COMPUTED] 作業時數 = 結束時間 - 開始時間（跨夜 +24h）
 *    [COMPUTED] 人時效率 = 件數 ÷ (時數 × 人數)
 *    [COMPUTED] 請款金額 = 依單價設定：
 *               依件數：件數 × 單價；依人時：時數 × 人數 × 單價
 * ============================================================ */
function AnalysisZone({
  db,
  setDB,
  month,
  setMonth,
  toast
}) {
  const [brandId, setBrandId] = useState("");
  const [filters, setFilters] = useState({});
  const setF = (k, v) => setFilters(p => ({
    ...p,
    [k]: v
  }));
  const selBrand = db.brands.find(b => b.id === brandId);
  const osheng = isOshengBrand(selBrand);
  const rows = useMemo(() => {
    return db.records.filter(r => r.month === month && (!brandId || r.brandId === brandId)).map(r => {
      const store = db.stores.find(s => s.id === r.storeId);
      const brand = db.brands.find(b => b.id === r.brandId);
      const price = db.prices.find(p => p.brandId === r.brandId); // 單價以品牌為準
      const pieces = num(r.pieces); // 後端可能回字串，統一轉數字
      const headcount = num(r.headcount);
      const unitPrice = price ? num(price.unitPrice) : 0;
      const countHrs = calcHours(r.countStart, r.countEnd); // 存貨盤點時數
      const countMin = Math.round(countHrs * 60);
      const manHours = Math.round(countHrs * headcount * 100) / 100; // 人時
      const diffHrs = Math.round(calcHours(r.diffStart, r.diffEnd) * 10) / 10; // 找差異時數
      const efficiency = countHrs > 0 && headcount > 0 ? Math.round(pieces / (countHrs * headcount)) : 0; // 件/H/人
      let base = 0,
        priceDesc = "未設定單價";
      if (price) {
        if (price.priceType === "piece") {
          base = Math.round(pieces * unitPrice);
          priceDesc = `${unitPrice} 元/件`;
        } else {
          base = Math.round(manHours * unitPrice);
          priceDesc = `${unitPrice} 元/人時`;
        }
      }
      const docFee = price ? num(price.docFee) : 0; // 英斯伯：每場文件處理費
      const otFee = price ? num(price.otFee) : 0; // 英斯伯：每場超時費
      const amount = base + docFee + otFee;
      return {
        ...r,
        pieces,
        headcount,
        storeName: store?.name || r.storeId,
        storeCode: store?.code || "",
        div: store?.div || "",
        dept: store?.dept || "",
        warehouse: num(store?.warehouse) || 1,
        brandName: brand?.name,
        countHrs,
        countMin,
        manHours,
        diffHrs,
        efficiency,
        base,
        docFee,
        otFee,
        amount,
        priceDesc
      };
    });
  }, [db, month, brandId]);
  const viewRows = rows.filter(r => matchFilters(r, filters)); // 套用欄位篩選
  const totals = viewRows.reduce((a, r) => ({
    pieces: a.pieces + r.pieces,
    manHours: a.manHours + r.manHours,
    base: a.base + r.base,
    docFee: a.docFee + r.docFee,
    otFee: a.otFee + r.otFee,
    amount: a.amount + r.amount
  }), {
    pieces: 0,
    manHours: 0,
    base: 0,
    docFee: 0,
    otFee: 0,
    amount: 0
  });

  // 歐聖請款：依範本 3 分頁（彙總/客戶/內部），保留公式
  const exportBillingOsheng = () => {
    const p = db.prices.find(x => x.brandId === brandId) || {};
    const unit = num(p.unitPrice) || 2.2,
      minC = num(p.minCharge) || 5000,
      whF = num(p.whFee) || 500;
    const minPieces = Math.ceil(minC / unit); // 低於此件數 → 最低收費
    const md = d => {
      const s = String(d).split("-");
      return s.length === 3 ? `${+s[1]}/${+s[2]}` : d;
    };
    const gVal = r => Math.round(Math.max(r.pieces * unit, minC) + (num(r.warehouse) - 1) * whF);
    const N = viewRows.length;
    const grand = viewRows.reduce((a, r) => a + gVal(r), 0);
    const wb = XLSX.utils.book_new();
    const [, moStr] = month.split("-");
    const invoiceTitle = `# ${+moStr}月請款金額-全`;

    // 逐店明細列（彙總／客戶共用同一套欄位與公式）
    const detailRow = (r, i) => {
      const R = i + 2,
        wh = num(r.warehouse) || 1,
        g = gVal(r);
      return [md(r.date), r.storeCode, r.storeName, r.pieces, wh, {
        f: `(E${R}-1)*${whF}`,
        v: (wh - 1) * whF
      }, {
        f: `ROUND((IF((D${R}*${unit})<${minC},${minC},(D${R}*${unit}))+F${R}),0)`,
        v: g
      }, {
        t: "str",
        f: `IF(D${R}<${minPieces},"最低收費","")`,
        v: r.pieces < minPieces ? "最低收費" : ""
      }];
    };
    // 發票小計三列（項目/數量/金額 表頭已由呼叫端加好）：回傳 {rows, taxAmt, totalAmt}
    const invoiceLines = (svcRef, svcAmt) => {
      const taxAmt = Math.round(svcAmt * 0.05 * 100) / 100;
      return [["盤點服務", 1, {
        f: svcRef,
        v: svcAmt
      }], ["", "5%稅金", {
        f: `SUM(C{SVC})*0.05`,
        v: taxAmt
      }], ["", "總計", {
        f: `SUM(C{SVC}:C{TAX})`,
        v: svcAmt + taxAmt
      }]];
    };

    // 分頁一：彙總（含部別/主責課分攤；協盤課留空；底部合計列＋發票小計）
    const H = ["盤點日期", "店點代號", "店櫃", "實盤件數", "總倉別", "倉別加計費用", "請款金額", "備註", "部別", "主責課", "人數", "金額", "協盤課", "人數", "金額", "協盤課", "人數", "金額", "協盤課", "人數", "金額", "總計"];
    const M = [H];
    viewRows.forEach((r, i) => {
      const R = i + 2,
        wh = num(r.warehouse) || 1,
        g = gVal(r);
      M.push([...detailRow(r, i), r.div || DEPT_TO_DIV[r.dept] || "", r.dept, r.headcount, {
        f: `ROUND((K${R}/($K${R}+$N${R}+$Q${R}+$T${R})*$G${R}),0)`,
        v: g
      }, "", "", {
        f: `IF($K${R}+$N${R}+$Q${R}+$T${R}=0,0,ROUND((N${R}/($K${R}+$N${R}+$Q${R}+$T${R})*$G${R}),0))`,
        v: 0
      }, "", "", {
        f: `IF($K${R}+$N${R}+$Q${R}+$T${R}=0,0,ROUND((Q${R}/($K${R}+$N${R}+$Q${R}+$T${R})*$G${R}),0))`,
        v: 0
      }, "", "", {
        f: `IF($K${R}+$N${R}+$Q${R}+$T${R}=0,0,ROUND((T${R}/($K${R}+$N${R}+$Q${R}+$T${R})*$G${R}),0))`,
        v: 0
      }, {
        f: `ROUND(L${R}+O${R}+R${R}+U${R},0)`,
        v: g
      }]);
    });
    const totalR1 = N + 2;
    M.push(["", "", "", {
      f: `SUM(D2:D${N + 1})`,
      v: viewRows.reduce((a, r) => a + r.pieces, 0)
    }, {
      f: `SUM(E2:E${N + 1})`,
      v: viewRows.reduce((a, r) => a + (num(r.warehouse) || 1), 0)
    }, {
      f: `SUM(F2:F${N + 1})`,
      v: viewRows.reduce((a, r) => a + ((num(r.warehouse) || 1) - 1) * whF, 0)
    }, {
      f: `SUM(G2:G${N + 1})`,
      v: grand
    }, "", "", "", "", "", "", "", "", "", "", "", "", "", {
      f: `SUM(V2:V${N + 1})`,
      v: grand
    }]);
    M.push([]);
    M.push([invoiceTitle]);
    const summaryTitleRow = M.length;
    M.push(["項目", "數量", "金額"]);
    const summarySvcRow = M.length + 1;
    const summaryTaxRow = summarySvcRow + 1;
    invoiceLines(`G${totalR1}`, grand).forEach((row, idx) => {
      const fixed = row.map(cell => cell && cell.f ? {
        ...cell,
        f: cell.f.replace("{SVC}", summarySvcRow).replace("{TAX}", summaryTaxRow)
      } : cell);
      M.push(fixed);
    });
    XLSX.utils.book_append_sheet(wb, wsFromMatrix(M), "請款明細(彙總)");

    // 分頁二：內部（左：公司發票小計＋業務部限定發票小計；右：課別家數/金額，依既定組織順序，
    // 金額用 4-way SUMIF——一家店的請款金額可能分給主責課或最多 3 個協盤課，全部要算進該課小計）
    const cntOf = d => viewRows.filter(r => r.dept === d).length;
    const sumOf = d => viewRows.filter(r => r.dept === d).reduce((a, r) => a + gVal(r), 0);
    const MI = [];
    let bizSubtotalRow = null,
      bizSubtotalSum = 0;
    ORG.forEach(o => {
      const startR = MI.length + 2;
      o.depts.forEach(d => {
        const R = MI.length + 2;
        MI.push(["", "", "", "", "", d, {
          f: `COUNTIF('請款明細(彙總)'!$J:$J,'請款明細(內部)'!$F${R})`,
          v: cntOf(d)
        }, {
          f: `SUMIF('請款明細(彙總)'!J:J,$F${R},'請款明細(彙總)'!L:L)+SUMIF('請款明細(彙總)'!M:M,$F${R},'請款明細(彙總)'!O:O)+SUMIF('請款明細(彙總)'!P:P,$F${R},'請款明細(彙總)'!R:R)+SUMIF('請款明細(彙總)'!S:S,$F${R},'請款明細(彙總)'!U:U)`,
          v: sumOf(d)
        }]);
      });
      const endR = MI.length + 1,
        subR = MI.length + 2;
      const subCnt = o.depts.reduce((a, d) => a + cntOf(d), 0);
      const subSum = o.depts.reduce((a, d) => a + sumOf(d), 0);
      MI.push(["", "", "", "", "", o.div, {
        f: `SUM(G${startR}:G${endR})`,
        v: subCnt
      }, {
        f: `SUM(H${startR}:H${endR})`,
        v: subSum
      }]);
      if (o.div === "業務部") {
        bizSubtotalRow = subR;
        bizSubtotalSum = subSum;
      }
    });
    const subtotalRows = [];
    {
      let r = 2;
      ORG.forEach(o => {
        r += o.depts.length;
        subtotalRows.push(r);
        r += 1;
      });
    }
    MI.push(["", "", "", "", "", "總計", {
      f: subtotalRows.map(r => `G${r}`).join("+"),
      v: viewRows.length
    }, {
      f: subtotalRows.map(r => `H${r}`).join("+"),
      v: grand
    }]);
    MI.unshift(["", "", "", "", "", "課別", "家數", "請款金額"]);
    const setLeft = (rowNum, vals) => {
      while (MI.length < rowNum) MI.push([]);
      vals.forEach((v, ci) => {
        MI[rowNum - 1][ci] = v;
      });
    };
    setLeft(1, [{
      f: `'請款明細(彙總)'!C${summaryTitleRow}`,
      v: invoiceTitle
    }, "", "", "台灣歐聖股份有限公司"]);
    setLeft(2, ["項目", "數量", "金額", "統一編號：24940192"]);
    setLeft(3, ["盤點服務", 1, {
      f: `'請款明細(彙總)'!G${summarySvcRow}`,
      v: grand
    }]);
    setLeft(4, ["", "5%稅金", {
      f: `SUM(C3)*0.05`,
      v: Math.round(grand * 0.05 * 100) / 100
    }]);
    setLeft(5, ["", "總計", {
      f: `SUM(C3:C4)`,
      v: grand + Math.round(grand * 0.05 * 100) / 100
    }]);
    setLeft(7, [`${invoiceTitle}(盤點中心業務部)`]);
    setLeft(8, ["項目", "數量", "金額"]);
    setLeft(9, ["盤點服務", 1, {
      f: `H${bizSubtotalRow}`,
      v: bizSubtotalSum
    }]);
    setLeft(10, ["", "5%稅金", {
      f: `SUM(C9)*0.05`,
      v: Math.round(bizSubtotalSum * 0.05 * 100) / 100
    }]);
    setLeft(11, ["", "總計", {
      f: `SUM(C9:C10)`,
      v: bizSubtotalSum + Math.round(bizSubtotalSum * 0.05 * 100) / 100
    }]);
    XLSX.utils.book_append_sheet(wb, wsFromMatrix(MI), "請款明細(內部)");

    // 分頁三：客戶（A–H，同彙總欄位與公式；底部合計列＋發票小計，自己欄位加總、不跨分頁引用）
    const HC = ["盤點日期", "店點代號", "店櫃", "實盤件數", "總倉別", "倉別加計費用", "請款金額", "備註"];
    const MC = [HC];
    viewRows.forEach((r, i) => MC.push(detailRow(r, i)));
    const totalR3 = N + 2;
    MC.push(["", "", "", {
      f: `SUM(D2:D${N + 1})`,
      v: viewRows.reduce((a, r) => a + r.pieces, 0)
    }, {
      f: `SUM(E2:E${N + 1})`,
      v: viewRows.reduce((a, r) => a + (num(r.warehouse) || 1), 0)
    }, {
      f: `SUM(F2:F${N + 1})`,
      v: viewRows.reduce((a, r) => a + ((num(r.warehouse) || 1) - 1) * whF, 0)
    }, {
      f: `SUM(G2:G${N + 1})`,
      v: grand
    }, ""]);
    MC.push([]);
    MC.push([invoiceTitle]);
    const custSvcRow = MC.length + 1,
      custTaxRow = custSvcRow + 1;
    invoiceLines(`G${totalR3}`, grand).forEach((row, idx) => {
      const fixed = row.map(cell => cell && cell.f ? {
        ...cell,
        f: cell.f.replace("{SVC}", custSvcRow).replace("{TAX}", custTaxRow)
      } : cell);
      MC.push(fixed);
    });
    XLSX.utils.book_append_sheet(wb, wsFromMatrix(MC), "請款明細(客戶)");
    XLSX.writeFile(wb, `歐聖發票明細${month}-彙總.xlsx`);
    toast("歐聖請款（3 分頁、含公式）已匯出 ✔");
  };

  // 匯出請款資料
  const exportBilling = () => {
    if (viewRows.length === 0) {
      toast("目前沒有可匯出的資料");
      return;
    }
    if (osheng) {
      exportBillingOsheng();
      return;
    }
    // 其他品牌：件數×單價（英斯伯另加文件處理費/超時費）
    exportXLSX(`請款資料_${month}.xlsx`, `請款資料_${month}`, [["品牌", "店鋪", "主責課", "盤點日期", "實盤件數", "盤點人數", "計價方式", "作業費", "文件處理費", "超時費", "請款金額"], ...viewRows.map(r => [r.brandName, r.storeName, r.dept, r.date, r.pieces, r.headcount, r.priceDesc, r.base, r.docFee, r.otFee, r.amount]), ["合計", "", "", "", totals.pieces, "", "", totals.base, totals.docFee, totals.otFee, totals.amount]]);
    toast("請款資料 Excel 已匯出 ✔");
  };

  // 匯出作業分析：歐聖用比照範本的 4 分頁格式；其他品牌／未篩選單一品牌時維持原 2 分頁格式
  const exportOps = () => {
    if (viewRows.length === 0) {
      toast("目前沒有可匯出的資料");
      return;
    }
    if (osheng) {
      exportOpsOsheng();
      return;
    }
    exportOpsGeneric();
  };

  // 舊格式（非歐聖）：各店概要 + 盤點效率，公式用 TIMEVALUE 解析文字時間
  const exportOpsGeneric = () => {
    const wb = XLSX.utils.book_new();
    const gH = ["日期", "主責課", "店號", "店名", "盤點人數", "實盤件數", "進店時間", "存貨開始盤點時間", "存貨結束盤點時間", "找差異開始時間", "找差異結束時間", "找差異時間(H)", "盤點人員離店", "盤點效率(件/H/人)", "特殊狀況說明"];
    const gM = [gH];
    viewRows.forEach((r, i) => {
      const R = i + 2;
      gM.push([r.date, r.dept, r.storeCode, r.storeName, r.headcount, r.pieces, r.arriveTime, r.countStart, r.countEnd, r.diffStart, r.diffEnd, {
        f: `IF(OR(J${R}="",K${R}=""),"",ROUND((TIMEVALUE(K${R})-TIMEVALUE(J${R}))*24,1))`,
        v: r.diffHrs
      }, r.leaveTime, {
        f: `IF(OR(H${R}="",I${R}="",E${R}=0),"",ROUND(F${R}/((TIMEVALUE(I${R})-TIMEVALUE(H${R}))*24*E${R}),0))`,
        v: r.efficiency
      }, r.special || ""]);
    });
    XLSX.utils.book_append_sheet(wb, wsFromMatrix(gM), "各店概要");
    const eH = ["日期", "主責課", "店號", "店名", "盤點人數", "實盤件數", "盤點開始時間", "盤點結束時間", "單店耗時(分)", "單店耗時(H)", "盤點效率(件/H/人)"];
    const eM = [eH];
    viewRows.forEach((r, i) => {
      const R = i + 2;
      eM.push([r.date, r.dept, r.storeCode, r.storeName, r.headcount, r.pieces, r.countStart, r.countEnd, {
        f: `IF(OR(G${R}="",H${R}=""),"",ROUND((TIMEVALUE(H${R})-TIMEVALUE(G${R}))*1440,0))`,
        v: r.countMin
      }, {
        f: `IF(I${R}="","",ROUND(I${R}*E${R}/60,2))`,
        v: r.manHours
      }, {
        f: `IF(OR(J${R}="",J${R}=0),"",ROUND(F${R}/J${R},0))`,
        v: r.efficiency
      }]);
    });
    XLSX.utils.book_append_sheet(wb, wsFromMatrix(eM), "盤點效率");
    XLSX.writeFile(wb, `作業分析-${month}.xlsx`);
    toast("作業分析 Excel 已匯出（含公式）✔");
  };

  // 歐聖格式：比照「歐聖作業分析-數據分析產出範本」4 分頁（工作表/各店概要/盤點效率/損益分析-實際），日期時間用真正的
  // Excel 日期/時間格式（非文字），分頁間用跨分頁公式互相引用（不重複帶值），並在匯出時把本月各店毛利%存進歷史，
  // 供下個月匯出時自動帶出「上期毛利%」（本月若查無上期資料則留空）
  const exportOpsOsheng = () => {
    const p = db.prices.find(x => x.brandId === brandId) || {};
    const unit = num(p.unitPrice) || 2.2,
      minC = num(p.minCharge) || 5000,
      whF = num(p.whFee) || 500,
      costRate = num(p.costRate) || 315;
    const gVal = r => Math.round(Math.max(r.pieces * unit, minC) + ((num(r.warehouse) || 1) - 1) * whF);
    const N = viewRows.length;

    // 查詢某店「上一次盤點」（本品牌、月份 < 本月、最近一次有記錄的月份）的毛利%
    const prevMarginFor = storeId => {
      const recs = (db.opsMargins || []).filter(x => x.brandId === brandId && x.storeId === storeId && x.month < month);
      if (recs.length === 0) return null;
      recs.sort((a, b) => a.month.localeCompare(b.month));
      return recs[recs.length - 1].marginPercent;
    };

    // 各列先算好所有衍生值，供 4 個分頁共用（避免重複算、也方便算合計）
    const computed = viewRows.map(r => {
      const arrive = timeStrToFrac(r.arriveTime),
        countStart = timeStrToFrac(r.countStart),
        countEnd = timeStrToFrac(r.countEnd),
        diffStart = timeStrToFrac(r.diffStart),
        diffEnd = timeStrToFrac(r.diffEnd),
        leave = timeStrToFrac(r.leaveTime);
      const diffHrs = diffStart != null && diffEnd != null ? (diffEnd - diffStart) * 24 : null;
      const countMin = countStart != null && countEnd != null ? (countEnd - countStart) * 24 * 60 : null;
      const manHours = countMin != null ? countMin / 60 * r.headcount : null;
      const efficiency = manHours != null && manHours > 0 ? r.pieces / manHours : null;
      const stayHours = arrive != null && leave != null ? (leave - arrive) * 24 : null;
      const stayManHours = stayHours != null ? stayHours * r.headcount : null;
      const revenue = gVal(r);
      const cost = stayManHours != null ? stayManHours * costRate : null;
      const profit = cost != null ? revenue - cost : null;
      const marginPct = profit != null && revenue ? profit / revenue : null;
      return {
        r,
        dateSerial: dateToExcelSerial(r.date),
        arrive,
        countStart,
        countEnd,
        diffStart,
        diffEnd,
        leave,
        diffHrs,
        countMin,
        manHours,
        efficiency,
        stayHours,
        stayManHours,
        revenue,
        cost,
        profit,
        marginPct,
        prevMargin: prevMarginFor(r.storeId)
      };
    });
    const tf = frac => frac == null ? "" : {
      v: frac,
      z: "h:mm"
    };
    const dt = c => c.dateSerial == null ? "" : {
      v: c.dateSerial,
      z: "yyyy-mm-dd"
    };
    const wb = XLSX.utils.book_new();

    // 分頁一：工作表（基礎資料 + 請款金額公式，供其他分頁引用）
    const H1 = ["日期", "主責課", "店號", "店名", "實盤件數", "總倉別", "請款金額", "盤點人數", "協盤課", "協盤課"];
    const M1 = [H1];
    computed.forEach((c, i) => {
      const R = i + 2;
      M1.push([dt(c), c.r.dept, c.r.storeCode, c.r.storeName, c.r.pieces, num(c.r.warehouse) || 1, {
        f: `ROUND((IF((E${R}*${unit})<${minC},${minC},(E${R}*${unit}))+((F${R}-1)*${whF})),0)`,
        v: c.revenue
      }, c.r.headcount, "", ""]);
    });
    M1.push(["", "", "", "合計", {
      f: `SUM(E2:E${N + 1})`,
      v: computed.reduce((a, c) => a + c.r.pieces, 0)
    }, "", {
      f: `SUM(G2:G${N + 1})`,
      v: computed.reduce((a, c) => a + c.revenue, 0)
    }, "", "", ""]);
    XLSX.utils.book_append_sheet(wb, wsFromMatrix(M1), "工作表");

    // 分頁二：各店概要
    const H2 = ["日期", "主責課", "店號", "店名", "盤點人數", "實盤件數", "進店時間", "存貨開始盤點時間", "存貨結束盤點時間", "找差異開始時間", "找差異結束時間", "找差異時間(H)", "盤點人員離店", "盤點效率\n(件/H/人)", "特殊狀況說明(找差異超過一小時請備註說明原因)"];
    const M2 = [H2];
    computed.forEach((c, i) => {
      const R = i + 2;
      M2.push([{
        f: `工作表!A${R}`,
        v: c.dateSerial || 0,
        z: "yyyy-mm-dd"
      }, {
        f: `工作表!B${R}`,
        v: c.r.dept
      }, {
        f: `工作表!C${R}`,
        v: c.r.storeCode
      }, {
        f: `工作表!D${R}`,
        v: c.r.storeName
      }, {
        f: `工作表!H${R}`,
        v: c.r.headcount
      }, {
        f: `工作表!E${R}`,
        v: c.r.pieces
      }, tf(c.arrive), tf(c.countStart), tf(c.countEnd), tf(c.diffStart), tf(c.diffEnd), c.diffHrs == null ? "" : {
        f: `(K${R}-J${R})*24`,
        v: c.diffHrs
      }, tf(c.leave), c.efficiency == null ? "" : {
        f: `盤點效率!K${R}`,
        v: c.efficiency
      }, c.r.special || ""]);
    });
    XLSX.utils.book_append_sheet(wb, wsFromMatrix(M2), "各店概要");

    // 分頁三：盤點效率
    const H3 = ["日期", "主責課", "店號", "店名", "盤點人數", "實盤件數", "盤點開始時間", "盤點結束時間", "單店耗時\n(分)", "單店耗時\n(H)", "盤點效率\n(件/H/人)"];
    const M3 = [H3];
    computed.forEach((c, i) => {
      const R = i + 2;
      M3.push([{
        f: `工作表!A${R}`,
        v: c.dateSerial || 0,
        z: "yyyy-mm-dd"
      }, {
        f: `工作表!B${R}`,
        v: c.r.dept
      }, {
        f: `工作表!C${R}`,
        v: c.r.storeCode
      }, {
        f: `工作表!D${R}`,
        v: c.r.storeName
      }, {
        f: `工作表!H${R}`,
        v: c.r.headcount
      }, {
        f: `工作表!E${R}`,
        v: c.r.pieces
      }, c.countStart == null ? "" : {
        f: `各店概要!H${R}`,
        v: c.countStart,
        z: "h:mm"
      }, c.countEnd == null ? "" : {
        f: `各店概要!I${R}`,
        v: c.countEnd,
        z: "h:mm"
      }, c.countMin == null ? "" : {
        f: `(H${R}-G${R})*24*60`,
        v: c.countMin
      }, c.manHours == null ? "" : {
        f: `I${R}/60*E${R}`,
        v: c.manHours
      }, c.efficiency == null ? "" : {
        f: `SUM(F${R}/J${R})`,
        v: c.efficiency
      }]);
    });
    const totalManHours3 = computed.reduce((a, c) => a + (c.manHours || 0), 0);
    const totalR3 = N + 2;
    M3.push(["", "", "", "合計", {
      f: `SUM(E2:E${N + 1})`,
      v: computed.reduce((a, c) => a + c.r.headcount, 0)
    }, {
      f: `SUM(F2:F${N + 1})`,
      v: computed.reduce((a, c) => a + c.r.pieces, 0)
    }, "", "", "", {
      f: `SUM(J2:J${N + 1})`,
      v: totalManHours3
    }, {
      f: `SUM(F${totalR3}/J${totalR3})`,
      v: totalManHours3 ? computed.reduce((a, c) => a + c.r.pieces, 0) / totalManHours3 : 0
    }]);
    XLSX.utils.book_append_sheet(wb, wsFromMatrix(M3), "盤點效率");

    // 分頁四：損益分析-實際（全新，收入=請款金額，成本=在店總時數×專員成本，毛利=收入-成本）
    const H4 = ["日期", "主責課", "店號", "店名", "盤點人數", "實盤件數", "盤點效率\n(件/H/人)", "進店時間", "盤點人員離店", "在店時間\n(H)", "在店總時數(hr)", "收入", "成本", "毛利", "毛利%", "上期\n毛利%", "說明"];
    const M4 = [H4];
    computed.forEach((c, i) => {
      const R = i + 2;
      M4.push([{
        f: `工作表!A${R}`,
        v: c.dateSerial || 0,
        z: "yyyy-mm-dd"
      }, {
        f: `工作表!B${R}`,
        v: c.r.dept
      }, {
        f: `工作表!C${R}`,
        v: c.r.storeCode
      }, {
        f: `工作表!D${R}`,
        v: c.r.storeName
      }, {
        f: `工作表!H${R}`,
        v: c.r.headcount
      }, {
        f: `工作表!E${R}`,
        v: c.r.pieces
      }, c.efficiency == null ? "" : {
        f: `盤點效率!K${R}`,
        v: c.efficiency
      }, c.arrive == null ? "" : {
        f: `各店概要!G${R}`,
        v: c.arrive,
        z: "h:mm"
      }, c.leave == null ? "" : {
        f: `各店概要!M${R}`,
        v: c.leave,
        z: "h:mm"
      }, c.stayHours == null ? "" : {
        f: `(I${R}-H${R})*24`,
        v: c.stayHours
      }, c.stayManHours == null ? "" : {
        f: `J${R}*E${R}`,
        v: c.stayManHours
      }, {
        f: `工作表!G${R}`,
        v: c.revenue
      }, c.cost == null ? "" : {
        f: `SUM(K${R})*${costRate}`,
        v: c.cost
      }, c.profit == null ? "" : {
        f: `SUM(L${R}-M${R})`,
        v: c.profit
      }, c.marginPct == null ? "" : {
        f: `SUM(N${R}/L${R})`,
        v: c.marginPct
      }, c.prevMargin == null ? "" : c.prevMargin, {
        t: "str",
        f: `IF(各店概要!O${R}="","",各店概要!O${R})`,
        v: c.r.special || ""
      }]);
    });
    const sumRevenue = computed.reduce((a, c) => a + c.revenue, 0);
    const sumCost = computed.reduce((a, c) => a + (c.cost || 0), 0);
    const sumProfit = sumRevenue - sumCost;
    const totalR4 = N + 2;
    M4.push(["", "", "", "合計", "", "", "", "", "", "", "", {
      f: `SUM(L2:L${N + 1})`,
      v: sumRevenue
    }, {
      f: `SUM(M2:M${N + 1})`,
      v: sumCost
    }, {
      f: `SUM(N2:N${N + 1})`,
      v: sumProfit
    }, {
      f: `SUM(N${totalR4}/L${totalR4})`,
      v: sumRevenue ? sumProfit / sumRevenue : 0
    }, "", ""]);
    M4.push([]);
    M4.push([`說明:1.專員成本為${costRate}元/H`]);
    const avgStayManHours = N ? computed.reduce((a, c) => a + (c.stayManHours || 0), 0) / N : 0;
    const [y, mo] = month.split("-");
    M4.push([`        2.${y}年${+mo}月平均單店工時為${avgStayManHours.toFixed(2)}H`]);
    XLSX.utils.book_append_sheet(wb, wsFromMatrix(M4), "損益分析-實際");
    XLSX.writeFile(wb, `歐聖作業分析-${month}.xlsx`);

    // 把本月各店毛利%存進歷史，供下個月匯出時查「上期毛利%」（同店同月重新匯出會覆蓋，不會重複累積）
    const storeIdsThisExport = new Set(computed.map(c => c.r.storeId));
    const marginRecs = computed.filter(c => c.marginPct != null).map(c => ({
      brandId,
      storeId: c.r.storeId,
      month,
      marginPercent: c.marginPct
    }));
    setDB(d => {
      const kept = (d.opsMargins || []).filter(x => !(x.brandId === brandId && x.month === month && storeIdsThisExport.has(x.storeId)));
      return {
        ...d,
        opsMargins: [...kept, ...marginRecs]
      };
    });
    toast("作業分析 Excel 已匯出（4 分頁、含公式）✔");
  };
  const Stat = ({
    label,
    value,
    unit
  }) => /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-50 border border-slate-200 rounded-xl px-5 py-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-xs text-slate-500"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "text-2xl font-bold text-slate-800 mt-1"
  }, value, /*#__PURE__*/React.createElement("span", {
    className: "text-sm font-normal text-slate-500 ml-1"
  }, unit)));
  return /*#__PURE__*/React.createElement(SectionCard, {
    title: "📊 數據分析",
    subtitle: "依盤點作業紀錄自動產出作業效率分析與請款資料；各欄可篩選"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center justify-between gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-3 items-center"
  }, /*#__PURE__*/React.createElement(BrandStoreSelect, {
    db: db,
    brandId: brandId,
    month: month,
    onBrand: setBrandId,
    showStore: false
  }), /*#__PURE__*/React.createElement("input", {
    type: "month",
    value: month,
    onChange: e => setMonth(e.target.value),
    title: "盤點月份",
    className: "px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: exportOps,
    className: "px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg"
  }, "⬇ 匯出作業分析（Excel）"), /*#__PURE__*/React.createElement("button", {
    onClick: exportBilling,
    className: "px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg"
  }, "⬇ 匯出請款資料（Excel）"))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 md:grid-cols-4 gap-4 mt-5"
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "盤點場次",
    value: viewRows.length,
    unit: "場"
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "總盤點件數",
    value: totals.pieces.toLocaleString(),
    unit: "件"
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "總投入人時",
    value: totals.manHours.toLocaleString(),
    unit: "人時"
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "請款總額",
    value: totals.amount.toLocaleString(),
    unit: "元"
  })), /*#__PURE__*/React.createElement("div", {
    className: "table-scroll mt-5"
  }, /*#__PURE__*/React.createElement("table", {
    className: "w-full text-sm"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    className: "text-left text-slate-500 border-b"
  }, /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "品牌"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "店鋪"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "主責課"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "日期"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4 text-right"
  }, "件數"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4 text-right"
  }, "人數"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4 text-right"
  }, "人時"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4 text-right"
  }, "盤點效率"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "計價方式"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4 text-right"
  }, "請款金額")), /*#__PURE__*/React.createElement("tr", {
    className: "border-b"
  }, /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.brandName,
    onChange: v => setF("brandName", v),
    options: distinctVals(rows, "brandName")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.storeName,
    onChange: v => setF("storeName", v),
    options: distinctVals(rows, "storeName")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.dept,
    onChange: v => setF("dept", v),
    options: distinctDepts(rows, "dept")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: filters.date,
    onChange: v => setF("date", v),
    options: distinctVals(rows, "date")
  })), /*#__PURE__*/React.createElement("th", {
    colSpan: "6"
  }))), /*#__PURE__*/React.createElement("tbody", null, viewRows.map(r => /*#__PURE__*/React.createElement("tr", {
    key: r.id,
    className: "border-b last:border-0"
  }, /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, r.brandName), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, r.storeName), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, r.dept || "—"), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, r.date), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4 text-right"
  }, r.pieces.toLocaleString()), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4 text-right"
  }, r.headcount), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4 text-right"
  }, r.manHours), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4 text-right"
  }, r.efficiency.toLocaleString(), " 件/H/人"), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, r.priceDesc), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4 text-right font-semibold"
  }, r.amount.toLocaleString(), " 元"))), viewRows.length === 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: "10",
    className: "py-6 text-center text-slate-400"
  }, "查無符合條件的紀錄"))))));
}

/* ============================================================
 * 5. 維護區：品牌 / 店鋪名單 / 盤點人員 / 單價設定
 *    先分品牌 → 再依月份 → Excel 匯入或單筆新增；保留新增品牌功能
 * ============================================================ */
function MaintainZone({
  db,
  setDB,
  month,
  setMonth,
  toast
}) {
  const [brandId, setBrandId] = useState(db.brands[0]?.id || "");
  const [tab, setTab] = useState("stores");
  const [newBrand, setNewBrand] = useState("");
  const [storeForm, setStoreForm] = useState({
    code: "",
    name: "",
    dept: "",
    category: "",
    enName: "",
    warehouse: "",
    auditDate: ""
  });
  const [staffForm, setStaffForm] = useState({
    div: "",
    dept: "",
    empNo: "",
    name: "",
    title: ""
  });
  const [sFilters, setSFilters] = useState({}); // 店鋪篩選
  const [pFilters, setPFilters] = useState({}); // 人員篩選
  const setSF = (k, v) => setSFilters(p => ({
    ...p,
    [k]: v
  }));
  const setPF = (k, v) => setPFilters(p => ({
    ...p,
    [k]: v
  }));
  const baseStores = db.stores.filter(s => s.brandId === brandId && s.month === month);
  const baseStaff = db.staff.filter(p => p.brandId === brandId && p.month === month);
  const stores = sortStoresByDateCode(baseStores.filter(s => matchFilters(s, sFilters)));
  const staff = baseStaff.filter(p => matchFilters(p, pFilters));

  // TODO: IT 工程師請在此串接後端 API 邏輯（POST /api/brands）
  const addBrand = () => {
    const name = newBrand.trim();
    if (!name) {
      toast("請輸入品牌名稱");
      return;
    }
    if (db.brands.some(b => b.name === name)) {
      toast("品牌已存在");
      return;
    }
    const b = {
      id: uid("B"),
      name
    };
    setDB(d => ({
      ...d,
      brands: [...d.brands, b]
    }));
    setNewBrand("");
    toast(`品牌「${name}」已新增 ✔`);
  };
  const addStore = () => {
    if (!storeForm.code.trim() || !storeForm.name.trim()) {
      toast("店鋪代碼與名稱皆為必填");
      return;
    }
    setDB(d => ({
      ...d,
      stores: [...d.stores, {
        id: uid("S"),
        brandId,
        month,
        code: storeForm.code.trim(),
        name: storeForm.name.trim(),
        dept: storeForm.dept.trim(),
        category: storeForm.category.trim(),
        enName: storeForm.enName.trim(),
        warehouse: storeForm.warehouse.trim(),
        auditDate: storeForm.auditDate.trim()
      }]
    }));
    setStoreForm({
      code: "",
      name: "",
      dept: "",
      category: "",
      enName: "",
      warehouse: "",
      auditDate: ""
    });
    toast("店鋪已新增 ✔");
  };
  const addStaff = () => {
    if (!staffForm.empNo.trim() || !staffForm.name.trim()) {
      toast("工號與姓名皆為必填");
      return;
    }
    setDB(d => ({
      ...d,
      staff: [...d.staff, {
        id: uid("P"),
        brandId,
        month,
        div: staffForm.div.trim(),
        dept: staffForm.dept.trim(),
        empNo: staffForm.empNo.trim(),
        name: staffForm.name.trim(),
        title: staffForm.title.trim()
      }]
    }));
    setStaffForm({
      div: "",
      dept: "",
      empNo: "",
      name: "",
      title: ""
    });
    toast("盤點人員已新增 ✔");
  };

  // 匯入範本欄位
  const TEMPLATES = {
    stores: ["店鋪代碼", "店鋪名稱", "主責課", "店鋪種類", "英文店名", "倉別量", "盤點日期", "分倉英文店名（多個用逗號分隔）"],
    staff: ["部別", "課別", "工號", "姓名", "職稱"]
  };
  // 下載匯入範本（Excel）
  const downloadTemplate = kind => {
    const label = kind === "stores" ? "店鋪名單" : "盤點人員名單";
    exportXLSX(`${label}_匯入範本.xlsx`, label, [TEMPLATES[kind], kind === "stores" ? ["TO006", "華泰名品城", "桃竹課", "Outlet", "華泰名品城", "4", "2026-01-06", "Gloria_Destroy,Gloria_Family Sale,GLORIA_Temp Store"] : ["一部", "北一課", "E001", "範例姓名", "資深專員"]]);
    toast(`已下載${label}匯入範本`);
  };

  // 真正解析 Excel 匯入（依範本欄位；也容錯常見別名）
  const importExcel = kind => async e => {
    const f = e.target.files[0];
    if (!f) {
      return;
    }
    if (!/\.(xlsx|xls)$/i.test(f.name)) {
      toast("僅接受 Excel 檔（.xlsx / .xls）");
      e.target.value = "";
      return;
    }
    try {
      const {
        headers,
        rows
      } = await readXLSX(f);
      const pick = (row, names) => {
        for (const n of names) {
          const k = headers.find(h => h === n);
          if (k && String(row[k]).trim() !== "") return String(row[k]).trim();
        }
        return "";
      };
      // 以關鍵字找欄（相容本系統範本與客戶名單，如「主檔類別/店點代號/店名/店名(英文)」）
      const findH = re => headers.find(h => re.test(String(h)));
      if (kind === "stores") {
        const hCode = findH(/店鋪代碼|店點代號|代號|代碼|code/i);
        const hName = headers.find(h => /店鋪名稱|店名|名稱|name/i.test(String(h)) && !/英文/.test(String(h)) && !/分倉/.test(String(h)));
        const hDiv = findH(/主責部|部別/i);
        const hDept = findH(/主責課|課別|dept/i);
        const hCat = findH(/主檔類別|店鋪種類|類別|種類|category/i);
        const hEn = headers.find(h => /英文/.test(String(h)) && !/分倉/.test(String(h))) || findH(/enName/i);
        const hWh = findH(/倉別量|倉別|warehouse/i);
        const hAudit = findH(/盤點日期|日期|date/i);
        const hSubEn = findH(/分倉.*英文|分倉店名|sub.*en/i); // 多倉別：主店一列填多個客戶檔英文名(逗號分隔)，自動展開成分倉列
        const get = (r, h) => h ? String(r[h] == null ? "" : r[h]).trim() : "";
        const splitSub = v => v.split(/[,，;；]/).map(s => s.trim()).filter(Boolean);
        // 分倉英文名取「主品牌前綴之後」的部分當倉別後綴，如 "Gloria_Destroy"→"Destroy"、"MITSUI TAINAN Sale"→"Sale"
        const subSuffix = enName => {
          if (enName.includes("_")) {
            const p = enName.split("_");
            return p[p.length - 1].trim();
          }
          const w = enName.trim().split(/\s+/);
          return w[w.length - 1];
        };
        const raw = rows.map(r => ({
          code: get(r, hCode),
          name: get(r, hName),
          div: get(r, hDiv),
          dept: get(r, hDept),
          category: get(r, hCat),
          enName: get(r, hEn),
          warehouse: get(r, hWh),
          auditDate: get(r, hAudit),
          subEn: hSubEn ? get(r, hSubEn) : ""
        })).filter(x => x.code || x.name);
        let subCount = 0;
        const items = [];
        raw.forEach(x => {
          const mainCode = x.code || x.name,
            mainName = x.name || x.code;
          items.push({
            id: uid("S"),
            brandId,
            month,
            code: mainCode,
            name: mainName,
            div: x.div,
            dept: x.dept,
            category: x.category,
            enName: x.enName,
            warehouse: x.warehouse,
            auditDate: x.auditDate,
            srcFile: f.name
          });
          splitSub(x.subEn).forEach((subEnName, i) => {
            subCount++;
            items.push({
              id: uid("S"),
              brandId,
              month,
              code: `${mainCode}-${i + 1}`,
              name: `${mainName}_${subSuffix(subEnName)}`,
              div: x.div,
              dept: x.dept,
              category: x.category,
              enName: subEnName,
              warehouse: "1",
              auditDate: x.auditDate,
              srcFile: f.name,
              isSub: true,
              parentCode: mainCode // 標記為分倉：Layout 區等「只列主店」的畫面會排除這些列
            });
          });
        });
        if (items.length === 0) {
          toast("未讀到有效店鋪資料，請確認欄位（店鋪代碼/店名）");
          e.target.value = "";
          return;
        }
        // 同檔名重匯：先清掉上次此檔匯入的店鋪（本品牌本月），保留手動新增與其他檔匯入
        const prior = db.stores.filter(s => s.srcFile === f.name && s.brandId === brandId && s.month === month).length;
        setDB(d => ({
          ...d,
          stores: [...d.stores.filter(s => !(s.srcFile === f.name && s.brandId === brandId && s.month === month)), ...items]
        }));
        toast(`已匯入 ${items.length} 筆店鋪資料 ✔${subCount ? `（自動展開 ${subCount} 筆分倉）` : ""}${prior ? `；已清除同檔名舊資料 ${prior} 筆` : ""}`);
      } else {
        const hDiv = findH(/部別|部門|div/i);
        const hSec = findH(/課別|主責課/i);
        const hEmp = findH(/工號|員工編號|員編|empNo/i);
        const hNm = headers.find(h => /姓名|名稱|name/i.test(String(h)));
        const hTitle = findH(/職稱|職務|title/i);
        const get = (r, h) => h ? String(r[h] == null ? "" : r[h]).trim() : "";
        const items = rows.map(r => ({
          div: get(r, hDiv),
          dept: get(r, hSec),
          empNo: get(r, hEmp),
          name: get(r, hNm),
          title: get(r, hTitle)
        })).filter(x => x.empNo && x.name).map(x => ({
          id: uid("P"),
          brandId,
          month,
          div: x.div,
          dept: x.dept,
          empNo: x.empNo,
          name: x.name,
          title: x.title,
          srcFile: f.name
        }));
        if (items.length === 0) {
          toast("未讀到有效人員資料，請確認欄位（工號／姓名）");
          e.target.value = "";
          return;
        }
        const prior = db.staff.filter(p => p.srcFile === f.name && p.brandId === brandId && p.month === month).length;
        setDB(d => ({
          ...d,
          staff: [...d.staff.filter(p => !(p.srcFile === f.name && p.brandId === brandId && p.month === month)), ...items]
        }));
        toast(`已匯入 ${items.length} 位盤點人員 ✔${prior ? `（已清除同檔名舊資料 ${prior} 筆）` : ""}`);
      }
    } catch (err) {
      toast("Excel 解析失敗，請確認檔案格式");
    }
    e.target.value = "";
  };
  const removeStore = id => setDB(d => ({
    ...d,
    stores: d.stores.filter(s => s.id !== id)
  }));
  const removeStaff = id => setDB(d => ({
    ...d,
    staff: d.staff.filter(p => p.id !== id)
  }));
  // 清除本品牌本月的整份店鋪名單（例如名單匯錯要整批重來）
  const clearStores = () => {
    if (stores.length === 0) {
      toast("此品牌本月尚無店鋪名單");
      return;
    }
    if (!confirm(`確定要清除「${db.brands.find(b => b.id === brandId)?.name || ""}」${month} 的整份店鋪名單（共 ${stores.length} 筆）嗎？`)) return;
    setDB(d => ({
      ...d,
      stores: d.stores.filter(s => !(s.brandId === brandId && s.month === month))
    }));
    toast("已清除本月店鋪名單 ✔");
  };

  // 單價以品牌為單位
  const setPrice = (bId, patch) => {
    setDB(d => {
      const exists = d.prices.find(p => p.brandId === bId);
      const prices = exists ? d.prices.map(p => p.brandId === bId ? {
        ...p,
        ...patch
      } : p) : [...d.prices, {
        brandId: bId,
        priceType: "piece",
        unitPrice: 0,
        ...patch
      }];
      return {
        ...d,
        prices
      };
    });
  };
  const tabs = [{
    id: "stores",
    label: "🏬 店鋪名單"
  }, {
    id: "staff",
    label: "👥 盤點人員名單"
  }, {
    id: "prices",
    label: "💰 單價設定"
  }, {
    id: "upload",
    label: "📤 上傳主檔"
  }, {
    id: "manual",
    label: "📘 盤點手冊"
  }, {
    id: "brands",
    label: "🏷 品牌管理"
  }];
  const inputCls = "px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none";
  const importBtn = (kind, label) => /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("label", {
    className: "px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg cursor-pointer"
  }, "📥 ", label, "（Excel 匯入）", /*#__PURE__*/React.createElement("input", {
    type: "file",
    accept: ".xlsx,.xls",
    className: "hidden",
    onChange: importExcel(kind)
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => downloadTemplate(kind),
    className: "px-3 py-2 text-teal-700 hover:bg-teal-50 border border-teal-600 text-sm rounded-lg"
  }, "⬇ 下載匯入範本"));
  return /*#__PURE__*/React.createElement(SectionCard, {
    title: "🛠 維護區",
    subtitle: "先選品牌、再選月份，維護店鋪名單、盤點人員名單與單價；支援 Excel 匯入或單筆新增"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-3 items-center"
  }, /*#__PURE__*/React.createElement("select", {
    value: brandId,
    onChange: e => setBrandId(e.target.value),
    className: inputCls + " bg-white"
  }, db.brands.map(b => /*#__PURE__*/React.createElement("option", {
    key: b.id,
    value: b.id
  }, b.name))), /*#__PURE__*/React.createElement("input", {
    type: "month",
    value: month,
    onChange: e => setMonth(e.target.value),
    className: inputCls
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-xs text-slate-400"
  }, "※ 月份為全平台共用篩選條件")), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2 mt-5 border-b border-slate-200"
  }, tabs.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    onClick: () => setTab(t.id),
    className: "px-4 py-2 text-sm rounded-t-lg " + (tab === t.id ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100")
  }, t.label))), tab === "stores" && /*#__PURE__*/React.createElement("div", {
    className: "mt-4 space-y-4 fade-in"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-3 items-center"
  }, importBtn("stores", "店鋪名單"), /*#__PURE__*/React.createElement("span", {
    className: "text-slate-300"
  }, "|"), /*#__PURE__*/React.createElement("input", {
    placeholder: "店鋪代碼",
    value: storeForm.code,
    onChange: e => setStoreForm({
      ...storeForm,
      code: e.target.value
    }),
    className: inputCls + " w-24"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "店鋪名稱",
    value: storeForm.name,
    onChange: e => setStoreForm({
      ...storeForm,
      name: e.target.value
    }),
    className: inputCls + " w-36"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "主責課",
    value: storeForm.dept,
    onChange: e => setStoreForm({
      ...storeForm,
      dept: e.target.value
    }),
    className: inputCls + " w-24"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "店鋪種類",
    value: storeForm.category,
    onChange: e => setStoreForm({
      ...storeForm,
      category: e.target.value
    }),
    className: inputCls + " w-24"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "英文店名（對應客戶檔）",
    value: storeForm.enName,
    onChange: e => setStoreForm({
      ...storeForm,
      enName: e.target.value
    }),
    className: inputCls + " w-48"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "倉別量",
    value: storeForm.warehouse,
    onChange: e => setStoreForm({
      ...storeForm,
      warehouse: e.target.value
    }),
    className: inputCls + " w-20"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "盤點日期",
    value: storeForm.auditDate,
    onChange: e => setStoreForm({
      ...storeForm,
      auditDate: e.target.value
    }),
    className: inputCls + " w-28"
  }), /*#__PURE__*/React.createElement("button", {
    onClick: addStore,
    className: "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
  }, "＋ 單筆新增"), /*#__PURE__*/React.createElement("button", {
    onClick: clearStores,
    className: "px-4 py-2 border border-red-400 text-red-500 hover:bg-red-50 text-sm rounded-lg"
  }, "🗑 清除本月名單")), /*#__PURE__*/React.createElement("div", {
    className: "table-scroll"
  }, /*#__PURE__*/React.createElement("table", {
    className: "w-full text-sm"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    className: "text-left text-slate-500 border-b"
  }, /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "代碼"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "名稱"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "主責課"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "店鋪種類"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "英文店名"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "倉別量"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "盤點日期"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "操作")), /*#__PURE__*/React.createElement("tr", {
    className: "border-b"
  }, /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: sFilters.code,
    onChange: v => setSF("code", v),
    options: distinctVals(baseStores, "code")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: sFilters.name,
    onChange: v => setSF("name", v),
    options: distinctVals(baseStores, "name")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: sFilters.dept,
    onChange: v => setSF("dept", v),
    options: distinctDepts(baseStores, "dept")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: sFilters.category,
    onChange: v => setSF("category", v),
    options: distinctVals(baseStores, "category")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: sFilters.enName,
    onChange: v => setSF("enName", v),
    options: distinctVals(baseStores, "enName")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: sFilters.warehouse,
    onChange: v => setSF("warehouse", v),
    options: distinctVals(baseStores, "warehouse")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: sFilters.auditDate,
    onChange: v => setSF("auditDate", v),
    options: distinctVals(baseStores, "auditDate")
  })), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, stores.map(s => /*#__PURE__*/React.createElement("tr", {
    key: s.id,
    className: "border-b last:border-0"
  }, /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4 font-mono"
  }, s.code), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, s.name), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, s.dept || "—"), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, s.category || "—"), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, s.enName || "—"), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, s.warehouse || "—"), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, s.auditDate || "—"), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => removeStore(s.id),
    className: "text-red-500 hover:underline"
  }, "刪除")))), stores.length === 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: "8",
    className: "py-6 text-center text-slate-400"
  }, "查無店鋪，請匯入或新增")))))), tab === "staff" && /*#__PURE__*/React.createElement("div", {
    className: "mt-4 space-y-4 fade-in"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-3 items-center"
  }, importBtn("staff", "盤點人員名單"), /*#__PURE__*/React.createElement("span", {
    className: "text-slate-300"
  }, "|"), /*#__PURE__*/React.createElement("input", {
    placeholder: "部別",
    value: staffForm.div,
    onChange: e => setStaffForm({
      ...staffForm,
      div: e.target.value
    }),
    className: inputCls + " w-20"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "課別",
    value: staffForm.dept,
    onChange: e => setStaffForm({
      ...staffForm,
      dept: e.target.value
    }),
    className: inputCls + " w-24"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "工號",
    value: staffForm.empNo,
    onChange: e => setStaffForm({
      ...staffForm,
      empNo: e.target.value
    }),
    className: inputCls + " w-28"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "姓名（請用範例資料）",
    value: staffForm.name,
    onChange: e => setStaffForm({
      ...staffForm,
      name: e.target.value
    }),
    className: inputCls + " w-40"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "職稱",
    value: staffForm.title,
    onChange: e => setStaffForm({
      ...staffForm,
      title: e.target.value
    }),
    className: inputCls + " w-24"
  }), /*#__PURE__*/React.createElement("button", {
    onClick: addStaff,
    className: "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
  }, "＋ 單筆新增")), /*#__PURE__*/React.createElement("div", {
    className: "table-scroll"
  }, /*#__PURE__*/React.createElement("table", {
    className: "w-full text-sm"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    className: "text-left text-slate-500 border-b"
  }, /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "部別"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "課別"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "工號"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "姓名"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "職稱"), /*#__PURE__*/React.createElement("th", {
    className: "py-2 pr-4"
  }, "操作")), /*#__PURE__*/React.createElement("tr", {
    className: "border-b"
  }, /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: pFilters.div,
    onChange: v => setPF("div", v),
    options: distinctVals(baseStaff, "div")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: pFilters.dept,
    onChange: v => setPF("dept", v),
    options: distinctDepts(baseStaff, "dept")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: pFilters.empNo,
    onChange: v => setPF("empNo", v),
    options: distinctVals(baseStaff, "empNo")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: pFilters.name,
    onChange: v => setPF("name", v),
    options: distinctVals(baseStaff, "name")
  })), /*#__PURE__*/React.createElement("th", {
    className: "py-1 pr-4"
  }, /*#__PURE__*/React.createElement(FilterSelect, {
    value: pFilters.title,
    onChange: v => setPF("title", v),
    options: distinctVals(baseStaff, "title")
  })), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, staff.map(p => /*#__PURE__*/React.createElement("tr", {
    key: p.id,
    className: "border-b last:border-0"
  }, /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, p.div || "—"), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, p.dept || "—"), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4 font-mono"
  }, p.empNo), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, p.name), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, p.title || "—"), /*#__PURE__*/React.createElement("td", {
    className: "py-2 pr-4"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => removeStaff(p.id),
    className: "text-red-500 hover:underline"
  }, "刪除")))), staff.length === 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: "6",
    className: "py-6 text-center text-slate-400"
  }, "查無盤點人員，請匯入或新增")))))), tab === "upload" && /*#__PURE__*/React.createElement("div", {
    className: "mt-4 fade-in"
  }, /*#__PURE__*/React.createElement(UploadZone, {
    db: db,
    setDB: setDB,
    month: month,
    toast: toast,
    brandId: brandId
  })), tab === "manual" && (() => {
    const brandObj = db.brands.find(b => b.id === brandId);
    const manual = (db.manuals || []).find(m => m.brandId === brandId);
    const onManualFile = e => {
      const f = e.target.files[0];
      if (!f) return;
      if (!/\.pdf$/i.test(f.name)) {
        toast("僅接受 PDF 檔");
        e.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const url = await InventoryAPI.uploadManual(reader.result, f.name, brandObj ? brandObj.name : "");
          const rec = {
            brandId,
            fileName: f.name,
            fileUrl: url,
            uploadedAt: new Date().toISOString().slice(0, 10)
          };
          setDB(d => ({
            ...d,
            manuals: [...(d.manuals || []).filter(m => m.brandId !== brandId), rec]
          }));
          toast(`已上傳「${brandObj ? brandObj.name : ""}」盤點手冊 ✔`);
        } catch (err) {
          toast("上傳失敗，請確認網路或稍後再試");
        }
      };
      reader.readAsDataURL(f);
      e.target.value = "";
    };
    return /*#__PURE__*/React.createElement("div", {
      className: "mt-4 space-y-4 fade-in"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-sm text-slate-500"
    }, "上傳「", brandObj ? brandObj.name : "", "」的盤點手冊（PDF）。一個品牌僅一份、不分店鋪種類；重新上傳將取代舊檔。"), /*#__PURE__*/React.createElement("label", {
      className: "inline-block px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg cursor-pointer"
    }, "📤 上傳盤點手冊（PDF）", /*#__PURE__*/React.createElement("input", {
      type: "file",
      accept: ".pdf",
      className: "hidden",
      onChange: onManualFile
    })), manual ? /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-2xl"
    }, "📘"), /*#__PURE__*/React.createElement("div", {
      className: "flex-1"
    }, /*#__PURE__*/React.createElement("div", {
      className: "font-medium text-slate-800"
    }, manual.fileName), /*#__PURE__*/React.createElement("div", {
      className: "text-xs text-slate-500"
    }, "上傳日期：", manual.uploadedAt)), /*#__PURE__*/React.createElement("a", {
      href: manual.fileUrl,
      target: "_blank",
      rel: "noreferrer",
      className: "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
    }, "預覽")) : /*#__PURE__*/React.createElement("p", {
      className: "text-sm text-slate-400"
    }, "尚未上傳手冊"));
  })(), tab === "prices" && (() => {
    const brandObj = db.brands.find(b => b.id === brandId);
    const bp = db.prices.find(x => x.brandId === brandId) || {
      priceType: "piece",
      unitPrice: ""
    };
    const showFees = brandObj && brandObj.name === "英斯伯"; // 英斯伯專屬加收項
    const showOsheng = brandObj && brandObj.name === "歐聖"; // 歐聖：最低收費 + 倉別加計
    return /*#__PURE__*/React.createElement("div", {
      className: "mt-4 fade-in space-y-4"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-sm text-slate-500"
    }, "「", brandObj ? brandObj.name : "", "」的請款單價（一個品牌一個價，不分店鋪）。"), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap gap-4 items-end"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "block text-xs text-slate-500 mb-1"
    }, "計價方式"), /*#__PURE__*/React.createElement("select", {
      value: bp.priceType,
      onChange: e => setPrice(brandId, {
        priceType: e.target.value
      }),
      className: inputCls + " bg-white"
    }, /*#__PURE__*/React.createElement("option", {
      value: "piece"
    }, "依件數（元/件）"), /*#__PURE__*/React.createElement("option", {
      value: "hour"
    }, "依人時（元/人時）"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "block text-xs text-slate-500 mb-1"
    }, "單價（元）"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      min: "0",
      step: "0.01",
      value: bp.unitPrice,
      onChange: e => setPrice(brandId, {
        unitPrice: Number(e.target.value)
      }),
      className: inputCls + " w-32"
    })), showOsheng && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "block text-xs text-slate-500 mb-1"
    }, "最低收費（元/店）"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      min: "0",
      step: "1",
      value: bp.minCharge == null ? "" : bp.minCharge,
      onChange: e => setPrice(brandId, {
        minCharge: Number(e.target.value)
      }),
      className: inputCls + " w-32"
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "block text-xs text-slate-500 mb-1"
    }, "倉別加計（元/倉）"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      min: "0",
      step: "1",
      value: bp.whFee == null ? "" : bp.whFee,
      onChange: e => setPrice(brandId, {
        whFee: Number(e.target.value)
      }),
      className: inputCls + " w-32"
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "block text-xs text-slate-500 mb-1"
    }, "專員成本（元/時）"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      min: "0",
      step: "1",
      value: bp.costRate == null ? "" : bp.costRate,
      onChange: e => setPrice(brandId, {
        costRate: Number(e.target.value)
      }),
      className: inputCls + " w-32"
    }))), showFees && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "block text-xs text-slate-500 mb-1"
    }, "文件處理費（元/場）"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      min: "0",
      step: "1",
      value: bp.docFee == null ? "" : bp.docFee,
      onChange: e => setPrice(brandId, {
        docFee: Number(e.target.value)
      }),
      className: inputCls + " w-32"
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "block text-xs text-slate-500 mb-1"
    }, "超時費（元/場）"), /*#__PURE__*/React.createElement("input", {
      type: "number",
      min: "0",
      step: "1",
      value: bp.otFee == null ? "" : bp.otFee,
      onChange: e => setPrice(brandId, {
        otFee: Number(e.target.value)
      }),
      className: inputCls + " w-32"
    })))), showOsheng && /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-slate-400"
    }, "歐聖請款＝MAX(實盤件數×單價, 最低收費)＋(總倉別-1)×倉別加計；件數不足最低收費者標記「最低收費」。專員成本用於作業分析「損益分析」分頁算成本／毛利。"), showFees && /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-slate-400"
    }, "文件處理費、超時費為英斯伯專屬，預設每場（每筆盤點紀錄）加收；如計算方式不同再告知調整。"));
  })(), tab === "brands" && /*#__PURE__*/React.createElement("div", {
    className: "mt-4 space-y-4 fade-in"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-3"
  }, /*#__PURE__*/React.createElement("input", {
    placeholder: "輸入新品牌名稱",
    value: newBrand,
    onChange: e => setNewBrand(e.target.value),
    className: inputCls + " w-60"
  }), /*#__PURE__*/React.createElement("button", {
    onClick: addBrand,
    className: "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
  }, "＋ 新增品牌")), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-2"
  }, db.brands.map(b => /*#__PURE__*/React.createElement("span", {
    key: b.id,
    className: "px-4 py-2 bg-slate-100 border border-slate-200 rounded-full text-sm"
  }, "🏷 ", b.name)))));
}

/* ============================================================
 * 主應用程式：頁籤導覽 + 權限控管 + 預警通知
 * ============================================================ */
function App() {
  const [db, setDB] = useState(null);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [role, setRole] = useState("manager"); // manager=管理者, staff=盤點人員
  const [tab, setTab] = useState("download");
  const [toastMsg, setToastMsg] = useState("");
  const [showBell, setShowBell] = useState(false);
  const saveTimer = useRef();
  const lastEditRef = useRef(0); // 使用者最後編輯時間（避免自動刷新蓋掉未存的編輯）
  const fromPollRef = useRef(false); // 標記本次 db 變更來自自動刷新（不回寫後端）
  const syncingRef = useRef(false);
  const setSync = v => {
    syncingRef.current = v;
    setSyncing(v);
  };
  const user = sessionStorage.getItem("loginUser") || "demo-user";

  // 權限控管：盤點人員僅可使用下載區與填寫區
  const NAV_TABS = [{
    id: "layout",
    label: "🗺️ Layout 圖",
    roles: ["manager", "staff"]
  }, {
    id: "download",
    label: "📥 主檔下載",
    roles: ["manager", "staff"]
  }, {
    id: "count",
    label: "📋 盤點總表上傳",
    roles: ["manager", "staff"]
  }, {
    id: "fill",
    label: "📝 盤點作業情況紀錄",
    roles: ["manager", "staff"]
  }, {
    id: "analysis",
    label: "📊 數據分析",
    roles: ["manager"]
  }, {
    id: "maintain",
    label: "🛠 維護區",
    roles: ["manager"]
  }];

  // 初次載入：先顯示上次的雲端資料快照（若有），畫面立刻可用；背景同時抓最新資料，抓到再悄悄換上
  // （stale-while-revalidate，避免每次進站都要等 Apps Script／Sheets 讀完才看得到畫面）
  useEffect(() => {
    const cached = InventoryAPI.loadCachedDB();
    if (cached && cached.brands && cached.brands.length) {
      fromPollRef.current = true; // 快取資料不算使用者編輯，不要回寫後端
      setDB(cached);
      setReady(true);
    }
    (async () => {
      let d = await InventoryAPI.loadDB();
      if (!d || !d.brands || d.brands.length === 0) {
        d = seed();
        await InventoryAPI.saveTabs(d, ALL_TABS);
      }
      InventoryAPI.cacheDB(d);
      fromPollRef.current = true; // 剛讀到的最新資料也不算使用者編輯
      setDB(d);
      setReady(true);
    })();
  }, []);

  // 維護類資料變更 → 防抖後同步（紀錄/上傳走 append，不在此重寫，避免多裝置互相覆蓋）
  useEffect(() => {
    if (!ready || !db) return;
    if (fromPollRef.current) {
      fromPollRef.current = false;
      return;
    } // 自動刷新帶來的變更不回寫
    lastEditRef.current = Date.now();
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSync(true);
      try {
        await InventoryAPI.saveTabs(db, ADMIN_TABS);
      } catch (e) {/* 同步失敗，下次變更再試 */} finally {
        setSync(false);
      }
    }, 600);
  }, [db, ready]);

  // 即時更新：每 15 秒自動抓最新資料（近即時；使用者剛編輯或分頁隱藏時略過）
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(async () => {
      if (document.hidden || syncingRef.current) return;
      if (Date.now() - lastEditRef.current < 3000) return;
      try {
        const d = await InventoryAPI.loadDB();
        if (d && d.brands) {
          InventoryAPI.cacheDB(d);
          fromPollRef.current = true;
          setDB(d);
        }
      } catch (e) {/* 忽略單次刷新失敗 */}
    }, 15000);
    return () => clearInterval(id);
  }, [ready]);

  // 手動重新整理
  const refresh = async () => {
    setSync(true);
    try {
      const d = await InventoryAPI.loadDB();
      if (d && d.brands) {
        InventoryAPI.cacheDB(d);
        fromPollRef.current = true;
        setDB(d);
        toast("已更新為最新資料 ✔");
      }
    } catch (e) {
      toast("更新失敗，請確認網路");
    } finally {
      setSync(false);
    }
  };

  // 角色切換時，若目前頁籤無權限則跳回第一個可用頁籤
  useEffect(() => {
    const visible = NAV_TABS.filter(t => t.roles.includes(role));
    if (!visible.some(t => t.id === tab)) setTab(visible[0].id);
  }, [role]);
  const toast = msg => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2500);
  };
  if (!ready || !db) {
    return /*#__PURE__*/React.createElement("div", {
      className: "min-h-screen flex items-center justify-center text-slate-500"
    }, "載入中…");
  }

  // 預警機制：本月尚未填寫盤點紀錄的店鋪
  const pendingStores = db.stores.filter(s => s.month === month && !db.records.some(r => r.storeId === s.id && r.month === month));
  const visibleTabs = NAV_TABS.filter(t => t.roles.includes(role));
  const logout = () => {
    sessionStorage.removeItem("loginUser");
    window.location.href = "index.html";
  };
  const resetDemo = async () => {
    if (!confirm("確定要清除目前資料並回復範例資料嗎？")) return;
    await InventoryAPI.saveTabs(seed(), ALL_TABS);
    location.reload();
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen"
  }, /*#__PURE__*/React.createElement("header", {
    className: "bg-slate-900 text-white sticky top-0 z-40 shadow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 mr-auto"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-2xl"
  }, "📋"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "font-bold"
  }, "日翊外盤平台"), /*#__PURE__*/React.createElement("div", {
    className: "text-[11px] text-slate-400"
  }, "多品牌盤點作業管理系統"))), /*#__PURE__*/React.createElement("button", {
    onClick: refresh,
    disabled: syncing,
    title: "重新整理（抓最新資料）",
    className: "px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg text-sm"
  }, syncing ? "⟳ 更新中" : "⟳ 重新整理"), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowBell(!showBell),
    className: "relative px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm"
  }, "🔔", pendingStores.length > 0 && /*#__PURE__*/React.createElement("span", {
    className: "absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center"
  }, pendingStores.length)), showBell && /*#__PURE__*/React.createElement("div", {
    className: "absolute right-0 mt-2 w-72 bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 p-4 fade-in"
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-semibold text-sm mb-2"
  }, "⚠ 本月未填寫盤點紀錄的店鋪"), pendingStores.length === 0 ? /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-emerald-600"
  }, "全部店鋪皆已完成填寫 🎉") : /*#__PURE__*/React.createElement("ul", {
    className: "text-sm space-y-1 max-h-48 overflow-y-auto"
  }, pendingStores.map(s => /*#__PURE__*/React.createElement("li", {
    key: s.id,
    className: "text-slate-600"
  }, "• ", s.code, " ", s.name))))), /*#__PURE__*/React.createElement("select", {
    value: role,
    onChange: e => setRole(e.target.value),
    className: "px-2 py-1.5 rounded-lg text-sm text-slate-800 bg-white"
  }, /*#__PURE__*/React.createElement("option", {
    value: "manager"
  }, "👑 管理者"), /*#__PURE__*/React.createElement("option", {
    value: "staff"
  }, "🧑‍🔧 盤點人員")), /*#__PURE__*/React.createElement("div", {
    className: "text-sm text-slate-300"
  }, user), /*#__PURE__*/React.createElement("button", {
    onClick: logout,
    className: "px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-sm"
  }, "登出")), /*#__PURE__*/React.createElement("nav", {
    className: "max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto"
  }, visibleTabs.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    onClick: () => setTab(t.id),
    className: "px-4 py-2.5 text-sm whitespace-nowrap rounded-t-lg " + (tab === t.id ? "bg-slate-100 text-slate-900 font-semibold" : "text-slate-300 hover:bg-slate-800")
  }, t.label)))), /*#__PURE__*/React.createElement("main", {
    className: "max-w-7xl mx-auto px-4 py-6"
  }, tab === "layout" && /*#__PURE__*/React.createElement(LayoutZone, {
    db: db,
    setDB: setDB,
    month: month,
    setMonth: setMonth,
    toast: toast
  }), tab === "download" && /*#__PURE__*/React.createElement(DownloadZone, {
    db: db,
    month: month,
    setMonth: setMonth,
    toast: toast
  }), tab === "count" && /*#__PURE__*/React.createElement(CountUploadZone, {
    db: db,
    setDB: setDB,
    month: month,
    setMonth: setMonth,
    toast: toast
  }), tab === "fill" && /*#__PURE__*/React.createElement(FillZone, {
    db: db,
    setDB: setDB,
    month: month,
    setMonth: setMonth,
    user: user,
    toast: toast
  }), tab === "analysis" && /*#__PURE__*/React.createElement(AnalysisZone, {
    db: db,
    setDB: setDB,
    month: month,
    setMonth: setMonth,
    toast: toast
  }), tab === "maintain" && /*#__PURE__*/React.createElement(MaintainZone, {
    db: db,
    setDB: setDB,
    month: month,
    setMonth: setMonth,
    toast: toast
  })), /*#__PURE__*/React.createElement("footer", {
    className: "text-center text-xs text-slate-400 pb-6"
  }, InventoryAPI.cloud() ? /*#__PURE__*/React.createElement("span", null, "雲端共用模式（Google Sheets / Drive）· ", syncing ? "☁ 同步中…" : "☁ 已同步") : /*#__PURE__*/React.createElement("span", null, "本機測試模式 — 資料暫存於此瀏覽器（尚未設定 Google Sheets 網址）"), /*#__PURE__*/React.createElement("button", {
    onClick: resetDemo,
    className: "underline ml-2 hover:text-slate-600"
  }, "重置範例資料")), /*#__PURE__*/React.createElement(Toast, {
    msg: toastMsg
  }));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));
