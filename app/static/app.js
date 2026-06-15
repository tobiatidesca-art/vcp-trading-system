/* =============================================================
   VCP Trading System — Frontend  v7
   ============================================================= */
'use strict';

const API = '';

// ── State ──────────────────────────────────────────────────────
let signals       = [];
let sortKey       = 'signalStrength';
let sortAsc       = true;
let ws            = null;
let wsReconnTimer = null;
let equityChart   = null;
let _modalChart   = null;
let _currentWatchlist = [];

// ── Boot ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  startClock();
  connectWebSocket();
  loadChips();
  fetchInitialSignals();
  const endEl = document.getElementById('bt-end');
  if (endEl) endEl.value = new Date().toISOString().split('T')[0];
});

// ──────────────────────────────────────────────────────────────
// TABS
// ──────────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });
}

// ──────────────────────────────────────────────────────────────
// TICKER CHIPS
// ──────────────────────────────────────────────────────────────
async function loadChips() {
  try {
    const list = await (await fetch(API + '/api/screener/watchlist')).json();
    _currentWatchlist = list;
    renderChips(list);
    setText('chips-count', list.length);
    setText('stat-watchlist', list.length);
  } catch (e) { console.warn('loadChips:', e); }
}

function renderChips(list) {
  const body = document.getElementById('ticker-chips-body');
  if (!body) return;
  body.innerHTML = list.map(t =>
    `<span class="t-chip" id="chip-${t}" title="${t}">${t}</span>`
  ).join('');
}

function toggleChips() {
  document.getElementById('chips-wrap').classList.toggle('open');
}

function chipDownloading(ticker) {
  document.querySelectorAll('.t-chip.downloading').forEach(c => {
    c.classList.remove('downloading');
    c.classList.add('done');
  });
  const el = document.getElementById('chip-' + ticker);
  if (el) { el.classList.remove('done', 'signal'); el.classList.add('downloading'); }
}

function chipsAllDone() {
  document.querySelectorAll('.t-chip').forEach(c => {
    c.classList.remove('downloading');
    if (!c.classList.contains('signal')) c.classList.add('done');
  });
}

function chipSignal(ticker) {
  const el = document.getElementById('chip-' + ticker);
  if (el) { el.classList.remove('done', 'downloading'); el.classList.add('signal'); }
}

function resetChips() {
  document.querySelectorAll('.t-chip').forEach(c =>
    c.classList.remove('downloading', 'done', 'signal'));
}

// ──────────────────────────────────────────────────────────────
// CLOCK
// ──────────────────────────────────────────────────────────────
function startClock() {
  function tick() {
    const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    setText('clock', et.toTimeString().slice(0, 8) + ' ET');
    const h = et.getHours(), m = et.getMinutes(), d = et.getDay();
    const open = d >= 1 && d <= 5 && (h > 9 || (h === 9 && m >= 30)) && h < 16;
    const el = document.getElementById('stat-market');
    if (el) { el.textContent = open ? 'OPEN' : 'CLOSED'; el.className = 'stat-value ' + (open ? 'green' : 'red'); }
  }
  tick();
  setInterval(tick, 1000);
}

// ──────────────────────────────────────────────────────────────
// WEBSOCKET
// ──────────────────────────────────────────────────────────────
function connectWebSocket() {
  clearTimeout(wsReconnTimer);
  if (ws) { try { ws.close(); } catch (_) {} ws = null; }
  setBadge('', 'Connecting…');
  try {
    ws = new WebSocket(`ws://${location.host}/ws/signals`);
    ws.onopen  = () => setBadge('connected', 'Live');
    ws.onmessage = event => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'progress') {
          showProgress(msg.current, msg.total, msg.ticker);
          chipDownloading(msg.ticker);
        } else if (msg.type === 'signals') {
          hideProgress();
          chipsAllDone();
          msg.data.forEach(s => chipSignal(s.ticker));
          applySignals(msg.data);
          if (msg.data.length > 0) toast(`📡 ${msg.data.length} signals received`, 'info');
        } else if (msg.type === 'bt_progress') {
          showBtProgress(msg.current, msg.total, msg.ticker);
        } else if (Array.isArray(msg)) {
          hideProgress();
          applySignals(msg);
        }
      } catch (e) { console.error('WS parse:', e); }
    };
    ws.onclose = () => {
      setBadge('', 'Disconnected');
      wsReconnTimer = setTimeout(connectWebSocket, 5000);
    };
    ws.onerror = () => {
      setBadge('error', 'WS Error');
      ws = null;
      wsReconnTimer = setTimeout(connectWebSocket, 8000);
    };
  } catch (e) {
    setBadge('error', 'WS N/A');
    wsReconnTimer = setTimeout(connectWebSocket, 10000);
  }
}

