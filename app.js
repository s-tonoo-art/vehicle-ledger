/* ==============================================
   車両点検アプリ - app.js
   メインロジック（LocalStorage永続化）
   ============================================== */

'use strict';

// ── マスターデータ（ここに追加・変更可能）──
const MASTER = {
  branches: ['東京本社', '大阪支店', '名古屋支店', '福岡支店', '札幌支店', 'その他（手入力）'],
  vehicles: ['品川300あ1234', '品川300あ5678', '品川300い1111', 'その他（手入力）'],
  drivers:  ['山田 太郎', '鈴木 花子', '田中 一郎', '佐藤 美咲', 'その他（手入力）'],
  checkers: ['管理者A', '管理者B', '主任C', 'その他（手入力）'],
};

const CHECK_ITEMS = [
  { key: 'brake',    label: 'ブレーキ',      icon: '🛑' },
  { key: 'tire',     label: 'タイヤ状態',    icon: '🔄' },
  { key: 'lights',   label: '灯火類',        icon: '💡' },
  { key: 'wiper',    label: 'ワイパー',      icon: '🌧️' },
  { key: 'mirror',   label: 'バックミラー',  icon: '🪞' },
  { key: 'engine',   label: 'エンジン始動',  icon: '🔧' },
  { key: 'noise',    label: '異音有無',      icon: '🔊' },
  { key: 'fuel',     label: '燃料残量',      icon: '⛽' },
  { key: 'other',    label: 'その他',        icon: '📝' },
];

const TOTAL_SECTIONS = 5;
const ALCOHOL_THRESHOLD = 0.15;
const STORAGE_KEY = 'vehicle_inspections_v1';
const MASTER_KEY  = 'vehicle_master_v1';

// ── ストレージ ──
function loadRecords() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}
function loadMaster() {
  const defaultMaster = {
    branches: [...MASTER.branches],
    vehicles: [...MASTER.vehicles],
    drivers:  [...MASTER.drivers],
    checkers: [...MASTER.checkers],
  };
  try {
    const m = JSON.parse(localStorage.getItem(MASTER_KEY));
    // localStorageが空オブジェクトや壊れている場合はデフォルトを返す
    if (m && Array.isArray(m.branches) && Array.isArray(m.vehicles)) {
      return m;
    }
  } catch {}
  return defaultMaster;
}
function saveMaster(m) {
  localStorage.setItem(MASTER_KEY, JSON.stringify(m));
}

// ── DOM 取得ヘルパー ──
const $ = id => document.getElementById(id);

// ── セレクト生成 ──
function buildSelect(selectEl, items) {
  selectEl.innerHTML = '<option value="">-- 選択してください --</option>';
  if (!Array.isArray(items)) return;
  
  // スプレッドシートからのデータを入れる
  items.forEach(item => {
    if (item === 'その他（手入力）') return; // 重複防止
    const opt = document.createElement('option');
    opt.value = opt.textContent = item;
    selectEl.appendChild(opt);
  });
  
  // 最後に必ず「その他」を追加
  const other = document.createElement('option');
  other.value = other.textContent = 'その他（手入力）';
  selectEl.appendChild(other);
}


// ── 点検カード生成 ──
function buildCheckList() {
  const container = $('checkList');
  container.innerHTML = '';
  CHECK_ITEMS.forEach(item => {
    const card = document.createElement('div');
    card.className = 'check-card';
    card.id = `card-${item.key}`;
    card.innerHTML = `
      <div class="check-item-name">${item.icon} ${item.label}</div>
      <div class="check-buttons">
        <button class="btn-check" data-key="${item.key}" data-val="ok"   id="btn-${item.key}-ok">✅ OK</button>
        <button class="btn-check" data-key="${item.key}" data-val="ng"   id="btn-${item.key}-ng">❌ NG</button>
        <button class="btn-check" data-key="${item.key}" data-val="skip" id="btn-${item.key}-skip">— 未実施</button>
      </div>
      <div class="ng-comment" id="ngComment-${item.key}">
        <label>⚠️ NG理由（必須）</label>
        <textarea id="ngText-${item.key}" placeholder="${item.label}のNG内容を入力してください"></textarea>
      </div>
    `;
    container.appendChild(card);
  });

  // ボタンイベント
  container.addEventListener('click', e => {
    const btn = e.target.closest('.btn-check');
    if (!btn) return;
    const { key, val } = btn.dataset;
    setCheckState(key, val);
  });
}

