// ============== HASH ROUTING ==============
let _routingInProgress = false;

function handleHashChange() {
  if (_routingInProgress) return;
  _routingInProgress = true;
  const hash = window.location.hash || '';
  const match = hash.match(/^#\/(\w+)$/);
  if (match && CLIENTS[match[1]]) {
    openClient(match[1]);
  } else {
    goHome();
  }
  _routingInProgress = false;
}

window.addEventListener('hashchange', handleHashChange);

// ============== DATE RANGE ==============
let activeDateRange = 'this_month';
let customDateFrom = null;
let customDateTo = null;

function getCurrentMonth() {
  const el = document.getElementById('importMonth');
  return el?.value || new Date().toISOString().slice(0, 7);
}

function getDateRangeBounds() {
  const today = new Date();
  const y = today.getFullYear(), m = today.getMonth(), d = today.getDate();
  switch (activeDateRange) {
    case 'this_month':
      return { from: new Date(y, m, 1), to: today, month: `${y}-${String(m+1).padStart(2,'0')}` };
    case 'last_month': {
      const lm = new Date(y, m - 1, 1);
      const lmEnd = new Date(y, m, 0);
      return { from: lm, to: lmEnd, month: `${lm.getFullYear()}-${String(lm.getMonth()+1).padStart(2,'0')}` };
    }
    case 'yesterday': {
      const yest = new Date(y, m, d - 1);
      const yestStr = `${yest.getFullYear()}-${String(yest.getMonth()+1).padStart(2,'0')}-${String(yest.getDate()).padStart(2,'0')}`;
      return { from: new Date(yestStr), to: new Date(yestStr + 'T23:59:59.999Z'), month: yestStr.slice(0, 7) };
    }
    case 'last_7': {
      const from = new Date(today); from.setDate(d - 6);
      return { from, to: today, month: null };
    }
    case 'last_30': {
      const from = new Date(today); from.setDate(d - 29);
      return { from, to: today, month: null };
    }
    case 'all':
      return { from: new Date(2020, 0, 1), to: today, month: null, allMonths: true };
    case 'custom':
      return { from: customDateFrom ? new Date(customDateFrom) : new Date(y, m, 1), to: customDateTo ? new Date(customDateTo) : today, month: null };
    default:
      return { from: new Date(y, m, 1), to: today, month: `${y}-${String(m+1).padStart(2,'0')}` };
  }
}

function setDateRange(range) {
  activeDateRange = range;
  document.querySelectorAll('.date-range-bar .preset-btn').forEach(b => b.classList.toggle('active', b.dataset.range === range));
  const customEl = document.getElementById('dateCustomInputs');
  if (range === 'custom') {
    customEl.classList.add('show');
    const bounds = getDateRangeBounds();
    document.getElementById('dateFrom').value = bounds.from.toISOString().slice(0, 10);
    document.getElementById('dateTo').value = bounds.to.toISOString().slice(0, 10);
  } else {
    customEl.classList.remove('show');
  }
  refreshClientView();
}

function applyCustomDateRange() {
  customDateFrom = document.getElementById('dateFrom').value;
  customDateTo = document.getElementById('dateTo').value;
  refreshClientView();
}

function refreshClientView() {
  if (!currentClient) return;
  renderBudgetOverview(currentClient);
  if (currentPlatform === 'overview') {
    renderOverview(currentClient);
  } else {
    renderPlatformView(currentClient, currentPlatform);
  }
}

function getFilteredData(clientId, platform) {
  const bounds = getDateRangeBounds();

  // "Ukupno" - collect ALL data from all stored months
  if (bounds.allMonths) {
    const data = loadData();
    const prefix = `${clientId}_${platform}_`;
    let allRows = [];
    Object.keys(data).forEach(key => {
      if (key.startsWith(prefix) && !key.startsWith('budget_')) {
        allRows = allRows.concat(data[key]);
      }
    });
    return allRows;
  }

  // For specific month (this_month, last_month), get that month's data and filter by exact dates
  if (bounds.month) {
    let rows = getCampaignData(clientId, platform, bounds.month);
    // Also filter by date range within the month for accuracy
    if (rows.length > 0 && rows[0].date) {
      const fromDate = bounds.from;
      const toDate = bounds.to;
      rows = rows.filter(r => {
        const rd = new Date(r.date);
        return rd >= fromDate && rd <= toDate;
      });
    }
    return rows;
  }

  // For cross-month ranges (last_7, last_30, custom), collect from relevant months and filter by date
  const fromDate = bounds.from;
  const toDate = bounds.to;
  const months = getMonthsInRange(fromDate, toDate);
  let allRows = [];
  months.forEach(m => {
    const rows = getCampaignData(clientId, platform, m);
    allRows = allRows.concat(rows);
  });
  // Filter rows by date if they have a date field
  if (allRows.length > 0 && allRows[0].date) {
    allRows = allRows.filter(r => {
      const rd = new Date(r.date);
      return rd >= fromDate && rd <= toDate;
    });
  }
  return allRows;
}

function getMonthsInRange(from, to) {
  const months = [];
  const d = new Date(from.getFullYear(), from.getMonth(), 1);
  while (d <= to) {
    months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    d.setMonth(d.getMonth() + 1);
  }
  return months;
}

// Aggregate daily rows by campaign name (when data has Date column)
function aggregateByCampaign(rows) {
  const map = {};
  rows.forEach(r => {
    // Za DV360 sa Insertion Order, grupiši po IO; inače po campaign
    const key = r.insertion_order || r.campaign || 'Unknown';
    if (!map[key]) {
      map[key] = { campaign: r.campaign || key, insertion_order: r.insertion_order || '', impressions: 0, clicks: 0, spend: 0, reach: 0, conversions: 0, conv_value: 0 };
    }
    map[key].impressions += r.impressions || 0;
    map[key].clicks += r.clicks || 0;
    map[key].spend += r.spend || 0;
    map[key].reach += r.reach || 0;
    map[key].conversions += r.conversions || 0;
    map[key].conv_value += r.conv_value || 0;
  });
  // Recalculate computed metrics
  return Object.values(map).map(r => {
    r.ctr = r.impressions > 0 ? r.clicks / r.impressions * 100 : 0;
    r.cpm = r.impressions > 0 ? r.spend / r.impressions * 1000 : 0;
    r.cpc = r.clicks > 0 ? r.spend / r.clicks : 0;
    r.cpa = r.conversions > 0 ? r.spend / r.conversions : 0;
    return r;
  });
}

// ============== IMPORT MODAL ==============
function openImportModal() {
  document.getElementById('importModal').classList.add('show');
  document.getElementById('importResult').classList.remove('show');
  if (!document.getElementById('importMonth').value) {
    document.getElementById('importMonth').value = new Date().toISOString().slice(0, 7);
  }
}
function closeImportModal() { document.getElementById('importModal').classList.remove('show'); }

// Drop zone
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => { if (e.target.files.length) handleFile(e.target.files[0]); });

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    const { headers, rows } = parseCSV(text);
    const platform = detectPlatform(headers);
    const resultEl = document.getElementById('importResult');

    if (!platform) {
      resultEl.textContent = 'Platforma nije prepoznata. Proveri CSV format.';
      resultEl.className = 'import-result show error';
      return;
    }

    const clientId = document.getElementById('importClient').value;
    const month = document.getElementById('importMonth').value;
    const mapped = rows.map(r => mapRow(platform, r));

    saveCampaignData(clientId, platform, month, mapped);

    const campaignNames = mapped.map(r => r.campaign).filter(Boolean);
    let campaignList = campaignNames.length > 0
      ? `<div style="margin-top:10px;font-weight:600;">Kampanje (${campaignNames.length}):</div><ul style="margin:6px 0 0 18px;font-size:12px;line-height:1.8;">${campaignNames.map(c => `<li>${c}</li>`).join('')}</ul>`
      : '';

    resultEl.innerHTML = `Uspešno importovano <strong>${mapped.length}</strong> redova sa <strong>${PLATFORM_NAMES[platform]}</strong> za <strong>${CLIENTS[clientId].name}</strong> (${month})${campaignList}`;
    resultEl.className = 'import-result show';
    notify(`${PLATFORM_NAMES[platform]} podaci importovani za ${CLIENTS[clientId].name}`);

    renderHomepage();
    if (currentClient) openClient(currentClient);

    fileInput.value = '';
  };
  reader.readAsText(file);
}

