/* ============================================================
 * 日翊盤點平台 - 前端核心邏輯（React + Tailwind 原型）
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
    { id: "S001", brandId: "B01", month: CURRENT_MONTH, code: "AS-001", name: "歐聖-台北旗艦店" },
    { id: "S002", brandId: "B01", month: CURRENT_MONTH, code: "AS-002", name: "歐聖-台中門市" },
    { id: "S003", brandId: "B01", month: CURRENT_MONTH, code: "AS-003", name: "歐聖-高雄門市" },
    { id: "S004", brandId: "B02", month: CURRENT_MONTH, code: "IB-001", name: "英斯伯-信義店" },
    { id: "S005", brandId: "B02", month: CURRENT_MONTH, code: "IB-002", name: "英斯伯-板橋店" },
    { id: "S006", brandId: "B03", month: CURRENT_MONTH, code: "AT-001", name: "歐都納-南港店" },
    { id: "S007", brandId: "B03", month: CURRENT_MONTH, code: "AT-002", name: "歐都納-新竹店" },
  ],
  staff: [
    { id: "P001", brandId: "B01", month: CURRENT_MONTH, empNo: "E001", name: "王小明（範例）" },
    { id: "P002", brandId: "B01", month: CURRENT_MONTH, empNo: "E002", name: "李小華（範例）" },
    { id: "P003", brandId: "B02", month: CURRENT_MONTH, empNo: "E003", name: "張小美（範例）" },
    { id: "P004", brandId: "B03", month: CURRENT_MONTH, empNo: "E004", name: "陳小強（範例）" },
  ],
  // 單價設定：priceType = "piece"（依件數）或 "hour"（依人時）
  prices: [
    { storeId: "S001", priceType: "piece", unitPrice: 0.5 },
    { storeId: "S002", priceType: "piece", unitPrice: 0.5 },
    { storeId: "S003", priceType: "piece", unitPrice: 0.55 },
    { storeId: "S004", priceType: "hour", unitPrice: 320 },
    { storeId: "S005", priceType: "hour", unitPrice: 320 },
    { storeId: "S006", priceType: "piece", unitPrice: 0.6 },
    { storeId: "S007", priceType: "piece", unitPrice: 0.6 },
  ],
  // 上傳區產製結果：哪些店鋪的主檔 / 庫存檔已可下載
  produced: [
    { storeId: "S001", month: CURRENT_MONTH, master: true, stock: true },
    { storeId: "S002", month: CURRENT_MONTH, master: true, stock: true },
    { storeId: "S004", month: CURRENT_MONTH, master: true, stock: false },
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
};

/* ---------------- 資料存取（透過 api.js 抽象層） ----------------
 * 維護類資料（單一管理者編輯）→ 整表覆蓋（ADMIN_TABS）
 * 盤點/上傳紀錄（多裝置同時新增）→ 逐筆 append，避免互相覆蓋
 */
const ADMIN_TABS = ["brands", "stores", "staff", "prices", "produced"];
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

// 逸脫單一 CSV 儲存格，並防止公式注入（CSV Injection / CWE-1236）
// 若儲存格開頭為 = + - @ tab 等，Excel 會當公式執行，故加上前綴 ' 中和
function csvCell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