// チェック状態管理
const checkState = {};

function setCheckState(key, val) {
  checkState[key] = val;
  CHECK_ITEMS.forEach(item => {
    if (item.key !== key) return;
    const card   = $(`card-${key}`);
    const btnOk   = $(`btn-${key}-ok`);
    const btnNg   = $(`btn-${key}-ng`);
    const btnSkip = $(`btn-${key}-skip`);
    const comment = $(`ngComment-${key}`);

    // reset
    btnOk.className   = 'btn-check';
    btnNg.className   = 'btn-check';
    btnSkip.className = 'btn-check';
    card.classList.remove('is-ok', 'is-ng');
    comment.classList.remove('visible');

    if (val === 'ok') {
      btnOk.className = 'btn-check active-ok';
      card.classList.add('is-ok');
    } else if (val === 'ng') {
      btnNg.className = 'btn-check active-ng';
      card.classList.add('is-ng');
      comment.classList.add('visible');
      $(`ngText-${key}`).focus();
    } else {
      btnSkip.className = 'btn-check active-skip';
    }
    updateProgress();
  });
}

// ── 前回データ引継ぎ ──
function applyLastRecord() {
  const records = loadRecords();
  if (records.length === 0) return;
  const last = records[records.length - 1];
  // 支店名
  if (last.branch) {
    const sel = $('branch');
    if ([...sel.options].some(o => o.value === last.branch)) {
      sel.value = last.branch;
    } else {
      sel.value = 'その他（手入力）';
      $('branchCustom').value = last.branch;
      $('branchCustomWrap').style.display = '';
    }
  }
  // 車両番号
  if (last.vehicle) {
    const sel = $('vehicle');
    if ([...sel.options].some(o => o.value === last.vehicle)) {
      sel.value = last.vehicle;
    } else {
      sel.value = 'その他（手入力）';
      $('vehicleCustom').value = last.vehicle;
      $('vehicleCustomWrap').style.display = '';
    }
  }
  // 運転者名
  if (last.driver) {
    const sel = $('driver');
    if ([...sel.options].some(o => o.value === last.driver)) {
      sel.value = last.driver;
    } else {
      sel.value = 'その他（手入力）';
      $('driverCustom').value = last.driver;
      $('driverCustomWrap').style.display = '';
    }
  }
  // 出発時走行距離（帰着値を引継ぎ）
  if (last.odoEnd) {
    $('odoStart').value = last.odoEnd;
    updateOdo();
  }
}

// ── 走行距離計算 ──
function updateOdo() {
  const start = parseFloat($('odoStart').value) || 0;
  const end   = parseFloat($('odoEnd').value)   || 0;
  const diff  = end - start;
  $('odoCalc').value = diff >= 0 ? `${diff.toLocaleString()} km` : '--- km';
  updateProgress();
}

// ── アルコールチェック ──
function updateAlcohol() {
  const val = parseFloat($('alcoholVal').value);
  const warn = $('alcoholWarning');
  if (!isNaN(val) && val >= ALCOHOL_THRESHOLD) {
    warn.classList.add('visible');
  } else {
    warn.classList.remove('visible');
  }
  updateProgress();
}

