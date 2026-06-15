/* =================================================================
   VCP Trading System — Static Edition (GitHub Pages)
   All computation runs in the browser; data is loaded from JSON
   files generated daily by GitHub Actions (scripts/fetch_data.py).
   ================================================================= */
'use strict';

// ── Watchlist ─────────────────────────────────────────────────────
const WATCHLIST = [
  "AAPL","MSFT","GOOGL","AMZN","META","NVDA","TSLA","AVGO","ORCL","AMD",
  "INTC","QCOM","TXN","MU","AMAT","LRCX","KLAC","MRVL","ADSK","CRM",
  "ADBE","NOW","INTU","PANW","FTNT","SNPS","CDNS","DDOG","NET","CRWD",
  "JPM","BAC","WFC","GS","MS","C","AXP","BLK","SCHW","COF",
  "BX","CB","PGR","TRV","AFL","ALL","AIG","MET","SPGI","MCO",
  "ICE","CME","MSCI","V","MA","PYPL","FDS","BR","ALLY","SYF",
  "JNJ","LLY","ABBV","MRK","PFE","AMGN","GILD","REGN","VRTX","BMY",
  "TMO","ABT","MDT","SYK","BSX","EW","ISRG","DHR","IQV","A",
  "CVS","UNH","ELV","CNC","HUM","CI","MCK","CAH","ABC","DXCM",
  "PG","KO","PEP","MCD","SBUX","NKE","COST","WMT","TGT","HD",
  "LOW","TJX","ROST","DG","DLTR","EL","CL","CHD","KMB","GIS",
  "DIS","NFLX","CMCSA","CHTR","LYV","BKNG","MAR","HLT","RCL","CCL",
  "CAT","DE","HON","RTX","LMT","GD","NOC","BA","EMR","ETN",
  "ITW","PH","ROK","IR","AME","FTV","CARR","OTIS","TT","XYL",
  "XOM","CVX","COP","EOG","OXY","MPC","PSX","VLO","HES","SLB",
  "LIN","APD","SHW","PPG","ECL","IFF","ALB","FCX","NEM","NUE",
  "AMT","PLD","CCI","EQIX","DLR","SPG","O","WELL","VTR","AVB",
  "NEE","DUK","SO","D","EXC","AEP","SRE","XEL","WEC","ES",
  "UBER","ABNB","SHOP","SQ","SOFI","PLTR","ZS","OKTA","MDB","TTD",
];

// ── Default VCP screener config (mirrors Python DEFAULT_CONFIG) ──
const DEFAULT_CFG = {
  highPeriodDays:     252,
  proximityThreshold: 5.0,
  bbPeriod:           20,
  bbStd:              2.0,
  bbWidthThreshold:   8.0,
  bbContractionBars:  3,
  volumeMultiplier:   1.3,
  atrPeriod:          14,
  minBars:            200,
};

// ── State ─────────────────────────────────────────────────────────
let _screenerDB  = null;   // {updated, tickers: {AAPL: {d,o,h,l,c,v}}}
let _tickerCache = {};     // full-history JSON keyed by ticker symbol
let _signals     = [];     // last screener result
let _tradeReg    = [];     // indexed trade registry for modal lookup
let _equityChart = null;
let _modalChart  = null;
let _sortKey     = 'signalStrength';
let _sortAsc     = true;

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initClockET();
  renderChips(WATCHLIST);
  const endEl = document.getElementById('bt-end');
  if (endEl) endEl.value = new Date().toISOString().split('T')[0];
  loadScreenerDB();
});