// 下載 CSV（含 BOM，Excel 開啟不亂碼；每格逸脫並防公式注入）
function downloadCSV(filename, rows) {
  const csv = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------------- 共用元件 ---------------- */
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
 * 1. 下載區：盤點主檔 / 庫存檔 / 盤點手冊
 * ============================================================ */
function DownloadZone({ db, month, toast }) {
  const [brandId, setBrandId] = useState("");
  const stores = db.stores.filter((s) => s.brandId === brandId && s.month === month);
  const brand = db.brands.find((b) => b.id === brandId);

  const producedOf = (storeId) =>
    db.produced.find((p) => p.storeId === storeId && p.month === month) || {};

  // TODO: IT 工程師請在此串接後端 API 邏輯（GET /api/files/master、/api/files/stock）
  const download = (store, type) => {
    const label = type === "master" ? "盤點主檔" : "庫存檔";
    downloadCSV(`${store.code}_${label}_${month}.csv`, [
      ["店鋪代碼", "商品條碼", "品名", "規格", type === "master" ? "售價" : "庫存量"],
      [store.code, "4710000000011", "範例商品A", "M", type === "master" ? "590" : "12"],
      [store.code, "4710000000028", "範例商品B", "L", type === "master" ? "790" : "8"],
    ]);
    toast(`已下載 ${store.name} ${label}`);
  };

  return (
    <SectionCard title="📥 下載區" subtitle="盤點人員下載各盤點店鋪的盤點主檔、庫存檔及盤點手冊">
      <BrandStoreSelect db={db} brandId={brandId} month={month} onBrand={setBrandId} showStore={false} />

      {brand && (
        <div className="mt-4 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <span className="text-2xl">📘</span>
          <div className="flex-1">
            <div className="font-medium text-slate-800">{brand.name} 盤點手冊</div>
            <div className="text-xs text-slate-500">品牌通用作業手冊（PDF）</div>
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
                <th className="py-2 pr-4">盤點主檔</th>
                <th className="py-2 pr-4">庫存檔</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => {
                const p = producedOf(s.id);
                return (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-mono">{s.code}</td>
                    <td className="py-3 pr-4">{s.name}</td>
                    <td className="py-3 pr-4">
                      {p.master
                        ? <button onClick={() => download(s, "master")} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">⬇ 下載</button>
                        : <span className="text-slate-400">尚未產製</span>}
                    </td>
                    <td className="py-3 pr-4">
                      {p.stock
                        ? <button onClick={() => download(s, "stock")} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">⬇ 下載</button>
                        : <span className="text-slate-400">尚未產製</span>}
                    </td>
                  </tr>
                );
              })}
              {stores.length === 0 && (
                <tr><td colSpan="4" className="py-6 text-center text-slate-400">此品牌本月尚無店鋪名單，請至維護區上傳</td></tr>
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

  const myRecords = db.records.filter((r) => r.month === month);

  const Err = ({ k }) => errors[k] ? <p className="text-xs text-red-600 mt-1">{errors[k]}</p> : null;
  const inputCls = "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none";

  return (
    <div className="space-y-6">
      <SectionCard title="📝 填寫區" subtitle="記錄盤點作業時間、件數人數、特殊狀況及紙本報表照片">
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

      <SectionCard title="🗂 本月已填寫紀錄" subtitle={`${month} 共 ${myRecords.length} 筆`}>
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-4">日期</th><th className="py-2 pr-4">品牌</th><th className="py-2 pr-4">店鋪</th>
                <th className="py-2 pr-4">時間</th><th className="py-2 pr-4">人數</th><th className="py-2 pr-4">件數</th>
                <th className="py-2 pr-4">特殊狀況</th><th className="py-2 pr-4">填寫人</th>
              </tr>
            </thead>
            <tbody>
              {myRecords.map((r) => {
                const store = db.stores.find((s) => s.id === r.storeId);
                const brand = db.brands.find((b) => b.id === r.brandId);
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{r.date}</td>
                    <td className="py-2 pr-4">{brand?.name}</td>
                    <td className="py-2 pr-4">{store?.name}</td>
                    <td className="py-2 pr-4 font-mono">{r.startTime}–{r.endTime}</td>
                    <td className="py-2 pr-4">{r.headcount}</td>
                    <td className="py-2 pr-4">{r.pieces.toLocaleString()}</td>
                    <td className="py-2 pr-4 max-w-[200px] truncate" title={r.special}>{r.special || "—"}</td>
                    <td className="py-2 pr-4">{r.filledBy}</td>
                  </tr>
                );
              })}
              {myRecords.length === 0 && <tr><td colSpan="8" className="py-6 text-center text-slate-400">本月尚無填寫紀錄</td></tr>}
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
function UploadZone({ db, setDB, month, toast }) {
  const [brandId, setBrandId] = useState("");
  const [file, setFile] = useState(null);
  const [fileErr, setFileErr] = useState("");
  const stores = db.stores.filter((s) => s.brandId === brandId && s.month === month);
  const brand = db.brands.find((b) => b.id === brandId);

  // 資料驗證規則：僅接受 Excel / CSV 格式
  const onFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) {
      setFileErr("檔案格式錯誤：僅接受 .xlsx / .xls / .csv");
      setFile(null);
      return;
    }
    setFileErr("");
    setFile(f);
  };

  // 依店鋪格式產製主檔/庫存檔：更新 produced（維護類，自動同步）+ append 一筆上傳紀錄
  // TODO: 未來改接日翊資料庫時，對應後端解析並依盤點程式格式產製
  const produce = async () => {
    if (!brandId) { toast("請先選擇品牌"); return; }
    if (!file) { toast("請先上傳客戶提供的主檔（庫存檔）"); return; }
    if (stores.length === 0) { toast("此品牌本月尚無店鋪名單，請先至維護區上傳"); return; }

    const others = db.produced.filter((p) => !(p.month === month && stores.some((s) => s.id === p.storeId)));
    const newProduced = stores.map((s) => ({ storeId: s.id, month, master: true, stock: true }));
    const uploadRec = { id: uid("U"), brandId, month, fileName: file.name, storeCount: stores.length, uploadedAt: new Date().toISOString().slice(0, 10) };
    const next = { ...db, produced: [...others, ...newProduced], uploads: [...db.uploads, uploadRec] };
    setDB(next);
    await InventoryAPI.appendRow(next, "uploads", uploadRec);
    toast(`已依 ${brand.name} ${stores.length} 家店鋪格式產製主檔與庫存檔 ✔（下載區可下載）`);
    setFile(null);
  };

  const history = db.uploads.filter((u) => u.month === month);

  return (
    <div className="space-y-6">
      <SectionCard title="📤 上傳區" subtitle="上傳客戶提供的主檔（庫存檔），依店鋪及盤點程式規定格式產製各盤點店鋪所需主檔">
        <div className="space-y-4">
          <BrandStoreSelect db={db} brandId={brandId} month={month} onBrand={setBrandId} showStore={false} />

          <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50">
            <div className="text-4xl mb-2">📄</div>
            <p className="text-sm text-slate-600 mb-3">上傳客戶提供的主檔 / 庫存檔（.xlsx / .xls / .csv）</p>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile}
              className="mx-auto block text-sm text-slate-500 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700" />
            {fileErr && <p className="text-sm text-red-600 mt-2">{fileErr}</p>}
            {file && <p className="text-sm text-emerald-600 mt-2">✔ 已選擇：{file.name}</p>}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={produce}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg">
              ⚙ 依店鋪格式產製各店主檔（庫存檔）
            </button>
            {brandId && <span className="text-sm text-slate-500">將產製 {stores.length} 家店鋪的檔案</span>}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="🗂 本月上傳紀錄" subtitle={`${month}`}>
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-4">上傳日期</th><th className="py-2 pr-4">品牌</th>
                <th className="py-2 pr-4">檔案名稱</th><th className="py-2 pr-4">產製店鋪數</th><th className="py-2 pr-4">狀態</th>
              </tr>
            </thead>
            <tbody>
              {history.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">{u.uploadedAt}</td>
                  <td className="py-2 pr-4">{db.brands.find((b) => b.id === u.brandId)?.name}</td>
                  <td className="py-2 pr-4 font-mono">{u.fileName}</td>
                  <td className="py-2 pr-4">{u.storeCount}</td>
                  <td className="py-2 pr-4"><span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs">已產製</span></td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan="5" className="py-6 text-center text-slate-400">本月尚無上傳紀錄</td></tr>}
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

  const rows = useMemo(() => {
    return db.records
      .filter((r) => r.month === month && (!brandId || r.brandId === brandId))
      .map((r) => {
        const store = db.stores.find((s) => s.id === r.storeId);
        const brand = db.brands.find((b) => b.id === r.brandId);
        const price = db.prices.find((p) => p.storeId === r.storeId);
        const hoursVal = calcHours(r.startTime, r.endTime);
        const manHours = Math.round(hoursVal * r.headcount * 100) / 100;
        const efficiency = manHours > 0 ? Math.round(r.pieces / manHours) : 0;
        let amount = 0, priceDesc = "未設定單價";
        if (price) {
          if (price.priceType === "piece") {
            amount = Math.round(r.pieces * price.unitPrice);
            priceDesc = `${price.unitPrice} 元/件`;
          } else {
            amount = Math.round(manHours * price.unitPrice);
            priceDesc = `${price.unitPrice} 元/人時`;
          }
        }
        return { ...r, storeName: store?.name || r.storeId, brandName: brand?.name, hoursVal, manHours, efficiency, amount, priceDesc };
      });
  }, [db, month, brandId]);

  const totals = rows.reduce((a, r) => ({
    pieces: a.pieces + r.pieces, manHours: a.manHours + r.manHours, amount: a.amount + r.amount,
  }), { pieces: 0, manHours: 0, amount: 0 });

  // TODO: IT 工程師請在此串接後端 API 邏輯（GET /api/analysis/export）
  const exportCSV = () => {
    downloadCSV(`請款資料_${month}.csv`, [
      ["品牌", "店鋪", "盤點日期", "件數", "人數", "時數", "人時", "人時效率(件/人時)", "計價方式", "請款金額"],
      ...rows.map((r) => [r.brandName, r.storeName, r.date, r.pieces, r.headcount, r.hoursVal, r.manHours, r.efficiency, r.priceDesc, r.amount]),
      ["合計", "", "", totals.pieces, "", "", totals.manHours, "", "", totals.amount],
    ]);
    toast("請款資料 CSV 已匯出 ✔");
  };

  const Stat = ({ label, value, unit }) => (
    <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-800 mt-1">{value}<span className="text-sm font-normal text-slate-500 ml-1">{unit}</span></div>
    </div>
  );

  return (
    <SectionCard title="📊 數據分析區" subtitle="依填寫區資料自動產出作業效率分析及請款資料">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BrandStoreSelect db={db} brandId={brandId} month={month} onBrand={setBrandId} showStore={false} />
        <button onClick={exportCSV} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg">
          ⬇ 匯出請款資料（CSV）
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
        <Stat label="盤點場次" value={rows.length} unit="場" />
        <Stat label="總盤點件數" value={totals.pieces.toLocaleString()} unit="件" />
        <Stat label="總投入人時" value={totals.manHours.toLocaleString()} unit="人時" />
        <Stat label="請款總額" value={totals.amount.toLocaleString()} unit="元" />
      </div>

      <div className="table-scroll mt-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2 pr-4">品牌</th><th className="py-2 pr-4">店鋪</th><th className="py-2 pr-4">日期</th>
              <th className="py-2 pr-4 text-right">件數</th><th className="py-2 pr-4 text-right">人數</th>
              <th className="py-2 pr-4 text-right">人時</th><th className="py-2 pr-4 text-right">人時效率</th>
              <th className="py-2 pr-4">計價方式</th><th className="py-2 pr-4 text-right">請款金額</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2 pr-4">{r.brandName}</td>
                <td className="py-2 pr-4">{r.storeName}</td>
                <td className="py-2 pr-4">{r.date}</td>
                <td className="py-2 pr-4 text-right">{r.pieces.toLocaleString()}</td>
                <td className="py-2 pr-4 text-right">{r.headcount}</td>
                <td className="py-2 pr-4 text-right">{r.manHours}</td>
                <td className="py-2 pr-4 text-right">{r.efficiency.toLocaleString()} 件/人時</td>
                <td className="py-2 pr-4">{r.priceDesc}</td>
                <td className="py-2 pr-4 text-right font-semibold">{r.amount.toLocaleString()} 元</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="9" className="py-6 text-center text-slate-400">尚無符合條件的填寫紀錄</td></tr>}
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
  const [storeForm, setStoreForm] = useState({ code: "", name: "" });
  const [staffForm, setStaffForm] = useState({ empNo: "", name: "" });

  const stores = db.stores.filter((s) => s.brandId === brandId && s.month === month);
  const staff = db.staff.filter((p) => p.brandId === brandId && p.month === month);

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
    setDB((d) => ({ ...d, stores: [...d.stores, { id: uid("S"), brandId, month, code: storeForm.code.trim(), name: storeForm.name.trim() }] }));
    setStoreForm({ code: "", name: "" });
    toast("店鋪已新增 ✔");
  };

  const addStaff = () => {
    if (!staffForm.empNo.trim() || !staffForm.name.trim()) { toast("員工編號與姓名皆為必填"); return; }
    setDB((d) => ({ ...d, staff: [...d.staff, { id: uid("P"), brandId, month, empNo: staffForm.empNo.trim(), name: staffForm.name.trim() }] }));
    setStaffForm({ empNo: "", name: "" });
    toast("盤點人員已新增 ✔");
  };

  // Excel 匯入（原型模擬：實際解析由後端處理）
  // TODO: IT 工程師請在此串接後端 API 邏輯（POST /api/import/stores、/api/import/staff）
  const importExcel = (kind) => (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) { toast("僅接受 .xlsx / .xls / .csv 檔案"); return; }
    if (kind === "stores") {
      const n = stores.length + 1;
      setDB((d) => ({
        ...d, stores: [...d.stores,
          { id: uid("S"), brandId, month, code: `IMP-${String(n).padStart(3, "0")}`, name: `匯入店鋪範例${n}` },
          { id: uid("S"), brandId, month, code: `IMP-${String(n + 1).padStart(3, "0")}`, name: `匯入店鋪範例${n + 1}` },
        ],
      }));
      toast(`已模擬匯入店鋪名單（${f.name}）✔`);
    } else {
      const n = staff.length + 1;
      setDB((d) => ({
        ...d, staff: [...d.staff,
          { id: uid("P"), brandId, month, empNo: `IMP${String(n).padStart(3, "0")}`, name: `匯入人員範例${n}` },
        ],
      }));
      toast(`已模擬匯入盤點人員名單（${f.name}）✔`);
    }
    e.target.value = "";
  };

  const removeStore = (id) => setDB((d) => ({ ...d, stores: d.stores.filter((s) => s.id !== id) }));
  const removeStaff = (id) => setDB((d) => ({ ...d, staff: d.staff.filter((p) => p.id !== id) }));

  const setPrice = (storeId, patch) => {
    setDB((d) => {
      const exists = d.prices.find((p) => p.storeId === storeId);
      const prices = exists
        ? d.prices.map((p) => (p.storeId === storeId ? { ...p, ...patch } : p))
        : [...d.prices, { storeId, priceType: "piece", unitPrice: 0, ...patch }];
      return { ...d, prices };
    });
  };

  const tabs = [
    { id: "stores", label: "🏬 店鋪名單" },
    { id: "staff", label: "👥 盤點人員名單" },
    { id: "prices", label: "💰 單價設定" },
    { id: "brands", label: "🏷 品牌管理" },
  ];

  const inputCls = "px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none";
  const importBtn = (kind, label) => (
    <label className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg cursor-pointer">
      📥 {label}（Excel 匯入）
      <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importExcel(kind)} />
    </label>
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
            <input placeholder="店鋪代碼" value={storeForm.code} onChange={(e) => setStoreForm({ ...storeForm, code: e.target.value })} className={inputCls + " w-32"} />
            <input placeholder="店鋪名稱" value={storeForm.name} onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })} className={inputCls + " w-52"} />
            <button onClick={addStore} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">＋ 單筆新增</button>
          </div>
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500 border-b"><th className="py-2 pr-4">代碼</th><th className="py-2 pr-4">名稱</th><th className="py-2 pr-4">操作</th></tr></thead>
              <tbody>
                {stores.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-mono">{s.code}</td><td className="py-2 pr-4">{s.name}</td>
                    <td className="py-2 pr-4"><button onClick={() => removeStore(s.id)} className="text-red-500 hover:underline">刪除</button></td>
                  </tr>
                ))}
                {stores.length === 0 && <tr><td colSpan="3" className="py-6 text-center text-slate-400">此品牌本月尚無店鋪，請匯入或新增</td></tr>}
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
            <input placeholder="員工編號" value={staffForm.empNo} onChange={(e) => setStaffForm({ ...staffForm, empNo: e.target.value })} className={inputCls + " w-32"} />
            <input placeholder="姓名（請用範例資料）" value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} className={inputCls + " w-52"} />
            <button onClick={addStaff} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">＋ 單筆新增</button>
          </div>
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500 border-b"><th className="py-2 pr-4">員編</th><th className="py-2 pr-4">姓名</th><th className="py-2 pr-4">操作</th></tr></thead>
              <tbody>
                {staff.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-mono">{p.empNo}</td><td className="py-2 pr-4">{p.name}</td>
                    <td className="py-2 pr-4"><button onClick={() => removeStaff(p.id)} className="text-red-500 hover:underline">刪除</button></td>
                  </tr>
                ))}
                {staff.length === 0 && <tr><td colSpan="3" className="py-6 text-center text-slate-400">此品牌本月尚無盤點人員，請匯入或新增</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 單價設定 */}
      {tab === "prices" && (
        <div className="mt-4 fade-in">
          <p className="text-sm text-slate-500 mb-3">依品牌 / 店鋪別設定計價方式與單價，數據分析區將依此計算請款金額。</p>
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500 border-b"><th className="py-2 pr-4">店鋪</th><th className="py-2 pr-4">計價方式</th><th className="py-2 pr-4">單價（元）</th></tr></thead>
              <tbody>
                {stores.map((s) => {
                  const p = db.prices.find((x) => x.storeId === s.id) || { priceType: "piece", unitPrice: "" };
                  return (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{s.code} {s.name}</td>
                      <td className="py-2 pr-4">
                        <select value={p.priceType} onChange={(e) => setPrice(s.id, { priceType: e.target.value })} className={inputCls + " bg-white"}>
                          <option value="piece">依件數（元/件）</option>
                          <option value="hour">依人時（元/人時）</option>
                        </select>
                      </td>
                      <td className="py-2 pr-4">
                        <input type="number" min="0" step="0.01" value={p.unitPrice}
                          onChange={(e) => setPrice(s.id, { unitPrice: Number(e.target.value) })} className={inputCls + " w-32"} />
                      </td>
                    </tr>
                  );
                })}
                {stores.length === 0 && <tr><td colSpan="3" className="py-6 text-center text-slate-400">此品牌本月尚無店鋪</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

  const user = sessionStorage.getItem("loginUser") || "demo-user";

  // 權限控管：盤點人員僅可使用下載區與填寫區
  const NAV_TABS = [
    { id: "download", label: "📥 下載區", roles: ["manager", "staff"] },
    { id: "fill", label: "📝 填寫區", roles: ["manager", "staff"] },
    { id: "upload", label: "📤 上傳區", roles: ["manager"] },
    { id: "analysis", label: "📊 數據分析區", roles: ["manager"] },
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
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSyncing(true);
      try { await InventoryAPI.saveTabs(db, ADMIN_TABS); } catch (e) { /* 同步失敗，下次變更再試 */ } finally { setSyncing(false); }
    }, 600);
  }, [db, ready]);

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
              <div className="font-bold">日翊盤點平台</div>
              <div className="text-[11px] text-slate-400">多品牌盤點作業管理系統</div>
            </div>
          </div>

          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-sm text-slate-800 bg-white" title="盤點月份" />

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
        {tab === "upload" && <UploadZone db={db} setDB={setDB} month={month} toast={toast} />}
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