function setBadge(cls, text) {
  document.getElementById('ws-badge').className = 'ws-badge ' + cls;
  setText('ws-label', text);
}

// ──────────────────────────────────────────────────────────────
// SCREENER
// ──────────────────────────────────────────────────────────────
async function fetchInitialSignals() {
  try {
    const res  = await fetch(API + '/api/screener/signals');
    const data = await res.json();
    if (data.length > 0) applySignals(data);
  } catch (e) { console.warn('fetchInitial:', e); }
}

async function triggerRefresh() {
  const btn = document.getElementById('btn-refresh');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Scanning…';
  resetChips();
  try {
    const res  = await fetch(API + '/api/screener/refresh', { method: 'POST' });
    const data = await res.json();
    hideProgress();
    applySignals(data);
    toast(`✅ Screener: ${data.length} signals found`, 'success');
  } catch (e) {
    hideProgress();
    toast('❌ Error: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>⚡</span> REFRESH SCREENER';
  }
}

function applySignals(data) {
  signals = data;
  renderTable();
  updateStats();
  setText('last-update-time', new Date().toLocaleTimeString('en-US'));
  // Async ISIN fetch for each new signal
  data.forEach(s => prefetchIsin(s.ticker));
}

// ──────────────────────────────────────────────────────────────
// SCREENER TABLE
// ──────────────────────────────────────────────────────────────
function renderTable() {
  const order  = { STRONG: 0, MODERATE: 1, WATCH: 2 };
  const sorted = [...signals].sort((a, b) => {
    let va = a[sortKey], vb = b[sortKey];
    if (sortKey === 'signalStrength') { va = order[va] ?? 3; vb = order[vb] ?? 3; }
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    return sortAsc ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0);
  });

  const body = document.getElementById('screener-body');
  if (!sorted.length) {
    body.innerHTML = `<tr><td colspan="9"><div class="empty-state">
      <div class="icon">🔍</div>
      <p>No signals found. Press <strong>REFRESH SCREENER</strong>.</p>
    </div></td></tr>`;
    return;
  }

  body.innerHTML = sorted.map(s => {
    const dCls  = s.distanceFromHighPct >= 0 ? 'positive' : (s.distanceFromHighPct > -2 ? 'yellow' : 'neutral');
    const dSign = s.distanceFromHighPct >= 0 ? '+' : '';
    const vPct  = Math.min(100, (s.volumeRatio / 4) * 100);
    const time  = s.detectedAt ? new Date(s.detectedAt).toLocaleTimeString('it-IT') : '—';
    const sigDate = s.detectedAt ? s.detectedAt.split('T')[0] : '';
    const cachedIsin = sessionStorage.getItem('isin_' + s.ticker) || '…';
    return `<tr>
      <td>
        <a href="https://finance.yahoo.com/quote/${esc(s.ticker)}" target="_blank" rel="noopener" class="ticker-link">${esc(s.ticker)}</a>
        <div class="ticker-isin" id="isin-row-${esc(s.ticker)}">${cachedIsin}</div>
      </td>
      <td class="price-cell">$${f2(s.currentPrice)}</td>
      <td class="${dCls}">${dSign}${f2(s.distanceFromHighPct)}%</td>
      <td class="${s.bbWidthPct < 4 ? 'positive' : 'neutral'}">${f2(s.bbWidthPct)}%</td>
      <td>$${f2(s.atr14)}</td>
      <td>
        <div class="volume-bar-wrap">
          <span class="${s.volumeRatio > 2 ? 'positive' : 'neutral'}">${f1(s.volumeRatio)}x</span>
          <div class="volume-bar" style="width:${vPct}px;opacity:${0.4 + vPct / 200}"></div>
        </div>
      </td>
      <td><span class="badge badge-${s.signalStrength}">${s.signalStrength}</span></td>
      <td style="color:#a8c0d8;font-size:18px">${time}</td>
      <td><button class="chart-btn" onclick="openSignalChart('${esc(s.ticker)}','${sigDate}')">📊 Chart</button></td>
    </tr>`;
  }).join('');

  // Update ISIN cells from cache or trigger fetch
  sorted.forEach(s => {
    const isin = sessionStorage.getItem('isin_' + s.ticker);
    if (isin) {
      const el = document.getElementById('isin-row-' + s.ticker);
      if (el) el.textContent = isin;
    }
  });
}

