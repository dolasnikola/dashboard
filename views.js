// ============== HOMEPAGE ==============
function renderHomepage() {
  const grid = document.getElementById('clientsGrid');
  const currentMonth = document.getElementById('importMonth')?.value || new Date().toISOString().slice(0,7);
  grid.innerHTML = '';

  Object.entries(CLIENTS).forEach(([id, client]) => {
    const card = document.createElement('div');
    card.className = 'client-card';
    card.onclick = () => openClient(id);

    let totalSpend = 0, totalBudget = 0;
    client.platforms.forEach(p => {
      const rows = getCampaignData(id, p, currentMonth);
      rows.forEach(r => totalSpend += r.spend || 0);
      totalBudget += getBudget(id, p, currentMonth);
    });

    const pct = totalBudget > 0 ? (totalSpend / totalBudget * 100) : 0;
    const fillClass = pct > 90 ? 'fill-danger' : pct > 70 ? 'fill-warning' : 'fill-ok';
    const statusClass = client.status === 'active' ? 'status-active' : 'status-partial';

    let platformBadges = client.platforms.map(p =>
      `<span class="platform-badge ${PLATFORM_BADGE[p]}">${PLATFORM_NAMES[p]}</span>`
    ).join('');
    if (client.tiktok) platformBadges += `<span class="platform-badge badge-tiktok">TikTok</span>`;

    // Aggregate key metrics
    let totalImpressions = 0, totalClicks = 0, totalConversions = 0;
    client.platforms.forEach(p => {
      getCampaignData(id, p, currentMonth).forEach(r => {
        totalImpressions += r.impressions || 0;
        totalClicks += r.clicks || 0;
        totalConversions += r.conversions || 0;
      });
    });

    card.innerHTML = `
      <div class="client-card-header">
        <span class="client-name">${client.name}</span>
        <span class="client-status ${statusClass}">${client.statusLabel}</span>
      </div>
      <div class="client-platforms">${platformBadges}</div>
      <div class="client-metrics">
        <div class="metric-mini">
          <div class="metric-mini-label">Spend</div>
          <div class="metric-mini-value">${fmt(totalSpend, 'money', client.currency)}</div>
        </div>
        <div class="metric-mini">
          <div class="metric-mini-label">Impressions</div>
          <div class="metric-mini-value">${fmt(totalImpressions, 'number')}</div>
        </div>
        <div class="metric-mini">
          <div class="metric-mini-label">Clicks</div>
          <div class="metric-mini-value">${fmt(totalClicks, 'number')}</div>
        </div>
        <div class="metric-mini">
          <div class="metric-mini-label">Conversions</div>
          <div class="metric-mini-value">${fmt(totalConversions, 'number')}</div>
        </div>
      </div>
      ${totalBudget > 0 ? `
      <div class="budget-bar">
        <div class="budget-bar-label">
          <span>Budget</span>
          <span>${fmt(totalSpend, 'money', client.currency)} / ${fmt(totalBudget, 'money', client.currency)}</span>
        </div>
        <div class="budget-bar-track">
          <div class="budget-bar-fill ${fillClass}" style="width:${Math.min(pct,100)}%"></div>
        </div>
      </div>` : ''}
    `;
    grid.appendChild(card);
  });
}

// ============== CLIENT DETAIL ==============
let currentClient = null;
let currentPlatform = null;
let activeCharts = [];

function destroyCharts() {
  activeCharts.forEach(c => c.destroy());
  activeCharts = [];
}