// ── プログレス計算 ──
function updateProgress() {
  let done = 0;
  // 基本情報
  const vehicle = getVehicle();
  const driver  = getDriver();
  if (vehicle && driver) done++;
  // 走行情報
  if ($('odoStart').value !== '') done++;
  // 点検項目
  const allChecked = CHECK_ITEMS.every(i => checkState[i.key]);
  if (allChecked) done++;
  // アルコール
  if ($('alcoholVal').value !== '') done++;
  // 確認
  if (getChecker()) done++;

  const pct = Math.round((done / TOTAL_SECTIONS) * 100);
  $('progressFill').style.width = `${pct}%`;
  $('progressLabel').textContent = `${done} / ${TOTAL_SECTIONS} セクション完了`;
}

// ── 値取得ヘルパー ──
function getBranch() {
  const v = $('branch').value;
  if (v === 'その他（手入力）') return $('branchCustom').value.trim();
  return v;
}
function getVehicle() {
  const v = $('vehicle').value;
  if (v === 'その他（手入力）') return $('vehicleCustom').value.trim();
  return v;
}
function getDriver() {
  const v = $('driver').value;
  if (v === 'その他（手入力）') return $('driverCustom').value.trim();
  return v;
}
function getChecker() {
  const v = $('checker').value;
  if (v === 'その他（手入力）') return $('checkerCustom').value.trim();
  return v;
}

// ── バリデーション ──
function validate() {
  const errors = [];
  if (!getBranch())   errors.push('支店名を選択または入力してください。');
  if (!getVehicle())  errors.push('車両番号を選択または入力してください。');
  if (!getDriver())   errors.push('運転者名を選択または入力してください。');
  if (!$('departure').value) errors.push('出発時刻を入力してください。');
  if ($('odoStart').value === '') errors.push('出発時走行距離を入力してください。');
  CHECK_ITEMS.forEach(item => {
    if (!checkState[item.key]) errors.push(`「${item.label}」の点検結果を選択してください。`);
    if (checkState[item.key] === 'ng') {
      const txt = $(`ngText-${item.key}`).value.trim();
      if (!txt) errors.push(`「${item.label}」のNG理由を入力してください。`);
    }
  });
  if ($('alcoholVal').value === '') errors.push('アルコール検査値を入力してください。');
  if (!getChecker()) errors.push('確認者名を選択または入力してください。');
  return errors;
}

// ── 保存 ──
async function saveRecord() {
  const errors = validate();
  if (errors.length > 0) {
    showToast('⚠️ ' + errors[0], 'error');
    return;
  }

  const alcohol = parseFloat($('alcoholVal').value) || 0;
  const checks  = {};
  CHECK_ITEMS.forEach(item => {
    checks[item.key] = {
      label:   item.label,
      result:  checkState[item.key],
      comment: checkState[item.key] === 'ng' ? $(`ngText-${item.key}`).value.trim() : '',
    };
  });

  const record = {
    id:        Date.now().toString(),
    savedAt:   new Date().toISOString(),
    date:      $('date').value,
    branch:    getBranch(),
    vehicle:   getVehicle(),
    driver:    getDriver(),
    departure: $('departure').value,
    arrival:   $('arrival').value,
    odoStart:  parseFloat($('odoStart').value) || 0,
    odoEnd:    parseFloat($('odoEnd').value)   || 0,
    odoDiff:   (parseFloat($('odoEnd').value) || 0) - (parseFloat($('odoStart').value) || 0),
    checks,
    alcohol,
    alcoholAlert: alcohol >= ALCOHOL_THRESHOLD,
    checker:   getChecker(),
    checkedAt: $('checkedAt').value,
    remarks:   $('remarks').value.trim(),
    status:    $('arrival').value && $('odoEnd').value ? '完了' : '稼働中', // 追加: ステータス判定
  };
  
  // Update Mode判定
  const isUpdate = sessionStorage.getItem('updateRecordId');
  if (isUpdate) {
    record.id = isUpdate; // 既存IDを引き継ぐ
  }

  // マスター更新（新規値を追加）
  const master = loadMaster();
  ['branches', 'vehicles', 'drivers', 'checkers'].forEach((mKey, i) => {
    const val = [record.branch, record.vehicle, record.driver, record.checker][i];
    if (val && !master[mKey].includes(val)) {
      master[mKey].splice(master[mKey].length - 1, 0, val);
    }
  });
  saveMaster(master);

  const records = loadRecords();
  if (isUpdate) {
    const idx = records.findIndex(r => r.id === isUpdate);
    if (idx !== -1) records[idx] = record;
    sessionStorage.removeItem('updateRecordId');
  } else {
    records.push(record);
  }
  saveRecords(records);

  // ▼ 新規追加: Google Apps Script経由でスプレッドシートへ送信
  const btn = $('submitBtn');
  btn.disabled = true;
  btn.textContent = '🔄 送信中...';
  
  try {
    // 💡 Content-Type: text/plain で送信し、CORSのPreflightエラーを回避する
    const payload = { action: isUpdate ? 'update' : 'create', data: record };
    await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });
    showToast('✅ スプレッドシートにも保存しました！', 'success');
  } catch (err) {
    console.error('GAS POST Error:', err);
    showToast('⚠️ ネットワークエラーのため端末内にのみ保存しました', 'error');
  }

  setTimeout(() => { window.location.href = 'history.html'; }, 1200);
}