// ============== BUDGET MODAL ==============
function openBudgetModal() {
  const month = getCurrentMonth() || new Date().toISOString().slice(0, 7);
  document.getElementById('budgetModal').classList.add('show');

  let html = `
    <div class="budget-modal-row" style="grid-template-columns:1fr;">
      <div><label>Mesec</label><input type="month" id="budgetMonth" value="${month}" onchange="renderBudgetForm()"/></div>
    </div>
    <div id="budgetFields"></div>
  `;
  document.getElementById('budgetForm').innerHTML = html;
  renderBudgetForm();
}

function renderBudgetForm() {
  const month = document.getElementById('budgetMonth').value;
  let html = '';
  Object.entries(CLIENTS).forEach(([id, client]) => {
    html += `<div style="margin-top:16px;font-weight:600;font-size:14px;">${client.name} (${client.currency})</div>`;
    client.platforms.forEach(p => {
      const val = getBudget(id, p, month);
      html += `
        <div class="budget-modal-row" style="margin-top:8px;">
          <div><label>${PLATFORM_NAMES[p]}</label><input type="number" data-client="${id}" data-platform="${p}" value="${val || ''}" placeholder="0" /></div>
        </div>
      `;
    });
  });
  document.getElementById('budgetFields').innerHTML = html;
}

