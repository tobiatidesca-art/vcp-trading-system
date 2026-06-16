/* =================================================================
   VCP Trading System — Static Edition (GitHub Pages)
   All computation runs in the browser; data is loaded from JSON
   files generated daily by GitHub Actions (scripts/fetch_data.py).
   ================================================================= */
'use strict';

// ── Market definitions ────────────────────────────────────────────
const MARKET_DEFS = {
  US: { label: '🇺🇸 USA',         tickers: [
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
  ]},
  IT: { label: '🇮🇹 Italy',       tickers: [
    "ENI.MI","ENEL.MI","ISP.MI","UCG.MI","STM.MI","G.MI","PRY.MI",
    "MB.MI","LDO.MI","RACE.MI","MONC.MI","FBK.MI","BAMI.MI","BPE.MI",
    "NEXI.MI","PIRC.MI","TRN.MI","SRG.MI","A2A.MI","HER.MI","SPM.MI",
    "TEN.MI","AZM.MI","DIA.MI","AMP.MI","REC.MI","BC.MI","BZU.MI",
    "STLAM.MI","TIT.MI","PST.MI","ERG.MI","INWIT.MI","IP.MI",
    "SFER.MI","BMPS.MI",
  ]},
  DE: { label: '🇩🇪 Germany',     tickers: [
    "SAP.DE","SIE.DE","ALV.DE","BMW.DE","MBG.DE","BAYN.DE","BAS.DE",
    "DTE.DE","DB1.DE","MUV2.DE","VOW3.DE","ADS.DE","RWE.DE","HEN3.DE",
    "EOAN.DE","DHL.DE","DBK.DE","IFX.DE","ENR.DE","MTX.DE",
    "CON.DE","MRK.DE","FRE.DE","FME.DE","BEI.DE","SHL.DE","P911.DE",
    "PAH3.DE","SY1.DE","PUM.DE","CBK.DE","ZAL.DE","VNA.DE",
    "QIA.DE","AFX.DE","HEI.DE",
  ]},
  FR: { label: '🇫🇷 France',      tickers: [
    "MC.PA","AIR.PA","TTE.PA","SAN.PA","BNP.PA","OR.PA","SU.PA",
    "AI.PA","RI.PA","GLE.PA","ACA.PA","CAP.PA","CS.PA","DG.PA",
    "EL.PA","HO.PA","KER.PA","LR.PA","ORA.PA","PUB.PA","RMS.PA",
    "RNO.PA","SAF.PA","SGO.PA","VIE.PA","VIV.PA","DSY.PA","ENGI.PA",
    "ERF.PA","CA.PA","BVI.PA","SW.PA","EN.PA","ML.PA","WLN.PA",
  ]},
  ES: { label: '🇪🇸 Spain',       tickers: [
    "SAN.MC","ITX.MC","IBE.MC","TEF.MC","BBVA.MC","REP.MC","ACS.MC",
    "FER.MC","AENA.MC","REE.MC","ENG.MC","MAP.MC","NTGY.MC","SAB.MC",
    "BKT.MC","ELE.MC","CLNX.MC","IAG.MC","IDR.MC","MRL.MC","CABK.MC",
    "GRF.MC","ACX.MC","VIS.MC","ANA.MC","LOG.MC","COL.MC","CIE.MC",
    "UNI.MC","PHM.MC",
  ]},
  NL: { label: '🇳🇱 Netherlands', tickers: [
    "ASML.AS","HEIA.AS","ING.AS","PHIA.AS","SHELL.AS","UNA.AS",
    "ABN.AS","AH.AS","AKZA.AS","ASRNL.AS","NN.AS","PRX.AS",
    "RAND.AS","REN.AS","WKL.AS","DSMN.AS","IMCD.AS","ADYEN.AS",
    "AGN.AS","BESI.AS","KPN.AS","SBM.AS","URW.AS","VPK.AS","OCI.AS",
  ]},
};

