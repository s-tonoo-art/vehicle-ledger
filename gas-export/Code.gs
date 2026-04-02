const SHEET_ID = 'ここにスプレッドシートIDを貼り付けてください'; 

/**
 * GETリクエスト: マスターデータの取得
 * ブラウザでURLを直接開いてもデータが表示されるため、疎通確認が簡単です。
 */
function doGet() {
  const data = getMasterData();
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
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

  return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * スプレッドシートからマスターデータを読み込む
 */
function getMasterData() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  // シート名の候補（大文字小文字、カタカナに対応）
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

  // 見出し列のインデックスを探す（柔軟な判定）
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
  
  // 重複削除と空文字の除外
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
