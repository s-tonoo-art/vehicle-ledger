/* ==============================================
   車両点検アプリ - history.js
   履歴・フィルタ・集計・CSV出力
   ============================================== */

'use strict';

const STORAGE_KEY = 'vehicle_inspections_v1';

const CHECK_LABELS = {
  brake:  'ブレーキ',
  tire:   'タイヤ状態',
  lights: '灯火類',
  wiper:  'ワイパー',
  mirror: 'バックミラー',
  engine: 'エンジン始動',
  noise:  '異音有無',
  fuel:   '燃料残量',
  other:  'その他',
};

const $ = id => document.getElementById(id);

// ── ストレージ ──
function loadRecords() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

// ── Toast ──
function showToast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

// ── NG判定 ──
function hasNg(record) {
  return Object.values(record.checks || {}).some(c => c.result === 'ng');
}

function countResults(record) {
  const checks = Object.values(record.checks || {});
  return {
    ok:   checks.filter(c => c.result === 'ok').length,
    ng:   checks.filter(c => c.result === 'ng').length,
    skip: checks.filter(c => c.result === 'skip').length,
  };
}

// ── レコードカード生成 ──
function createRecordCard(record) {
  const div  = document.createElement('div');
  const ng   = hasNg(record);
  const cnt  = countResults(record);
  div.className = `record-card ${ng ? 'has-ng' : ''}`;

  const dateStr = record.date ? record.date.replace(/-/g, '/') : '日付未設定';
  const timeStr = record.departure ? `出発 ${record.departure}` : '';
  const distStr = record.odoDiff   ? `${record.odoDiff.toLocaleString()} km走行` : '';
  const branchStr = record.branch ? `🏢 ${escHtml(record.branch)}` : '';

  div.innerHTML = `
    <div class="record-card-top">
      <span class="record-vehicle">${escHtml(record.vehicle || '---')}</span>
      <span class="record-date">${dateStr}</span>
    </div>
    <div class="record-driver">${branchStr}${branchStr ? '　' : ''}👤 ${escHtml(record.driver || '---')}　${timeStr}　${distStr}</div>
    <div class="record-badges">
      ${record.status === '稼働中' ? '<span class="badge" style="background:#f59e0b;color:white">🟡 稼働中</span>' : '<span class="badge" style="background:#10b981;color:white">✅ 完了</span>'}
      <span class="badge badge-ok">OK: ${cnt.ok}</span>
      <span class="badge badge-ng">NG: ${cnt.ng}</span>
      ${cnt.skip > 0 ? `<span class="badge badge-skip">未実施: ${cnt.skip}</span>` : ''}
      ${record.alcoholAlert ? '<span class="badge badge-warn">⚠️ アルコール</span>' : ''}
    </div>
  `;
  div.addEventListener('click', () => openModal(record));
  return div;
}

// ── 一覧レンダリング ──
function renderList() {
  const records = loadRecords();
  const container = $('listContainer');
  container.innerHTML = '';

  // フィルタ
  const vehicle = $('filterVehicle').value;
  const month   = $('filterMonth').value;  // YYYY-MM

  const filtered = records.filter(r => {
    if (vehicle && r.vehicle !== vehicle) return false;
    if (month && !r.date?.startsWith(month)) return false;
    return true;
  }).reverse();

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div>該当する点検記録がありません</div>`;
    return;
  }
  filtered.forEach(r => container.appendChild(createRecordCard(r)));
}

// ── NGのみ ──
function renderNg() {
  const records = loadRecords();
  const container = $('ngContainer');
  container.innerHTML = '';

  const ngRecords = records.filter(hasNg).reverse();
  if (ngRecords.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div>NGの点検記録はありません</div>`;
    return;
  }
  ngRecords.forEach(r => container.appendChild(createRecordCard(r)));
}

