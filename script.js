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
 * ============================================================ */

const { useState, useEffect, useMemo, useRef } = React;

/* ---------------- Mock Data（範例資料，禁止填入真實個資） ---------------- */
const CURRENT_MONTH = "2026-07";

const seedDB = {
  brands: [
    { id: "B01", name: "歐聖" },
    { id: "B02", name: "英斯伯" },
    { id: "B03", name: "歐都納" },
  ],
  stores: [
    { id: "S001", brandId: "B01", month: CURRENT_MONTH, code: "AS-001", name: "微風本館 JV", dept: "北一課", category: "JV", enName: "JV BREEZE MAIN", warehouse: "" },
    { id: "S002", brandId: "B01", month: CURRENT_MONTH, code: "AS-002", name: "微風南山 JV", dept: "北一課", category: "JV", enName: "JV BREEZE NANSHAN", warehouse: "" },
    { id: "S003", brandId: "B01", month: CURRENT_MONTH, code: "AS-003", name: "桃園統領 JV", dept: "中區課", category: "JV", enName: "JV GLORIA TAOYUAN", warehouse: "" },
    { id: "S004", brandId: "B02", month: CURRENT_MONTH, code: "IB-001", name: "英斯伯-信義店", dept: "北一課" },
    { id: "S005", brandId: "B02", month: CURRENT_MONTH, code: "IB-002", name: "英斯伯-板橋店", dept: "北二課" },
    { id: "S006", brandId: "B03", month: CURRENT_MONTH, code: "AT-001", name: "歐都納-南港店", dept: "北一課" },
    { id: "S007", brandId: "B03", month: CURRENT_MONTH, code: "AT-002", name: "歐都納-新竹店", dept: "北二課" },
  ],
  staff: [
    { id: "P001", brandId: "B01", month: CURRENT_MONTH, div: "一部", dept: "北一課", empNo: "E001", name: "王小明（範例）", title: "資深專員" },
    { id: "P002", brandId: "B01", month: CURRENT_MONTH, div: "一部", dept: "北二課", empNo: "E002", name: "李小華（範例）", title: "專員" },
    { id: "P003", brandId: "B02", month: CURRENT_MONTH, div: "一部", dept: "北一課", empNo: "E003", name: "張小美（範例）", title: "專員" },
    { id: "P004", brandId: "B03", month: CURRENT_MONTH, div: "二部", dept: "台中課", empNo: "E004", name: "陳小強（範例）", title: "課長" },
  ],
  // 單價設定：一個品牌一個價。priceType = "piece"（依件數）或 "hour"（依人時）
  // 英斯伯(B02)另有 docFee(文件處理費)、otFee(超時費)，每場加收
  prices: [
    { brandId: "B01", priceType: "piece", unitPrice: 0.5 },
    { brandId: "B02", priceType: "hour", unitPrice: 320, docFee: 500, otFee: 200 },
    { brandId: "B03", priceType: "piece", unitPrice: 0.6 },
  ],
  // 填寫區作業紀錄
  records: [
    {
      id: "R001", brandId: "B01", storeId: "S001", month: CURRENT_MONTH,
      date: "2026-07-05", startTime: "21:00", endTime: "23:30",
      headcount: 4, pieces: 12800, special: "冷凍櫃區域燈光不足，作業速度較慢",
      photos: [], filledBy: "王小明（範例）",
    },
    {
      id: "R002", brandId: "B02", storeId: "S004", month: CURRENT_MONTH,
      date: "2026-07-06", startTime: "22:00", endTime: "01:00",
      headcount: 3, pieces: 6400, special: "",
      photos: [], filledBy: "張小美（範例）",
    },
  ],
  uploads: [], // 上傳區：客戶主檔上傳紀錄
  aliases: [], // 店名對應記憶：{ brandId, key(正規化欄標題), storeId }
};

/* ---------------- 資料存取（透過 api.js 抽象層） ----------------
 * 維護類資料（單一管理者編輯）→ 整表覆蓋（ADMIN_TABS）
 * 盤點/上傳紀錄（多裝置同時新增）→ 逐筆 append，避免互相覆蓋
 */
const ADMIN_TABS = ["brands", "stores", "staff", "prices", "aliases"];
const ALL_TABS = [...ADMIN_TABS, "records", "uploads"];
function seed() { return JSON.parse(JSON.stringify(seedDB)); }

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
  return Math.round((mins / 60) * 100) / 100;
}