function sortTable(key) {
  sortAsc = sortKey === key ? !sortAsc : true;
  sortKey = key;
  renderTable();
}

function updateStats() {
  setText('stat-total',    signals.length || '0');
  setText('stat-strong',   signals.filter(s => s.signalStrength === 'STRONG').length   || '0');
  setText('stat-moderate', signals.filter(s => s.signalStrength === 'MODERATE').length || '0');
  setText('stat-watch',    signals.filter(s => s.signalStrength === 'WATCH').length    || '0');
}

// ──────────────────────────────────────────────────────────────
// WATCHLIST MODAL
// ──────────────────────────────────────────────────────────────
async function openWatchlistModal() {
  try {
    const list  = await (await fetch(API + '/api/screener/watchlist')).json();
    const input = prompt('Edit watchlist (comma-separated tickers):', list.join(','));
    if (!input) return;
    const tickers = input.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
    await fetch(API + '/api/screener/watchlist', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers }),
    });
    _currentWatchlist = tickers;
    setText('stat-watchlist', tickers.length);
    renderChips(tickers);
    toast(`📋 Watchlist updated: ${tickers.length} tickers`, 'success');
  } catch (e) { toast('Error: ' + e.message, 'error'); }
}

// ──────────────────────────────────────────────────────────────
// ISIN FETCHING
// ──────────────────────────────────────────────────────────────
async function fetchIsin(ticker) {
  const key    = 'isin_' + ticker;
  const cached = sessionStorage.getItem(key);
  if (cached) return cached;
  try {
    const r    = await fetch(API + '/api/ticker/' + ticker + '/isin');
    const data = await r.json();
    const isin = data.isin || 'N/A';
    sessionStorage.setItem(key, isin);
    return isin;
  } catch {
    return 'N/A';
  }
}

function prefetchIsin(ticker) {
  if (sessionStorage.getItem('isin_' + ticker)) {
    // Already cached — update any visible cell immediately
    _updateIsinCell(ticker, sessionStorage.getItem('isin_' + ticker));
    return;
  }
  fetchIsin(ticker).then(isin => _updateIsinCell(ticker, isin));
}

function _updateIsinCell(ticker, isin) {
  const el = document.getElementById('isin-row-' + ticker);
  if (el) el.textContent = isin;
}

// ──────────────────────────────────────────────────────────────
// CHART MODAL
// ──────────────────────────────────────────────────────────────
async function openSignalChart(ticker, signalDate) {
  const isin  = await fetchIsin(ticker);
  let url = API + `/api/ticker/${ticker}/chart?context=90`;
  if (signalDate) url += `&start=${signalDate}&end=${signalDate}`;
  let data;
  try {
    data = await (await fetch(url)).json();
  } catch (e) {
    toast('Error loading chart data', 'error');
    return;
  }

  _setModalHeader(ticker, isin);

  const info = document.getElementById('modal-trade-info');
  info.innerHTML = signalDate
    ? `<span class="info-lbl">VCP signal detected on</span>
       <span class="info-val" style="color:#f1c40f">⭐ ${signalDate}</span>`
    : `<span class="info-lbl">Last 120 days of data</span>`;

  _renderModalChart(data, signalDate, null, null, null, 'signal');
  document.getElementById('chart-modal').style.display = 'flex';
}

async function openTradeChart(ticker, entryDate, exitDate, entryPrice, exitPrice, returnPct) {
  const isin = await fetchIsin(ticker);
  let data;
  try {
    data = await (await fetch(
      API + `/api/ticker/${ticker}/chart?start=${entryDate}&end=${exitDate}&context=60`
    )).json();
  } catch (e) {
    toast('Error loading chart data', 'error');
    return;
  }

  _setModalHeader(ticker, isin);

  const sign = returnPct >= 0 ? '+' : '';
  const cls  = returnPct >= 0 ? 'positive' : 'negative';
  document.getElementById('modal-trade-info').innerHTML = `
    <span class="info-lbl">Entry</span>
    <span class="info-val">$${f2(entryPrice)}</span>
    <span style="color:#6a8aaa">on ${entryDate}</span>
    &nbsp;→&nbsp;
    <span class="info-lbl">Exit</span>
    <span class="info-val">$${f2(exitPrice)}</span>
    <span style="color:#6a8aaa">on ${exitDate}</span>
    &nbsp;&nbsp;
    <span class="info-lbl">Return</span>
    <span class="info-val ${cls}">${sign}${f2(returnPct)}%</span>
  `;

  _renderModalChart(data, entryDate, exitDate, entryPrice, exitPrice, 'trade');
  document.getElementById('chart-modal').style.display = 'flex';
}

