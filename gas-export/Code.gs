const SHEET_ID = 'ここにスプレッドシートIDを貼り付けてください'; 

/**
 * GETリクエスト: アプリの画面を表示
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('車両点検アプリ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
}

/**
 * POSTリクエスト: データの保存・更新
 */
function doPost(e) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName('records');
  if (!sheet) {
    sheet = ss.insertSheet('records');
  }
  
  // ヘッダーがなければ作成
  ensureHeaders(sheet);

  const payload = JSON.parse(e.postData.contents);
  const action = payload.action; // 'create' or 'update'
  const data = payload.data;

  if (action === 'create') {
    sheet.appendRow(recordToRow(data));
  } else if (action === 'update') {
    const rows = sheet.getDataRange().getValues();
    let found = false;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] == data.id) { // ID列(A列)で一致確認
        const range = sheet.getRange(i + 1, 1, 1, rows[i].length);
        range.setValues([recordToRow(data)]);
        found = true;
        break;
      }
    }
    // もし見つからなければ新規追加
    if (!found) sheet.appendRow(recordToRow(data));
  }

  return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * マスターデータの取得
 */
function getMasterData() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('master');
  if (!sheet) return { branches: [], vehicles: [], drivers: [], checkers: [] };

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const result = {
    branches: [],
    vehicles: [],
    drivers: [],
    checkers: []
  };

  for (let i = 1; i < data.length; i++) {
    for (let j = 0; j < headers.length; j++) {
      const val = data[i][j];
      if (!val) continue;
      if (headers[j] === '支店名') result.branches.push(val);
      if (headers[j] === '車両番号') result.vehicles.push(val);
      if (headers[j] === '運転者名') result.drivers.push(val);
      if (headers[j] === '確認者名') result.checkers.push(val);
    }
  }
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
 * オブジェクトをスプレッドシートの行（配列）に変換
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