// ── Toast ──
function showToast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

// ── セレクト変更→手入力欄 ──
function onSelectChange(selId, wrapId) {
  const sel  = $(selId);
  const wrap = $(wrapId);
  sel.addEventListener('change', () => {
    wrap.style.display = sel.value === 'その他（手入力）' ? '' : 'none';
    updateProgress();
  });
}

// ── OCR: カメラ → 数値読取 ──
function showOcrLoading(visible) {
  $('ocrOverlay').style.display = visible ? 'flex' : 'none';
}

async function runOcr(imageFile, targetInputId) {
  showOcrLoading(true);
  try {
    const workerPromise = (async () => {
      const worker = await Tesseract.createWorker('eng');
      await worker.setParameters({ tessedit_char_whitelist: '0123456789' });
      const res = await worker.recognize(imageFile);
      await worker.terminate();
      return res;
    })();

    // 15秒のタイムアウト
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('TIMEOUT')), 15000)
    );

    const { data: { text } } = await Promise.race([workerPromise, timeoutPromise]);

    // 数字列のうち最長（オドメーター値）を抽出
    const matches = text.match(/\d+/g);
    if (matches && matches.length > 0) {
      const num = matches.reduce((a, b) => a.length >= b.length ? a : b);
      $(targetInputId).value = num;
      updateOdo();
      showToast(`$D83D$DCF7 OCR読取: ${num} km`, 'success');
    } else {
      showToast('$26A0$FE0F 数値を読み取れませんでした。手動入力してください。', 'error');
    }
  } catch (err) {
    console.error('OCR error:', err);
    showToast('$26A0$FE0F OCRエラー。手動入力してください。', 'error');
    showToast('⚠️ OCRエラー。手動入力してください。', 'error');
  } finally {
    showOcrLoading(false);
  }
}

// ── Google Sheets連携 ──
// URLを確認（末尾にキャッシュ対策を追加）
const GAS_URL = 'https://script.google.com/a/macros/jt-e.jp/s/AKfycbxKCtNSP0fonFnIBjs3BUCoKcYtiFsw2ohXQHqFGi0UgHohrEm6seV4luG2BnCv-SHc/exec';

async function loadMasterFromSheets() {
  console.log('📡 GASからマスターデータを取得開始...');
  try {
    const res  = await fetch(GAS_URL + '?t=' + Date.now());
    if (!res.ok) throw new Error('Network response was not ok');
    
    const data = await res.json();
    console.log('✅ GASからの取得に成功:', data);
    
    const master = loadMaster();
    if (data.branches && data.branches.length > 0) master.branches = data.branches;
    if (data.vehicles && data.vehicles.length > 0) master.vehicles = data.vehicles;
    if (data.drivers  && data.drivers.length  > 0) master.drivers  = data.drivers;
    if (data.checkers && data.checkers.length > 0) master.checkers = data.checkers;
    
    saveMaster(master);
    return master;
  } catch (e) {
    console.error('❌ GASの読み込みに失敗しました:', e);
    showToast('⚠️ 連携失敗: 接続状況を確認してください', 'error');
    return loadMaster();
  }
}

