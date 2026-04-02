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
  try {
    const m = JSON.parse(localStorage.getItem(MASTER_KEY));
    if (m) return m;
  } catch {}
  return {
    branches: [...MASTER.branches],
    vehicles: [...MASTER.vehicles],
    drivers:  [...MASTER.drivers],
    checkers: [...MASTER.checkers],
  };
}
function saveMaster(m) {
  localStorage.setItem(MASTER_KEY, JSON.stringify(m));
}

// ── DOM 取得ヘルパー ──
const $ = id => document.getElementById(id);

// ── セレクト生成 ──
function buildSelect(selectEl, items, allowCustom) {
  selectEl.innerHTML = '<option value="">-- 選択してください --</option>';
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item;
    opt.textContent = item;
    selectEl.appendChild(opt);
  });
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
function saveRecord() {
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
  };

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
  records.push(record);
  saveRecords(records);

  showToast('✅ 点検記録を保存しました！', 'success');
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
    const worker = await Tesseract.createWorker('eng');
    await worker.setParameters({ tessedit_char_whitelist: '0123456789' });
    const { data: { text } } = await worker.recognize(imageFile);
    await worker.terminate();
    // 数字列のうち最長（オドメーター値）を抽出
    const matches = text.match(/\d+/g);
    if (matches && matches.length > 0) {
      const num = matches.reduce((a, b) => a.length >= b.length ? a : b);
      $(targetInputId).value = num;
      updateOdo();
      showToast(`📷 OCR読取: ${num} km`, 'success');
    } else {
      showToast('⚠️ 数値を読み取れませんでした。手動入力してください。', 'error');
    }
  } catch (err) {
    console.error('OCR error:', err);
    showToast('⚠️ OCRエラー。手動入力してください。', 'error');
  } finally {
    showOcrLoading(false);
  }
}

// ── 初期化 ──
function init() {
  // 日付セット
  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  $('date').value = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;

  // マスターからセレクト構築
  const master = loadMaster();
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

  // カメラOCRボタン
  $('btnCameraStart').addEventListener('click', () => $('cameraStart').click());
  $('btnCameraEnd').addEventListener('click',   () => $('cameraEnd').click());
  $('cameraStart').addEventListener('change', e => {
    if (e.target.files[0]) runOcr(e.target.files[0], 'odoStart');
  });
  $('cameraEnd').addEventListener('change', e => {
    if (e.target.files[0]) runOcr(e.target.files[0], 'odoEnd');
  });

  $('submitBtn').addEventListener('click', saveRecord);

  // 前回データ引継ぎ
  applyLastRecord();
  updateProgress();
}

document.addEventListener('DOMContentLoaded', init);