// ── DOM helpers ───────────────────────────────────────────────────
function setText(id, v)  { const e = document.getElementById(id); if (e) e.textContent = v; }
function setHtml(id, v)  { const e = document.getElementById(id); if (e) e.innerHTML   = v; }
function show(id)        { const e = document.getElementById(id); if (e) e.style.display = ''; }
function hide(id)        { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
function fmt$(n)         { return '$' + Math.round(n).toLocaleString('en-US'); }
function fmtPct(n)       { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }

// ── Tab switching ─────────────────────────────────────────────────
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

// ── ET Clock + market open badge ──────────────────────────────────
function initClockET() {
  function tick() {
    const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    setText('clock', et.toTimeString().slice(0, 8) + ' ET');
    const h = et.getHours(), m = et.getMinutes(), d = et.getDay();
    const open = d >= 1 && d <= 5 && (h > 9 || (h === 9 && m >= 30)) && h < 16;
    const el = document.getElementById('stat-market');
    if (el) { el.textContent = open ? 'OPEN' : 'CLOSED'; el.className = 'stat-value ' + (open ? 'green' : 'red'); }
  }
  tick(); setInterval(tick, 1000);
}

// ── Connection/data badge ─────────────────────────────────────────
function setDataBadge(text, state) {
  const badge = document.getElementById('ws-badge');
  const label = document.getElementById('ws-label');
  if (label) label.textContent = text;
  if (badge) badge.className = 'ws-badge' + (state === 'ok' ? ' connected' : state === 'error' ? ' error' : '');
}

// ── Watchlist chip strip ──────────────────────────────────────────
function renderChips(tickers) {
  const body  = document.getElementById('ticker-chips-body');
  if (!body) return;
  body.innerHTML = tickers.map(t => `<span class="t-chip" id="chip-${t}">${t}</span>`).join('');
  setText('chips-count', tickers.length);
  setText('stat-watchlist', tickers.length);
}

function toggleChips() {
  document.getElementById('chips-wrap')?.classList.toggle('open');
}

// ── Load screener JSON ────────────────────────────────────────────
async function loadScreenerDB() {
  setDataBadge('Loading data…', '');
  try {
    const resp = await fetch('data/screener.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    _screenerDB = await resp.json();
    const count = Object.keys(_screenerDB.tickers || {}).length;
    if (count === 0) { showNoData(); return; }
    setDataBadge(`Data: ${_screenerDB.updated} — ${count} tickers`, 'ok');
    runScreener();
  } catch {
    setDataBadge('Data not available', 'error');
    showNoData();
  }
}

function showNoData() {
  setHtml('screener-body', `<tr><td colspan="8">
    <div class="empty-state">
      <div class="icon">⏳</div>
      <p>Market data not yet available.</p>
      <p style="font-size:14px;margin-top:8px;color:#6a8aaa">
        Data is updated daily after US market close by GitHub Actions.<br>
        Check the <strong>Actions</strong> tab on GitHub to trigger the first run.
      </p>
    </div></td></tr>`);
}

// ── Run screener over loaded JSON data ────────────────────────────
function runScreener() {
  if (!_screenerDB) return;
  _signals = [];
  for (const [ticker, raw] of Object.entries(_screenerDB.tickers || {})) {
    if (!raw?.c || raw.c.length < DEFAULT_CFG.minBars) continue;
    const sig = detectSignalFromRaw(ticker, raw);
    if (sig) _signals.push(sig);
  }
  renderScreenerTable(_signals);
  setText('stat-total',    _signals.length);
  setText('stat-strong',   _signals.filter(s => s.signalStrength === 'STRONG').length);
  setText('stat-moderate', _signals.filter(s => s.signalStrength === 'MODERATE').length);
  setText('stat-watch',    _signals.filter(s => s.signalStrength === 'WATCH').length);
  setText('last-update-time', _screenerDB.updated);
}

function triggerRefresh() { loadScreenerDB(); }

// ═══════════════════════════════════════════════════════════════════
//  INDICATORS  (exact match to Python indicators.py)
// ═══════════════════════════════════════════════════════════════════

// BB Width — population std (ddof=0), matches pandas default
function calcBBWidth(closes, period=20, nStd=2.0) {
  const n = closes.length;
  const out = new Array(n).fill(null);
  for (let i = period - 1; i < n; i++) {
    let sum = 0, sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) { sum += closes[j]; sumSq += closes[j] * closes[j]; }
    const mean = sum / period;
    const variance = Math.max(0, sumSq / period - mean * mean);
    out[i] = mean > 0 ? (2 * nStd * Math.sqrt(variance) / mean) * 100 : null;
  }
  return out;
}

// ATR — Wilder's EMA: alpha=1/period, adjust=False, min_periods=period
function calcATR(highs, lows, closes, period=14) {
  const n = closes.length;
  const out = new Array(n).fill(null);
  const alpha = 1 / period;
  let ema = null;
  for (let i = 0; i < n; i++) {
    const prevC = i > 0 ? closes[i - 1] : closes[i];
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - prevC), Math.abs(lows[i] - prevC));
    ema = ema === null ? tr : alpha * tr + (1 - alpha) * ema;
    if (i >= period - 1) out[i] = ema;
  }
  return out;
}