// ── 日別集計 ──
function renderAgg() {
  const records = loadRecords();
  const byDate = {};
  records.forEach(r => {
    const d = r.date || '不明';
    if (!byDate[d]) byDate[d] = { count: 0, ng: 0, alcohol: 0 };
    byDate[d].count++;
    if (hasNg(r)) byDate[d].ng++;
    if (r.alcoholAlert) byDate[d].alcohol++;
  });

  const tbody = $('aggBody');
  tbody.innerHTML = '';

  const dates = Object.keys(byDate).sort().reverse();
  if (dates.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-sub);padding:20px">データなし</td></tr>`;
    return;
  }
  dates.forEach(d => {
    const row = document.createElement('tr');
    const agg = byDate[d];
    row.innerHTML = `
      <td>${d.replace(/-/g, '/')}</td>
      <td>${agg.count}</td>
      <td class="${agg.ng > 0 ? 'ng-cell' : ''}">${agg.ng}</td>
      <td class="${agg.alcohol > 0 ? 'ng-cell' : ''}">${agg.alcohol > 0 ? '⚠️' : '—'}</td>
    `;
    tbody.appendChild(row);
  });
}

// ── CSV出力 ──
function exportCsv() {
  const records = loadRecords();
  const fromVal = $('csvFrom').value;
  const toVal   = $('csvTo').value;
  const filterMode = $('csvFilter').value;

  let filtered = records.filter(r => {
    if (fromVal && r.date < fromVal) return false;
    if (toVal   && r.date > toVal)   return false;
    if (filterMode === 'ng' && !hasNg(r)) return false;
    return true;
  });

  if (filtered.length === 0) {
    showToast('⚠️ 出力対象のデータがありません', 'error');
    return;
  }

  const checkKeys = Object.keys(CHECK_LABELS);
  const headers = [
    '記録ID', '保存日時', '点検日', '支店名', '車両番号', '運転者', '出発時刻', '帰着時刻',
    '出発時走行距離(km)', '帰着時走行距離(km)', '走行距離(km)',
    ...checkKeys.flatMap(k => [`${CHECK_LABELS[k]}結果`, `${CHECK_LABELS[k]}コメント`]),
    'アルコール値(mg/L)', 'アルコール警告', '確認者', '確認時刻', '備考',
  ];

  const rows = filtered.map(r => {
    const checkCols = checkKeys.flatMap(k => {
      const c = r.checks?.[k];
      return [
        c ? ({'ok':'OK','ng':'NG','skip':'未実施'}[c.result] || c.result) : '',
        c?.comment || '',
      ];
    });
    return [
      r.id, r.savedAt, r.date, r.branch || '', r.vehicle, r.driver,
      r.departure, r.arrival,
      r.odoStart, r.odoEnd, r.odoDiff,
      ...checkCols,
      r.alcohol,
      r.alcoholAlert ? '警告' : '正常',
      r.checker, r.checkedAt, r.remarks,
    ];
  });

  // BOM付きUTF-8
  const BOM = '\uFEFF';
  const csvContent = BOM + [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const now  = new Date();
  const fname = `点検記録_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.csv`;
  a.href = url; a.download = fname; a.click();
  URL.revokeObjectURL(url);
  showToast(`✅ ${filtered.length}件をCSV出力しました`, 'success');
}

// ── 詳細モーダル ──
function openModal(record) {
  const content = $('modalContent');
  const checkKeys = Object.keys(CHECK_LABELS);

  const resultLabel = { ok: '<span class="modal-val ok">✅ OK</span>',
                        ng: '<span class="modal-val ng">❌ NG</span>',
                        skip: '<span class="modal-val" style="color:var(--skip-color)">— 未実施</span>' };

  let html = `
    <h2 style="font-size:1rem;margin-bottom:16px;color:var(--primary)">📋 点検詳細</h2>
    <div class="modal-row"><span class="modal-key">点検日</span><span class="modal-val">${escHtml(record.date||'')}</span></div>
    ${record.branch ? `<div class="modal-row"><span class="modal-key">支店名</span><span class="modal-val">${escHtml(record.branch)}</span></div>` : ''}
    <div class="modal-row"><span class="modal-key">車両番号</span><span class="modal-val">${escHtml(record.vehicle||'')}</span></div>
    <div class="modal-row"><span class="modal-key">運転者</span><span class="modal-val">${escHtml(record.driver||'')}</span></div>
    <div class="modal-row"><span class="modal-key">出発 / 帰着</span><span class="modal-val">${escHtml(record.departure||'')} / ${escHtml(record.arrival||'')}</span></div>
    <div class="modal-row"><span class="modal-key">走行距離</span><span class="modal-val">${record.odoDiff?.toLocaleString() || 0} km</span></div>
    <div style="margin:14px 0 6px;font-size:0.78rem;color:var(--text-sub);text-transform:uppercase;letter-spacing:.05em;font-weight:700;">点検項目</div>
  `;

  checkKeys.forEach(k => {
    const c = record.checks?.[k];
    if (!c) return;
    const lbl = resultLabel[c.result] || c.result;
    html += `<div class="modal-row"><span class="modal-key">${escHtml(CHECK_LABELS[k])}</span><div style="text-align:right">${lbl}${c.comment ? `<br><span style="font-size:0.8rem;color:var(--ng-color)">${escHtml(c.comment)}</span>` : ''}</div></div>`;
  });

  const alcoClass = record.alcoholAlert ? 'ng' : 'ok';
  html += `
    <div style="margin:14px 0 6px;font-size:0.78rem;color:var(--text-sub);text-transform:uppercase;letter-spacing:.05em;font-weight:700;">アルコール</div>
    <div class="modal-row"><span class="modal-key">確認者</span><span class="modal-val">${escHtml(record.checker||'')} ${escHtml(record.checkedAt||'')}</span></div>
    ${record.remarks ? `<div class="modal-row"><span class="modal-key">備考</span><span class="modal-val">${escHtml(record.remarks)}</span></div>` : ''}
    
    ${record.status === '稼働中' ? `
      <div style="margin-top:20px; text-align:center;">
        <button id="resumeBtn" class="btn-primary" style="width:100%; padding:12px; border-radius:8px; background:var(--primary); color:white; border:none; font-weight:bold; cursor:pointer;">
          🚗 帰着入力を開始する
        </button>
      </div>
    ` : ''}
  `;

  content.innerHTML = html;
  
  const resumeBtn = $('resumeBtn');
  if (resumeBtn) {
    resumeBtn.onclick = () => {
      sessionStorage.setItem('updateRecordId', record.id);
      window.location.href = 'index.html';
    };
  }

  $('modalOverlay').classList.add('open');
}

// ── 車両フィルタ選択肢 ──
function populateVehicleFilter() {
  const records = loadRecords();
  const vehicles = [...new Set(records.map(r => r.vehicle).filter(Boolean))];
  const sel = $('filterVehicle');
  sel.innerHTML = '<option value="">全車両</option>';
  vehicles.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v;
    sel.appendChild(opt);
  });
}

