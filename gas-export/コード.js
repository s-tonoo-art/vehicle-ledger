const SHEET_ID = '1rN5oDCZ9wRPxTRr-oATTDUKyD5vXz504TaSIZx4je5w'; // お客様のシステムシートID

/**
 * GETリクエスト: HTMLを返す
 */
function doGet(e) {
  const page = e.parameter.p || 'index';
  const html = HtmlService.createTemplateFromFile(page === 'history' ? 'History' : 'Index');
  return html.evaluate()
    .setTitle('車両点検アプリ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * ファイルをインクルードするためのヘルパー
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * マスターデータの取得 (クライアントから呼ばれる)
 */
function getMasterDataGAS() {
  try {
    return getMasterData();
  } catch (e) {
    console.error('Error in getMasterDataGAS:', e);
    return { error: e.toString() };
  }
}

/**
 * レコードの保存 (クライアントから呼ばれる)
 */
function saveRecordGAS(payload) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName('records');
    if (!sheet) {
      sheet = ss.insertSheet('records');
    }
    ensureHeaders(sheet);

    const action = payload.action; 
    const data = payload.data;

    if (action === 'create') {
      sheet.appendRow(recordToRow(data));
    } else if (action === 'update') {
      const rows = sheet.getDataRange().getValues();
      let found = false;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] == data.id) { 
          const range = sheet.getRange(i + 1, 1, 1, rows[i].length);
          range.setValues([recordToRow(data)]);
          found = true;
          break;
        }
      }
      if (!found) sheet.appendRow(recordToRow(data));
    }
    return { status: 'success' };
  } catch (e) {
    console.error('Error in saveRecordGAS:', e);
    return { status: 'error', message: e.toString() };
  }
}

/**
 * 保存済みレコードの取得 (履歴用)
 */
function getRecordsGAS() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName('records');
    if (!sheet) return [];
    
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return [];
    
    const headers = values[0];
    const records = [];
    
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const record = {
        id: row[0],
        status: row[1],
        date: formatDate(row[2]),
        branch: row[3],
        vehicle: row[4],
        driver: row[5],
        departure: row[6],
        arrival: row[7],
        odoStart: row[8],
        odoEnd: row[9],
        odoDiff: row[10],
        alcohol: row[11],
        alcoholAlert: row[12] === 'あり',
        checker: row[13],
        checkedAt: row[14],
        remarks: row[15],
        savedAt: row[16]
      };
      records.push(record);
    }
    return records;
  } catch (e) {
    console.error('Error in getRecordsGAS:', e);
    return [];
  }
}

/**
 * 補助関数: 日付フォーマット (YYYY-MM-DD)
 */
function formatDate(date) {
  if (!date || !(date instanceof Date)) return date;
  const y = date.getFullYear();
  const m = ('0' + (date.getMonth() + 1)).slice(-2);
  const d = ('0' + date.getDate()).slice(-2);
  return `${y}-${m}-${d}`;
}

/**
 * スプレッドシートからマスターデータを読み込む (内部用)
 */
function getMasterData() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheetNames = ['master', 'Master', 'マスター', 'MasterData'];
  let sheet = null;
  for (const name of sheetNames) {
    sheet = ss.getSheetByName(name);
    if (sheet) break;
  }
  
  if (!sheet) return { branches: [], vehicles: [], drivers: [], checkers: [], debug: 'Sheet "master" not found' };

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { branches: [], vehicles: [], drivers: [], checkers: [], debug: 'Sheet is empty' };
  
  const headers = data[0].map(h => String(h).trim());
  const result = { branches: [], vehicles: [], drivers: [], checkers: [], debug: 'Loaded from sheet: ' + sheet.getName() };

  const findCol = (targets) => headers.findIndex(h => targets.some(t => h.includes(t)));
  const colBranch  = findCol(['支店', '拠点', 'Branch']);
  const colVehicle = findCol(['車両', 'ナンバー', 'Vehicle', 'No']);
  const colDriver  = findCol(['運転者', '担当者', 'Driver', '氏名']);
  const colChecker = findCol(['確認者', '管理者', 'Checker', '承認']);

  for (let i = 1; i < data.length; i++) {
    if (colBranch >= 0 && data[i][colBranch])   result.branches.push(String(data[i][colBranch]));
    if (colVehicle >= 0 && data[i][colVehicle]) result.vehicles.push(String(data[i][colVehicle]));
    if (colDriver >= 0 && data[i][colDriver])   result.drivers.push(String(data[i][colDriver]));
    if (colChecker >= 0 && data[i][colChecker]) result.checkers.push(String(data[i][colChecker]));
  }
  
  const unique = (arr) => [...new Set(arr.filter(Boolean))];
  result.branches = unique(result.branches);
  result.vehicles = unique(result.vehicles);
  result.drivers = unique(result.drivers);
  result.checkers = unique(result.checkers);

  return result;
}

/**
 * ヘッダーの初期化
 */
function ensureHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    const headers = [
      '記録ID', 'ステータス', '点検日', '支店名', '車両番号', '運転者', 
      '出発時刻', '帰着時刻', '出発時走行距離', '帰着時走行距離', '走行距離',
      'アルコール値', 'アルコール警告', '確認者', '確認時刻', '備考', '保存日時'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

/**
 * オブジェクトを行に変換
 */
function recordToRow(r) {
  return [
    r.id,
    r.status || '不明',
    r.date,
    r.branch,
    r.vehicle,
    r.driver,
    r.departure,
    r.arrival,
    r.odoStart,
    r.odoEnd,
    r.odoDiff,
    r.alcohol,
    r.alcoholAlert ? 'あり' : 'なし',
    r.checker,
    r.checkedAt,
    r.remarks,
    r.savedAt
  ];
}

