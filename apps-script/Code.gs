/**
 * 日翊盤點平台 — Google Apps Script 資料橋樑
 * ------------------------------------------------------------
 * 作用：讓前端平台能把資料寫進這份 Google Sheets、把照片存進 Google Drive。
 * 每個資料表 = Sheets 的一個分頁（brands / stores / staff / prices / produced / records / uploads），
 * 一列一筆，第一列為欄位名稱（表頭），程式會自動建立不存在的分頁與表頭。
 *
 * 部署步驟見同資料夾 README.md。部署後把產生的 /exec 網址貼進前端 api.js 的 APPS_SCRIPT_URL。
 */

// 盤點照片要存放的 Google Drive 資料夾 ID（即使用者提供的資料夾）
var PHOTO_FOLDER_ID = "1h9qjSAx2-sojs5_uP307qmBUvw-XiDhn";

var TABS = ["brands", "stores", "staff", "prices", "records", "uploads"];

// 分頁顯示名稱（程式內部仍用英文代碼；工作表分頁改中文，方便人工檢視）
var SHEET_NAMES = {
  brands: "品牌",
  stores: "店鋪",
  staff: "盤點人員",
  prices: "單價",
  records: "盤點紀錄",
  uploads: "上傳紀錄",
  masters: "主檔索引"
};

function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || "getAll";
  if (action === "getAll") return jsonOut(getAll());
  if (action === "getMaster") return jsonOut(getMaster(p.storeId, p.month, p.type));
  return jsonOut({ error: "unknown action: " + action });
}

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  switch (body.action) {
    case "replaceTab":
      replaceTab(body.tab, body.rows);
      return jsonOut({ ok: true });
    case "append":
      appendRow(body.tab, body.row);
      return jsonOut({ ok: true });
    case "uploadPhoto":
      return jsonOut({ ok: true, url: uploadPhoto(body.dataUrl, body.filename) });
    case "putMaster":
      putMaster(body.rec);
      return jsonOut({ ok: true });
    default:
      return jsonOut({ error: "unknown action: " + body.action });
  }
}

/* ---------- 讀取 ---------- */
function getAll() {
  var db = {};
  TABS.forEach(function (tab) { db[tab] = readTab(tab); });
  db.mastersIndex = mastersIndex(); // 主檔只回傳「哪些店有檔」的輕量索引，實際內容用 getMaster 單獨抓
  return db;
}

function readTab(tab) {
  var sh = sheet(tab);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    if (values[i].join("") === "") continue; // 跳過空列
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var v = values[i][j];
      if (typeof v === "string" && (v.charAt(0) === "[" || v.charAt(0) === "{")) {
        try { v = JSON.parse(v); } catch (err) { /* 保持原字串 */ }
      }
      obj[headers[j]] = v;
    }
    rows.push(obj);
  }
  return rows;
}

/* ---------- 寫入 ---------- */
function replaceTab(tab, rows) {
  var sh = sheet(tab);
  sh.clear();
  if (!rows || rows.length === 0) return;
  var headers = collectHeaders(rows);
  var out = [headers];
  rows.forEach(function (r) { out.push(toLine(r, headers)); });
  var range = sh.getRange(1, 1, out.length, headers.length);
  range.setNumberFormat("@"); // 純文字格式，避免 "2026-07"、"21:00" 被 Sheets 自動轉成日期/時間
  range.setValues(out);
}

function appendRow(tab, row) {
  var sh = sheet(tab);
  var values = sh.getDataRange().getValues();
  var headers = (values.length && values[0].join("") !== "") ? values[0] : null;
  if (!headers) {
    headers = Object.keys(row);
    var hr = sh.getRange(1, 1, 1, headers.length);
    hr.setNumberFormat("@");
    hr.setValues([headers]);
  }
  var rowIndex = sh.getLastRow() + 1;
  var range = sh.getRange(rowIndex, 1, 1, headers.length);
  range.setNumberFormat("@"); // 同上，避免日期/時間欄位被自動轉型
  range.setValues([toLine(row, headers)]);
}

var MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 單張照片上限 10MB