function saveBudgets() {
  const month = document.getElementById('budgetMonth').value;
  document.querySelectorAll('#budgetFields input[type="number"]').forEach(input => {
    const clientId = input.dataset.client;
    const platform = input.dataset.platform;
    const val = parseFloat(input.value) || 0;
    setBudget(clientId, platform, month, val);
  });
  closeBudgetModal();
  notify('Budžeti su sačuvani');
  renderHomepage();
  if (currentClient) openClient(currentClient);
}

function closeBudgetModal() { document.getElementById('budgetModal').classList.remove('show'); }

// ============== SHEETS SYNC ==============
const DEFAULT_SHEET_LINKS = {
  'nlb_google_ads': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQc1yRWwl8JemLV4IwH1F1dR9qRRtd9LhuRfdWW8b2VxN9velSOvY1iI8WQDQ0P04Oav8KwciJlboaz/pub?gid=0&single=true&output=csv',
  'krka_google_ads': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQc1yRWwl8JemLV4IwH1F1dR9qRRtd9LhuRfdWW8b2VxN9velSOvY1iI8WQDQ0P04Oav8KwciJlboaz/pub?gid=1114546017&single=true&output=csv',
  'urban_google_ads': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQc1yRWwl8JemLV4IwH1F1dR9qRRtd9LhuRfdWW8b2VxN9velSOvY1iI8WQDQ0P04Oav8KwciJlboaz/pub?gid=1079909735&single=true&output=csv',
  'nlb_meta': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTGBTKXEBVZP_COQS8mcSOuzpJWh3GMVJ9RMaQSgtTm6xafni_XQX-K9dj0cmsaBI5LOSrFnvn46HK7/pub?gid=0&single=true&output=csv',
  'krka_meta': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTGBTKXEBVZP_COQS8mcSOuzpJWh3GMVJ9RMaQSgtTm6xafni_XQX-K9dj0cmsaBI5LOSrFnvn46HK7/pub?gid=1798421240&single=true&output=csv',
  'urban_meta': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTGBTKXEBVZP_COQS8mcSOuzpJWh3GMVJ9RMaQSgtTm6xafni_XQX-K9dj0cmsaBI5LOSrFnvn46HK7/pub?gid=457165510&single=true&output=csv',
  'nlb_dv360': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTIdAk8qTfnIjk7Znx2iQRGIpLZxOcxf05ESbkpsmhtmskXfpuzbHisFmKd7tQmFIO96PU5G32HHUYk/pub?gid=0&single=true&output=csv',
  'krka_dv360': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTIdAk8qTfnIjk7Znx2iQRGIpLZxOcxf05ESbkpsmhtmskXfpuzbHisFmKd7tQmFIO96PU5G32HHUYk/pub?gid=1866728560&single=true&output=csv'
};