function _setModalHeader(ticker, isin) {
  setText('modal-ticker', ticker);
  setText('modal-isin', isin !== 'N/A' ? isin : '');
  const link = document.getElementById('modal-yf-link');
  link.href = `https://finance.yahoo.com/quote/${ticker}`;
}

function _renderModalChart(data, entryDate, exitDate, entryPrice, exitPrice, mode) {
  if (_modalChart) { _modalChart.destroy(); _modalChart = null; }
  const ctx = document.getElementById('modal-chart-canvas').getContext('2d');

  if (!data.dates || data.dates.length === 0) {
    ctx.fillStyle = '#6a8aaa';
    ctx.font = '16px Segoe UI';
    ctx.fillText('No data available', 20, 40);
    return;
  }

  const maxVol = Math.max(...data.volumes, 1);
  const datasets = [];

  // Price line
  datasets.push({
    type: 'line',
    label: 'Close',
    data: data.dates.map((d, i) => ({ x: d, y: data.closes[i] })),
    borderColor: '#4db8ff',
    backgroundColor: 'rgba(77,184,255,0.05)',
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 5,
    fill: true,
    tension: 0.1,
    yAxisID: 'y',
    order: 1,
  });

  // Entry marker (green triangle up)
  if (mode === 'trade' && entryDate && entryPrice) {
    datasets.push({
      type: 'scatter',
      label: '▲ Entry',
      data: [{ x: entryDate, y: entryPrice }],
      backgroundColor: '#2ecc71',
      borderColor: '#ffffff',
      borderWidth: 2,
      pointStyle: 'triangle',
      pointRadius: 14,
      rotation: 0,
      yAxisID: 'y',
      order: 0,
    });
  }

  // Exit marker (red triangle down)
  if (mode === 'trade' && exitDate && exitPrice) {
    datasets.push({
      type: 'scatter',
      label: '▼ Exit',
      data: [{ x: exitDate, y: exitPrice }],
      backgroundColor: '#e74c3c',
      borderColor: '#ffffff',
      borderWidth: 2,
      pointStyle: 'triangle',
      pointRadius: 14,
      rotation: 180,
      yAxisID: 'y',
      order: 0,
    });
  }

  // Signal marker (yellow star)
  if (mode === 'signal' && entryDate) {
    const idx = data.dates.indexOf(entryDate);
    // find closest date if exact not found
    let sigIdx = idx >= 0 ? idx : data.dates.length - 1;
    for (let i = 0; i < data.dates.length; i++) {
      if (data.dates[i] >= entryDate) { sigIdx = i; break; }
    }
    const sigPrice = data.closes[sigIdx];
    if (sigPrice != null) {
      datasets.push({
        type: 'scatter',
        label: '⭐ VCP Signal',
        data: [{ x: data.dates[sigIdx], y: sigPrice }],
        backgroundColor: '#f1c40f',
        borderColor: '#ffffff',
        borderWidth: 2,
        pointStyle: 'star',
        pointRadius: 16,
        yAxisID: 'y',
        order: 0,
      });
    }
  }

  // Volume bars (secondary axis, bottom 1/5)
  datasets.push({
    type: 'bar',
    label: 'Volume',
    data: data.dates.map((d, i) => ({ x: d, y: data.volumes[i] })),
    backgroundColor: 'rgba(77,184,255,0.15)',
    borderColor: 'transparent',
    borderWidth: 0,
    yAxisID: 'yVol',
    order: 2,
  });

  // Thin x-tick strategy: show every Nth label
  const N = Math.max(1, Math.floor(data.dates.length / 10));
  const tickLabels = data.dates.filter((_, i) => i % N === 0);

  _modalChart = new Chart(ctx, {
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { color: '#c8daea', font: { size: 13 }, padding: 16 },
          onClick: () => {},
        },
        tooltip: {
          backgroundColor: '#162032',
          borderColor: '#2a4060',
          borderWidth: 1,
          titleColor: '#c8daea',
          bodyColor: '#ffffff',
          callbacks: {
            label: ctx => {
              if (ctx.dataset.label === 'Volume')
                return ` Vol: ${(ctx.raw.y / 1e6).toFixed(1)}M`;
              return ` $${Number(ctx.raw.y).toFixed(2)}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'category',
          ticks: {
            color: '#c8daea',
            font: { size: 12, weight: '600' },
            maxRotation: 45,
            minRotation: 30,
            maxTicksLimit: 12,
          },
          grid: { color: '#1e3050' },
        },
        y: {
          position: 'right',
          ticks: {
            color: '#c8daea',
            font: { size: 12, weight: '600' },
            callback: v => '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }),
          },
          grid: { color: '#1e3050' },
        },
        yVol: {
          position: 'left',
          grid: { drawOnChartArea: false },
          ticks: { display: false },
          max: maxVol * 6,
        },
      },
    },
  });
}

function closeChartModal() {
  document.getElementById('chart-modal').style.display = 'none';
  if (_modalChart) { _modalChart.destroy(); _modalChart = null; }
}

function modalBackdropClick(e) {
  if (e.target.id === 'chart-modal') closeChartModal();
}

// ──────────────────────────────────────────────────────────────
// BACKTEST
// ──────────────────────────────────────────────────────────────
async function runBacktest() {
  const raw = document.getElementById('bt-tickers').value.trim();
  let tickers;
  if (!raw || raw.toUpperCase().includes('ALL') || raw.toUpperCase().includes('TUTTI')) {
    tickers = _currentWatchlist.length ? _currentWatchlist
            : await (await fetch(API + '/api/screener/watchlist')).json();
  } else {
    tickers = raw.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
  }
  if (!tickers.length) { toast('Empty watchlist, cannot proceed', 'error'); return; }

  const config = {
    tickers,
    startDate:                 document.getElementById('bt-start').value,
    endDate:                   document.getElementById('bt-end').value,
    initialCapital:            num('bt-capital'),
    positionSizeUsd:           num('bt-position'),
    maxOpenPositions:          int('bt-max-pos'),
    highPeriodDays:            int('bt-high-period'),
    bbWidthThresholdPct:       num('bt-bb-width'),
    bbContractionBars:         int('bt-bb-bars'),
    volumeMultiplier:          num('bt-vol-mult'),
    stopLossAtrMultiplier:     num('bt-stop'),
    useTrailingStop:           document.getElementById('bt-trailing').checked,
    trailingStopAtrMultiplier: num('bt-trail'),
    maxHoldingDays:            int('bt-maxhold'),
  };

  showLoading(true);
  showBtProgress(0, tickers.length, '');
  document.getElementById('results-placeholder').style.display = 'none';
  document.getElementById('results-content').style.display     = 'none';

  try {
    const result = await (await fetch(API + '/api/backtest/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })).json();

    hideBtProgress();

    if (result.errorMessage) {
      toast('⚠️ ' + result.errorMessage, 'error');
      document.getElementById('results-placeholder').style.display = 'block';
      return;
    }
    renderResults(result);
    toast(`✅ Backtest: ${result.totalTrades} trades, Win Rate ${result.winRate}%`, 'success');
  } catch (e) {
    hideBtProgress();
    toast('❌ Backtest error: ' + e.message, 'error');
    document.getElementById('results-placeholder').style.display = 'block';
  } finally {
    showLoading(false);
  }
}

// ──────────────────────────────────────────────────────────────
// RESULTS
// ──────────────────────────────────────────────────────────────
function renderResults(r) {
  document.getElementById('results-content').style.display = 'block';

  const pnlSign = r.totalPnlUsd >= 0 ? '+' : '';
  const m = [
    { l: 'Win Rate',       v: r.winRate + '%',                               c: r.winRate >= 50 ? 'green' : 'red' },
    { l: 'Profit Factor',  v: f2(r.profitFactor),                            c: r.profitFactor >= 1.5 ? 'green' : r.profitFactor >= 1 ? 'yellow' : 'red' },
    { l: 'Total P&L $',    v: pnlSign + '$' + Math.abs(r.totalPnlUsd).toLocaleString('en-US', {maximumFractionDigits:0}), c: r.totalPnlUsd >= 0 ? 'green' : 'red' },
    { l: 'Total Return',   v: (r.totalReturnPct >= 0 ? '+' : '') + f2(r.totalReturnPct) + '%', c: r.totalReturnPct >= 0 ? 'green' : 'red' },
    { l: 'Max Drawdown',   v: '-' + f2(r.maxDrawdownPct) + '%',              c: r.maxDrawdownPct < 15 ? 'green' : r.maxDrawdownPct < 25 ? 'yellow' : 'red' },
    { l: 'Total Trades',   v: r.totalTrades,                                 c: '' },
    { l: 'Winners',        v: r.winningTrades,                               c: 'green' },
    { l: 'Losers',         v: r.losingTrades,                                c: 'red' },
    { l: 'Avg Win',        v: '+' + f2(r.avgWinPct) + '%',                   c: 'green' },
    { l: 'Avg Loss',       v: '-' + f2(r.avgLossPct) + '%',                  c: 'red' },
    { l: 'Expectancy',     v: f2(r.expectancyPct) + '%',                     c: r.expectancyPct >= 0 ? 'green' : 'red' },
    { l: 'Final Capital',  v: '$' + (r.finalCapital || 0).toLocaleString('en-US', {maximumFractionDigits:0}), c: (r.finalCapital || 0) >= (r.initialCapital || 100000) ? 'green' : 'red' },
  ];

  document.getElementById('metrics-grid').innerHTML = m.map(x =>
    `<div class="metric-card">
       <div class="metric-label">${x.l}</div>
       <div class="metric-value ${x.c}">${x.v}</div>
     </div>`
  ).join('');

  renderEquityChart(r.equityCurve, r.equityLabels);
  renderTradesTable(r.trades);
  renderAnnualTable(r.annualStats  || []);
  renderMonthlyGrid(r.monthlyStats || {});
}

function renderEquityChart(curve, labels) {
  if (equityChart) { equityChart.destroy(); equityChart = null; }
  const ctx     = document.getElementById('equity-chart').getContext('2d');
  const initial = curve[0] ?? 100000;
  const isPos   = curve[curve.length - 1] >= initial;
  equityChart   = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: curve,
        borderColor:     isPos ? '#2ecc71' : '#e74c3c',
        backgroundColor: isPos ? 'rgba(46,204,113,0.08)' : 'rgba(231,76,60,0.08)',
        borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, fill: true, tension: 0.1,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#162032', borderColor: '#2a4060', borderWidth: 1,
          titleColor: '#a8c0d8', bodyColor: '#ffffff',
          callbacks: { label: c => ' $' + c.raw.toLocaleString('en-US', { maximumFractionDigits: 0 }) },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#c8daea',
            maxRotation: 45,
            minRotation: 30,
            font: { size: 13, weight: '600' },
            maxTicksLimit: 12,
            callback: (_, i) => {
              // Show only every Nth label
              const step = Math.max(1, Math.floor(labels.length / 12));
              return i % step === 0 ? (labels[i] || '').split(' ')[0] : '';
            },
          },
          grid: { color: '#1e3050' },
        },
        y: {
          ticks: {
            color: '#c8daea',
            font: { size: 13, weight: '600' },
            callback: v => '$' + (v / 1000).toFixed(0) + 'k',
          },
          grid: { color: '#1e3050' },
        },
      },
    },
  });
}

function renderTradesTable(trades) {
  const body = document.getElementById('trades-body');
  if (!trades?.length) {
    body.innerHTML = '<tr><td colspan="12" style="text-align:center;color:#a8c0d8;padding:20px;font-size:18px">No trades</td></tr>';
    return;
  }
  const labels = { STOP_LOSS: '🔴 Stop Loss', TRAILING_STOP: '🟡 Trailing', MAX_HOLD: '⏱ Max Hold', END_OF_TEST: '🏁 End of Test' };
  body.innerHTML = trades.map(t => {
    const pnlCls  = t.pnlUsd >= 0 ? 'positive' : 'negative';
    const pnlSign = t.pnlUsd >= 0 ? '+' : '';
    const divPct  = t.dividendYieldPct ?? 0;
    const divCell = divPct > 0
      ? `<span style="color:#c39bd3">+${divPct.toFixed(2)}%</span>`
      : `<span style="color:#2a4060">—</span>`;
    const cachedIsin = sessionStorage.getItem('isin_' + t.ticker) || '…';
    return `<tr>
      <td>
        <a href="https://finance.yahoo.com/quote/${esc(t.ticker)}" target="_blank" rel="noopener" class="ticker-link" style="font-size:18px">${esc(t.ticker)}</a>
        <div class="ticker-isin" id="isin-trade-${esc(t.ticker)}">${cachedIsin}</div>
      </td>
      <td>${t.entryDate}</td>
      <td>${t.exitDate}</td>
      <td class="price-cell">$${f2(t.entryPrice)}</td>
      <td class="price-cell">$${f2(t.exitPrice)}</td>
      <td style="color:#c8daea">${t.shares ?? '—'}</td>
      <td class="${pnlCls}">${pnlSign}$${Math.abs(t.pnlUsd ?? 0).toLocaleString('en-US',{maximumFractionDigits:0})}</td>
      <td class="${t.returnPct >= 0 ? 'positive' : 'negative'}">${t.returnPct >= 0 ? '+' : ''}${f2(t.returnPct)}%</td>
      <td>${divCell}</td>
      <td>${t.holdingDays}d</td>
      <td style="font-size:15px;color:#c8daea">${labels[t.exitReason] ?? t.exitReason}</td>
      <td><button class="chart-btn" onclick="openTradeChart('${esc(t.ticker)}','${t.entryDate}','${t.exitDate}',${t.entryPrice},${t.exitPrice},${t.returnPct})">📊</button></td>
    </tr>`;
  }).join('');

  // Prefetch ISINs for all trade tickers
  const seen = new Set();
  trades.forEach(t => {
    if (!seen.has(t.ticker)) {
      seen.add(t.ticker);
      prefetchIsin(t.ticker);
    }
  });
}

// After ISIN fetch, also update trade rows
const _origUpdateIsinCell = window._updateIsinCell;
function _updateIsinCell(ticker, isin) {
  const el1 = document.getElementById('isin-row-' + ticker);
  if (el1) el1.textContent = isin;
  // Update all trade rows for this ticker
  document.querySelectorAll(`#isin-trade-${ticker}`).forEach(el => {
    el.textContent = isin;
  });
}

// ──────────────────────────────────────────────────────────────
// PROGRESS BARS
// ──────────────────────────────────────────────────────────────
function showProgress(current, total, ticker) {
  const el = document.getElementById('scan-progress');
  if (!el) return;
  el.style.display = 'block';
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  document.getElementById('progress-fill').style.width    = pct + '%';
  document.getElementById('progress-counter').textContent = `${current} / ${total}`;
  document.getElementById('progress-ticker').textContent  = `↓ ${ticker}  (${pct}%)`;
  document.getElementById('progress-label').textContent   =
    current < total ? `Downloading Yahoo Finance data — ${total} tickers…`
                    : 'Download complete, computing signals…';
}

function hideProgress() {
  const el = document.getElementById('scan-progress');
  if (el) el.style.display = 'none';
  const f  = document.getElementById('progress-fill');
  if (f)  f.style.width = '0%';
}

function showBtProgress(current, total, ticker) {
  const el = document.getElementById('bt-progress');
  if (!el) return;
  el.style.display = 'block';
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  document.getElementById('bt-progress-fill').style.width    = pct + '%';
  document.getElementById('bt-progress-counter').textContent = `${current} / ${total}`;
  document.getElementById('bt-progress-ticker').textContent  = ticker ? `↓ ${ticker}  (${pct}%)` : '↓ waiting…';
  document.getElementById('bt-progress-label').textContent   =
    current < total ? `Analyzing ticker ${current} of ${total}…`
                    : 'Computing results…';
}

function hideBtProgress() {
  const el = document.getElementById('bt-progress');
  if (el) el.style.display = 'none';
  const f  = document.getElementById('bt-progress-fill');
  if (f)  f.style.width = '0%';
}

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────
function showLoading(show) {
  document.getElementById('bt-loading').style.display = show ? 'flex' : 'none';
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

// ──────────────────────────────────────────────────────────────
// ANNUAL TABLE
// ──────────────────────────────────────────────────────────────
function renderAnnualTable(annualStats) {
  const section = document.getElementById('annual-section');
  const body    = document.getElementById('annual-body');
  if (!annualStats?.length) { if (section) section.style.display = 'none'; return; }
  if (section) section.style.display = 'block';

  const roiCell = (v) => {
    const cls  = v >= 0 ? 'positive' : 'negative';
    const sign = v >= 0 ? '+' : '';
    return `<td class="${cls}" style="font-family:'Courier New',monospace;font-weight:800;font-size:17px">${sign}${f2(v)}%</td>`;
  };

  body.innerHTML = annualStats.map(y => {
    const pnlCls  = y.pnlUsd >= 0 ? 'positive' : 'negative';
    const pnlSign = y.pnlUsd >= 0 ? '+' : '';
    const wrCls   = y.winRate >= 50 ? 'positive' : 'negative';
    return `<tr>
      <td style="font-family:'Courier New',monospace;font-weight:900;font-size:18px;color:#4db8ff">${y.year}</td>
      <td>${y.trades}</td>
      <td class="positive">${y.wins}</td>
      <td class="negative">${y.losses}</td>
      <td class="${wrCls}">${y.winRate}%</td>
      <td class="${pnlCls}" style="font-family:'Courier New',monospace;font-weight:700">
        ${pnlSign}$${Math.abs(y.pnlUsd).toLocaleString('en-US', { maximumFractionDigits: 0 })}
      </td>
      ${roiCell(y.roiOnInitialCapPct  ?? 0)}
      ${roiCell(y.roiOnMaxRiskCapPct  ?? 0)}
      ${roiCell(y.roiOnAvgDeployedPct ?? 0)}
      <td style="color:#6a8aaa;font-family:'Courier New',monospace;font-size:14px">
        $${(y.avgDeployedUsd ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
      </td>
    </tr>`;
  }).join('');
}

// ──────────────────────────────────────────────────────────────
// MONTHLY GRID
// ──────────────────────────────────────────────────────────────
function renderMonthlyGrid(monthlyStats) {
  const section   = document.getElementById('monthly-section');
  const container = document.getElementById('monthly-grid');
  if (!monthlyStats || !Object.keys(monthlyStats).length) {
    if (section) section.style.display = 'none'; return;
  }
  if (section) section.style.display = 'block';

  const MON_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const years     = Object.keys(monthlyStats).map(Number).sort();

  let html = '<table class="monthly-table"><thead><tr>';
  html += '<th>Year</th>';
  MON_NAMES.forEach(m => { html += `<th>${m}</th>`; });
  html += '<th>Total</th></tr></thead><tbody>';

  for (const year of years) {
    const yData   = monthlyStats[String(year)] || {};
    let   yearPnl = 0;
    let   yearTrd = 0;
    let   yearWin = 0;
    html += `<tr><td>${year}</td>`;

    for (let m = 1; m <= 12; m++) {
      const md = yData[String(m)];
      if (md) {
        yearPnl += md.pnlUsd;
        yearTrd += md.trades;
        yearWin += md.wins;
        const cls  = md.pnlUsd >= 0 ? 'positive' : 'negative';
        const sign = md.pnlUsd >= 0 ? '+' : '';
        html += `<td>
          <div class="month-pnl ${cls}">${sign}$${Math.abs(md.pnlUsd).toLocaleString('en-US',{maximumFractionDigits:0})}</div>
          <div class="month-sub">${md.trades}t &nbsp;${md.winRate}%</div>
        </td>`;
      } else {
        html += `<td class="month-cell-empty">—</td>`;
      }
    }

    // Year total cell
    const totCls  = yearPnl >= 0 ? 'positive' : 'negative';
    const totSign = yearPnl >= 0 ? '+' : '';
    const totWr   = yearTrd > 0 ? (yearWin / yearTrd * 100).toFixed(1) : '0';
    html += `<td>
      <div class="month-pnl ${totCls}">${totSign}$${Math.abs(yearPnl).toLocaleString('en-US',{maximumFractionDigits:0})}</div>
      <div class="month-sub">${yearTrd}t &nbsp;${totWr}%</div>
    </td></tr>`;
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
const f2  = v  => (typeof v === 'number' ? v.toFixed(2) : String(v ?? '—'));
const f1  = v  => (typeof v === 'number' ? v.toFixed(1) : String(v ?? '—'));
const num = id => parseFloat(document.getElementById(id)?.value) || 0;
const int = id => parseInt(document.getElementById(id)?.value, 10) || 0;
const esc = s  => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;');