function uploadPhoto(dataUrl, filename) {
  var parts = dataUrl.split(",");
  var meta = parts[0]; // 例：data:image/jpeg;base64
  var contentType = meta.substring(meta.indexOf(":") + 1, meta.indexOf(";"));
  // 後端驗證：前端 accept="image/*" 可被繞過，伺服器端必須再驗一次（CWE-434）
  if (contentType.indexOf("image/") !== 0) {
    throw new Error("僅允許上傳影像檔");
  }
  var bytes = Utilities.base64Decode(parts[1]);
  if (bytes.length > MAX_PHOTO_BYTES) {
    throw new Error("檔案過大，單張上限 10MB");
  }
  var blob = Utilities.newBlob(bytes, contentType, filename || "photo");
  var file = DriveApp.getFolderById(PHOTO_FOLDER_ID).createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return "https://drive.google.com/uc?id=" + file.getId();
}

/* ---------- 主檔／庫存檔（資料量大：一個資料集 = 一個工作表，一列一筆） ----------
 * 索引分頁 masters：storeId, month, type, sheet（指向實際資料工作表名稱）
 * 資料工作表：第一列為欄位名稱，其後每列一筆。全部純文字格式。
 * 這樣可容納數萬列，不受單一儲存格 5 萬字元限制。
 */
var MASTER_INDEX_HEADERS = ["storeId", "month", "type", "sheet"];

function masterIndexSheet() {
  var sh = sheet("masters");
  var v = sh.getDataRange().getValues();
  if (v.length === 0 || v[0].join("") === "") {
    var hr = sh.getRange(1, 1, 1, MASTER_INDEX_HEADERS.length);
    hr.setNumberFormat("@"); hr.setValues([MASTER_INDEX_HEADERS]);
  }
  return sh;
}

function mastersIndex() {
  var sh = masterIndexSheet();
  var v = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === "") continue;
    out.push({ storeId: v[i][0], month: v[i][1], type: v[i][2] });
  }
  return out;
}

// 依 storeId/month/type 產生合法且唯一的資料工作表名稱
function dataSheetName(storeId, month, type) {
  var raw = "D_" + storeId + "_" + month + "_" + type;
  return raw.replace(/[:\\\/\?\*\[\]']/g, "_").substring(0, 95);
}

function getMaster(storeId, month, type) {
  var sh = masterIndexSheet();
  var v = sh.getDataRange().getValues();
  var name = null;
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === String(storeId) && String(v[i][1]) === String(month) && String(v[i][2]) === String(type)) { name = v[i][3]; break; }
  }
  if (!name) return null;
  var ds = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!ds) return null;
  var dv = ds.getDataRange().getValues();
  if (dv.length < 1) return { columns: [], rows: [] };
  var cols = dv[0];
  var rows = [];
  for (var r = 1; r < dv.length; r++) {
    if (dv[r].join("") === "") continue;
    var o = {};
    for (var c = 0; c < cols.length; c++) o[cols[c]] = dv[r][c];
    rows.push(o);
  }
  return { columns: cols, rows: rows };
}

function putMaster(rec) {
  var name = dataSheetName(rec.storeId, rec.month, rec.type);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ds = ss.getSheetByName(name);
  if (!ds) ds = ss.insertSheet(name); else ds.clear();
  var cols = rec.columns || [];
  var rows = rec.rows || [];
  if (cols.length) {
    var out = [cols];
    rows.forEach(function (r) { out.push(cols.map(function (c) { var v = r[c]; return v == null ? "" : v; })); });
    var rg = ds.getRange(1, 1, out.length, cols.length);
    rg.setNumberFormat("@"); rg.setValues(out);
  }
  // 索引 upsert
  var sh = masterIndexSheet();
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === String(rec.storeId) && String(v[i][1]) === String(rec.month) && String(v[i][2]) === String(rec.type)) return;
  }
  var ri = sh.getLastRow() + 1;
  var rg2 = sh.getRange(ri, 1, 1, MASTER_INDEX_HEADERS.length);
  rg2.setNumberFormat("@"); rg2.setValues([[rec.storeId, rec.month, rec.type, name]]);
}

function safeParse(v, dft) {
  try { return JSON.parse(v); } catch (e) { return dft; }
}

/* ---------- 工具 ---------- */
function collectHeaders(rows) {
  var headers = [];
  rows.forEach(function (r) {
    Object.keys(r).forEach(function (k) { if (headers.indexOf(k) < 0) headers.push(k); });
  });
  return headers;
}

function toLine(row, headers) {
  return headers.map(function (h) {
    var v = row[h];
    if (v && typeof v === "object") return JSON.stringify(v);
    return v == null ? "" : v;
  });
}

function sheet(name) {
  var real = SHEET_NAMES[name] || name; // 英文代碼 → 中文分頁名
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(real);
  if (!sh) sh = ss.insertSheet(real);
  return sh;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