// 後端（Google Sheets 純文字格式）讀回的數值/布林為字串，統一轉型
function num(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
function truthy(v) { return v === true || v === 1 || v === "1" || v === "true" || v === "TRUE" || v === "是"; }

// 欄位篩選：filters 為 { 欄位鍵: 關鍵字 }，全部符合（不分大小寫子字串）才保留
function matchFilters(row, filters) {
  return Object.keys(filters).every((k) => {
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
  const clean = aoa.map((row) => row.map((v) => (asText ? (v == null ? "" : String(v)) : safeCell(v))));
  const ws = XLSX.utils.aoa_to_sheet(clean);
  if (asText) {
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        if (cell) { cell.t = "s"; cell.z = "@"; }
      }
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (sheetName || "工作表1").slice(0, 31));
  XLSX.writeFile(wb, filename);
}

// 標準主檔／庫存檔輸出欄位（順序、名稱需與客戶範本一致；庫存數量為數量欄）
const MASTER_COLS = ["商品編號", "barcode", "舊商品編號2", "物品名稱", "庫存數量", "品項平均成本"];
const QTY_COL = "庫存數量";
const CODE_COL = "商品編號"; // A 欄，不可重複

// 歐聖客戶主檔為「寬表」：固定商品欄 + 其後每欄一個店鋪/倉別
const OSHENG_FIXED_COLS = ["商品條碼", "STYLENUMBER", "STYLE_NAME", "尺寸", "顏色", "零售價"];
const isOshengBrand = (brand) => !!brand && brand.name === "歐聖";

// 是否為整數字串
function isIntStr(v) { const s = String(v == null ? "" : v).trim(); return s === "" || /^-?\d+$/.test(s); }

// 從客戶檔名解析日期，例 "TW JEW_6Jan26-原" → "20260106"（找不到回空字串）
const MON3 = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function parseDateFromName(fn) {
  const m = String(fn || "").match(/(\d{1,2})\s*([A-Za-z]{3,})\s*(\d{2,4})/);
  if (!m) return "";
  const d = +m[1], mo = MON3[m[2].slice(0, 3).toLowerCase()], y = m[3].length <= 2 ? 2000 + (+m[3]) : +m[3];
  if (!mo) return "";
  return "" + y + String(mo).padStart(2, "0") + String(d).padStart(2, "0");
}
// 找第一個重複值（找不到回傳 null）
function firstDup(arr) { const seen = new Set(); for (const x of arr) { const k = String(x); if (seen.has(k)) return k; seen.add(k); } return null; }
// 店名正規化後比對（英文店名 ← 客戶檔欄標題，容許大小寫/空白/底線/連字差異）
function normName(s) { return String(s == null ? "" : s).toLowerCase().replace(/[\s_\-\.]+/g, ""); }
function findStoreByEnName(stores, header) {
  const h = normName(header);
  if (!h) return null;
  let s = stores.find((x) => normName(x.enName) === h);
  if (s) return s;
  s = stores.find((x) => x.enName && (normName(x.enName).includes(h) || h.includes(normName(x.enName))));
  return s || null;
}

// 讀取上傳的 .xlsx / .xls；回傳 { headers:[...], rows:[{欄名:值}] }
function readXLSX(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
        const headers = (aoa[0] || []).map((h) => String(h).trim()).filter((h) => h !== "");
        const rows = aoa.slice(1)
          .filter((r) => r.some((c) => String(c).trim() !== ""))
          .map((r) => { const o = {}; headers.forEach((h, i) => { o[h] = r[i] == null ? "" : r[i]; }); return o; });
        resolve({ headers, rows });
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/* ---------------- 共用元件 ---------------- */
// 欄位篩選輸入框（放在表頭下方一列）
function FilterInput({ value, onChange, placeholder }) {
  return (
    <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || "篩選…"}
      className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-normal text-slate-700 focus:ring-1 focus:ring-blue-400 outline-none" />
  );
}

// 下拉選單式篩選（選項為該欄不重複值）
function FilterSelect({ value, onChange, options }) {
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)}
      className="w-full px-2 py-1 border border-slate-200 rounded text-xs font-normal text-slate-700 bg-white focus:ring-1 focus:ring-blue-400 outline-none">
      <option value="">全部</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
// 取某欄不重複值（排序）供下拉選單
function distinctVals(rows, key) {
  return Array.from(new Set(rows.map((r) => String(r[key] == null ? "" : r[key])).filter((v) => v !== ""))).sort();
}

function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div className="toast bg-slate-800 text-white text-sm px-5 py-3 rounded-xl shadow-lg">
      {msg}
    </div>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 fade-in">
      <h2 className="text-lg font-bold text-slate-800">{title}</h2>
      {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

// 品牌 → 店鋪 連動選擇器（平台規則：各區域先選品牌再選店鋪）
function BrandStoreSelect({ db, brandId, storeId, month, onBrand, onStore, showStore = true }) {
  const stores = db.stores.filter((s) => s.brandId === brandId && s.month === month);
  return (
    <div className="flex flex-wrap gap-3">
      <select value={brandId} onChange={(e) => onBrand(e.target.value)}
        className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
        <option value="">— 請選擇品牌 —</option>
        {db.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      {showStore && (
        <select value={storeId} onChange={(e) => onStore(e.target.value)} disabled={!brandId}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white disabled:bg-slate-100 focus:ring-2 focus:ring-blue-500 outline-none">
          <option value="">— 請選擇店鋪 —</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}
        </select>
      )}
    </div>
  );
}

/* ============================================================
 * 1. 主檔下載：各店盤點主檔 / 庫存檔 / 盤點手冊
 * ============================================================ */
function DownloadZone({ db, month, toast }) {
  const [brandId, setBrandId] = useState("");
  const [busy, setBusy] = useState("");
  const [filters, setFilters] = useState({});
  const setF = (k, v) => setFilters((p) => ({ ...p, [k]: v }));
  const index = db.mastersIndex || [];
  const brand = db.brands.find((b) => b.id === brandId);
  const osheng = isOshengBrand(brand);

  // 歐聖主檔以「店鋪種類」為單位（storeId=CAT::種類）；其他品牌主檔為單店
  const masterKey = (s) => osheng ? ("CAT::" + (s.category || "")) : s.id;
  const has = (storeId, type) => index.some((m) => m.storeId === storeId && m.month === month && m.type === type);

  const baseStores = db.stores
    .filter((s) => s.brandId === brandId && s.month === month)
    .map((s) => ({ ...s, masterStatus: has(masterKey(s), "master") ? "可下載" : "尚未產製", stockStatus: has(s.id, "stock") ? "可下載" : "尚未產製" }));
  const stores = baseStores.filter((s) => matchFilters(s, filters));

  // 下載：輸出上傳時已重建好的標準格式（全部文字）；主檔取店鋪種類、庫存檔取單店
  const download = async (store, type) => {
    const label = type === "master" ? "主檔" : "庫存檔";
    const key = type === "master" ? masterKey(store) : store.id;
    const namePart = type === "master" && osheng ? (store.category || store.name) : store.name;
    setBusy(store.id + type);
    try {
      const m = await InventoryAPI.getMaster(key, month, type);
      if (!m || !m.columns || m.columns.length === 0) { toast(`查無此${label}，請重新整理或請管理者上傳`); return; }
      const rows = m.rows.map((r) => m.columns.map((c) => (r[c] == null ? "" : r[c])));
      const idxEntry = index.find((x) => x.storeId === key && x.month === month && x.type === type);
      const dateStr = (idxEntry && idxEntry.srcDate) ? idxEntry.srcDate : new Date().toISOString().slice(0, 10).replace(/-/g, "");
      exportXLSX(`${brand ? brand.name : ""}盤點用${label}-${namePart}-${dateStr}.xlsx`, label, [m.columns, ...rows], { asText: true });
      toast(`已下載 ${namePart} ${label}（${m.rows.length} 筆）`);
    } catch (e) {
      toast("下載失敗，請確認網路後再試");
    } finally { setBusy(""); }
  };

  const cell = (s, type) => (type === "master" ? has(masterKey(s), "master") : has(s.id, "stock"))
    ? <button disabled={busy === s.id + type} onClick={() => download(s, type)}
        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white rounded-lg">
        {busy === s.id + type ? "下載中…" : "⬇ 下載"}</button>
    : <span className="text-slate-400">尚未產製</span>;

  return (
    <SectionCard title="📥 主檔下載" subtitle="下載各盤點店鋪的盤點主檔、庫存檔（Excel）及盤點手冊；各欄用選單篩選">
      <BrandStoreSelect db={db} brandId={brandId} month={month} onBrand={setBrandId} showStore={false} />

      {brand && (
        <div className="mt-4 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <span className="text-2xl">📘</span>
          <div className="flex-1">
            <div className="font-medium text-slate-800">{brand.name} 盤點手冊</div>
            <div className="text-xs text-slate-500">品牌通用作業手冊（PDF）{osheng && "；歐聖主檔以店鋪種類提供（同種類共用一份）"}</div>
          </div>
          <button onClick={() => toast(`已下載 ${brand.name} 盤點手冊（原型模擬）`)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">下載手冊</button>
        </div>
      )}

      {brandId && (
        <div className="table-scroll mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-4">店鋪代碼</th>
                <th className="py-2 pr-4">店鋪名稱</th>
                <th className="py-2 pr-4">主責課</th>
                <th className="py-2 pr-4">店鋪種類</th>
                <th className="py-2 pr-4">盤點主檔</th>
                <th className="py-2 pr-4">庫存檔</th>
              </tr>
              <tr className="border-b">
                <th className="py-1 pr-4"><FilterSelect value={filters.code} onChange={(v) => setF("code", v)} options={distinctVals(baseStores, "code")} /></th>
                <th className="py-1 pr-4"><FilterSelect value={filters.name} onChange={(v) => setF("name", v)} options={distinctVals(baseStores, "name")} /></th>
                <th className="py-1 pr-4"><FilterSelect value={filters.dept} onChange={(v) => setF("dept", v)} options={distinctVals(baseStores, "dept")} /></th>
                <th className="py-1 pr-4"><FilterSelect value={filters.category} onChange={(v) => setF("category", v)} options={distinctVals(baseStores, "category")} /></th>
                <th className="py-1 pr-4"><FilterSelect value={filters.masterStatus} onChange={(v) => setF("masterStatus", v)} options={["可下載", "尚未產製"]} /></th>
                <th className="py-1 pr-4"><FilterSelect value={filters.stockStatus} onChange={(v) => setF("stockStatus", v)} options={["可下載", "尚未產製"]} /></th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="py-3 pr-4 font-mono">{s.code}</td>
                  <td className="py-3 pr-4">{s.name}</td>
                  <td className="py-3 pr-4">{s.dept || "—"}</td>
                  <td className="py-3 pr-4">{s.category || "—"}</td>
                  <td className="py-3 pr-4">{cell(s, "master")}</td>
                  <td className="py-3 pr-4">{cell(s, "stock")}</td>
                </tr>
              ))}
              {stores.length === 0 && (
                <tr><td colSpan="6" className="py-6 text-center text-slate-400">查無符合條件的店鋪</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {!brandId && <p className="mt-4 text-sm text-slate-400">請先選擇品牌以顯示店鋪檔案清單</p>}
    </SectionCard>
  );
}

/* ============================================================
 * 2. 填寫區：作業時間 / 件數人數 / 特殊狀況 / 紙本報表照片
 * ============================================================ */
function FillZone({ db, setDB, month, user, toast }) {
  const empty = { brandId: "", storeId: "", date: "", startTime: "", endTime: "", headcount: "", pieces: "", special: "", photos: [] };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const hours = calcHours(form.startTime, form.endTime);

  const onPhotos = (e) => {
    const files = Array.from(e.target.files).slice(0, 6);
    Promise.all(files.map((f) => new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res({ name: f.name, dataUrl: r.result });
      r.readAsDataURL(f);
    }))).then((photos) => set("photos", [...form.photos, ...photos].slice(0, 6)));
  };

  // 資料驗證規則：必填欄位檢查
  const validate = () => {
    const err = {};
    if (!form.brandId) err.brandId = "請選擇品牌";
    if (!form.storeId) err.storeId = "請選擇店鋪";
    if (!form.date) err.date = "請選擇盤點日期";
    if (!form.startTime || !form.endTime) err.time = "請填寫作業開始與結束時間";
    if (!form.headcount || Number(form.headcount) <= 0) err.headcount = "人數須大於 0";
    if (!form.pieces || Number(form.pieces) <= 0) err.pieces = "件數須大於 0";
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  // 儲存盤點紀錄：照片先上傳（雲端模式存 Drive、回傳連結）→ append 一筆紀錄
  // TODO: 未來改接日翊資料庫時，對應 api.js 的 uploadPhoto / appendRow
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!validate()) { toast("尚有欄位未通過驗證，請檢查紅字提示"); return; }
    setSaving(true);
    toast("儲存中…");
    try {
      const photos = [];
      for (const p of form.photos) {
        const url = await InventoryAPI.uploadPhoto(p.dataUrl, p.name);
        photos.push(InventoryAPI.cloud() ? { name: p.name, url } : { name: p.name });
      }
      const rec = {
        id: uid("R"), brandId: form.brandId, storeId: form.storeId, month,
        date: form.date, startTime: form.startTime, endTime: form.endTime,
        headcount: Number(form.headcount), pieces: Number(form.pieces),
        special: form.special, photos, filledBy: user,
      };
      const next = { ...db, records: [...db.records, rec] };
      setDB(next);
      await InventoryAPI.appendRow(next, "records", rec);
      setForm(empty); setErrors({});
      toast("盤點作業紀錄已儲存 ✔");
    } catch (e) {
      toast("儲存失敗，請確認網路或稍後再試");
    } finally {
      setSaving(false);
    }
  };

  const [filters, setFilters] = useState({});
  const setFilt = (k, v) => setFilters((p) => ({ ...p, [k]: v }));
  const myRecords = db.records
    .filter((r) => r.month === month)
    .map((r) => {
      const store = db.stores.find((s) => s.id === r.storeId);
      const brand = db.brands.find((b) => b.id === r.brandId);
      return { ...r, brandName: brand ? brand.name : "", storeName: store ? store.name : "", dept: store ? store.dept : "", timeRange: `${r.startTime}–${r.endTime}`, piecesNum: num(r.pieces) };
    })
    .filter((r) => matchFilters(r, filters));

  const Err = ({ k }) => errors[k] ? <p className="text-xs text-red-600 mt-1">{errors[k]}</p> : null;
  const inputCls = "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none";

  return (
    <div className="space-y-6">
      <SectionCard title="📝 盤點作業情況紀錄" subtitle="記錄盤點作業時間、件數人數、特殊狀況及紙本報表照片">
        <div className="space-y-4">
          <div>
            <BrandStoreSelect db={db} brandId={form.brandId} storeId={form.storeId} month={month}
              onBrand={(v) => setForm((f) => ({ ...f, brandId: v, storeId: "" }))}
              onStore={(v) => set("storeId", v)} />
            <Err k="brandId" /><Err k="storeId" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-slate-600">盤點日期 *</label>
              <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className={inputCls} />
              <Err k="date" />
            </div>
            <div>
              <label className="text-sm text-slate-600">開始時間 *</label>
              <input type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-sm text-slate-600">結束時間 *（跨夜自動計算）</label>
              <input type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} className={inputCls} />
              <Err k="time" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-slate-600">作業人數 *</label>
              <input type="number" min="1" value={form.headcount} onChange={(e) => set("headcount", e.target.value)} className={inputCls} placeholder="例：4" />
              <Err k="headcount" />
            </div>
            <div>
              <label className="text-sm text-slate-600">盤點件數 *</label>
              <input type="number" min="1" value={form.pieces} onChange={(e) => set("pieces", e.target.value)} className={inputCls} placeholder="例：12800" />
              <Err k="pieces" />
            </div>
            <div>
              <label className="text-sm text-slate-600">作業時數（自動計算）</label>
              <div className="px-3 py-2 bg-slate-100 rounded-lg text-sm font-mono">{hours > 0 ? `${hours} 小時` : "—"}</div>
            </div>
          </div>

          <div>
            <label className="text-sm text-slate-600">特殊狀況說明</label>
            <textarea rows="3" value={form.special} onChange={(e) => set("special", e.target.value)}
              className={inputCls} placeholder="例：冷凍櫃區域燈光不足、部分商品無條碼需手key…" />
          </div>

          <div>
            <label className="text-sm text-slate-600">紙本報表照片（最多 6 張）</label>
            <input type="file" accept="image/*" multiple onChange={onPhotos}
              className="block mt-1 text-sm text-slate-500 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            {form.photos.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {form.photos.map((p, i) => (
                  <div key={i} className="relative">
                    <img src={p.dataUrl} className="photo-thumb" alt={p.name} />
                    <button onClick={() => set("photos", form.photos.filter((_, j) => j !== i))}
                      className="absolute -top-2 -right-2 bg-red-500 text-white w-5 h-5 rounded-full text-xs">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button onClick={submit} disabled={saving}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-medium rounded-lg">
            {saving ? "儲存中…" : "儲存盤點紀錄"}
          </button>
        </div>
      </SectionCard>

      <SectionCard title="🗂 本月盤點作業紀錄" subtitle={`${month} 共 ${myRecords.length} 筆（各欄可篩選）`}>
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-4">日期</th><th className="py-2 pr-4">品牌</th><th className="py-2 pr-4">店鋪</th>
                <th className="py-2 pr-4">主責課</th><th className="py-2 pr-4">時間</th><th className="py-2 pr-4">人數</th><th className="py-2 pr-4">件數</th>
                <th className="py-2 pr-4">特殊狀況</th><th className="py-2 pr-4">填寫人</th>
              </tr>
              <tr className="border-b">
                <th className="py-1 pr-4"><FilterInput value={filters.date} onChange={(v) => setFilt("date", v)} /></th>
                <th className="py-1 pr-4"><FilterInput value={filters.brandName} onChange={(v) => setFilt("brandName", v)} /></th>
                <th className="py-1 pr-4"><FilterInput value={filters.storeName} onChange={(v) => setFilt("storeName", v)} /></th>
                <th className="py-1 pr-4"><FilterInput value={filters.dept} onChange={(v) => setFilt("dept", v)} /></th>
                <th className="py-1 pr-4"><FilterInput value={filters.timeRange} onChange={(v) => setFilt("timeRange", v)} /></th>
                <th className="py-1 pr-4"><FilterInput value={filters.headcount} onChange={(v) => setFilt("headcount", v)} /></th>
                <th className="py-1 pr-4"><FilterInput value={filters.piecesNum} onChange={(v) => setFilt("piecesNum", v)} /></th>
                <th className="py-1 pr-4"><FilterInput value={filters.special} onChange={(v) => setFilt("special", v)} /></th>
                <th className="py-1 pr-4"><FilterInput value={filters.filledBy} onChange={(v) => setFilt("filledBy", v)} /></th>
              </tr>
            </thead>
            <tbody>
              {myRecords.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">{r.date}</td>
                  <td className="py-2 pr-4">{r.brandName}</td>
                  <td className="py-2 pr-4">{r.storeName}</td>
                  <td className="py-2 pr-4">{r.dept || "—"}</td>
                  <td className="py-2 pr-4 font-mono">{r.timeRange}</td>
                  <td className="py-2 pr-4">{r.headcount}</td>
                  <td className="py-2 pr-4">{r.piecesNum.toLocaleString()}</td>
                  <td className="py-2 pr-4 max-w-[200px] truncate" title={r.special}>{r.special || "—"}</td>
                  <td className="py-2 pr-4">{r.filledBy}</td>
                </tr>
              ))}
              {myRecords.length === 0 && <tr><td colSpan="9" className="py-6 text-center text-slate-400">查無符合條件的紀錄</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

/* ============================================================
 * 3. 上傳區：上傳客戶主檔 → 依店鋪及盤點程式格式產製各店主檔（庫存檔）
 * ============================================================ */
function UploadZone({ db, setDB, month, toast, brandId }) {
  const [fileType, setFileType] = useState("master");  // master=盤點前主檔(數量帶0), stock=盤點當日庫存檔(帶客戶數量)
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);          // { headers, rows }
  const [storeCol, setStoreCol] = useState("");        // 哪一欄對應店鋪
  const [matchBy, setMatchBy] = useState("code");      // 以店鋪代碼或名稱對應
  const [colMap, setColMap] = useState({});            // 標準欄位 → 客戶檔來源欄
  const [colStore, setColStore] = useState({});        // 歐聖：客戶檔店名欄 → storeId（自動比對＋手動調整）
  const [busy, setBusy] = useState(false);
  const isStock = fileType === "stock";
  const stores = db.stores.filter((s) => s.brandId === brandId && s.month === month);
  const brand = db.brands.find((b) => b.id === brandId);
  const aliases = db.aliases || [];

  // 解析店名欄 → 店鋪：先查記憶(aliases)，再用英文店名/中文名模糊比對
  const resolveStore = (header) => {
    const key = normName(header);
    const a = aliases.find((x) => x.brandId === brandId && x.key === key);
    if (a) { const s = stores.find((x) => x.id === a.storeId); if (s) return s; }
    return findStoreByEnName(stores, header);
  };

  // 依標準欄位自動猜測對應的來源欄
  const guessMap = (headers) => {
    const rules = {
      "商品編號": /商品編號|品號|貨號|item|sku/i,
      "barcode": /barcode|條碼|國際條碼|ean/i,
      "舊商品編號2": /舊.*編號|old/i,
      "物品名稱": /品名|物品名稱|名稱|品項名稱|name/i,
      "庫存數量": /數量|庫存|存量|qty|stock/i,
      "品項平均成本": /成本|平均成本|單價|cost|price/i,
    };
    const map = {};
    MASTER_COLS.forEach((c) => { map[c] = headers.find((h) => rules[c].test(h)) || ""; });
    return map;
  };

  // 選檔後立即解析 Excel，讀出表頭供對應
  const onFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (!/\.(xlsx|xls)$/i.test(f.name)) { toast("僅接受 Excel 檔（.xlsx / .xls）"); e.target.value = ""; return; }
    setFile(f); setParsed(null); setStoreCol(""); setColStore({});
    try {
      const { headers, rows } = await readXLSX(f);
      if (headers.length === 0 || rows.length === 0) { toast("檔案沒有可讀取的資料列"); return; }
      setParsed({ headers, rows });
      const guess = headers.find((h) => /店|門市|store|shop|代碼|code/i.test(h));
      setStoreCol(guess || headers[0]);
      setColMap(guessMap(headers));
      // 歐聖：對每個店名/倉別欄做自動比對，預填對應下拉
      if (isOshengBrand(brand)) {
        const cs = {};
        headers.filter((h) => !OSHENG_FIXED_COLS.includes(h)).forEach((h) => { const s = resolveStore(h); cs[h] = s ? s.id : ""; });
        setColStore(cs);
      }
    } catch (err) { toast("Excel 解析失敗，請確認檔案格式"); }
  };

  const osheng = isOshengBrand(brand);

  // 共用驗證：商品編號(A欄)不可重複、庫存數量(E欄)須整數。回傳錯誤訊息或 null
  const validateRows = (rows) => {
    if (firstDup(rows.map((r) => r[CODE_COL]))) return "主檔商品編號重複";
    for (const r of rows) { if (!isIntStr(r[QTY_COL])) return "庫存數量須為整數"; }
    return null;
  };

  // 寫入上傳紀錄與索引、記憶店名對應、提示、清空
  const finalize = async (addedIdx, matched, unmatched, label, newAliases) => {
    const uploadRec = { id: uid("U"), brandId, month, type: fileType, fileName: file.name, storeCount: matched, rowCount: parsed.rows.length, uploadedAt: new Date().toISOString().slice(0, 10) };
    const idx = (db.mastersIndex || []).filter((m) => !addedIdx.some((a) => a.storeId === m.storeId && a.month === m.month && a.type === m.type));
    const mergedAliases = [...(db.aliases || []), ...(newAliases || [])];
    const next = { ...db, uploads: [...db.uploads, uploadRec], mastersIndex: [...idx, ...addedIdx], aliases: mergedAliases };
    setDB(next); // aliases 屬 ADMIN_TABS，會自動同步
    await InventoryAPI.appendRow(next, "uploads", uploadRec);
    let msg = `已產製 ${matched} 個${label}（來源 ${parsed.rows.length} 筆）✔`;
    if (unmatched.length) msg += `；${unmatched.length} 個未對應（例：${unmatched.slice(0, 2).join("、")}）`;
    if (newAliases && newAliases.length) msg += `；已記住 ${newAliases.length} 筆店名對應`;
    toast(msg);
    setFile(null); setParsed(null); setStoreCol(""); setColMap({}); setColStore({});
  };

  // 一般品牌：依 storeCol 切分、colMap 對應
  const produceGeneric = async () => {
    const label = isStock ? "庫存檔" : "主檔";
    if (!storeCol) { toast("請選擇對應店鋪的欄位"); return; }
    if (isStock && !colMap[QTY_COL]) { toast("庫存檔必須指定「庫存數量」對應的來源欄"); return; }
    const groups = {};
    parsed.rows.forEach((r) => { const key = String(r[storeCol]).trim(); (groups[key] = groups[key] || []).push(r); });
    const toStd = (src) => {
      const o = {};
      MASTER_COLS.forEach((c) => {
        if (c === QTY_COL) { o[c] = isStock ? String(src[colMap[c]] == null ? "" : src[colMap[c]]).trim() : "0"; return; }
        const from = colMap[c];
        o[c] = from ? String(src[from] == null ? "" : src[from]) : "";
      });
      return o;
    };
    const datasets = []; const unmatched = [];
    for (const key of Object.keys(groups)) {
      const store = stores.find((s) => String(matchBy === "code" ? s.code : s.name).trim() === key);
      if (!store) { if (key) unmatched.push(key); continue; }
      const rows = groups[key].map(toStd);
      const err = validateRows(rows);
      if (err) { toast(`${err}（店鋪 ${store.code}）`); return; }
      datasets.push({ storeId: store.id, rows });
    }
    if (datasets.length === 0) { toast("沒有可對應的店鋪，請確認切分欄與名單"); return; }
    const srcDate = parseDateFromName(file.name);
    const addedIdx = [];
    for (const d of datasets) { await InventoryAPI.putMaster({ storeId: d.storeId, month, type: fileType, srcDate, columns: MASTER_COLS, rows: d.rows }); addedIdx.push({ storeId: d.storeId, month, type: fileType }); }
    await finalize(addedIdx, datasets.length, unmatched, label);
  };

  // 歐聖：寬表；商品欄固定、其後每欄一個店鋪/倉別
  const produceOsheng = async () => {
    if (!parsed.headers.includes("商品條碼")) { toast("此檔缺少『商品條碼』欄，非歐聖主檔格式"); return; }
    const storeCols = parsed.headers.filter((h) => !OSHENG_FIXED_COLS.includes(h));
    if (storeCols.length === 0) { toast("找不到店鋪/倉別欄"); return; }
    const mapRow = (src, qty) => ({
      "商品編號": String(src["商品條碼"] == null ? "" : src["商品條碼"]).trim(),
      "barcode": String(src["商品條碼"] == null ? "" : src["商品條碼"]).trim(),
      "舊商品編號2": "",
      "物品名稱": ["STYLENUMBER", "顏色", "尺寸"].map((k) => String(src[k] == null ? "" : src[k]).trim()).filter(Boolean).join("-"),
      "品項平均成本": String(src["零售價"] == null ? "" : src["零售價"]).trim(),
      "庫存數量": qty,
    });

    // 記住手動對應：把本次每個「已選店鋪」的欄標題存成 alias（下次自動套用）
    const learnAliases = () => {
      const cur = db.aliases || [];
      const add = [];
      storeCols.forEach((h) => { const sid = colStore[h]; if (sid) { const key = normName(h); if (!cur.some((x) => x.brandId === brandId && x.key === key && x.storeId === sid)) add.push({ brandId, key, storeId: sid }); } });
      return add;
    };
    const chosen = (h) => stores.find((s) => s.id === colStore[h]) || null;

    if (!isStock) {
      // 主檔：全部商品、數量0；依「所選店鋪的店鋪種類」各產一份主檔
      const rows = parsed.rows.map((r) => mapRow(r, "0"));
      const err = validateRows(rows); if (err) { toast(err); return; }
      const cats = new Set();
      storeCols.forEach((h) => { const s = chosen(h); if (s && s.category) cats.add(s.category); });
      if (cats.size === 0) { toast("找不到店鋪種類：請在下方為店名欄選擇對應店鋪，或先於維護區維護名單（店鋪種類）"); return; }
      const srcDate = parseDateFromName(file.name);
      const addedIdx = [];
      for (const cat of cats) { await InventoryAPI.putMaster({ storeId: "CAT::" + cat, month, type: "master", srcDate, columns: MASTER_COLS, rows }); addedIdx.push({ storeId: "CAT::" + cat, month, type: "master" }); }
      await finalize(addedIdx, cats.size, [], `主檔（種類：${Array.from(cats).join("、")}）`, learnAliases());
    } else {
      // 庫存檔：每個店名/倉別欄各一份，數量帶該欄（先驗證整數）
      for (const h of storeCols) { for (const src of parsed.rows) { if (!isIntStr(src[h])) { toast(`庫存數量須為整數（欄「${h}」）`); return; } } }
      // 檢查：一家店只能對應一個客戶庫存欄（單倉別店鋪；多倉別請用各自的店鋪列），避免覆蓋
      const chosenCounts = {};
      storeCols.forEach((h) => { const sid = colStore[h]; if (sid) chosenCounts[sid] = (chosenCounts[sid] || 0) + 1; });
      for (const sid of Object.keys(chosenCounts)) {
        if (chosenCounts[sid] > 1) {
          const st = stores.find((s) => s.id === sid);
          toast(`「${st ? st.code + " " + st.name : sid}」被對應到 ${chosenCounts[sid]} 個庫存欄，一家店只能對應一個庫存檔（多倉別請分列不同店鋪）`); return;
        }
      }
      const srcDate = parseDateFromName(file.name);
      const addedIdx = []; let matched = 0; const unmatched = [];
      for (const h of storeCols) {
        const store = chosen(h);
        if (!store) { unmatched.push(h); continue; }
        const rows = parsed.rows.map((src) => mapRow(src, String(src[h] == null || src[h] === "" ? "0" : src[h]).trim()));
        if (firstDup(rows.map((r) => r[CODE_COL]))) { toast("主檔商品編號重複"); return; }
        await InventoryAPI.putMaster({ storeId: store.id, month, type: "stock", srcDate, columns: MASTER_COLS, rows });
        addedIdx.push({ storeId: store.id, month, type: "stock" }); matched++;
      }
      if (matched === 0) { toast("尚未對應任何店鋪，請在下方為店名欄選擇對應店鋪"); return; }
      await finalize(addedIdx, matched, unmatched, "庫存檔", learnAliases());
    }
  };

  const produce = async () => {
    if (!brandId) { toast("請先選擇品牌"); return; }
    if (!parsed) { toast("請先上傳並解析客戶檔（Excel）"); return; }
    if (stores.length === 0) { toast("此品牌本月尚無店鋪名單，請先至維護區建立"); return; }
    setBusy(true);
    try { osheng ? await produceOsheng() : await produceGeneric(); }
    catch (e) { toast("產製失敗，請確認網路後再試"); }
    finally { setBusy(false); }
  };

  const history = db.uploads.filter((u) => u.month === month);
  const sel = "px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none";

  return (
    <div className="space-y-6">
      <SectionCard title="📤 上傳客戶主檔" subtitle="盤點前的檔案做主檔（數量帶0）、盤點當日的檔案做庫存檔（帶客戶數量）；兩者皆用客戶檔完整重建為標準格式">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <span className="text-sm text-slate-600">目前品牌：<b>{brand ? brand.name : "（請於上方選擇品牌）"}</b>{osheng && <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">歐聖專屬格式</span>}</span>
            <select value={fileType} onChange={(e) => setFileType(e.target.value)} className={sel}>
              <option value="master">用途：盤點前主檔（庫存數量帶 0）</option>
              <option value="stock">用途：盤點當日庫存檔（帶入客戶數量）</option>
            </select>
          </div>

          <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50">
            <div className="text-4xl mb-2">📄</div>
            <p className="text-sm text-slate-600 mb-3">上傳客戶提供的檔案（Excel：.xlsx / .xls）— 目前用途：<b>{isStock ? "盤點當日庫存檔" : "盤點前主檔"}</b></p>
            <input type="file" accept=".xlsx,.xls" onChange={onFile}
              className="mx-auto block text-sm text-slate-500 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700" />
            {file && parsed && <p className="text-sm text-emerald-600 mt-2">✔ {file.name}：讀到 {parsed.headers.length} 欄、{parsed.rows.length} 筆資料</p>}
          </div>

          {parsed && osheng && (() => {
            const storeCols = parsed.headers.filter((h) => !OSHENG_FIXED_COLS.includes(h));
            const matchedCnt = storeCols.filter((h) => colStore[h]).length;
            return (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-slate-700 space-y-3">
                <div className="space-y-1">
                  <p className="font-medium">歐聖固定規則（自動套用）：</p>
                  <p className="text-xs">商品編號＝barcode＝<b>商品條碼</b>；物品名稱＝<b>STYLENUMBER＋顏色＋尺寸</b>；品項平均成本＝<b>零售價</b>；舊商品編號2 空白。{isStock ? "庫存數量帶各店欄數字（須整數）。" : "主檔庫存數量帶 0。"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">店名對應（自動比對 {matchedCnt}/{storeCols.length}；可手動調整，送出後記住下次自動套用）</p>
                  <div className="max-h-72 overflow-y-auto border border-amber-200 rounded-lg bg-white">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr className="text-left text-slate-500 border-b"><th className="py-1.5 px-2">客戶檔店名欄</th><th className="py-1.5 px-2">對應店鋪（種類）</th></tr>
                      </thead>
                      <tbody>
                        {storeCols.map((h) => (
                          <tr key={h} className={"border-b last:border-0 " + (colStore[h] ? "" : "bg-red-50")}>
                            <td className="py-1 px-2 font-mono">{h}</td>
                            <td className="py-1 px-2">
                              <select value={colStore[h] || ""} onChange={(e) => setColStore({ ...colStore, [h]: e.target.value })}
                                className={"w-full px-2 py-1 border rounded " + (colStore[h] ? "border-slate-200" : "border-red-300")}>
                                <option value="">— 未對應 —</option>
                                {stores.map((s) => <option key={s.id} value={s.id}>{s.code} {s.name}{s.category ? `（${s.category}）` : ""}</option>)}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}

          {parsed && !osheng && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">① 店鋪切分</p>
                <div className="flex flex-wrap gap-3 items-center text-sm">
                  <span className="text-slate-600">以此欄對應店鋪：</span>
                  <select value={storeCol} onChange={(e) => setStoreCol(e.target.value)} className={sel}>
                    {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <span className="text-slate-600">比對店鋪：</span>
                  <select value={matchBy} onChange={(e) => setMatchBy(e.target.value)} className={sel}>
                    <option value="code">店鋪代碼</option>
                    <option value="name">店鋪名稱</option>
                  </select>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">② 欄位對應（標準輸出欄 ← 客戶檔欄位）</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  {MASTER_COLS.map((c) => {
                    const qtyForMaster = c === QTY_COL && !isStock;
                    return (
                      <div key={c} className="flex items-center gap-2">
                        <span className="w-28 text-slate-600 shrink-0">{c}{c === QTY_COL && isStock && <span className="text-red-500">*</span>}</span>
                        <select value={qtyForMaster ? "" : (colMap[c] || "")} disabled={qtyForMaster}
                          onChange={(e) => setColMap({ ...colMap, [c]: e.target.value })} className={sel + " flex-1 disabled:bg-slate-100"}>
                          <option value="">{qtyForMaster ? "（主檔固定帶 0）" : "（空白）"}</option>
                          {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400 mt-2">{isStock ? "庫存檔：「庫存數量」為必填來源欄，帶入客戶數量。" : "主檔：「庫存數量」一律帶 0（不需對應來源欄）。"}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button onClick={produce} disabled={busy || !parsed}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-medium rounded-lg">
              {busy ? "產製中…" : (isStock ? "⚙ 依店鋪切分並產製各店庫存檔" : "⚙ 依店鋪切分並產製各店主檔")}
            </button>
            {brandId && <span className="text-sm text-slate-500">本品牌本月 {stores.length} 家店鋪</span>}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="🗂 本月上傳紀錄" subtitle={`${month}`}>
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-4">上傳日期</th><th className="py-2 pr-4">品牌</th><th className="py-2 pr-4">用途</th>
                <th className="py-2 pr-4">檔案名稱</th><th className="py-2 pr-4">產製店鋪數</th><th className="py-2 pr-4">資料筆數</th>
              </tr>
            </thead>
            <tbody>
              {history.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">{u.uploadedAt}</td>
                  <td className="py-2 pr-4">{db.brands.find((b) => b.id === u.brandId)?.name}</td>
                  <td className="py-2 pr-4">{u.type === "stock" ? "盤點當日庫存檔" : "盤點前主檔"}</td>
                  <td className="py-2 pr-4 font-mono">{u.fileName}</td>
                  <td className="py-2 pr-4">{u.storeCount}</td>
                  <td className="py-2 pr-4">{u.rowCount != null ? num(u.rowCount).toLocaleString() : "—"}</td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan="6" className="py-6 text-center text-slate-400">本月尚無上傳紀錄</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

/* ============================================================
 * 4. 數據分析區：作業效率分析 + 請款資料
 *    [COMPUTED] 作業時數 = 結束時間 - 開始時間（跨夜 +24h）
 *    [COMPUTED] 人時效率 = 件數 ÷ (時數 × 人數)
 *    [COMPUTED] 請款金額 = 依單價設定：
 *               依件數：件數 × 單價；依人時：時數 × 人數 × 單價
 * ============================================================ */
function AnalysisZone({ db, month, toast }) {
  const [brandId, setBrandId] = useState("");
  const [filters, setFilters] = useState({});
  const setF = (k, v) => setFilters((p) => ({ ...p, [k]: v }));

  const rows = useMemo(() => {
    return db.records
      .filter((r) => r.month === month && (!brandId || r.brandId === brandId))
      .map((r) => {
        const store = db.stores.find((s) => s.id === r.storeId);
        const brand = db.brands.find((b) => b.id === r.brandId);
        const price = db.prices.find((p) => p.brandId === r.brandId); // 單價以品牌為準
        const pieces = num(r.pieces);          // 後端可能回字串，統一轉數字
        const headcount = num(r.headcount);
        const unitPrice = price ? num(price.unitPrice) : 0;
        const hoursVal = calcHours(r.startTime, r.endTime);
        const manHours = Math.round(hoursVal * headcount * 100) / 100;
        const efficiency = manHours > 0 ? Math.round(pieces / manHours) : 0;
        let base = 0, priceDesc = "未設定單價";
        if (price) {
          if (price.priceType === "piece") { base = Math.round(pieces * unitPrice); priceDesc = `${unitPrice} 元/件`; }
          else { base = Math.round(manHours * unitPrice); priceDesc = `${unitPrice} 元/人時`; }
        }
        const docFee = price ? num(price.docFee) : 0;   // 英斯伯：每場文件處理費
        const otFee = price ? num(price.otFee) : 0;     // 英斯伯：每場超時費
        const amount = base + docFee + otFee;
        return { ...r, pieces, headcount, storeName: store?.name || r.storeId, dept: store?.dept || "", brandName: brand?.name, hoursVal, manHours, efficiency, base, docFee, otFee, amount, priceDesc };
      });
  }, [db, month, brandId]);

  const viewRows = rows.filter((r) => matchFilters(r, filters)); // 套用欄位篩選
  const totals = viewRows.reduce((a, r) => ({
    pieces: a.pieces + r.pieces, manHours: a.manHours + r.manHours, base: a.base + r.base, docFee: a.docFee + r.docFee, otFee: a.otFee + r.otFee, amount: a.amount + r.amount,
  }), { pieces: 0, manHours: 0, base: 0, docFee: 0, otFee: 0, amount: 0 });

  // 匯出請款資料
  const exportBilling = () => {
    if (viewRows.length === 0) { toast("目前沒有可匯出的資料"); return; }
    exportXLSX(`請款資料_${month}.xlsx`, `請款資料_${month}`, [
      ["品牌", "店鋪", "主責課", "盤點日期", "件數", "人數", "時數", "人時", "計價方式", "作業費", "文件處理費", "超時費", "請款金額"],
      ...viewRows.map((r) => [r.brandName, r.storeName, r.dept, r.date, r.pieces, r.headcount, r.hoursVal, r.manHours, r.priceDesc, r.base, r.docFee, r.otFee, r.amount]),
      ["合計", "", "", "", totals.pieces, "", "", totals.manHours, "", totals.base, totals.docFee, totals.otFee, totals.amount],
    ]);
    toast("請款資料 Excel 已匯出 ✔");
  };

  // 匯出作業分析（偏重效率/工時，不含金額）
  const exportOps = () => {
    if (viewRows.length === 0) { toast("目前沒有可匯出的資料"); return; }
    const avgEff = totals.manHours > 0 ? Math.round(totals.pieces / totals.manHours) : 0;
    exportXLSX(`作業分析_${month}.xlsx`, `作業分析_${month}`, [
      ["品牌", "店鋪", "主責課", "盤點日期", "開始", "結束", "作業時數", "人數", "人時", "盤點件數", "人時效率(件/人時)", "特殊狀況"],
      ...viewRows.map((r) => [r.brandName, r.storeName, r.dept, r.date, r.startTime, r.endTime, r.hoursVal, r.headcount, r.manHours, r.pieces, r.efficiency, r.special || ""]),
      ["合計/平均", "", "", "", "", "", "", "", totals.manHours, totals.pieces, avgEff, ""],
    ]);
    toast("作業分析 Excel 已匯出 ✔");
  };

  const Stat = ({ label, value, unit }) => (
    <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-800 mt-1">{value}<span className="text-sm font-normal text-slate-500 ml-1">{unit}</span></div>
    </div>
  );

  return (
    <SectionCard title="📊 數據分析" subtitle="依盤點作業紀錄自動產出作業效率分析與請款資料；各欄可篩選">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BrandStoreSelect db={db} brandId={brandId} month={month} onBrand={setBrandId} showStore={false} />
        <div className="flex gap-2">
          <button onClick={exportOps} className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg">
            ⬇ 匯出作業分析（Excel）
          </button>
          <button onClick={exportBilling} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg">
            ⬇ 匯出請款資料（Excel）
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
        <Stat label="盤點場次" value={viewRows.length} unit="場" />
        <Stat label="總盤點件數" value={totals.pieces.toLocaleString()} unit="件" />
        <Stat label="總投入人時" value={totals.manHours.toLocaleString()} unit="人時" />
        <Stat label="請款總額" value={totals.amount.toLocaleString()} unit="元" />
      </div>

      <div className="table-scroll mt-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2 pr-4">品牌</th><th className="py-2 pr-4">店鋪</th><th className="py-2 pr-4">主責課</th><th className="py-2 pr-4">日期</th>
              <th className="py-2 pr-4 text-right">件數</th><th className="py-2 pr-4 text-right">人數</th>
              <th className="py-2 pr-4 text-right">人時</th><th className="py-2 pr-4 text-right">人時效率</th>
              <th className="py-2 pr-4">計價方式</th><th className="py-2 pr-4 text-right">請款金額</th>
            </tr>
            <tr className="border-b">
              <th className="py-1 pr-4"><FilterInput value={filters.brandName} onChange={(v) => setF("brandName", v)} /></th>
              <th className="py-1 pr-4"><FilterInput value={filters.storeName} onChange={(v) => setF("storeName", v)} /></th>
              <th className="py-1 pr-4"><FilterInput value={filters.dept} onChange={(v) => setF("dept", v)} /></th>
              <th className="py-1 pr-4"><FilterInput value={filters.date} onChange={(v) => setF("date", v)} /></th>
              <th colSpan="6"></th>
            </tr>
          </thead>
          <tbody>
            {viewRows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2 pr-4">{r.brandName}</td>
                <td className="py-2 pr-4">{r.storeName}</td>
                <td className="py-2 pr-4">{r.dept || "—"}</td>
                <td className="py-2 pr-4">{r.date}</td>
                <td className="py-2 pr-4 text-right">{r.pieces.toLocaleString()}</td>
                <td className="py-2 pr-4 text-right">{r.headcount}</td>
                <td className="py-2 pr-4 text-right">{r.manHours}</td>
                <td className="py-2 pr-4 text-right">{r.efficiency.toLocaleString()} 件/人時</td>
                <td className="py-2 pr-4">{r.priceDesc}</td>
                <td className="py-2 pr-4 text-right font-semibold">{r.amount.toLocaleString()} 元</td>
              </tr>
            ))}
            {viewRows.length === 0 && <tr><td colSpan="10" className="py-6 text-center text-slate-400">查無符合條件的紀錄</td></tr>}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

/* ============================================================
 * 5. 維護區：品牌 / 店鋪名單 / 盤點人員 / 單價設定
 *    先分品牌 → 再依月份 → Excel 匯入或單筆新增；保留新增品牌功能
 * ============================================================ */
function MaintainZone({ db, setDB, month, setMonth, toast }) {
  const [brandId, setBrandId] = useState(db.brands[0]?.id || "");
  const [tab, setTab] = useState("stores");
  const [newBrand, setNewBrand] = useState("");
  const [storeForm, setStoreForm] = useState({ code: "", name: "", dept: "", category: "", enName: "", warehouse: "", auditDate: "" });
  const [staffForm, setStaffForm] = useState({ div: "", dept: "", empNo: "", name: "", title: "" });
  const [sFilters, setSFilters] = useState({});   // 店鋪篩選
  const [pFilters, setPFilters] = useState({});   // 人員篩選
  const setSF = (k, v) => setSFilters((p) => ({ ...p, [k]: v }));
  const setPF = (k, v) => setPFilters((p) => ({ ...p, [k]: v }));

  const stores = db.stores.filter((s) => s.brandId === brandId && s.month === month).filter((s) => matchFilters(s, sFilters));
  const staff = db.staff.filter((p) => p.brandId === brandId && p.month === month).filter((p) => matchFilters(p, pFilters));

  // TODO: IT 工程師請在此串接後端 API 邏輯（POST /api/brands）
  const addBrand = () => {
    const name = newBrand.trim();
    if (!name) { toast("請輸入品牌名稱"); return; }
    if (db.brands.some((b) => b.name === name)) { toast("品牌已存在"); return; }
    const b = { id: uid("B"), name };
    setDB((d) => ({ ...d, brands: [...d.brands, b] }));
    setNewBrand("");
    toast(`品牌「${name}」已新增 ✔`);
  };

  const addStore = () => {
    if (!storeForm.code.trim() || !storeForm.name.trim()) { toast("店鋪代碼與名稱皆為必填"); return; }
    setDB((d) => ({ ...d, stores: [...d.stores, { id: uid("S"), brandId, month, code: storeForm.code.trim(), name: storeForm.name.trim(), dept: storeForm.dept.trim(), category: storeForm.category.trim(), enName: storeForm.enName.trim(), warehouse: storeForm.warehouse.trim(), auditDate: storeForm.auditDate.trim() }] }));
    setStoreForm({ code: "", name: "", dept: "", category: "", enName: "", warehouse: "", auditDate: "" });
    toast("店鋪已新增 ✔");
  };

  const addStaff = () => {
    if (!staffForm.empNo.trim() || !staffForm.name.trim()) { toast("工號與姓名皆為必填"); return; }
    setDB((d) => ({ ...d, staff: [...d.staff, { id: uid("P"), brandId, month, div: staffForm.div.trim(), dept: staffForm.dept.trim(), empNo: staffForm.empNo.trim(), name: staffForm.name.trim(), title: staffForm.title.trim() }] }));
    setStaffForm({ div: "", dept: "", empNo: "", name: "", title: "" });
    toast("盤點人員已新增 ✔");
  };

  // 匯入範本欄位
  const TEMPLATES = {
    stores: ["店鋪代碼", "店鋪名稱", "主責課", "店鋪種類", "英文店名", "倉別量", "盤點日期"],
    staff: ["部別", "課別", "工號", "姓名", "職稱"],
  };
  // 下載匯入範本（Excel）
  const downloadTemplate = (kind) => {
    const label = kind === "stores" ? "店鋪名單" : "盤點人員名單";
    exportXLSX(`${label}_匯入範本.xlsx`, label, [TEMPLATES[kind], kind === "stores" ? ["AS-001", "微風本館 JV", "北一課", "JV", "JV BREEZE MAIN", "1", "2026-01-06"] : ["一部", "北一課", "E001", "範例姓名", "資深專員"]]);
    toast(`已下載${label}匯入範本`);
  };

  // 真正解析 Excel 匯入（依範本欄位；也容錯常見別名）
  const importExcel = (kind) => async (e) => {
    const f = e.target.files[0];
    if (!f) { return; }
    if (!/\.(xlsx|xls)$/i.test(f.name)) { toast("僅接受 Excel 檔（.xlsx / .xls）"); e.target.value = ""; return; }
    try {
      const { headers, rows } = await readXLSX(f);
      const pick = (row, names) => { for (const n of names) { const k = headers.find((h) => h === n); if (k && String(row[k]).trim() !== "") return String(row[k]).trim(); } return ""; };
      // 以關鍵字找欄（相容本系統範本與客戶名單，如「主檔類別/店點代號/店名/店名(英文)」）
      const findH = (re) => headers.find((h) => re.test(String(h)));
      if (kind === "stores") {
        const hCode = findH(/店鋪代碼|店點代號|代號|代碼|code/i);
        const hName = headers.find((h) => /店鋪名稱|店名|名稱|name/i.test(String(h)) && !/英文/.test(String(h)));
        const hDept = findH(/主責課|課別|dept/i);
        const hCat = findH(/主檔類別|店鋪種類|類別|種類|category/i);
        const hEn = findH(/英文/i) || findH(/enName/i);
        const hWh = findH(/倉別/i);
        const hAudit = findH(/盤點日期|日期|date/i);
        const get = (r, h) => h ? String(r[h] == null ? "" : r[h]).trim() : "";
        const items = rows.map((r) => ({ code: get(r, hCode), name: get(r, hName), dept: get(r, hDept), category: get(r, hCat), enName: get(r, hEn), warehouse: get(r, hWh), auditDate: get(r, hAudit) }))
          .filter((x) => x.code || x.name)
          .map((x) => ({ id: uid("S"), brandId, month, code: x.code || x.name, name: x.name || x.code, dept: x.dept, category: x.category, enName: x.enName, warehouse: x.warehouse, auditDate: x.auditDate }));
        if (items.length === 0) { toast("未讀到有效店鋪資料，請確認欄位（店鋪代碼/店名）"); e.target.value = ""; return; }
        setDB((d) => ({ ...d, stores: [...d.stores, ...items] }));
        toast(`已匯入 ${items.length} 家店鋪 ✔`);
      } else {
        const hDiv = findH(/部別|部門|div/i);
        const hSec = findH(/課別|主責課/i);
        const hEmp = findH(/工號|員工編號|員編|empNo/i);
        const hNm = headers.find((h) => /姓名|名稱|name/i.test(String(h)));
        const hTitle = findH(/職稱|職務|title/i);
        const get = (r, h) => h ? String(r[h] == null ? "" : r[h]).trim() : "";
        const items = rows.map((r) => ({ div: get(r, hDiv), dept: get(r, hSec), empNo: get(r, hEmp), name: get(r, hNm), title: get(r, hTitle) }))
          .filter((x) => x.empNo && x.name)
          .map((x) => ({ id: uid("P"), brandId, month, div: x.div, dept: x.dept, empNo: x.empNo, name: x.name, title: x.title }));
        if (items.length === 0) { toast("未讀到有效人員資料，請確認欄位（工號／姓名）"); e.target.value = ""; return; }
        setDB((d) => ({ ...d, staff: [...d.staff, ...items] }));
        toast(`已匯入 ${items.length} 位盤點人員 ✔`);
      }
    } catch (err) { toast("Excel 解析失敗，請確認檔案格式"); }
    e.target.value = "";
  };

  const removeStore = (id) => setDB((d) => ({ ...d, stores: d.stores.filter((s) => s.id !== id) }));
  const removeStaff = (id) => setDB((d) => ({ ...d, staff: d.staff.filter((p) => p.id !== id) }));

  // 單價以品牌為單位
  const setPrice = (bId, patch) => {
    setDB((d) => {
      const exists = d.prices.find((p) => p.brandId === bId);
      const prices = exists
        ? d.prices.map((p) => (p.brandId === bId ? { ...p, ...patch } : p))
        : [...d.prices, { brandId: bId, priceType: "piece", unitPrice: 0, ...patch }];
      return { ...d, prices };
    });
  };

  const tabs = [
    { id: "stores", label: "🏬 店鋪名單" },
    { id: "staff", label: "👥 盤點人員名單" },
    { id: "prices", label: "💰 單價設定" },
    { id: "upload", label: "📤 上傳主檔" },
    { id: "brands", label: "🏷 品牌管理" },
  ];

  const inputCls = "px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none";
  const importBtn = (kind, label) => (
    <>
      <label className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg cursor-pointer">
        📥 {label}（Excel 匯入）
        <input type="file" accept=".xlsx,.xls" className="hidden" onChange={importExcel(kind)} />
      </label>
      <button onClick={() => downloadTemplate(kind)} className="px-3 py-2 text-teal-700 hover:bg-teal-50 border border-teal-600 text-sm rounded-lg">⬇ 下載匯入範本</button>
    </>
  );

  return (
    <SectionCard title="🛠 維護區" subtitle="先選品牌、再選月份，維護店鋪名單、盤點人員名單與單價；支援 Excel 匯入或單筆新增">
      {/* 品牌 + 月份 */}
      <div className="flex flex-wrap gap-3 items-center">
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={inputCls + " bg-white"}>
          {db.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} />
        <span className="text-xs text-slate-400">※ 月份為全平台共用篩選條件</span>
      </div>

      {/* 子頁籤 */}
      <div className="flex gap-2 mt-5 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={"px-4 py-2 text-sm rounded-t-lg " + (tab === t.id ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100")}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 店鋪名單 */}
      {tab === "stores" && (
        <div className="mt-4 space-y-4 fade-in">
          <div className="flex flex-wrap gap-3 items-center">
            {importBtn("stores", "店鋪名單")}
            <span className="text-slate-300">|</span>
            <input placeholder="店鋪代碼" value={storeForm.code} onChange={(e) => setStoreForm({ ...storeForm, code: e.target.value })} className={inputCls + " w-24"} />
            <input placeholder="店鋪名稱" value={storeForm.name} onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })} className={inputCls + " w-36"} />
            <input placeholder="主責課" value={storeForm.dept} onChange={(e) => setStoreForm({ ...storeForm, dept: e.target.value })} className={inputCls + " w-24"} />
            <input placeholder="店鋪種類" value={storeForm.category} onChange={(e) => setStoreForm({ ...storeForm, category: e.target.value })} className={inputCls + " w-24"} />
            <input placeholder="英文店名（對應客戶檔）" value={storeForm.enName} onChange={(e) => setStoreForm({ ...storeForm, enName: e.target.value })} className={inputCls + " w-48"} />
            <input placeholder="倉別量" value={storeForm.warehouse} onChange={(e) => setStoreForm({ ...storeForm, warehouse: e.target.value })} className={inputCls + " w-20"} />
            <input placeholder="盤點日期" value={storeForm.auditDate} onChange={(e) => setStoreForm({ ...storeForm, auditDate: e.target.value })} className={inputCls + " w-28"} />
            <button onClick={addStore} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">＋ 單筆新增</button>
          </div>
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-4">代碼</th><th className="py-2 pr-4">名稱</th><th className="py-2 pr-4">主責課</th>
                  <th className="py-2 pr-4">店鋪種類</th><th className="py-2 pr-4">英文店名</th><th className="py-2 pr-4">倉別量</th><th className="py-2 pr-4">盤點日期</th><th className="py-2 pr-4">操作</th>
                </tr>
                <tr className="border-b">
                  <th className="py-1 pr-4"><FilterInput value={sFilters.code} onChange={(v) => setSF("code", v)} /></th>
                  <th className="py-1 pr-4"><FilterInput value={sFilters.name} onChange={(v) => setSF("name", v)} /></th>
                  <th className="py-1 pr-4"><FilterInput value={sFilters.dept} onChange={(v) => setSF("dept", v)} /></th>
                  <th className="py-1 pr-4"><FilterInput value={sFilters.category} onChange={(v) => setSF("category", v)} /></th>
                  <th className="py-1 pr-4"><FilterInput value={sFilters.enName} onChange={(v) => setSF("enName", v)} /></th>
                  <th className="py-1 pr-4"><FilterInput value={sFilters.warehouse} onChange={(v) => setSF("warehouse", v)} /></th>
                  <th className="py-1 pr-4"><FilterInput value={sFilters.auditDate} onChange={(v) => setSF("auditDate", v)} /></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {stores.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-mono">{s.code}</td><td className="py-2 pr-4">{s.name}</td><td className="py-2 pr-4">{s.dept || "—"}</td>
                    <td className="py-2 pr-4">{s.category || "—"}</td><td className="py-2 pr-4">{s.enName || "—"}</td><td className="py-2 pr-4">{s.warehouse || "—"}</td><td className="py-2 pr-4">{s.auditDate || "—"}</td>
                    <td className="py-2 pr-4"><button onClick={() => removeStore(s.id)} className="text-red-500 hover:underline">刪除</button></td>
                  </tr>
                ))}
                {stores.length === 0 && <tr><td colSpan="8" className="py-6 text-center text-slate-400">查無店鋪，請匯入或新增</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 盤點人員名單 */}
      {tab === "staff" && (
        <div className="mt-4 space-y-4 fade-in">
          <div className="flex flex-wrap gap-3 items-center">
            {importBtn("staff", "盤點人員名單")}
            <span className="text-slate-300">|</span>
            <input placeholder="部別" value={staffForm.div} onChange={(e) => setStaffForm({ ...staffForm, div: e.target.value })} className={inputCls + " w-20"} />
            <input placeholder="課別" value={staffForm.dept} onChange={(e) => setStaffForm({ ...staffForm, dept: e.target.value })} className={inputCls + " w-24"} />
            <input placeholder="工號" value={staffForm.empNo} onChange={(e) => setStaffForm({ ...staffForm, empNo: e.target.value })} className={inputCls + " w-28"} />
            <input placeholder="姓名（請用範例資料）" value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} className={inputCls + " w-40"} />
            <input placeholder="職稱" value={staffForm.title} onChange={(e) => setStaffForm({ ...staffForm, title: e.target.value })} className={inputCls + " w-24"} />
            <button onClick={addStaff} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">＋ 單筆新增</button>
          </div>
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b"><th className="py-2 pr-4">部別</th><th className="py-2 pr-4">課別</th><th className="py-2 pr-4">工號</th><th className="py-2 pr-4">姓名</th><th className="py-2 pr-4">職稱</th><th className="py-2 pr-4">操作</th></tr>
                <tr className="border-b">
                  <th className="py-1 pr-4"><FilterInput value={pFilters.div} onChange={(v) => setPF("div", v)} /></th>
                  <th className="py-1 pr-4"><FilterInput value={pFilters.dept} onChange={(v) => setPF("dept", v)} /></th>
                  <th className="py-1 pr-4"><FilterInput value={pFilters.empNo} onChange={(v) => setPF("empNo", v)} /></th>
                  <th className="py-1 pr-4"><FilterInput value={pFilters.name} onChange={(v) => setPF("name", v)} /></th>
                  <th className="py-1 pr-4"><FilterInput value={pFilters.title} onChange={(v) => setPF("title", v)} /></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {staff.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{p.div || "—"}</td><td className="py-2 pr-4">{p.dept || "—"}</td><td className="py-2 pr-4 font-mono">{p.empNo}</td><td className="py-2 pr-4">{p.name}</td><td className="py-2 pr-4">{p.title || "—"}</td>
                    <td className="py-2 pr-4"><button onClick={() => removeStaff(p.id)} className="text-red-500 hover:underline">刪除</button></td>
                  </tr>
                ))}
                {staff.length === 0 && <tr><td colSpan="6" className="py-6 text-center text-slate-400">查無盤點人員，請匯入或新增</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 上傳主檔（原上傳區併入） */}
      {tab === "upload" && (
        <div className="mt-4 fade-in">
          <UploadZone db={db} setDB={setDB} month={month} toast={toast} brandId={brandId} />
        </div>
      )}

      {/* 單價設定（一個品牌一個價，不分店鋪） */}
      {tab === "prices" && (() => {
        const brandObj = db.brands.find((b) => b.id === brandId);
        const bp = db.prices.find((x) => x.brandId === brandId) || { priceType: "piece", unitPrice: "" };
        const showFees = brandObj && brandObj.name === "英斯伯"; // 英斯伯專屬加收項
        return (
          <div className="mt-4 fade-in space-y-4">
            <p className="text-sm text-slate-500">「{brandObj ? brandObj.name : ""}」的請款單價（一個品牌一個價，不分店鋪）。</p>
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs text-slate-500 mb-1">計價方式</label>
                <select value={bp.priceType} onChange={(e) => setPrice(brandId, { priceType: e.target.value })} className={inputCls + " bg-white"}>
                  <option value="piece">依件數（元/件）</option>
                  <option value="hour">依人時（元/人時）</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">單價（元）</label>
                <input type="number" min="0" step="0.01" value={bp.unitPrice}
                  onChange={(e) => setPrice(brandId, { unitPrice: Number(e.target.value) })} className={inputCls + " w-32"} />
              </div>
              {showFees && (
                <>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">文件處理費（元/場）</label>
                    <input type="number" min="0" step="1" value={bp.docFee == null ? "" : bp.docFee}
                      onChange={(e) => setPrice(brandId, { docFee: Number(e.target.value) })} className={inputCls + " w-32"} />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">超時費（元/場）</label>
                    <input type="number" min="0" step="1" value={bp.otFee == null ? "" : bp.otFee}
                      onChange={(e) => setPrice(brandId, { otFee: Number(e.target.value) })} className={inputCls + " w-32"} />
                  </div>
                </>
              )}
            </div>
            {showFees && <p className="text-xs text-slate-400">文件處理費、超時費為英斯伯專屬，預設每場（每筆盤點紀錄）加收；如計算方式不同再告知調整。</p>}
          </div>
        );
      })()}

      {/* 品牌管理（保留新增品牌功能） */}
      {tab === "brands" && (
        <div className="mt-4 space-y-4 fade-in">
          <div className="flex gap-3">
            <input placeholder="輸入新品牌名稱" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} className={inputCls + " w-60"} />
            <button onClick={addBrand} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">＋ 新增品牌</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {db.brands.map((b) => (
              <span key={b.id} className="px-4 py-2 bg-slate-100 border border-slate-200 rounded-full text-sm">🏷 {b.name}</span>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
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
  const lastEditRef = useRef(0);      // 使用者最後編輯時間（避免自動刷新蓋掉未存的編輯）
  const fromPollRef = useRef(false);  // 標記本次 db 變更來自自動刷新（不回寫後端）
  const syncingRef = useRef(false);
  const setSync = (v) => { syncingRef.current = v; setSyncing(v); };

  const user = sessionStorage.getItem("loginUser") || "demo-user";

  // 權限控管：盤點人員僅可使用下載區與填寫區
  const NAV_TABS = [
    { id: "download", label: "📥 主檔下載", roles: ["manager", "staff"] },
    { id: "fill", label: "📝 盤點作業情況紀錄", roles: ["manager", "staff"] },
    { id: "analysis", label: "📊 數據分析", roles: ["manager"] },
    { id: "maintain", label: "🛠 維護區", roles: ["manager"] },
  ];

  // 初次載入：從後端讀取；後端尚無資料則寫入範例種子
  useEffect(() => {
    (async () => {
      let d = await InventoryAPI.loadDB();
      if (!d || !d.brands || d.brands.length === 0) {
        d = seed();
        await InventoryAPI.saveTabs(d, ALL_TABS);
      }
      setDB(d);
      setReady(true);
    })();
  }, []);

  // 維護類資料變更 → 防抖後同步（紀錄/上傳走 append，不在此重寫，避免多裝置互相覆蓋）
  useEffect(() => {
    if (!ready || !db) return;
    if (fromPollRef.current) { fromPollRef.current = false; return; } // 自動刷新帶來的變更不回寫
    lastEditRef.current = Date.now();
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSync(true);
      try { await InventoryAPI.saveTabs(db, ADMIN_TABS); } catch (e) { /* 同步失敗，下次變更再試 */ } finally { setSync(false); }
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
        if (d && d.brands) { fromPollRef.current = true; setDB(d); }
      } catch (e) { /* 忽略單次刷新失敗 */ }
    }, 15000);
    return () => clearInterval(id);
  }, [ready]);

  // 手動重新整理
  const refresh = async () => {
    setSync(true);
    try {
      const d = await InventoryAPI.loadDB();
      if (d && d.brands) { fromPollRef.current = true; setDB(d); toast("已更新為最新資料 ✔"); }
    } catch (e) { toast("更新失敗，請確認網路"); } finally { setSync(false); }
  };

  // 角色切換時，若目前頁籤無權限則跳回第一個可用頁籤
  useEffect(() => {
    const visible = NAV_TABS.filter((t) => t.roles.includes(role));
    if (!visible.some((t) => t.id === tab)) setTab(visible[0].id);
  }, [role]);

  const toast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2500);
  };

  if (!ready || !db) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">載入中…</div>;
  }

  // 預警機制：本月尚未填寫盤點紀錄的店鋪
  const pendingStores = db.stores.filter(
    (s) => s.month === month && !db.records.some((r) => r.storeId === s.id && r.month === month)
  );
  const visibleTabs = NAV_TABS.filter((t) => t.roles.includes(role));

  const logout = () => {
    sessionStorage.removeItem("loginUser");
    window.location.href = "index.html";
  };

  const resetDemo = async () => {
    if (!confirm("確定要清除目前資料並回復範例資料嗎？")) return;
    await InventoryAPI.saveTabs(seed(), ALL_TABS);
    location.reload();
  };

  return (
    <div className="min-h-screen">
      {/* 頂部導覽列 */}
      <header className="bg-slate-900 text-white sticky top-0 z-40 shadow">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 mr-auto">
            <span className="text-2xl">📋</span>
            <div>
              <div className="font-bold">日翊外盤平台</div>
              <div className="text-[11px] text-slate-400">多品牌盤點作業管理系統</div>
            </div>
          </div>

          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-sm text-slate-800 bg-white" title="盤點月份" />

          {/* 手動重新整理 */}
          <button onClick={refresh} disabled={syncing} title="重新整理（抓最新資料）"
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg text-sm">
            {syncing ? "⟳ 更新中" : "⟳ 重新整理"}
          </button>

          {/* 預警通知 */}
          <div className="relative">
            <button onClick={() => setShowBell(!showBell)} className="relative px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm">
              🔔
              {pendingStores.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">
                  {pendingStores.length}
                </span>
              )}
            </button>
            {showBell && (
              <div className="absolute right-0 mt-2 w-72 bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 p-4 fade-in">
                <div className="font-semibold text-sm mb-2">⚠ 本月未填寫盤點紀錄的店鋪</div>
                {pendingStores.length === 0
                  ? <p className="text-sm text-emerald-600">全部店鋪皆已完成填寫 🎉</p>
                  : <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
                      {pendingStores.map((s) => <li key={s.id} className="text-slate-600">• {s.code} {s.name}</li>)}
                    </ul>}
              </div>
            )}
          </div>

          {/* 角色切換（原型展示用；正式版由後端依帳號授權） */}
          <select value={role} onChange={(e) => setRole(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-sm text-slate-800 bg-white">
            <option value="manager">👑 管理者</option>
            <option value="staff">🧑‍🔧 盤點人員</option>
          </select>

          <div className="text-sm text-slate-300">{user}</div>
          <button onClick={logout} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-sm">登出</button>
        </div>

        {/* 功能頁籤 */}
        <nav className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {visibleTabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={"px-4 py-2.5 text-sm whitespace-nowrap rounded-t-lg " +
                (tab === t.id ? "bg-slate-100 text-slate-900 font-semibold" : "text-slate-300 hover:bg-slate-800")}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {/* 主內容 */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {tab === "download" && <DownloadZone db={db} month={month} toast={toast} />}
        {tab === "fill" && <FillZone db={db} setDB={setDB} month={month} user={user} toast={toast} />}
        {tab === "analysis" && <AnalysisZone db={db} month={month} toast={toast} />}
        {tab === "maintain" && <MaintainZone db={db} setDB={setDB} month={month} setMonth={setMonth} toast={toast} />}
      </main>

      <footer className="text-center text-xs text-slate-400 pb-6">
        {InventoryAPI.cloud()
          ? <span>雲端共用模式（Google Sheets / Drive）· {syncing ? "☁ 同步中…" : "☁ 已同步"}</span>
          : <span>本機測試模式 — 資料暫存於此瀏覽器（尚未設定 Google Sheets 網址）</span>}
        <button onClick={resetDemo} className="underline ml-2 hover:text-slate-600">重置範例資料</button>
      </footer>

      <Toast msg={toastMsg} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