// ── GitHub repo (for Actions dispatch) ───────────────────────────
const GH_OWNER = 'tobiatidesca-art';
const GH_REPO  = 'vcp-trading-system';

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
let _activeMarkets    = ['US']; // market codes currently selected
let _screenerDB       = null;   // merged screener data for active markets
let _tickerCache      = {};     // full-history JSON keyed by ticker symbol
let _signals          = [];     // last screener result
let _tradeReg         = [];     // all trades reversed — used by chart modal (index = onclick arg)
let _lastTrades       = [];     // all trades chronological — for filter recomputation
let _lastResult       = null;   // full metrics result — restored when filter is cleared
let _lastCfg          = null;   // backtest cfg — needed to recompute metrics on filter
let _divFilterActive  = false;  // true when "with dividends only" filter is on
let _filterTicker     = '';     // trade list ticker filter (empty = all)
let _filterMaxDivDays = null;   // max calendar days entry→first dividend (null = no filter)
let _equityChart      = null;
let _modalChart       = null;
let _subChart         = null;
let _sortKey          = 'signalStrength';
let _sortAsc          = true;

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initClockET();
  renderMarketSelector();
  renderChips([]);
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

// ── Market selector ───────────────────────────────────────────────
function renderMarketSelector() {
  const el = document.getElementById('market-selector');
  if (!el) return;
  el.innerHTML = Object.entries(MARKET_DEFS).map(([code, def]) => {
    const on = _activeMarkets.includes(code);
    return `<button class="market-btn${on ? ' active' : ''}" onclick="toggleMarket('${code}')" title="${on ? 'Deselect' : 'Add'} ${code}">${def.label}</button>`;
  }).join('');
}

function toggleMarket(code) {
  if (_activeMarkets.includes(code)) {
    if (_activeMarkets.length === 1) { showToast('At least one market must be selected', 'error'); return; }
    _activeMarkets = _activeMarkets.filter(m => m !== code);
  } else {
    _activeMarkets = [..._activeMarkets, code];
  }
  renderMarketSelector();
  loadScreenerDB();
}