function openClient(id) {
  if (!_routingInProgress && window.location.hash !== '#/' + id) {
    _routingInProgress = true;
    window.location.hash = '#/' + id;
    _routingInProgress = false;
  }
  currentClient = id;
  const client = CLIENTS[id];
  document.getElementById('homepage').style.display = 'none';
  document.getElementById('detailView').style.display = 'block';
  document.getElementById('detailTitle').textContent = client.name;
  document.getElementById('detailCurrency').textContent = client.currency;

  let badges = client.platforms.map(p =>
    `<span class="platform-badge ${PLATFORM_BADGE[p]}">${PLATFORM_NAMES[p]}</span>`
  ).join('');
  if (client.tiktok) badges += `<span class="platform-badge badge-tiktok">TikTok</span>`;
  document.getElementById('detailPlatforms').innerHTML = badges;

  // Show report button only for clients with a report generator
  const reportBtn = document.getElementById('downloadReportBtn');
  const REPORT_GENERATORS = {
    krka: { fn: 'generateMonthlyReport', label: 'Krka izvestaj' },
    // nlb: { fn: 'generateNLBReport', label: 'NLB izvestaj' },
    // urban: { fn: 'generateUrbanReport', label: 'Urban izvestaj' }
  };
  const rg = REPORT_GENERATORS[id];
  if (rg && typeof window[rg.fn] === 'function') {
    reportBtn.style.display = 'inline-block';
    reportBtn.textContent = rg.label;
    reportBtn.setAttribute('data-client', id);
    reportBtn.onclick = () => window[rg.fn]();
  } else {
    reportBtn.style.display = 'none';
  }

  document.getElementById('flightIndicator').style.display = 'none';

  // Reset date range to current month
  activeDateRange = 'this_month';
  document.querySelectorAll('.date-range-bar .preset-btn').forEach(b => b.classList.toggle('active', b.dataset.range === 'this_month'));
  document.getElementById('dateCustomInputs').classList.remove('show');

  // Budget overview
  renderBudgetOverview(id);

  // Tabs
  renderTabs(id);
  currentPlatform = client.platforms[0];
  renderPlatformView(id, currentPlatform);
}

