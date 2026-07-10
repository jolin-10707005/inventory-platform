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

var TABS = ["brands", "stores", "staff", "prices", "produced", "records", "uploads"];

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "getAll";
  if (action === "getAll") return jsonOut(getAll());
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
    default:
      return jsonOut({ error: "unknown action: " + body.action });
  }
}

/* ---------- 讀取 ---------- */
function getAll() {
  var db = {};
  TABS.forEach(function (tab) { db[tab] = readTab(tab); });
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
  sh.getRange(1, 1, out.length, headers.length).setValues(out);
}

function appendRow(tab, row) {
  var sh = sheet(tab);
  var values = sh.getDataRange().getValues();
  var headers = (values.length && values[0].join("") !== "") ? values[0] : null;
  if (!headers) {
    headers = Object.keys(row);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  sh.appendRow(toLine(row, headers));
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