// ── XSS防止 ──
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── タブ切替 ──
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(btn.dataset.tab).classList.add('active');
      refreshActiveTab(btn.dataset.tab);
    });
  });
}

function refreshActiveTab(tabId) {
  if (tabId === 'tab-list') renderList();
  if (tabId === 'tab-ng')   renderNg();
  if (tabId === 'tab-agg')  renderAgg();
}

// ── 初期化 ──
function init() {
  initTabs();

  // 一覧フィルタ
  $('filterVehicle').addEventListener('change', renderList);
  $('filterMonth').addEventListener('change', renderList);

  // CSV
  $('csvBtn').addEventListener('click', exportCsv);

  // デフォルト月フィルタ（今月）
  const now = new Date();
  $('filterMonth').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  // CSV期間デフォルト（今月）
  const y = now.getFullYear(), m = String(now.getMonth()+1).padStart(2,'0');
  $('csvFrom').value = `${y}-${m}-01`;
  $('csvTo').value   = `${y}-${m}-${String(new Date(y, now.getMonth()+1, 0).getDate()).padStart(2,'0')}`;

  // モーダル閉じる
  $('modalClose').addEventListener('click', () => $('modalOverlay').classList.remove('open'));
  $('modalOverlay').addEventListener('click', e => {
    if (e.target === $('modalOverlay')) $('modalOverlay').classList.remove('open');
  });

  // 全削除
  $('deleteAllBtn').addEventListener('click', () => {
    if (confirm('すべての点検記録を削除します。この操作は元に戻せません。よろしいですか？')) {
      localStorage.removeItem(STORAGE_KEY);
      showToast('🗑️ 全データを削除しました', 'error');
      renderList(); renderNg(); renderAgg();
    }
  });

  populateVehicleFilter();
  renderList();
}

document.addEventListener('DOMContentLoaded', init);