// ── Load screener JSON (one file per active market, merged) ───────
async function loadScreenerDB() {
  setDataBadge('Loading data…', '');
  try {
    const results = await Promise.all(
      _activeMarkets.map(code =>
        fetch(`data/screener_${code}.json`).then(r => r.ok ? r.json() : null).catch(() => null)
      )
    );
    const merged = { updated: null, tickers: {} };
    for (const data of results) {
      if (!data) continue;
      if (!merged.updated || data.updated > merged.updated) merged.updated = data.updated;
      Object.assign(merged.tickers, data.tickers);
    }
    _screenerDB = merged;
    const count = Object.keys(_screenerDB.tickers).length;
    if (count === 0) { showNoData(); return; }
    const mktLabel = _activeMarkets.map(c => MARKET_DEFS[c].label).join(' + ');
    setDataBadge(`Data: ${_screenerDB.updated} — ${count} tickers (${mktLabel})`, 'ok');
    renderChips(Object.keys(_screenerDB.tickers));
    setText('stat-watchlist', count);
    setText('chips-count', count);
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
    ? Object.keys(_screenerDB?.tickers || {})
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

  // Save for filter recomputation
  _lastTrades = finalTrades;
  _lastCfg    = cfg;
  _lastResult = result;

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
        const exitDateStr = dates[i];

        // ── Dividends received during holding period ──────────────
        // mirrors Python: entry_ts < date <= exit_ts
        let divPerShare = 0, firstDivDate = null;
        if (raw.divs?.d) {
          for (let di = 0; di < raw.divs.d.length; di++) {
            const dd = raw.divs.d[di];
            if (dd > entryDateStr && dd <= exitDateStr) {
              if (!firstDivDate) firstDivDate = dd;
              divPerShare += raw.divs.a[di];
            }
          }
        }
        const divYieldPct    = entryPx > 0 ? +(divPerShare / entryPx * 100).toFixed(4) : 0;
        const daysToFirstDiv = firstDivDate
          ? Math.round((new Date(firstDivDate) - new Date(entryDateStr)) / 86400000) : null;

        trades.push({
          ticker,
          entryDate:        entryDateStr,
          exitDate:         exitDateStr,
          entryPrice:       +entryPx.toFixed(2),
          exitPrice:        +exitPx.toFixed(2),
          stopLossPrice:    +stopLoss.toFixed(2),
          returnPct:        +retPct.toFixed(2),
          pnlUsd:           +((exitPx - entryPx) * shares).toFixed(2),
          investedUsd:      +(entryPx * shares).toFixed(2),
          shares,
          holdingDays:      heldDays,
          exitReason:       reason,
          winner:           retPct > 0,
          dividendPerShare: +divPerShare.toFixed(4),
          dividendYieldPct: divYieldPct,
          dividendUsd:      +(divPerShare * shares).toFixed(2),
          hasDividend:      divPerShare > 0,
          daysToFirstDiv,
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
    setHtml('trades-body', '<tr><td colspan="11" style="text-align:center;color:#6a8aaa">No trades</td></tr>');
    return;
  }

  _renderMetricsGrid(result);
  renderEquityChart(result.equityCurve, result.equityLabels);
  renderTradesTable(result.trades);
  renderAnnualTable(result.annualStats);
  renderMonthlyGrid(result.monthlyStats);
}

// Renders only the top metrics cards + equity chart (called by filter toggle too)
function _renderMetricsGrid(result, label) {
  const pnlCls = result.totalPnlUsd >= 0 ? 'green' : 'red';
  const retCls = result.totalReturnPct >= 0 ? 'green' : 'red';
  const ddCls  = result.maxDrawdownPct > 20 ? 'red' : result.maxDrawdownPct > 10 ? 'yellow' : 'green';
  const pfCls  = result.profitFactor >= 1.5 ? 'green' : result.profitFactor >= 1 ? 'yellow' : 'red';
  const wrCls  = result.winRate >= 50 ? 'green' : result.winRate >= 40 ? 'yellow' : 'red';
  const badge  = label ? `<div style="grid-column:1/-1;font-size:13px;color:#f1c40f;font-weight:700;padding:4px 0 2px">📅 Showing: ${label}</div>` : '';
  setHtml('metrics-grid', badge + `
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

// renderTradesTable: stores full reversed list in _tradeReg, then applies filter
function renderTradesTable(trades) {
  if (!trades.length) {
    _tradeReg = [];
    _renderTradeRows([]);
    return;
  }
  _tradeReg = [...trades].reverse();
  _divFilterActive = false;
  _updateDivFilterBtn();
  const ti = document.getElementById('filter-ticker');
  const di = document.getElementById('filter-div-days');
  if (ti) ti.value = '';
  if (di) di.value = '';
  _renderTradeRows(_tradeReg);
}

// Re-render just the rows (called by filter toggle too)
function _renderTradeRows(display) {
  const tbody = document.getElementById('trades-body');
  if (!tbody) return;
  if (!display.length) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:#6a8aaa">No trades match the filter</td></tr>';
    return;
  }
  tbody.innerHTML = display.map(t => {
    const idx  = _tradeReg.indexOf(t);   // index in full registry — for chart modal
    const cls  = t.winner ? 'positive' : 'negative';
    const sign = t.winner ? '+' : '';
    const divTitle = t.hasDividend
      ? `${t.dividendPerShare.toFixed(4)}/share · 1st div in ${t.daysToFirstDiv}d from entry`
      : '';
    const divPct = t.hasDividend
      ? `<span class="positive" title="${divTitle}">+${t.dividendYieldPct.toFixed(2)}%</span>`
      : `<span style="color:#3a5070">—</span>`;
    const divUsd = t.hasDividend
      ? `<span class="positive" title="${divTitle}">+$${t.dividendUsd.toFixed(2)}</span>`
      : `<span style="color:#3a5070">—</span>`;
    return `<tr>
      <td class="ticker-cell"><span style="cursor:pointer;color:#4db8ff" onclick="openChartModal('${t.ticker}',${idx})">${t.ticker}</span></td>
      <td style="font-size:14px">${t.entryDate}</td>
      <td style="font-size:14px">${t.exitDate}</td>
      <td class="price-cell" style="font-size:15px">$${t.entryPrice.toFixed(2)}</td>
      <td class="price-cell" style="font-size:15px">$${t.exitPrice.toFixed(2)}</td>
      <td style="font-size:15px">${t.shares}</td>
      <td class="${cls}">${sign}${fmt$(t.pnlUsd)}</td>
      <td class="${cls}">${sign}${t.returnPct.toFixed(2)}%</td>
      <td style="font-size:15px">${divPct}</td>
      <td style="font-size:15px">${divUsd}</td>
      <td style="font-size:15px;color:#6a8aaa">${t.holdingDays}d</td>
      <td style="font-size:13px;color:#6a8aaa">${fmtReason(t.exitReason)}</td>
    </tr>`;
  }).join('');
}

// Toggle "with dividends only" button — delegates to unified filter engine
function toggleDivFilter() {
  _divFilterActive = !_divFilterActive;
  _updateDivFilterBtn();
  applyTradeFilters();
}

// Apply all active trade filters (div-only toggle + ticker + max-days-to-dividend)
function applyTradeFilters() {
  if (!_tradeReg.length || !_lastResult) return;

  const tickerVal  = (document.getElementById('filter-ticker')?.value  || '').toUpperCase().trim();
  const daysRaw    = parseInt(document.getElementById('filter-div-days')?.value || '');
  const hasMaxDays = !isNaN(daysRaw) && daysRaw > 0;

  let subset = _tradeReg;
  if (_divFilterActive) subset = subset.filter(t => t.hasDividend);
  if (tickerVal)        subset = subset.filter(t => t.ticker.startsWith(tickerVal));
  if (hasMaxDays)       subset = subset.filter(t => t.daysToFirstDiv !== null && t.daysToFirstDiv <= daysRaw);

  const isFiltered = _divFilterActive || !!tickerVal || hasMaxDays;
  if (isFiltered) {
    const subSet = new Set(subset);
    const chron  = _lastTrades.filter(t => subSet.has(t));
    const r      = computeMetrics(chron, _lastResult.initialCapital, _lastCfg.positionSizeUsd, _lastCfg.maxOpenPositions);
    _renderMetricsGrid(r, _buildFilterLabel(tickerVal, hasMaxDays ? daysRaw : null));
    renderEquityChart(r.equityCurve, r.equityLabels);
  } else {
    _renderMetricsGrid(_lastResult);
    renderEquityChart(_lastResult.equityCurve, _lastResult.equityLabels);
  }
  _renderTradeRows(subset);
}

// Reset all trade filters
function clearTradeFilters() {
  _divFilterActive = false;
  _updateDivFilterBtn();
  const ti = document.getElementById('filter-ticker');
  const di = document.getElementById('filter-div-days');
  if (ti) ti.value = '';
  if (di) di.value = '';
  if (_lastResult) {
    _renderMetricsGrid(_lastResult);
    renderEquityChart(_lastResult.equityCurve, _lastResult.equityLabels);
  }
  _renderTradeRows(_tradeReg);
}

function _buildFilterLabel(ticker, maxDivDays) {
  const parts = [];
  if (_divFilterActive)    parts.push('dividends only');
  if (ticker)              parts.push(`ticker: ${ticker}`);
  if (maxDivDays !== null) parts.push(`div within ${maxDivDays}d`);
  return parts.join(' · ');
}

function _updateDivFilterBtn() {
  const btn = document.getElementById('btn-div-filter');
  if (!btn) return;
  if (_divFilterActive) {
    btn.style.borderColor = '#f1c40f';
    btn.style.color       = '#f1c40f';
    btn.textContent       = '📅 All Trades';
  } else {
    btn.style.borderColor = '';
    btn.style.color       = '';
    btn.textContent       = '📅 With Dividends Only';
  }
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
//  CHART MODAL  (price + entry/exit/stop + dividend arrows)
// ═══════════════════════════════════════════════════════════════════

// Per-chart dividend registry used by tooltip callback
let _chartDivs = [];   // [{labelIdx, date, amount, yieldPct, price}]

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
    if (trade) {
      const pnlCls = trade.winner ? 'positive' : 'negative';
      const pnlStr = `${trade.pnlUsd >= 0 ? '+' : ''}${fmt$(trade.pnlUsd)} (${trade.returnPct >= 0 ? '+' : ''}${trade.returnPct.toFixed(2)}%)`;
      const divStr = trade.hasDividend
        ? ` &nbsp;|&nbsp; 📅 Dividendo: <span class="positive">+$${trade.dividendUsd.toFixed(2)} (+${trade.dividendYieldPct.toFixed(2)}%)</span>`
        : '';
      infoEl.innerHTML = `
        <span style="color:#2ecc71;font-size:15px">●</span>
        <strong>Entrata</strong> il <strong>${trade.entryDate}</strong> a <strong>$${trade.entryPrice.toFixed(2)}</strong>
        &nbsp;→&nbsp;
        <span style="color:#f1c40f;font-size:15px">●</span>
        <strong>Uscita</strong> il <strong>${trade.exitDate}</strong> a <strong>$${trade.exitPrice.toFixed(2)}</strong>
        &nbsp;|&nbsp; ${trade.holdingDays} giorni
        &nbsp;|&nbsp; P&L: <span class="${pnlCls}"><strong>${pnlStr}</strong></span>
        &nbsp;|&nbsp; Motivo: <strong>${fmtReason(trade.exitReason)}</strong>${divStr}`;
    } else {
      infoEl.innerHTML = '';
    }
  }

  modal.style.display = 'flex';

  // ── Always prefer the individual ticker file (has dividends + full history)
  if (!_tickerCache[ticker]?.divs) {
    try {
      const resp = await fetch(`data/${ticker}.json`);
      if (resp.ok) { _tickerCache[ticker] = await resp.json(); }
    } catch { /* fall back to screener data */ }
  }
  const raw = _tickerCache[ticker] || _screenerDB?.tickers?.[ticker] || null;

  const wrap = document.getElementById('modal-chart-wrap');
  if (!raw) {
    if (wrap) wrap.innerHTML = '<div style="height:420px;display:flex;align-items:center;justify-content:center;color:#6a8aaa">No price data available</div>';
    return;
  }

  // ── Window: 180 bars or centred on the trade ──────────────────
  const n = raw.c.length;
  let sliceEnd   = n;
  let sliceStart = Math.max(0, n - 180);

  if (trade && raw.d) {
    const exitIdx = raw.d.lastIndexOf(trade.exitDate);
    if (exitIdx > 0) {
      sliceEnd   = Math.min(n, exitIdx + 20);
      sliceStart = Math.max(0, exitIdx - 160);
    }
  }

  const closes = raw.c.slice(sliceStart, sliceEnd);
  const labels = raw.d?.slice(sliceStart, sliceEnd) ?? closes.map((_, k) => String(k));

  // ── Reset canvas ──────────────────────────────────────────────
  if (wrap) wrap.innerHTML = '<canvas id="modal-chart-canvas"></canvas>';
  const canvas = document.getElementById('modal-chart-canvas');
  if (!canvas) return;
  if (_modalChart) { _modalChart.destroy(); _modalChart = null; }
  if (_subChart)   { _subChart.destroy();   _subChart   = null; }

  // ── Main price line ───────────────────────────────────────────
  const datasets = [{
    label: ticker, data: closes,
    borderColor: '#4db8ff', backgroundColor: 'rgba(77,184,255,0.05)',
    borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.1,
    order: 10,
  }];

  // ── Entry / exit / stop datasets ─────────────────────────────
  if (trade && raw.d) {
    const entryIdx = raw.d.indexOf(trade.entryDate) - sliceStart;
    const exitIdx2 = raw.d.lastIndexOf(trade.exitDate) - sliceStart;
    if (entryIdx >= 0 && entryIdx < closes.length) {
      const entryPts = closes.map((_, k) => k === entryIdx ? trade.entryPrice : null);
      datasets.push({
        label: 'Entry', data: entryPts, showLine: false, fill: false,
        borderColor: '#2ecc71', backgroundColor: '#2ecc71',
        pointRadius: closes.map((_, k) => k === entryIdx ? 9 : 0), order: 1,
      });
      if (exitIdx2 >= 0) {
        const stopPts = closes.map((_, k) => k >= entryIdx && k <= exitIdx2 ? trade.stopLossPrice : null);
        datasets.push({
          label: 'Stop', data: stopPts, showLine: true, fill: false,
          borderColor: '#e74c3c', borderDash: [4, 4], borderWidth: 1, pointRadius: 0,
          tension: 0, order: 9,
        });
      }
    }
    if (exitIdx2 >= 0 && exitIdx2 < closes.length) {
      const exitPts = closes.map((_, k) => k === exitIdx2 ? trade.exitPrice : null);
      datasets.push({
        label: 'Exit', data: exitPts, showLine: false, fill: false,
        borderColor: '#f1c40f', backgroundColor: '#f1c40f',
        pointRadius: closes.map((_, k) => k === exitIdx2 ? 9 : 0), order: 1,
      });
    }
  }

  // ── Dividend arrows (▲ triangles) ─────────────────────────────
  _chartDivs = [];
  if (raw.divs?.d) {
    for (let di = 0; di < raw.divs.d.length; di++) {
      const divDate = raw.divs.d[di];
      const divAmt  = raw.divs.a[di];
      const labelIdx = labels.indexOf(divDate);
      if (labelIdx < 0) continue;
      const price    = closes[labelIdx];
      const yieldPct = price > 0 ? divAmt / price * 100 : 0;
      _chartDivs.push({ labelIdx, date: divDate, amount: divAmt, yieldPct, price });
    }
  }

  if (_chartDivs.length > 0) {
    const priceRange = Math.max(...closes) - Math.min(...closes);
    const divData = closes.map((_, k) => {
      const d = _chartDivs.find(x => x.labelIdx === k);
      return d ? d.price + priceRange * 0.04 : null;  // 4% above price so non viene coperto da altri marker
    });
    datasets.push({
      label: 'Dividend ▲',
      data: divData,
      showLine: false, fill: false,
      pointStyle:            closes.map((_, k) => _chartDivs.find(x => x.labelIdx === k) ? 'triangle' : 'circle'),
      pointRadius:           closes.map((_, k) => _chartDivs.find(x => x.labelIdx === k) ? 11 : 0),
      pointHoverRadius:      closes.map((_, k) => _chartDivs.find(x => x.labelIdx === k) ? 14 : 0),
      pointBackgroundColor:  '#f1c40f',
      pointBorderColor:      '#000',
      pointBorderWidth:      1.5,
      rotation:              0,
      order: 0,  // sopra tutti gli altri marker
    });
  }

  // ── Build chart ───────────────────────────────────────────────
  const hasAnnotations = !!trade || _chartDivs.length > 0;
  _modalChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: {
          display: hasAnnotations,
          labels: { color: '#a8c0d8', font: { size: 12 }, filter: item => item.text !== ticker },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              if (ctx.dataset.label === 'Dividend ▲') {
                const d = _chartDivs.find(x => x.labelIdx === ctx.dataIndex);
                if (d) return `Dividend: $${d.amount.toFixed(4)}  (+${d.yieldPct.toFixed(3)}% yield)`;
              }
              if (ctx.raw === null || ctx.raw === undefined) return null;
              return `$${typeof ctx.raw === 'number' ? ctx.raw.toFixed(2) : ctx.raw}`;
            },
            title(ctx) { return ctx[0]?.label ?? ''; },
          },
        },
      },
      scales: {
        x: { ticks: { color: '#6a8aaa', maxTicksLimit: 8 }, grid: { color: '#1e3050' } },
        y: { ticks: { color: '#a8c0d8', callback: v => '$' + v.toFixed(0) }, grid: { color: '#1e3050' } },
      },
    },
  });
}

function closeChartModal() {
  const modal = document.getElementById('chart-modal');
  if (modal) modal.style.display = 'none';
  if (_modalChart) { _modalChart.destroy(); _modalChart = null; }
  if (_subChart)   { _subChart.destroy();   _subChart   = null; }
}

function modalBackdropClick(e) { if (e.target === e.currentTarget) closeChartModal(); }

// ── Toast notifications ───────────────────────────────────────────
function showToast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container')?.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