// Volume MA — shift(1).rolling(period).mean(): average of the previous `period` bars
function calcVolMA(volumes, period=20) {
  const n = volumes.length;
  const out = new Array(n).fill(null);
  for (let i = period; i < n; i++) {
    let sum = 0;
    for (let j = i - period; j < i; j++) sum += volumes[j];
    out[i] = sum / period;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════
//  VCP DETECTION  (mirrors Python vcp_detector.py)
// ═══════════════════════════════════════════════════════════════════

function classify(dist, bbw, vol) {
  let score = 0;
  if (dist >= 0) score += 2;      else if (dist > -1) score += 1;
  if (bbw  < 4.0) score += 2;    else if (bbw  < 5.5) score += 1;
  if (vol  > 2.5) score += 2;    else if (vol  > 1.8) score += 1;
  return score >= 5 ? 'STRONG' : score >= 3 ? 'MODERATE' : 'WATCH';
}

// Check VCP at the LAST bar of a raw ticker object (screener use)
function detectSignalFromRaw(ticker, raw, cfg=DEFAULT_CFG) {
  const { c: closes, h: highs, l: lows, v: volumes, d: dates } = raw;
  const n = closes.length;
  const i = n - 1;

  if (n < cfg.minBars) return null;

  // C1: proximity to N-day high
  const startH = Math.max(0, i - cfg.highPeriodDays + 1);
  let highN = -Infinity;
  for (let k = startH; k <= i; k++) highN = Math.max(highN, highs[k]);
  const distPct = (closes[i] - highN) / highN * 100;
  if (distPct < -cfg.proximityThreshold) return null;

  // C2: BB contraction for K bars
  const bbwArr = calcBBWidth(closes, cfg.bbPeriod, cfg.bbStd);
  for (let k = i - cfg.bbContractionBars + 1; k <= i; k++) {
    if (bbwArr[k] === null || bbwArr[k] >= cfg.bbWidthThreshold) return null;
  }

  // C3: volume spike
  const volMA = calcVolMA(volumes);
  if (volMA[i] === null || volMA[i] <= 0) return null;
  const volRatio = volumes[i] / volMA[i];
  if (volRatio < cfg.volumeMultiplier) return null;

  const atrArr = calcATR(highs, lows, closes, cfg.atrPeriod);
  return {
    ticker,
    currentPrice:        +closes[i].toFixed(2),
    distanceFromHighPct: +distPct.toFixed(2),
    bbWidthPct:          +(bbwArr[i] ?? 0).toFixed(2),
    atr14:               +(atrArr[i] ?? 0).toFixed(2),
    volumeRatio:         +volRatio.toFixed(2),
    highPeriodPrice:     +highN.toFixed(2),
    signalStrength:      classify(distPct, bbwArr[i] ?? 0, volRatio),
    detectedAt:          dates?.[i] ?? '',
  };
}

// Check VCP at an arbitrary bar index i within pre-computed indicator arrays
function isSignalAt(closes, highs, volumes, bbwArr, volMAArr, i, cfg) {
  const minRequired = Math.max(cfg.minBars, cfg.highPeriodDays + cfg.bbContractionBars);
  if (i < minRequired) return false;

  // C1
  const startH = Math.max(0, i - cfg.highPeriodDays + 1);
  let highN = -Infinity;
  for (let k = startH; k <= i; k++) highN = Math.max(highN, highs[k]);
  if ((closes[i] - highN) / highN * 100 < -cfg.proximityThreshold) return false;

  // C2
  for (let k = i - cfg.bbContractionBars + 1; k <= i; k++) {
    if (bbwArr[k] === null || bbwArr[k] >= cfg.bbWidthThreshold) return false;
  }

  // C3
  if (volMAArr[i] === null || volMAArr[i] <= 0) return false;
  if (volumes[i] / volMAArr[i] < cfg.volumeMultiplier) return false;

  return true;
}

// ── Screener table ────────────────────────────────────────────────
const STRENGTH_ORDER = { STRONG: 3, MODERATE: 2, WATCH: 1 };

function sortTable(key) {
  if (_sortKey === key) _sortAsc = !_sortAsc; else { _sortKey = key; _sortAsc = true; }
  renderScreenerTable(_signals);
}

function renderScreenerTable(sigs) {
  const tbody = document.getElementById('screener-body');
  if (!tbody) return;

  if (!sigs?.length) {
    tbody.innerHTML = `<tr><td colspan="8">
      <div class="empty-state">
        <div class="icon">🔍</div>
        <p>No VCP signals found in today's data</p>
        <p style="font-size:14px;margin-top:6px;color:#6a8aaa">Check back after US market close (18:00 ET weekdays)</p>
      </div></td></tr>`;
    return;
  }

  const sorted = [...sigs].sort((a, b) => {
    let va = a[_sortKey], vb = b[_sortKey];
    if (_sortKey === 'signalStrength') { va = STRENGTH_ORDER[a.signalStrength] || 0; vb = STRENGTH_ORDER[b.signalStrength] || 0; }
    if (_sortKey === 'ticker') return _sortAsc ? a.ticker.localeCompare(b.ticker) : b.ticker.localeCompare(a.ticker);
    return _sortAsc ? va - vb : vb - va;
  });

  tbody.innerHTML = sorted.map(s => {
    const distCls = s.distanceFromHighPct >= 0 ? 'positive' : s.distanceFromHighPct > -2 ? 'yellow' : 'negative';
    const volCls  = s.volumeRatio >= 2 ? 'positive' : s.volumeRatio >= 1.5 ? 'yellow' : '';
    const barW    = Math.min(90, Math.round((s.volumeRatio - 1) * 40));
    return `<tr>
      <td class="ticker-cell"><span style="cursor:pointer;color:#4db8ff" onclick="openChartModal('${s.ticker}',null)">${s.ticker}</span></td>
      <td class="price-cell">$${s.currentPrice.toFixed(2)}</td>
      <td class="${distCls}">${s.distanceFromHighPct >= 0 ? '+' : ''}${s.distanceFromHighPct.toFixed(2)}%</td>
      <td class="neutral">${s.bbWidthPct.toFixed(2)}%</td>
      <td class="neutral">${s.atr14.toFixed(2)}</td>
      <td><div class="volume-bar-wrap"><span class="${volCls}">${s.volumeRatio.toFixed(2)}×</span>
          <div class="volume-bar" style="width:${barW}px"></div></div></td>
      <td><span class="badge badge-${s.signalStrength}">${s.signalStrength}</span></td>
      <td style="font-size:14px;color:#6a8aaa">${s.detectedAt}</td>
    </tr>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════
//  BACKTESTING ENGINE  (mirrors Python backtest.py)
// ═══════════════════════════════════════════════════════════════════

async function runBacktest() {
  const tickersRaw = (document.getElementById('bt-tickers')?.value || '').trim();
  const startDate  = document.getElementById('bt-start')?.value;
  const endDate    = document.getElementById('bt-end')?.value;

  if (!startDate || !endDate) { showToast('Please select start and end dates', 'error'); return; }

  const upper = tickersRaw.toUpperCase();
  const tickers = (!tickersRaw || upper.includes('ALL') || upper.includes('TUTTI'))
    ? [...WATCHLIST]
    : tickersRaw.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);

  const cfg = {
    startDate, endDate,
    initialCapital:           parseFloat(document.getElementById('bt-capital')?.value  || 100000),
    positionSizeUsd:          parseFloat(document.getElementById('bt-position')?.value || 10000),
    maxOpenPositions:         parseInt(document.getElementById('bt-max-pos')?.value    || 5),
    highPeriodDays:           parseInt(document.getElementById('bt-high-period')?.value || 252),
    proximityThreshold:       5.0,
    bbPeriod:                 20,
    bbStdDev:                 2.0,
    bbWidthThresholdPct:      parseFloat(document.getElementById('bt-bb-width')?.value || 8.0),
    bbContractionBars:        parseInt(document.getElementById('bt-bb-bars')?.value    || 3),
    volumeMultiplier:         parseFloat(document.getElementById('bt-vol-mult')?.value || 1.3),
    atrPeriod:                14,
    stopLossAtrMultiplier:    parseFloat(document.getElementById('bt-stop')?.value     || 1.5),
    trailingStopAtrMultiplier:parseFloat(document.getElementById('bt-trail')?.value    || 2.0),
    useTrailingStop:          document.getElementById('bt-trailing')?.checked ?? true,
    maxHoldingDays:           parseInt(document.getElementById('bt-maxhold')?.value    || 60),
    minBars:                  Math.max(200, parseInt(document.getElementById('bt-high-period')?.value || 252) + 30),
  };

  show('bt-progress');
  hide('results-placeholder');
  hide('results-content');
  setText('bt-progress-label',   'Downloading per-ticker data…');
  setText('bt-progress-counter', `0 / ${tickers.length}`);
  document.getElementById('bt-progress-fill').style.width = '0%';
  setText('bt-progress-ticker',  '↓ loading…');

  // ── Download all ticker data in parallel ──────────────────────
  let loaded = 0;
  const dataMap = {};

  await Promise.all(tickers.map(async ticker => {
    try {
      if (_tickerCache[ticker]) {
        dataMap[ticker] = _tickerCache[ticker];
      } else {
        const resp = await fetch(`data/${ticker}.json`);
        if (resp.ok) {
          const data = await resp.json();
          _tickerCache[ticker] = data;
          dataMap[ticker] = data;
        }
      }
    } catch { /* skip missing tickers */ }
    loaded++;
    const pct = Math.round(loaded / tickers.length * 100);
    setText('bt-progress-counter', `${loaded} / ${tickers.length}`);
    document.getElementById('bt-progress-fill').style.width = pct + '%';
    setText('bt-progress-ticker', '↓ ' + ticker);
  }));

  setText('bt-progress-label', 'Running backtest…');
  await new Promise(r => setTimeout(r, 0));   // yield to let browser repaint

  // ── Run per-ticker simulation ─────────────────────────────────
  const allTrades = [];
  for (const ticker of tickers) {
    const raw = dataMap[ticker];
    if (!raw?.c) continue;
    try { allTrades.push(...runTickerBacktest(ticker, raw, cfg)); }
    catch (e) { console.warn('Backtest error', ticker, e); }
  }

  allTrades.sort((a, b) => a.entryDate.localeCompare(b.entryDate));

  const maxPos = cfg.maxOpenPositions;
  const finalTrades = maxPos > 0 ? filterMaxPositions(allTrades, maxPos) : allTrades;

  const result = computeMetrics(finalTrades, cfg.initialCapital, cfg.positionSizeUsd, maxPos);

  hide('bt-progress');
  renderResults(result);
}

// ── Per-ticker simulation (mirrors Python _run_ticker) ────────────
function runTickerBacktest(ticker, raw, cfg) {
  const opens   = raw.o, highs = raw.h, lows = raw.l;
  const closes  = raw.c, volumes = raw.v, dates = raw.d;
  const n = closes.length;
  if (n < 60) return [];

  // Pre-compute indicators once (O(n) each)
  const bbwArr = calcBBWidth(closes, cfg.bbPeriod, cfg.bbStdDev);
  const atrArr = calcATR(highs, lows, closes, cfg.atrPeriod);
  const volMA  = calcVolMA(volumes);

  // Locate start/end bar indices by date string comparison
  let startIdx = -1, endIdx = -1;
  for (let i = 0; i < n; i++) {
    if (dates[i] >= cfg.startDate && startIdx === -1) startIdx = i;
    if (dates[i] <= cfg.endDate) endIdx = i;
  }
  if (startIdx === -1 || endIdx === -1) return [];

  const scanCfg = {
    highPeriodDays:    cfg.highPeriodDays,
    proximityThreshold:cfg.proximityThreshold,
    bbWidthThreshold:  cfg.bbWidthThresholdPct,
    bbContractionBars: cfg.bbContractionBars,
    volumeMultiplier:  cfg.volumeMultiplier,
    minBars:           cfg.minBars,
  };

  const trades = [];
  let inPos = false;
  let entryPx = 0, stopLoss = 0, highest = 0, entryAtr = 0;
  let shares = 0, entryDateStr = '', entryIdxLocal = 0;

  let i = startIdx;
  while (i <= endIdx) {
    const curOpen = opens[i], curHigh = highs[i], curLow = lows[i], curClose = closes[i];

    if (!inPos) {
      if (isSignalAt(closes, highs, volumes, bbwArr, volMA, i, scanCfg) && i + 1 <= endIdx) {
        entryPx = opens[i + 1];
        shares  = entryPx > 0 ? Math.floor(cfg.positionSizeUsd / entryPx) : 0;
        if (shares === 0) { i++; continue; }
        entryAtr      = atrArr[i] ?? (curHigh - curLow);
        stopLoss      = entryPx - cfg.stopLossAtrMultiplier * entryAtr;
        highest       = entryPx;
        entryIdxLocal = i + 1;
        entryDateStr  = dates[i + 1];
        inPos = true;
        i += 2;
        continue;
      }
    } else {
      highest = Math.max(highest, curHigh);
      const trail      = cfg.useTrailingStop ? highest - cfg.trailingStopAtrMultiplier * entryAtr : stopLoss;
      const activeStop = Math.max(stopLoss, trail);

      const heldDays   = i - entryIdxLocal;
      const stopHit    = curLow <= activeStop;
      const maxHoldHit = cfg.maxHoldingDays > 0 && heldDays >= cfg.maxHoldingDays;
      const endReached = i === endIdx;

      if (stopHit || maxHoldHit || endReached) {
        let exitPx, reason;
        if (stopHit)      { exitPx = Math.max(activeStop, curOpen); reason = trail > stopLoss ? 'TRAILING_STOP' : 'STOP_LOSS'; }
        else if (maxHoldHit) { exitPx = curClose; reason = 'MAX_HOLD'; }
        else                 { exitPx = curClose; reason = 'END_OF_TEST'; }

        const retPct = (exitPx - entryPx) / entryPx * 100;
        trades.push({
          ticker,
          entryDate:     entryDateStr,
          exitDate:      dates[i],
          entryPrice:    +entryPx.toFixed(2),
          exitPrice:     +exitPx.toFixed(2),
          stopLossPrice: +stopLoss.toFixed(2),
          returnPct:     +retPct.toFixed(2),
          pnlUsd:        +((exitPx - entryPx) * shares).toFixed(2),
          investedUsd:   +(entryPx * shares).toFixed(2),
          shares,
          holdingDays:   heldDays,
          exitReason:    reason,
          winner:        retPct > 0,
          // raw arrays sliced around the trade (for chart modal)
          _rawRef:       { ticker, entryDate: entryDateStr, exitDate: dates[i] },
        });
        inPos = false;
      }
    }
    i++;
  }
  return trades;
}

// ── Greedy max-positions filter (mirrors Python _filter_max_positions) ──
function filterMaxPositions(trades, maxPos) {
  const accepted = [];
  for (const trade of trades) {
    const entry   = trade.entryDate;
    const openNow = accepted.filter(t => t.entryDate <= entry && entry <= t.exitDate).length;
    if (openNow < maxPos) accepted.push(trade);
  }
  return accepted;
}

// ── Compute aggregate metrics (mirrors Python _compute_metrics) ───
function computeMetrics(trades, initialCapital, positionSizeUsd, maxOpenPos) {
  if (!trades.length) {
    return {
      errorMessage: 'No signals found in the selected period. Try a wider date range or relaxed filters.',
      totalTrades: 0, initialCapital, finalCapital: initialCapital,
      equityCurve: [initialCapital], equityLabels: ['Start'], trades: [],
    };
  }

  const wins   = trades.filter(t => t.winner);
  const losses = trades.filter(t => !t.winner);
  const n      = trades.length;

  const grossProfit  = wins.reduce((s, t) => s + t.returnPct, 0);
  const grossLoss    = Math.abs(losses.reduce((s, t) => s + t.returnPct, 0));
  const winRate      = wins.length / n * 100;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit;
  const avgWin       = wins.length   ? grossProfit / wins.length   : 0;
  const avgLoss      = losses.length ? grossLoss   / losses.length : 0;
  const expectancy   = (winRate / 100) * avgWin - (1 - winRate / 100) * avgLoss;

  // Dollar equity curve
  const equity = [initialCapital], labels = ['Start'];
  let current = initialCapital;
  for (const t of trades) {
    current += t.pnlUsd;
    equity.push(+current.toFixed(2));
    labels.push(`${t.exitDate} ${t.ticker}`);
  }
  const totalReturnPct = (current - initialCapital) / initialCapital * 100;

  let peak = initialCapital, maxDD = 0;
  for (const eq of equity) { peak = Math.max(peak, eq); maxDD = Math.max(maxDD, (peak - eq) / peak * 100); }

  const totalPnl = trades.reduce((s, t) => s + t.pnlUsd, 0);

  // Daily deployed capital (for metric ③)
  const dailyDep = {};
  for (const t of trades) {
    let d = new Date(t.entryDate), end = new Date(t.exitDate);
    while (d <= end) {
      const k = d.toISOString().slice(0, 10);
      dailyDep[k] = (dailyDep[k] || 0) + t.investedUsd;
      d.setDate(d.getDate() + 1);
    }
  }
  const depByYear = {};
  for (const [k, v] of Object.entries(dailyDep)) {
    const y = k.slice(0, 4);
    if (!depByYear[y]) depByYear[y] = [];
    depByYear[y].push(v);
  }
  const avgDepByYear = {};
  for (const [y, vals] of Object.entries(depByYear))
    avgDepByYear[y] = vals.reduce((s, v) => s + v, 0) / vals.length;

  const vals = Object.values(dailyDep);
  const effMaxPos  = maxOpenPos > 0 ? maxOpenPos : Math.max(1, Math.round((vals.length ? Math.max(...vals) : 0) / positionSizeUsd));
  const maxCapRisk = positionSizeUsd * effMaxPos;

  // Annual & monthly stats
  const annMap = {}, monMap = {};
  for (const t of trades) {
    const yr  = t.exitDate.slice(0, 4);
    const mon = String(parseInt(t.exitDate.slice(5, 7)));
    if (!annMap[yr]) annMap[yr] = { n: 0, w: 0, pnl: 0 };
    annMap[yr].n++; annMap[yr].w += t.winner ? 1 : 0; annMap[yr].pnl += t.pnlUsd;
    const mk = `${yr}-${mon}`;
    if (!monMap[mk]) monMap[mk] = { yr, mon, n: 0, w: 0, pnl: 0 };
    monMap[mk].n++; monMap[mk].w += t.winner ? 1 : 0; monMap[mk].pnl += t.pnlUsd;
  }

  const annualStats = Object.keys(annMap).sort().map(yr => {
    const d   = annMap[yr], avgDep = avgDepByYear[yr] || 0;
    const roi1 = initialCapital  > 0 ? +(d.pnl / initialCapital * 100).toFixed(2) : 0;
    const roi2 = maxCapRisk      > 0 ? +(d.pnl / maxCapRisk * 100).toFixed(2)     : 0;
    const roi3 = avgDep          > 0 ? +(d.pnl / avgDep * 100).toFixed(2)         : 0;
    return {
      year: parseInt(yr), trades: d.n, wins: d.w, losses: d.n - d.w,
      winRate:               +(d.w / d.n * 100).toFixed(1),
      pnlUsd:                +d.pnl.toFixed(0),
      roiOnInitialCapPct:    roi1, roiOnMaxRiskCapPct: roi2, roiOnAvgDeployedPct: roi3,
      avgDeployedUsd:        +avgDep.toFixed(0),
    };
  });

  const monthlyStats = {};
  for (const [mk, d] of Object.entries(monMap)) {
    const [yr, mon] = mk.split('-');
    if (!monthlyStats[yr]) monthlyStats[yr] = {};
    monthlyStats[yr][mon] = { trades: d.n, wins: d.w, pnlUsd: +d.pnl.toFixed(0), winRate: +(d.w / d.n * 100).toFixed(1) };
  }

  return {
    totalTrades: n, winningTrades: wins.length, losingTrades: losses.length,
    winRate: +winRate.toFixed(2), profitFactor: +profitFactor.toFixed(2),
    maxDrawdownPct: +maxDD.toFixed(2), totalReturnPct: +totalReturnPct.toFixed(2),
    totalPnlUsd: +totalPnl.toFixed(2),
    avgWinPct: +avgWin.toFixed(2), avgLossPct: +avgLoss.toFixed(2),
    expectancyPct: +expectancy.toFixed(2),
    initialCapital, finalCapital: +current.toFixed(2),
    equityCurve: equity, equityLabels: labels,
    trades, annualStats, monthlyStats,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  RESULTS RENDERING
// ═══════════════════════════════════════════════════════════════════

function renderResults(result) {
  show('results-content');
  hide('results-placeholder');

  if (result.errorMessage) {
    setHtml('metrics-grid', `<div style="grid-column:1/-1;padding:20px;color:#e74c3c">${result.errorMessage}</div>`);
    hide('annual-section'); hide('monthly-section');
    renderEquityChart(result.equityCurve, result.equityLabels);
    setHtml('trades-body', '<tr><td colspan="10" style="text-align:center;color:#6a8aaa">No trades</td></tr>');
    return;
  }

  const pnlCls = result.totalPnlUsd >= 0 ? 'green' : 'red';
  const retCls = result.totalReturnPct >= 0 ? 'green' : 'red';
  const ddCls  = result.maxDrawdownPct > 20 ? 'red' : result.maxDrawdownPct > 10 ? 'yellow' : 'green';
  const pfCls  = result.profitFactor >= 1.5 ? 'green' : result.profitFactor >= 1 ? 'yellow' : 'red';
  const wrCls  = result.winRate >= 50 ? 'green' : result.winRate >= 40 ? 'yellow' : 'red';

  setHtml('metrics-grid', `
    <div class="metric-card"><div class="metric-label">Total P&L</div><div class="metric-value ${pnlCls}">${fmt$(result.totalPnlUsd)}</div></div>
    <div class="metric-card"><div class="metric-label">Total Return</div><div class="metric-value ${retCls}">${fmtPct(result.totalReturnPct)}</div></div>
    <div class="metric-card"><div class="metric-label">Max Drawdown</div><div class="metric-value ${ddCls}">${result.maxDrawdownPct.toFixed(1)}%</div></div>
    <div class="metric-card"><div class="metric-label">Profit Factor</div><div class="metric-value ${pfCls}">${result.profitFactor.toFixed(2)}</div></div>
    <div class="metric-card"><div class="metric-label">Win Rate</div><div class="metric-value ${wrCls}">${result.winRate.toFixed(1)}%</div></div>
    <div class="metric-card"><div class="metric-label">Total Trades</div><div class="metric-value">${result.totalTrades}</div></div>
    <div class="metric-card"><div class="metric-label">Winners</div><div class="metric-value green">${result.winningTrades}</div></div>
    <div class="metric-card"><div class="metric-label">Losers</div><div class="metric-value red">${result.losingTrades}</div></div>
    <div class="metric-card"><div class="metric-label">Avg Win %</div><div class="metric-value green">+${result.avgWinPct.toFixed(2)}%</div></div>
    <div class="metric-card"><div class="metric-label">Avg Loss %</div><div class="metric-value red">-${result.avgLossPct.toFixed(2)}%</div></div>
    <div class="metric-card"><div class="metric-label">Expectancy</div><div class="metric-value ${result.expectancyPct >= 0 ? 'green' : 'red'}">${fmtPct(result.expectancyPct)}</div></div>
    <div class="metric-card"><div class="metric-label">Final Capital</div><div class="metric-value ${pnlCls}">${fmt$(result.finalCapital)}</div></div>
  `);

  renderEquityChart(result.equityCurve, result.equityLabels);
  renderTradesTable(result.trades);
  renderAnnualTable(result.annualStats);
  renderMonthlyGrid(result.monthlyStats);
}

function renderEquityChart(curve, labels) {
  const ctx = document.getElementById('equity-chart');
  if (!ctx) return;
  if (_equityChart) { _equityChart.destroy(); _equityChart = null; }
  const initial = curve[0];
  _equityChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Equity ($)', data: curve,
        borderColor: '#4db8ff', backgroundColor: 'rgba(77,184,255,0.07)',
        borderWidth: 2, pointRadius: 0, fill: true, tension: 0.3,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: {
        label: c => '$' + Math.round(c.raw).toLocaleString('en-US'),
        title: c => c[0].label,
      }}},
      scales: {
        x: { display: false },
        y: { grid: { color: '#1e3050' }, ticks: { color: '#a8c0d8', callback: v => '$' + Math.round(v / 1000) + 'K' } }
      }
    }
  });
}

function renderTradesTable(trades) {
  const tbody = document.getElementById('trades-body');
  if (!tbody) return;
  if (!trades.length) { tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#6a8aaa">No trades</td></tr>'; return; }

  // Store in registry so chart modal can look them up by index
  _tradeReg = [...trades].reverse();

  tbody.innerHTML = _tradeReg.map((t, idx) => {
    const cls  = t.winner ? 'positive' : 'negative';
    const sign = t.winner ? '+' : '';
    return `<tr>
      <td class="ticker-cell"><span style="cursor:pointer;color:#4db8ff" onclick="openChartModal('${t.ticker}',${idx})">${t.ticker}</span></td>
      <td style="font-size:14px">${t.entryDate}</td>
      <td style="font-size:14px">${t.exitDate}</td>
      <td class="price-cell" style="font-size:15px">$${t.entryPrice.toFixed(2)}</td>
      <td class="price-cell" style="font-size:15px">$${t.exitPrice.toFixed(2)}</td>
      <td style="font-size:15px">${t.shares}</td>
      <td class="${cls}">${sign}${fmt$(t.pnlUsd)}</td>
      <td class="${cls}">${sign}${t.returnPct.toFixed(2)}%</td>
      <td style="font-size:15px;color:#6a8aaa">${t.holdingDays}d</td>
      <td style="font-size:13px;color:#6a8aaa">${fmtReason(t.exitReason)}</td>
    </tr>`;
  }).join('');
}

function fmtReason(r) {
  return { STOP_LOSS:'Stop Loss', TRAILING_STOP:'Trail Stop', MAX_HOLD:'Max Hold', END_OF_TEST:'End of Test' }[r] ?? r;
}

function renderAnnualTable(stats) {
  const sec = document.getElementById('annual-section');
  if (!sec) return;
  if (!stats?.length) { sec.style.display = 'none'; return; }
  sec.style.display = '';
  const tbody = document.getElementById('annual-body');
  const p = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  tbody.innerHTML = stats.map(s => {
    const c = s.pnlUsd >= 0 ? 'positive' : 'negative';
    return `<tr>
      <td>${s.year}</td><td>${s.trades}</td>
      <td class="positive">${s.wins}</td><td class="negative">${s.losses}</td>
      <td>${s.winRate.toFixed(1)}%</td>
      <td class="${c}">${s.pnlUsd >= 0 ? '+' : ''}${fmt$(s.pnlUsd)}</td>
      <td class="${s.roiOnInitialCapPct >= 0 ? 'positive' : 'negative'}">${p(s.roiOnInitialCapPct)}</td>
      <td class="${s.roiOnMaxRiskCapPct >= 0 ? 'positive' : 'negative'}">${p(s.roiOnMaxRiskCapPct)}</td>
      <td class="${s.roiOnAvgDeployedPct >= 0 ? 'positive' : 'negative'}">${p(s.roiOnAvgDeployedPct)}</td>
      <td class="neutral">${fmt$(s.avgDeployedUsd)}</td>
    </tr>`;
  }).join('');
}

function renderMonthlyGrid(monthlyStats) {
  const sec = document.getElementById('monthly-section');
  if (!sec || !monthlyStats) { sec && (sec.style.display = 'none'); return; }
  const years = Object.keys(monthlyStats).sort();
  if (!years.length) { sec.style.display = 'none'; return; }
  sec.style.display = '';
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let html = `<table class="monthly-table"><thead><tr><th>Year</th>${MONTHS.map(m=>`<th>${m}</th>`).join('')}<th>Total</th></tr></thead><tbody>`;
  for (const yr of years) {
    const yd  = monthlyStats[yr];
    const tot = Object.values(yd).reduce((s, v) => s + v.pnlUsd, 0);
    const tc  = tot >= 0 ? 'positive' : 'negative';
    html += `<tr><td>${yr}</td>`;
    for (let m = 1; m <= 12; m++) {
      const md = yd[String(m)];
      if (!md) { html += `<td class="month-cell-empty">·</td>`; continue; }
      const cls = md.pnlUsd >= 0 ? 'positive' : 'negative';
      html += `<td><div class="month-pnl ${cls}">${md.pnlUsd >= 0 ? '+' : ''}${fmt$(md.pnlUsd)}</div>
               <div class="month-sub">${md.trades}t&nbsp;·&nbsp;${md.winRate}%</div></td>`;
    }
    html += `<td class="${tc}"><strong>${tot >= 0 ? '+' : ''}${fmt$(tot)}</strong></td></tr>`;
  }
  html += '</tbody></table>';
  setHtml('monthly-grid', html);
}

// ═══════════════════════════════════════════════════════════════════
//  CHART MODAL
// ═══════════════════════════════════════════════════════════════════

// tradeIdx: index into _tradeReg (or null for screener click)
async function openChartModal(ticker, tradeIdx) {
  const modal = document.getElementById('chart-modal');
  if (!modal) return;

  setText('modal-ticker', ticker);
  const yfLink = document.getElementById('modal-yf-link');
  if (yfLink) yfLink.href = `https://finance.yahoo.com/chart/${ticker}`;

  const trade  = (tradeIdx !== null && tradeIdx !== undefined) ? _tradeReg[tradeIdx] : null;
  const infoEl = document.getElementById('modal-trade-info');
  if (infoEl) {
    infoEl.innerHTML = trade ? `
      <span><span class="info-lbl">Entry</span> <span class="info-val">${trade.entryDate}</span></span>
      <span><span class="info-lbl">Exit</span>  <span class="info-val">${trade.exitDate}</span></span>
      <span><span class="info-lbl">Entry $</span><span class="info-val">$${trade.entryPrice.toFixed(2)}</span></span>
      <span><span class="info-lbl">Exit $</span> <span class="info-val">$${trade.exitPrice.toFixed(2)}</span></span>
      <span><span class="info-lbl">P&amp;L</span>
        <span class="info-val ${trade.winner ? 'positive' : 'negative'}">${trade.pnlUsd >= 0 ? '+' : ''}${fmt$(trade.pnlUsd)}
        (${trade.returnPct >= 0 ? '+' : ''}${trade.returnPct.toFixed(2)}%)</span></span>
      <span><span class="info-lbl">Reason</span><span class="info-val">${fmtReason(trade.exitReason)}</span></span>
    ` : '';
  }

  modal.style.display = 'flex';

  // Load OHLCV data
  let raw = _tickerCache[ticker] || _screenerDB?.tickers?.[ticker] || null;
  if (!raw) {
    try {
      const resp = await fetch(`data/${ticker}.json`);
      if (resp.ok) { raw = await resp.json(); _tickerCache[ticker] = raw; }
    } catch { /* no chart */ }
  }

  const wrap = document.getElementById('modal-chart-wrap');
  if (!raw) {
    if (wrap) wrap.innerHTML = '<div style="height:420px;display:flex;align-items:center;justify-content:center;color:#6a8aaa">No price data available</div>';
    return;
  }

  // Show last 180 bars (or a window around the trade)
  const n = raw.c.length;
  let sliceEnd = n;
  let sliceStart = Math.max(0, n - 180);

  if (trade) {
    const exitIdx = raw.d ? raw.d.lastIndexOf(trade.exitDate) : -1;
    if (exitIdx > 0) {
      sliceEnd   = Math.min(n, exitIdx + 20);
      sliceStart = Math.max(0, exitIdx - 160);
    }
  }

  const closes = raw.c.slice(sliceStart, sliceEnd);
  const labels = raw.d?.slice(sliceStart, sliceEnd) ?? closes.map((_, k) => String(k));

  // Annotations: entry / exit / stop
  if (wrap && !wrap.querySelector('canvas')) {
    wrap.innerHTML = '<canvas id="modal-chart-canvas"></canvas>';
  }
  const canvas = document.getElementById('modal-chart-canvas');
  if (!canvas) return;
  if (_modalChart) { _modalChart.destroy(); _modalChart = null; }

  const datasets = [{
    label: ticker, data: closes,
    borderColor: '#4db8ff', backgroundColor: 'rgba(77,184,255,0.05)',
    borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.1,
  }];

  // Entry/exit/stop lines as point datasets
  if (trade && raw.d) {
    const entryIdx = raw.d.indexOf(trade.entryDate) - sliceStart;
    const exitIdx2 = raw.d.lastIndexOf(trade.exitDate) - sliceStart;
    if (entryIdx >= 0) {
      const entryPts = closes.map((_, k) => k === entryIdx ? trade.entryPrice : null);
      datasets.push({ label: 'Entry', data: entryPts, borderColor:'#2ecc71', backgroundColor:'#2ecc71', pointRadius: closes.map((_, k) => k === entryIdx ? 7 : 0), showLine: false });
      const stopPts  = closes.map((_, k) => k >= entryIdx && k <= exitIdx2 ? trade.stopLossPrice : null);
      datasets.push({ label: 'Stop', data: stopPts, borderColor:'#e74c3c', borderDash:[4,4], borderWidth:1, pointRadius:0, fill:false, tension:0 });
    }
    if (exitIdx2 >= 0) {
      const exitPts = closes.map((_, k) => k === exitIdx2 ? trade.exitPrice : null);
      datasets.push({ label: 'Exit', data: exitPts, borderColor:'#f1c40f', backgroundColor:'#f1c40f', pointRadius: closes.map((_, k) => k === exitIdx2 ? 7 : 0), showLine: false });
    }
  }

  _modalChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: { display: !!trade, labels: { color: '#a8c0d8', font: { size: 12 } } },
        tooltip: { callbacks: { label: c => `$${c.raw?.toFixed?.(2) ?? c.raw}` } }
      },
      scales: {
        x: { ticks: { color: '#6a8aaa', maxTicksLimit: 8 }, grid: { color: '#1e3050' } },
        y: { ticks: { color: '#a8c0d8', callback: v => '$' + v.toFixed(0) }, grid: { color: '#1e3050' } }
      }
    }
  });
}

function closeChartModal() {
  const modal = document.getElementById('chart-modal');
  if (modal) modal.style.display = 'none';
  if (_modalChart) { _modalChart.destroy(); _modalChart = null; }
}

function modalBackdropClick(e) { if (e.target === e.currentTarget) closeChartModal(); }

// ── Toast notifications ───────────────────────────────────────────
function showToast(msg, type = 'info') {
  const el  = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container')?.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