// ── 接続テスト（詳細診断） ──
async function runDiagnostic() {
  const statusEl = $('diagnosticStatus');
  const logEl    = $('diagnosticLog');
  const btn      = $('testConnBtn');
  
  statusEl.textContent = '⏳ 診断中...';
  statusEl.className = 'diagnostic-status';
  logEl.style.display = 'block';
  logEl.textContent = `[${new Date().toLocaleTimeString()}] 診断開始...\n`;
  logEl.textContent += `URL: ${GAS_URL}\n`;
  btn.disabled = true;

  try {
    logEl.textContent += `> Fetch実行中...\n`;
    const start = Date.now();
    const res = await fetch(GAS_URL + '?diagnostic=' + start);
    const end = Date.now();
    
    logEl.textContent += `> レスポンス受信: ${res.status} ${res.statusText} (${end - start}ms)\n`;
    
    if (res.ok) {
      const data = await res.json();
      logEl.textContent += `> JSONパース成功:\n${JSON.stringify(data, null, 2)}\n`;
      statusEl.textContent = '✅ 接続成功！';
      statusEl.classList.add('status-ok');
      showToast('✅ 正常に通信できています', 'success');
    } else {
      statusEl.textContent = `❌ エラー (${res.status})`;
      statusEl.classList.add('status-error');
      logEl.textContent += `> エラー詳細: ${res.status} ${res.statusText}\n`;
      if (res.status === 401) {
        logEl.textContent += `💡 ヒント: Googleアカウントの認証が必要か、アクセス権限が不足しています。\n`;
      }
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent = '❌ 接続失敗';
    statusEl.classList.add('status-error');
    logEl.textContent += `> エラー発生: ${err.name}\n`;
    logEl.textContent += `> メッセージ: ${err.message}\n`;
    
    if (err.message.includes('Failed to fetch')) {
      logEl.textContent += `\n🚨 【重要】CORSエラーまたはネットワーク遮断が発生しています。\n`;
      logEl.textContent += `考えられる原因:\n`;
      logEl.textContent += `1. GASの公開設定が「全員(Anyone)」になっていないため、リダイレクト先の認証でブラウザに拒否されている。\n`;
      logEl.textContent += `2. 社内プロキシやセキュリティソフトで script.google.com が制限されている。\n`;
      logEl.textContent += `\n💡 対策案:\n`;
      logEl.textContent += `・可能であれば、GASの公開設定を「全員(Anyone)」に変更して再デプロイしてください。\n`;
    }
  } finally {
    btn.disabled = false;
    logEl.textContent += `\n[${new Date().toLocaleTimeString()}] 診断終了。`;
  }
}

// ── フォームリセット処理 ──
function resetForm() {
  $('submitBtn').disabled = false;
  $('submitBtn').textContent = '送信';
  $('departure').value = '';
  $('arrival').value = '';
  $('odoStart').value = '';
  $('odoEnd').value = '';
  $('odoCalc').value = '--- km';
  $('alcoholVal').value = '';
  $('remarks').value = '';
  
  CHECK_ITEMS.forEach(item => {
    checkState[item.key] = null;
    $(`card-${item.key}`).classList.remove('is-ok', 'is-ng');
    $(`btn-${item.key}-ok`).className = 'btn-check';
    $(`btn-${item.key}-ng`).className = 'btn-check';
    $(`btn-${item.key}-skip`).className = 'btn-check';
    $(`ngComment-${item.key}`).classList.remove('visible');
    $(`ngText-${item.key}`).value = '';
  });
  updateProgress();
}

// ── 初期化 ──
async function init() {
  // ページが表示されるたびにリセット（Safari等のキャッシュ戻り対策）
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) resetForm();
  });
  
  // 日付セット
  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  $('date').value = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;

  // マスターからセレクト構築
  const master = await loadMasterFromSheets();
  buildSelect($('branch'),   master.branches);
  buildSelect($('vehicle'),  master.vehicles);
  buildSelect($('driver'),   master.drivers);
  buildSelect($('checker'),  master.checkers);

  // 選択→手入力切替
  onSelectChange('branch',   'branchCustomWrap');
  onSelectChange('vehicle',  'vehicleCustomWrap');
  onSelectChange('driver',   'driverCustomWrap');
  onSelectChange('checker',  'checkerCustomWrap');

  // 点検カード生成
  buildCheckList();

  // イベント登録
  $('odoStart').addEventListener('input', updateOdo);
  $('odoEnd').addEventListener('input',   updateOdo);
  $('alcoholVal').addEventListener('input', updateAlcohol);
  $('departure').addEventListener('change', updateProgress);
  $('arrival').addEventListener('change', updateProgress);
  $('branch').addEventListener('change', updateProgress);
  $('vehicle').addEventListener('change', updateProgress);
  $('driver').addEventListener('change', updateProgress);
  $('checker').addEventListener('change', updateProgress);
  $('branchCustom').addEventListener('input', updateProgress);
  $('vehicleCustom').addEventListener('input', updateProgress);
  $('driverCustom').addEventListener('input', updateProgress);
  $('checkerCustom').addEventListener('input', updateProgress);

  // カメラOCRイベント
  $('cameraStart').addEventListener('change', e => {
    if (e.target.files[0]) runOcr(e.target.files[0], 'odoStart');
  });
  $('cameraEnd').addEventListener('change', e => {
    if (e.target.files[0]) runOcr(e.target.files[0], 'odoEnd');
  });

  $('submitBtn').addEventListener('click', saveRecord);
  $('testConnBtn').addEventListener('click', runDiagnostic);

  // Updateモードの判定（履歴から再入力に来た場合）
  const updateId = sessionStorage.getItem('updateRecordId');
  if (updateId) {
    const rawRecs = loadRecords();
    const target = rawRecs.find(r => r.id === updateId);
    if (target) {
      // 復元処理
      $('date').value = target.date || '';
      // セレクトボックス系の復元
      const safeSetSelect = (id, val, wrapId) => {
        const sel = $(id);
        if ([...sel.options].some(o => o.value === val)) {
           sel.value = val;
        } else {
           sel.value = 'その他（手入力）';
           $(id + 'Custom').value = val;
           $(wrapId).style.display = '';
        }
      };
      safeSetSelect('branch', target.branch, 'branchCustomWrap');
      safeSetSelect('vehicle', target.vehicle, 'vehicleCustomWrap');
      safeSetSelect('driver', target.driver, 'driverCustomWrap');
      safeSetSelect('checker', target.checker, 'checkerCustomWrap');
      
      $('departure').value = target.departure || '';
      $('odoStart').value = target.odoStart || '';
      $('alcoholVal').value = target.alcohol || '';
      $('checkedAt').value = target.checkedAt || '';
      $('remarks').value = target.remarks || '';
      
      // 点検チェック状態の復元
      if (target.checks) {
        Object.keys(target.checks).forEach(k => {
          setCheckState(k, target.checks[k].result);
          if (target.checks[k].result === 'ng') {
            $(`ngText-${k}`).value = target.checks[k].comment;
          }
        });
      }
      // 送信ボタンのラベル変更
      $('submitBtn').textContent = '$2705 帰着報告を送信（更新）';
    }
  } else {
    // 新規時は前回データ引継ぎ
    applyLastRecord();
  }

  updateProgress();
}

document.addEventListener('DOMContentLoaded', init);