// ZAMENI ovaj URL sa publish-to-web CSV linkom za GA4 KPI Sheet
const DEFAULT_GA4_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTq6-QCaIMlbEFe04kvUmvJSbKdNgMattF-A1h5uynSIUIUEl5Aj7ku-j2j7QOMZtJ4m2CM6OrToBmp/pub?gid=0&single=true&output=csv';
// Setuj default GA4 URL ako nije već setovan
if (!localStorage.getItem('ga4_sheet_url') && DEFAULT_GA4_SHEET_URL) {
  localStorage.setItem('ga4_sheet_url', DEFAULT_GA4_SHEET_URL);
}

function getSheetLinks() {
  try {
    const saved = JSON.parse(localStorage.getItem('pmSheetLinks') || '{}');
    return Object.assign({}, DEFAULT_SHEET_LINKS, saved);
  } catch { return Object.assign({}, DEFAULT_SHEET_LINKS); }
}
function saveSheetLinksData(links) { localStorage.setItem('pmSheetLinks', JSON.stringify(links)); }

function openSheetsModal() {
  document.getElementById('sheetsModal').classList.add('show');
  const links = getSheetLinks();
  let html = '';

  Object.entries(CLIENTS).forEach(([id, client]) => {
    html += `<div style="margin-top:16px;margin-bottom:8px;font-weight:700;font-size:14px;">${client.name}</div>`;
    const allPlatforms = [...client.platforms];
    if (client.tiktok) allPlatforms.push('tiktok');

    allPlatforms.filter(p => p !== 'ga4').forEach(p => {
      const key = `${id}_${p}`;
      const val = links[key] || '';
      const statusId = `sync-status-${key}`;
      html += `
        <div style="display:flex;gap:8px;align-items:end;margin-top:6px;">
          <div style="flex:1;">
            <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:3px;">${PLATFORM_NAMES[p]}</label>
            <input type="url" data-key="${key}" value="${val}" placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv" style="width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;" />
          </div>
          <button class="btn" style="font-size:11px;padding:7px 12px;white-space:nowrap;" onclick="syncOneSheet('${id}','${p}')">Sync</button>
          <span id="${statusId}" style="font-size:11px;min-width:20px;"></span>
        </div>
      `;
    });
  });

  // GA4 KPI Sheet URL (posebno polje)
  const ga4Url = localStorage.getItem('ga4_sheet_url') || '';
  html += `
    <div style="margin-top:24px;padding-top:16px;border-top:2px solid var(--border);">
      <div style="font-weight:700;font-size:14px;margin-bottom:8px;">GA4 KPI (NLB)</div>
      <div style="display:flex;gap:8px;align-items:end;">
        <div style="flex:1;">
          <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:3px;">GA4 KPI Sheet CSV</label>
          <input type="url" id="ga4SheetUrl" value="${ga4Url}" placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv" style="width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;" />
        </div>
        <button class="btn" style="font-size:11px;padding:7px 12px;" onclick="syncGA4Sheet().then(()=>notify('GA4 podaci sinhronizovani','success'))">Sync</button>
      </div>
    </div>`;

  document.getElementById('sheetsForm').innerHTML = html;
  document.getElementById('syncStatus').textContent = '';
}

function closeSheetsModal() { document.getElementById('sheetsModal').classList.remove('show'); }

function saveSheetLinks() {
  const links = {};
  document.querySelectorAll('#sheetsForm input[data-key]').forEach(input => {
    const key = input.dataset.key;
    const val = input.value.trim();
    if (val) links[key] = val;
  });
  saveSheetLinksData(links);

  // Sačuvaj GA4 Sheet URL posebno
  const ga4Input = document.getElementById('ga4SheetUrl');
  if (ga4Input && ga4Input.value.trim()) {
    localStorage.setItem('ga4_sheet_url', ga4Input.value.trim());
  }

  notify('Sheet linkovi sačuvani');
}

async function fetchSheetCSV(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    return text;
  } catch (err) {
    throw new Error(`Fetch error: ${err.message}`);
  }
}