function renderBudgetOverview(clientId) {
  const client = CLIENTS[clientId];
  const bounds = getDateRangeBounds();
  const month = bounds.month || getCurrentMonth();
  const container = document.getElementById('budgetOverview');
  let html = '<div class="metrics-row">';

  client.platforms.forEach(p => {
    const budget = getBudget(clientId, p, month);
    const rows = getFilteredData(clientId, p);
    const spent = rows.reduce((s, r) => s + (r.spend || 0), 0);
    const pct = budget > 0 ? (spent / budget * 100) : 0;
    const fillClass = pct > 90 ? 'fill-danger' : pct > 70 ? 'fill-warning' : 'fill-ok';
    const alertClass = pct > 95 ? 'danger show' : pct > 85 ? 'warning show' : '';
    const alertMsg = pct > 95 ? '⚠ Budžet je skoro potrošen!' : pct > 85 ? '⚡ Budžet se bliži limitu' : '';

    html += `
      <div class="metric-card">
        <div class="metric-label">${PLATFORM_NAMES[p]} Budget</div>
        <div class="metric-value" style="font-size:20px;">${fmt(spent, 'money2', client.currency)}</div>
        ${budget > 0 ? `
        <div class="budget-bar" style="margin-top:8px;">
          <div class="budget-bar-label"><span>${pct.toFixed(0)}%</span><span>${fmt(budget, 'money', client.currency)}</span></div>
          <div class="budget-bar-track"><div class="budget-bar-fill ${fillClass}" style="width:${Math.min(pct,100)}%"></div></div>
        </div>
        ${alertMsg ? `<div class="budget-alert ${alertClass}" style="margin-top:8px;padding:6px 10px;font-size:11px;">${alertMsg}</div>` : ''}
        ` : '<div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">Budžet nije podešen</div>'}
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

function renderTabs(clientId) {
  const client = CLIENTS[clientId];
  const tabs = document.getElementById('platformTabs');
  let html = '';
  const allPlatforms = [...client.platforms];
  if (client.tiktok) allPlatforms.push('tiktok');
  allPlatforms.unshift('overview');

  allPlatforms.forEach((p, i) => {
    const label = p === 'overview' ? 'Overview' : PLATFORM_NAMES[p];
    html += `<button class="tab ${i === 0 ? '' : ''}" data-platform="${p}" onclick="switchTab('${clientId}','${p}')">${label}</button>`;
  });
  tabs.innerHTML = html;
  switchTab(clientId, client.defaultPlatform || 'overview');
}

function switchTab(clientId, platform) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.platform === platform));
  currentPlatform = platform;
  if (platform === 'overview') {
    renderOverview(clientId);
  } else {
    renderPlatformView(clientId, platform);
  }
}

function renderOverview(clientId) {
  destroyCharts();
  const client = CLIENTS[clientId];
  const container = document.getElementById('tabContent');

  // Aggregate all platforms
  let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalConversions = 0, totalConvValue = 0, totalReach = 0;
  const platformSpends = {};

  client.platforms.forEach(p => {
    const rows = getFilteredData(clientId, p);
    let pSpend = 0;
    rows.forEach(r => {
      totalSpend += r.spend || 0;
      totalImpressions += r.impressions || 0;
      totalClicks += r.clicks || 0;
      totalConversions += r.conversions || 0;
      totalConvValue += r.conv_value || 0;
      totalReach += r.reach || 0;
      pSpend += r.spend || 0;
    });
    platformSpends[p] = pSpend;
  });

  const overallCTR = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;
  const overallCPM = totalImpressions > 0 ? (totalSpend / totalImpressions * 1000) : 0;

  let html = `
    <div class="metrics-row">
      <div class="metric-card"><div class="metric-label">Total Spend</div><div class="metric-value">${fmt(totalSpend, 'money2', client.currency)}</div></div>
      <div class="metric-card"><div class="metric-label">Impressions</div><div class="metric-value">${fmt(totalImpressions, 'number')}</div></div>
      <div class="metric-card"><div class="metric-label">Clicks</div><div class="metric-value">${fmt(totalClicks, 'number')}</div></div>
      <div class="metric-card"><div class="metric-label">Reach</div><div class="metric-value">${fmt(totalReach, 'number')}</div></div>
      <div class="metric-card"><div class="metric-label">CTR</div><div class="metric-value">${overallCTR.toFixed(2)}%</div></div>
      <div class="metric-card"><div class="metric-label">CPM</div><div class="metric-value">${fmt(overallCPM, 'money2', client.currency)}</div></div>
    </div>
    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-title">Raspodela budžeta po platformama</div>
        <div class="chart-container"><canvas id="pieChart"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Performanse po platformama</div>
        <div class="chart-container"><canvas id="barChart"></canvas></div>
      </div>
    </div>
  `;
  container.innerHTML = html;

  // Pie chart
  const pieLabels = Object.keys(platformSpends).map(p => PLATFORM_NAMES[p]);
  const pieData = Object.values(platformSpends);
  const pieColors = ['#ea4335', '#1877f2', '#8b5cf6', '#010101'];

  if (pieData.some(v => v > 0)) {
    const pie = new Chart(document.getElementById('pieChart'), {
      type: 'doughnut',
      data: { labels: pieLabels, datasets: [{ data: pieData, backgroundColor: pieColors, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
    activeCharts.push(pie);
  }

  // Bar chart
  const barLabels = Object.keys(platformSpends).map(p => PLATFORM_NAMES[p]);
  const barClicks = [], barImpressions = [];
  client.platforms.forEach(p => {
    const rows = getFilteredData(clientId, p);
    barClicks.push(rows.reduce((s,r) => s + (r.clicks || 0), 0));
    barImpressions.push(rows.reduce((s,r) => s + (r.impressions || 0), 0));
  });

  if (barClicks.some(v => v > 0) || barImpressions.some(v => v > 0)) {
    const bar = new Chart(document.getElementById('barChart'), {
      type: 'bar',
      data: {
        labels: barLabels,
        datasets: [
          { label: 'Clicks', data: barClicks, backgroundColor: '#4a6cf7' },
          { label: 'Impressions', data: barImpressions, backgroundColor: '#e8e5e0', yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, position: 'left' },
          y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false } }
        },
        plugins: { legend: { position: 'bottom' } }
      }
    });
    activeCharts.push(bar);
  }
}

// ============== GA4 KPI VIEW ==============
// Podaci se automatski upisuju u Sheet svakog 5. u mesecu putem Apps Script trigera.
// Dashboard samo čita Sheet CSV i prikazuje podatke po mesecima.

function renderGA4View(clientId, container) {
  const ga4Data = JSON.parse(localStorage.getItem('ga4_kpi_data') || '{}');
  const months = Object.keys(ga4Data).sort().reverse();

  const now = new Date();
  const prevMonth = now.getMonth() === 0
    ? `${now.getFullYear() - 1}-12`
    : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

  const selectedMonth = window._ga4SelectedMonth || (months.length > 0 ? months[0] : prevMonth);

  // Generiši opcije iz dostupnih meseci u Sheet-u
  let monthOptions = '';
  if (months.length > 0) {
    months.forEach(val => {
      const [y, m] = val.split('-').map(Number);
      const label = new Date(y, m - 1).toLocaleDateString('sr-Latn', { year: 'numeric', month: 'long' });
      monthOptions += `<option value="${val}" ${val === selectedMonth ? 'selected' : ''}>${label}</option>`;
    });
  } else {
    monthOptions = `<option value="${prevMonth}">Nema podataka</option>`;
  }

  const monthData = ga4Data[selectedMonth] || [];
  const hasData = monthData.length > 0;

  let tableHTML = '';
  if (hasData) {
    tableHTML = `
      <table class="data-table" style="margin-top:16px;">
        <thead>
          <tr>
            <th>Proizvod</th>
            <th>Leads</th>
            <th>Sessions</th>
            <th>Total Users</th>
          </tr>
        </thead>
        <tbody>
          ${monthData.map(r => {
            const isTotal = r.product.startsWith('UKUPNO');
            const style = isTotal ? 'font-weight:700;background:var(--hover);' : '';
            return `<tr style="${style}">
              <td>${r.product}</td>
              <td>${Number(r.leads).toLocaleString('de-DE')}</td>
              <td>${Number(r.sessions).toLocaleString('de-DE')}</td>
              <td>${Number(r.users).toLocaleString('de-DE')}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;flex-wrap:wrap;">
      <div class="type-badge type-awareness" style="background:#e8f5e9;color:#388e3c;">GA4 KPI</div>
      <select id="ga4MonthSelect" onchange="selectGA4Month(this.value)" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;">
        ${monthOptions}
      </select>
      <button class="btn" onclick="refreshGA4View()" style="font-size:12px;padding:8px 12px;">
        Osveži iz Sheet-a
      </button>
    </div>
    ${hasData ? tableHTML : '<div style="padding:40px;text-align:center;color:var(--text-secondary);background:var(--card);border-radius:12px;border:1px solid var(--border);">Nema podataka za izabrani mesec.<br><small style="margin-top:8px;display:block;">Podaci se automatski unose svakog 5. u mesecu putem Apps Script trigera.</small></div>'}
  `;
}

function selectGA4Month(month) {
  window._ga4SelectedMonth = month;
  renderGA4View('nlb', document.getElementById('tabContent'));
}

function refreshGA4View() {
  syncGA4Sheet().then(() => {
    renderGA4View('nlb', document.getElementById('tabContent'));
  });
}

// ============== NLB PROIZVODI ==============
function groupByProduct(rawRows) {
  const grouped = {};
  Object.keys(NLB_PRODUCTS).forEach(key => { grouped[key] = []; });
  grouped['ostalo'] = [];

  rawRows.forEach(r => {
    const name = (r.campaign || '').toLowerCase();
    // Samo pmax i search kampanje — demand gen je optimizovan na klikove
    if (!name.includes('pmax') && !name.includes('search')) return;
    let matched = false;
    for (const key of Object.keys(NLB_PRODUCTS)) {
      if (name.includes(key)) {
        grouped[key].push(r);
        matched = true;
        break;
      }
    }
    if (!matched) grouped['ostalo'].push(r);
  });

  // Ukloni prazne grupe
  Object.keys(grouped).forEach(k => { if (grouped[k].length === 0) delete grouped[k]; });
  return grouped;
}

function renderProductsSection(rawRows, currency) {
  const grouped = groupByProduct(rawRows);
  if (Object.keys(grouped).length === 0) return '';

  // Metrike po proizvodu
  let cardsHTML = '<div class="metrics-row" style="flex-wrap:wrap;">';
  Object.entries(grouped).forEach(([key, rows]) => {
    const info = NLB_PRODUCTS[key] || { label: 'Ostalo', color: '#94a3b8' };
    const totalConv = rows.reduce((s, r) => s + (r.conversions || 0), 0);
    const totalSpend = rows.reduce((s, r) => s + (r.spend || 0), 0);
    const cpa = totalConv > 0 ? totalSpend / totalConv : 0;
    cardsHTML += `
      <div class="metric-card" style="border-left:4px solid ${info.color};min-width:180px;">
        <div class="metric-label">${info.label}</div>
        <div class="metric-value">${fmtMetric('conversions', totalConv, currency)}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">
          Spend: ${fmtMetric('spend', totalSpend, currency)} · CPA: ${fmtMetric('cpa', cpa, currency)}
        </div>
      </div>`;
  });
  cardsHTML += '</div>';

  // Pripremi podatke za line chart — dnevne konverzije po proizvodu
  const allDates = new Set();
  Object.values(grouped).forEach(rows => rows.forEach(r => { if (r.date) allDates.add(r.date.substring(0, 10)); }));
  const sortedDates = [...allDates].sort();

  let chartHTML = '';
  if (sortedDates.length > 1) {
    chartHTML = `
      <div class="chart-card" style="margin-top:16px;">
        <div class="chart-title">Dnevne konverzije po proizvodu</div>
        <div class="chart-container"><canvas id="productsChart"></canvas></div>
      </div>`;
  }

  // Podaci za chart (čuvamo u window za renderovanje posle DOM inserta)
  window._productsChartData = { grouped, sortedDates };

  return `
    <div class="section-title" style="margin-top:32px;">Proizvodi</div>
    ${cardsHTML}
    ${chartHTML}
  `;
}

function renderProductsChart() {
  const data = window._productsChartData;
  if (!data || !data.sortedDates.length) return;

  const canvas = document.getElementById('productsChart');
  if (!canvas) return;

  const datasets = [];
  Object.entries(data.grouped).forEach(([key, rows]) => {
    const info = NLB_PRODUCTS[key] || { label: 'Ostalo', color: '#94a3b8' };
    // Grupiši konverzije po datumu
    const dailyMap = {};
    rows.forEach(r => {
      const d = (r.date || '').substring(0, 10);
      if (d) dailyMap[d] = (dailyMap[d] || 0) + (r.conversions || 0);
    });
    const values = data.sortedDates.map(d => dailyMap[d] || 0);
    datasets.push({
      label: info.label,
      data: values,
      borderColor: info.color,
      backgroundColor: info.color + '20',
      borderWidth: 2,
      tension: 0.3,
      fill: false,
      pointRadius: 3
    });
  });

  new Chart(canvas, {
    type: 'line',
    data: { labels: data.sortedDates, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { ticks: { maxRotation: 45, font: { size: 10 } } },
        y: { beginAtZero: true, title: { display: true, text: 'Konverzije' } }
      }
    }
  });
}

// ============== MoM & SPARKLINE ==============
function getPrevPeriodBounds() {
  const today = new Date();
  const y = today.getFullYear(), mo = today.getMonth(), d = today.getDate();
  switch (activeDateRange) {
    case 'yesterday': {
      const prev = new Date(y, mo, d - 2);
      const prevStr = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}-${String(prev.getDate()).padStart(2,'0')}`;
      return { from: new Date(prevStr), to: new Date(prevStr + 'T23:59:59.999Z'), label: 'vs prekjuče' };
    }
    case 'last_7': {
      const from = new Date(today); from.setDate(d - 13);
      const to = new Date(today); to.setDate(d - 7);
      return { from, to, label: 'vs prethodnih 7 dana' };
    }
    case 'last_30': {
      const from = new Date(today); from.setDate(d - 59);
      const to = new Date(today); to.setDate(d - 30);
      return { from, to, label: 'vs prethodnih 30 dana' };
    }
    case 'this_month': {
      const from = new Date(y, mo - 1, 1);
      const to = new Date(y, mo, 0);
      return { from, to, label: 'vs prošli mesec' };
    }
    case 'last_month': {
      const from = new Date(y, mo - 2, 1);
      const to = new Date(y, mo - 1, 0);
      return { from, to, label: 'vs mesec pre' };
    }
    case 'custom': {
      if (!customDateFrom || !customDateTo) return null;
      const cFrom = new Date(customDateFrom);
      const cTo = new Date(customDateTo);
      const rangeMs = cTo.getTime() - cFrom.getTime();
      const prevTo = new Date(cFrom.getTime() - 86400000);
      const prevFrom = new Date(cFrom.getTime() - rangeMs - 86400000);
      return { from: prevFrom, to: prevTo, label: 'vs prethodni period' };
    }
    default:
      return null;
  }
}

function getDataForRange(clientId, platform, fromDate, toDate) {
  const months = getMonthsInRange(fromDate, toDate);
  let allRows = [];
  months.forEach(m => { allRows = allRows.concat(getCampaignData(clientId, platform, m)); });
  if (allRows.length > 0 && allRows[0].date) {
    allRows = allRows.filter(r => { const rd = new Date(r.date); return rd >= fromDate && rd <= toDate; });
  }
  return allRows;
}

function getPrevPeriodAgg(clientId, platform, setup) {
  const prev = getPrevPeriodBounds();
  if (!prev) return { agg: null, label: '' };

  const prevRows = getDataForRange(clientId, platform, prev.from, prev.to);
  if (prevRows.length === 0) return { agg: null, label: prev.label };

  const rows = aggregateByCampaign(prevRows);
  const agg = {};
  setup.metrics.forEach(m => agg[m] = 0);
  rows.forEach(r => {
    if (agg.impressions !== undefined) agg.impressions += r.impressions || 0;
    if (agg.reach !== undefined) agg.reach += r.reach || 0;
    if (agg.clicks !== undefined) agg.clicks += r.clicks || 0;
    if (agg.conversions !== undefined) agg.conversions += r.conversions || 0;
    if (agg.conv_value !== undefined) agg.conv_value += r.conv_value || 0;
    if (agg.spend !== undefined) agg.spend += r.spend || 0;
  });
  if (agg.cpm !== undefined) agg.cpm = agg.impressions > 0 ? agg.spend / agg.impressions * 1000 : 0;
  if (agg.ctr !== undefined) agg.ctr = agg.impressions > 0 ? agg.clicks / agg.impressions * 100 : 0;
  if (agg.cpc !== undefined) agg.cpc = agg.clicks > 0 ? agg.spend / agg.clicks : 0;
  if (agg.cpa !== undefined) agg.cpa = agg.conversions > 0 ? agg.spend / agg.conversions : 0;
  return { agg, label: prev.label };
}

function getMoMHTML(metric, current, prev, label) {
  if (!prev || prev[metric] === undefined || prev[metric] === 0) return '<div class="mom-change neutral">—</div>';
  const change = ((current - prev[metric]) / prev[metric]) * 100;
  // Za CPA, CPM, CPC — pad je pozitivan (zeleno)
  const invertedMetrics = ['cpa', 'cpm', 'cpc'];
  const isGood = invertedMetrics.includes(metric) ? change <= 0 : change >= 0;
  const cls = Math.abs(change) < 0.5 ? 'neutral' : (isGood ? 'positive' : 'negative');
  const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '–';
  return `<div class="mom-change ${cls}">${arrow} ${change > 0 ? '+' : ''}${change.toFixed(1)}% ${label || 'vs prethodni period'}</div>`;
}

function getDailyTotals(rawRows, metrics) {
  const dailyMap = {};
  rawRows.forEach(r => {
    const d = (r.date || '').substring(0, 10);
    if (!d) return;
    if (!dailyMap[d]) {
      dailyMap[d] = {};
      metrics.forEach(m => dailyMap[d][m] = 0);
    }
    metrics.forEach(m => {
      if (['impressions', 'reach', 'clicks', 'conversions', 'conv_value', 'spend'].includes(m)) {
        dailyMap[d][m] += r[m] || 0;
      }
    });
  });
  // Izračunaj computed metrike po danu
  const sortedDates = Object.keys(dailyMap).sort();
  return sortedDates.map(d => {
    const row = dailyMap[d];
    if (row.cpm !== undefined) row.cpm = row.impressions > 0 ? row.spend / row.impressions * 1000 : 0;
    if (row.ctr !== undefined) row.ctr = row.impressions > 0 ? row.clicks / row.impressions * 100 : 0;
    if (row.cpc !== undefined) row.cpc = row.clicks > 0 ? row.spend / row.clicks : 0;
    if (row.cpa !== undefined) row.cpa = row.conversions > 0 ? row.spend / row.conversions : 0;
    row._date = d;
    return row;
  });
}

function renderSparklines(rawRows, metrics) {
  const daily = getDailyTotals(rawRows, metrics);
  if (daily.length < 2) return;

  const sparkColors = {
    conversions: '#4a6cf7', cpa: '#ef4444', conv_value: '#22c55e', spend: '#f59e0b',
    impressions: '#4a6cf7', reach: '#8b5cf6', cpm: '#ef4444', ctr: '#22c55e',
    clicks: '#06b6d4', cpc: '#ec4899'
  };

  metrics.forEach(m => {
    const canvas = document.getElementById(`spark-${m}`);
    if (!canvas) return;
    const values = daily.map(d => d[m] || 0);
    const color = sparkColors[m] || '#94a3b8';
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: daily.map(d => d._date),
        datasets: [{
          data: values,
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 1.5,
          fill: true,
          tension: 0.4,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: { display: false }
        },
        layout: { padding: 0 }
      }
    });
    activeCharts.push(chart);
  });
}

function renderPlatformView(clientId, platform) {
  destroyCharts();
  const client = CLIENTS[clientId];
  const setup = client.setup[platform];
  const container = document.getElementById('tabContent');

  if (!setup) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary);">Nema podataka za ovu platformu. Importuj CSV da počneš.</div>';
    return;
  }

  // GA4 KPI ima poseban prikaz
  if (setup.type === 'ga4_kpi') {
    renderGA4View(clientId, container);
    return;
  }

  const rawRows = getFilteredData(clientId, platform);
  const rows = aggregateByCampaign(rawRows);

  const typeClass = setup.type === 'performance' ? 'type-performance' : setup.type === 'traffic' ? 'type-traffic' : 'type-awareness';

  // Aggregate metrics
  const agg = {};
  setup.metrics.forEach(m => agg[m] = 0);
  rows.forEach(r => {
    if (agg.impressions !== undefined) agg.impressions += r.impressions || 0;
    if (agg.reach !== undefined) agg.reach += r.reach || 0;
    if (agg.clicks !== undefined) agg.clicks += r.clicks || 0;
    if (agg.conversions !== undefined) agg.conversions += r.conversions || 0;
    if (agg.conv_value !== undefined) agg.conv_value += r.conv_value || 0;
    if (agg.spend !== undefined) agg.spend += r.spend || 0;
  });
  // Computed
  if (agg.cpm !== undefined) agg.cpm = agg.impressions > 0 ? agg.spend / agg.impressions * 1000 : 0;
  if (agg.ctr !== undefined) agg.ctr = agg.impressions > 0 ? agg.clicks / agg.impressions * 100 : 0;
  if (agg.cpc !== undefined) agg.cpc = agg.clicks > 0 ? agg.spend / agg.clicks : 0;
  if (agg.cpa !== undefined) {
    // CPA samo od PMAX kampanja (Demand Gen nije optimizovan za CPA)
    const pmaxRows = rows.filter(r => r.campaign && /pmax|performance.?max/i.test(r.campaign));
    if (pmaxRows.length > 0) {
      const pmaxConv = pmaxRows.reduce((s, r) => s + (r.conversions || 0), 0);
      const pmaxSpend = pmaxRows.reduce((s, r) => s + (r.spend || 0), 0);
      agg.cpa = pmaxConv > 0 ? pmaxSpend / pmaxConv : 0;
    } else {
      // Fallback ako nema PMAX kampanja - koristi sve
      agg.cpa = agg.conversions > 0 ? agg.spend / agg.conversions : 0;
    }
  }

  // Adaptivno poređenje sa prethodnim periodom
  const { agg: prevAgg, label: prevLabel } = getPrevPeriodAgg(clientId, platform, setup);

  let metricsHTML = '<div class="metrics-row">';
  setup.metrics.forEach(m => {
    const momHTML = getMoMHTML(m, agg[m], prevAgg, prevLabel);
    metricsHTML += `
      <div class="metric-card">
        <div class="metric-label">${METRIC_LABELS[m]}</div>
        <div class="metric-value">${fmtMetric(m, agg[m], client.currency)}</div>
        ${momHTML}
        <div class="sparkline-wrap"><canvas id="spark-${m}"></canvas></div>
      </div>`;
  });
  metricsHTML += '</div>';

  // Campaign table
  let tableHTML = '';
  if (rows.length > 0) {
    const hasDV360IO = platform === 'dv360' && rows.some(r => r.insertion_order);
    const tableCols = hasDV360IO ? ['campaign', 'insertion_order', ...setup.metrics] : ['campaign', ...setup.metrics];
    tableHTML = `
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr>${tableCols.map(c => `<th>${c === 'campaign' ? 'Campaign' : c === 'insertion_order' ? 'Insertion Order' : METRIC_LABELS[c]}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows.map(r => `<tr>${tableCols.map(c => `<td>${c === 'campaign' ? r.campaign : c === 'insertion_order' ? (r.insertion_order || '') : fmtMetric(c, r[c], client.currency)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else {
    tableHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary);background:var(--card);border-radius:12px;border:1px solid var(--border);">Nema podataka. Importuj CSV za ' + PLATFORM_NAMES[platform] + '.</div>';
  }

  // Chart
  let chartHTML = '';
  if (rows.length > 0) {
    chartHTML = `
      <div class="charts-grid">
        <div class="chart-card">
          <div class="chart-title">Spend po kampanjama</div>
          <div class="chart-container"><canvas id="spendChart"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-title">${setup.type === 'performance' ? 'Conversions' : setup.type === 'traffic' ? 'Clicks' : 'Impressions'} po kampanjama</div>
          <div class="chart-container"><canvas id="metricChart"></canvas></div>
        </div>
      </div>
    `;
  }

  // NLB Proizvodi sekcija
  let productsHTML = '';
  if (clientId === 'nlb' && platform === 'google_ads' && rawRows.length > 0) {
    productsHTML = renderProductsSection(rawRows, client.currency);
  }

  container.innerHTML = `
    <div class="section-title">${PLATFORM_NAMES[platform]} <span class="campaign-type ${typeClass}">${setup.label}</span></div>
    ${metricsHTML}
    ${productsHTML}
    ${chartHTML}
    ${tableHTML}
  `;

  // Render charts
  if (rows.length > 0) {
    const labels = rows.map(r => r.campaign?.length > 30 ? r.campaign.substring(0, 30) + '...' : r.campaign);
    const colors = ['#4a6cf7','#22c55e','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16'];

    const spendChart = new Chart(document.getElementById('spendChart'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Spend', data: rows.map(r => r.spend), backgroundColor: colors.slice(0, rows.length), borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
    activeCharts.push(spendChart);

    const metricKey = setup.type === 'performance' ? 'conversions' : setup.type === 'traffic' ? 'clicks' : 'impressions';
    const metricChart = new Chart(document.getElementById('metricChart'), {
      type: 'bar',
      data: { labels, datasets: [{ label: METRIC_LABELS[metricKey], data: rows.map(r => r[metricKey]), backgroundColor: colors.slice(0, rows.length), borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
    activeCharts.push(metricChart);
  }

  // Renderuj sparkline grafikone
  renderSparklines(rawRows, setup.metrics);

  // Renderuj Products chart ako postoji
  if (clientId === 'nlb' && platform === 'google_ads') {
    renderProductsChart();
  }
}

function goHome() {
  if (!_routingInProgress && window.location.hash !== '#/' && window.location.hash !== '') {
    _routingInProgress = true;
    window.location.hash = '#/';
    _routingInProgress = false;
  }
  currentClient = null;
  destroyCharts();
  document.getElementById('detailView').style.display = 'none';
  document.getElementById('homepage').style.display = 'block';
  renderHomepage();
}