async function syncOneSheet(clientId, platform) {
  const links = getSheetLinks();
  const key = `${clientId}_${platform}`;
  const url = links[key];
  const statusEl = document.getElementById(`sync-status-${key}`);

  if (!url) {
    statusEl.innerHTML = '<span style="color:var(--red);">Nema linka</span>';
    return;
  }

  statusEl.innerHTML = '<span style="color:var(--orange);">...</span>';

  try {
    const csvText = await fetchSheetCSV(url);
    const { headers, rows } = parseCSV(csvText);
    const detectedPlatform = detectPlatform(headers);
    const mapped = rows.map(r => mapRow(detectedPlatform || platform, r))
      .filter(r => r.campaign && r.campaign !== 'Poslednji update:' && !r.campaign.startsWith('Poslednji'));

    // Grupiši redove po mesecu na osnovu Date kolone
    const byMonth = {};
    mapped.forEach(r => {
      let month;
      if (r.date) {
        // Univerzalni date parser: podržava YYYY-MM-DD, YYYYMMDD, M/D/YYYY
        const ds = String(r.date).trim();
        let parsed;
        if (ds.includes('/')) {
          // Meta format: M/D/YYYY
          const parts = ds.split('/');
          parsed = { y: parts[2], m: parts[0].padStart(2, '0') };
        } else {
          // Google Ads format: YYYY-MM-DD ili YYYYMMDD
          const d = ds.replace(/-/g, '');
          parsed = { y: d.substring(0, 4), m: d.substring(4, 6) };
        }
        month = parsed.y + '-' + parsed.m;
        // Normalizuj datum u r.date na YYYY-MM-DD format za filtriranje
        if (ds.includes('/')) {
          const parts = ds.split('/');
          r.date = parts[2] + '-' + parts[0].padStart(2, '0') + '-' + parts[1].padStart(2, '0');
        }
      } else {
        month = getCurrentMonth();
      }
      if (!byMonth[month]) byMonth[month] = [];
      byMonth[month].push(r);
    });

    // Sačuvaj svaki mesec posebno
    const monthKeys = Object.keys(byMonth);
    monthKeys.forEach(m => {
      saveCampaignData(clientId, platform, m, byMonth[m]);
    });

    statusEl.innerHTML = `<span style="color:var(--green);">${mapped.length} redova (${monthKeys.length} mes.)</span>`;
    notify(`${PLATFORM_NAMES[platform]} sync za ${CLIENTS[clientId].name}: ${mapped.length} redova`);

    renderHomepage();
    if (currentClient) openClient(currentClient);
  } catch (err) {
    statusEl.innerHTML = `<span style="color:var(--red);">Greška</span>`;
    console.error(`Sync error for ${key}:`, err);
  }
}

async function syncAllSheets() {
  const links = getSheetLinks();
  // Filtriraj samo prave linkove (ne placeholder-e i prazne)
  const keys = Object.keys(links).filter(k => links[k] && links[k].includes('/pub') && !links[k].includes('/.../'));

  if (keys.length === 0) {
    notify('Nema sačuvanih linkova', 'warning');
    return;
  }

  const statusEl = document.getElementById('syncStatus');
  if (statusEl) statusEl.textContent = `Sync u toku... 0/${keys.length}`;
  let done = 0;
  let errors = 0;

  for (const key of keys) {
    // Parsiraj clientId i platform iz ključa (npr. "nlb_google_ads" → "nlb", "google_ads")
    const firstUnderscore = key.indexOf('_');
    const clientId = key.substring(0, firstUnderscore);
    const platform = key.substring(firstUnderscore + 1);
    try {
      await syncOneSheet(clientId, platform);
    } catch { errors++; }
    done++;
    if (statusEl) statusEl.textContent = `Sync u toku... ${done}/${keys.length}${errors > 0 ? ` (${errors} grešaka)` : ''}`;
  }

  if (statusEl) statusEl.textContent = `Sync završen: ${done - errors}/${keys.length} uspešno${errors > 0 ? `, ${errors} grešaka` : ''}`;
  notify(errors > 0 ? `Sync završen sa ${errors} grešaka` : 'Svi podaci sinhronizovani!', errors > 0 ? 'warning' : 'success');
}

// Auto-sync on page load if links exist
(function autoSync() {
  const links = getSheetLinks();
  if (Object.keys(links).length > 0) {
    setTimeout(() => syncAllSheets(), 1000);
  }
  // Auto-sync GA4 ako postoji URL
  if (localStorage.getItem('ga4_sheet_url')) {
    setTimeout(() => syncGA4Sheet(), 2000);
  }
})();

// ============== INIT ==============
document.getElementById('importMonth').value = new Date().toISOString().slice(0, 7);
renderHomepage();

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('show'); });
});
