"""
Market data — daily OHLCV via yfinance.

Two-tier cache
  Disk  (parquet) – survives restarts, updated incrementally (gap-fill).
  Memory (1 h TTL) – fast path within a single server run.
"""

import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path
from typing import Callable, Optional

import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────
_BASE      = Path(__file__).parent
CACHE_DIR  = _BASE / "cache"
CACHE_DIR.mkdir(exist_ok=True)
_ISIN_FILE          = CACHE_DIR / "_isin.json"
_CACHE_VERSION_FILE = CACHE_DIR / "_cache_version.txt"
_DATA_START         = "1985-01-01"  # yfinance clips to IPO date if ticker is newer
_CACHE_VERSION      = "v2_1985"     # bump to force re-download of all OHLCV parquet files


def _migrate_cache_if_needed() -> None:
    """Delete stale OHLCV parquet files when the cache version changes."""
    try:
        if (_CACHE_VERSION_FILE.exists()
                and _CACHE_VERSION_FILE.read_text(encoding="utf-8").strip() == _CACHE_VERSION):
            return
        deleted = 0
        for p in CACHE_DIR.glob("*.parquet"):
            if "_divs" not in p.name and not p.name.startswith("_"):
                try:
                    p.unlink()
                    deleted += 1
                except Exception:
                    pass
        _CACHE_VERSION_FILE.write_text(_CACHE_VERSION, encoding="utf-8")
        if deleted:
            logger.info("Cache migrated to %s: deleted %d old OHLCV files", _CACHE_VERSION, deleted)
    except Exception as exc:
        logger.warning("Cache migration check failed: %s", exc)


_migrate_cache_if_needed()

# ── Memory layers ─────────────────────────────────────────────
_mem:      dict[str, tuple[pd.DataFrame, datetime]] = {}
_CACHE_TTL = timedelta(hours=1)
_div_mem:  dict[str, pd.Series] = {}   # dividends cache (session-only)
_lock      = threading.Lock()

# ── ISIN on-disk map ─────────────────────────────────────────
_isin_map: dict[str, str] = {}

def _load_isin() -> None:
    global _isin_map
    try:
        if _ISIN_FILE.exists():
            _isin_map = json.loads(_ISIN_FILE.read_text(encoding="utf-8"))
    except Exception:
        _isin_map = {}

def _save_isin() -> None:
    try:
        _ISIN_FILE.write_text(json.dumps(_isin_map, indent=2), encoding="utf-8")
    except Exception:
        pass

_load_isin()

# ── Watchlist (200 liquid US equities) ───────────────────────
DEFAULT_WATCHLIST: list[str] = [
    # Mega-cap Tech
    "AAPL","MSFT","GOOGL","AMZN","META","NVDA","TSLA","AVGO","ORCL","AMD",
    "INTC","QCOM","TXN","MU","AMAT","LRCX","KLAC","MRVL","ADSK","CRM",
    "ADBE","NOW","INTU","PANW","FTNT","SNPS","CDNS","DDOG","NET","CRWD",
    # Financial
    "JPM","BAC","WFC","GS","MS","C","AXP","BLK","SCHW","COF",
    "BX","CB","PGR","TRV","AFL","ALL","AIG","MET","SPGI","MCO",
    "ICE","CME","MSCI","V","MA","PYPL","FDS","BR","ALLY","SYF",
    # Healthcare
    "JNJ","LLY","ABBV","MRK","PFE","AMGN","GILD","REGN","VRTX","BMY",
    "TMO","ABT","MDT","SYK","BSX","EW","ISRG","DHR","IQV","A",
    "CVS","UNH","ELV","CNC","HUM","CI","MCK","CAH","ABC","DXCM",
    # Consumer Staples & Discretionary
    "PG","KO","PEP","MCD","SBUX","NKE","COST","WMT","TGT","HD",
    "LOW","TJX","ROST","DG","DLTR","EL","CL","CHD","KMB","GIS",
    "DIS","NFLX","CMCSA","CHTR","LYV","BKNG","MAR","HLT","RCL","CCL",
    # Industrial & Aerospace
    "CAT","DE","HON","RTX","LMT","GD","NOC","BA","EMR","ETN",
    "ITW","PH","ROK","IR","AME","FTV","CARR","OTIS","TT","XYL",
    # Energy
    "XOM","CVX","COP","EOG","OXY","MPC","PSX","VLO","HES","SLB",
    # Materials & Chemicals
    "LIN","APD","SHW","PPG","ECL","IFF","ALB","FCX","NEM","NUE",
    # Real Estate
    "AMT","PLD","CCI","EQIX","DLR","SPG","O","WELL","VTR","AVB",
    # Utilities
    "NEE","DUK","SO","D","EXC","AEP","SRE","XEL","WEC","ES",
    # Growth / Fintech / Cloud
    "UBER","ABNB","SHOP","SQ","SOFI","PLTR","ZS","OKTA","MDB","TTD",
]
DEFAULT_PERIOD = "20y"   # kept for API compat; actual fetch uses _DATA_START
_MAX_WORKERS   = 5


# ── Helpers ───────────────────────────────────────────────────

def _disk_path(ticker: str) -> Path:
    safe = ticker.replace("-", "_").replace(".", "_")
    return CACHE_DIR / f"{safe}.parquet"


def _normalize(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()
    df = df.copy()
    if hasattr(df.index, "tz") and df.index.tz is not None:
        df.index = pd.to_datetime(df.index.date)
    else:
        df.index = pd.to_datetime(df.index)
    df.index.name = "Date"
    cols = [c for c in ("Open", "High", "Low", "Close", "Volume") if c in df.columns]
    return df[cols].dropna(how="all")


def _from_disk(ticker: str) -> Optional[pd.DataFrame]:
    p = _disk_path(ticker)
    if not p.exists():
        return None
    try:
        df = pd.read_parquet(p)
        df.index = pd.to_datetime(df.index)
        return df
    except Exception as exc:
        logger.warning("Corrupt disk cache %s: %s – deleting", ticker, exc)
        try:
            p.unlink()
        except Exception:
            pass
        return None


def _to_disk(ticker: str, df: pd.DataFrame) -> None:
    try:
        df.to_parquet(_disk_path(ticker))
    except Exception as exc:
        logger.warning("Cannot save cache %s: %s", ticker, exc)


def _is_stale(df: pd.DataFrame, gap_days: int = 5) -> bool:
    if df is None or df.empty:
        return True
    return (pd.Timestamp.today().normalize() - df.index[-1]).days > gap_days


# ── ISIN ─────────────────────────────────────────────────────

def get_isin(ticker: str) -> str:
    """Return ISIN for *ticker* from cache or yfinance (cached to disk)."""
    key = ticker.upper()
    if key in _isin_map:
        return _isin_map[key]
    isin = "N/A"
    try:
        t = yf.Ticker(key)
        val = None
        try:
            val = t.info.get("isin")
        except Exception:
            pass
        if not val:
            val = getattr(t, "isin", None)
        if val and str(val) not in ("None", "nan", ""):
            isin = str(val).strip()
    except Exception:
        pass
    _isin_map[key] = isin
    _save_isin()
    return isin


# ── Dividends ────────────────────────────────────────────────

def get_dividends(ticker: str) -> pd.Series:
    """
    Return the full dividend history for *ticker* (amount per share, per date).
    Cached in memory for the session and on disk as a parquet file.
    Returns an empty Series for non-dividend-paying stocks.
    """
    key = ticker.upper()
    if key in _div_mem:
        return _div_mem[key]

    safe = key.replace("-", "_").replace(".", "_")
    p    = CACHE_DIR / f"{safe}_divs.parquet"

    if p.exists():
        try:
            df = pd.read_parquet(p)
            s  = df["dividend"]
            s.index = pd.to_datetime(s.index)
            _div_mem[key] = s
            return s
        except Exception:
            pass

    try:
        s = yf.Ticker(key).dividends
        if s is not None and not s.empty:
            if hasattr(s.index, "tz") and s.index.tz is not None:
                s.index = pd.to_datetime(s.index.date)
            else:
                s.index = pd.to_datetime(s.index)
            s.name = "dividend"
            s.to_frame().to_parquet(p)
        else:
            s = pd.Series(dtype=float, name="dividend")
    except Exception:
        s = pd.Series(dtype=float, name="dividend")

    _div_mem[key] = s
    return s


# ── Core fetch ────────────────────────────────────────────────

def fetch_ticker(ticker: str, period: str = DEFAULT_PERIOD) -> pd.DataFrame:
    """
    Return full daily OHLCV for *ticker*.

    Resolution order:
      1. Memory cache (< 1 h)
      2. Disk cache, gap-fill if stale (> 5 calendar days behind)
      3. Full yfinance download (first run only)
    """
    key = ticker.upper()

    # 1 — memory
    with _lock:
        if key in _mem:
            df, ts = _mem[key]
            if datetime.now() - ts < _CACHE_TTL:
                return df

    # 2 — disk
    df = _from_disk(key)

    if df is not None and not _is_stale(df):
        with _lock:
            _mem[key] = (df, datetime.now())
        return df

    # 3 — gap-fill or full download
    if df is not None and not df.empty:
        last      = df.index[-1]
        start_str = (last + timedelta(days=1)).strftime("%Y-%m-%d")
        try:
            raw = yf.Ticker(key).history(start=start_str, interval="1d", auto_adjust=True)
            new = _normalize(raw)
            if not new.empty:
                combined = pd.concat([df, new])
                df = combined[~combined.index.duplicated(keep="last")].sort_index()
                logger.debug("Gap-filled %s: +%d bars", key, len(new))
        except Exception as exc:
            logger.warning("Gap-fill failed %s: %s — using stale data", key, exc)
    else:
        try:
            raw = yf.Ticker(key).history(start=_DATA_START, interval="1d", auto_adjust=True)
            df  = _normalize(raw)
            if not df.empty:
                logger.debug("Full fetch %s: %d bars (from %s)", key, len(df), _DATA_START)
        except Exception as exc:
            logger.warning("Full fetch failed %s: %s", key, exc)
            df = pd.DataFrame()

    if df is not None and not df.empty:
        _to_disk(key, df)

    result = df if df is not None else pd.DataFrame()
    with _lock:
        _mem[key] = (result, datetime.now())
    return result


def fetch_ticker_range(ticker: str, start: str, end: str) -> pd.DataFrame:
    """Return a date-range slice from cache (no extra yfinance call)."""
    df = fetch_ticker(ticker)
    if df.empty:
        return df
    s = pd.Timestamp(start).normalize()
    e = pd.Timestamp(end).normalize()
    return df.loc[(df.index >= s) & (df.index <= e)].copy()


def get_chart_data(
    ticker:       str,
    start_date:   str = "",
    end_date:     str = "",
    context_days: int = 60,
) -> dict:
    """
    Return OHLCV dict for the chart modal.
    Adds *context_days* of history before start_date and after end_date.
    If no dates given, returns last 120 bars.
    """
    df = fetch_ticker(ticker)
    if df.empty:
        return {"dates": [], "opens": [], "highs": [], "lows": [], "closes": [], "volumes": []}

    if start_date:
        s = pd.Timestamp(start_date) - timedelta(days=context_days)
        s = max(s, df.index[0])
    else:
        s = df.index[max(0, len(df) - 120)]

    if end_date:
        e = pd.Timestamp(end_date) + timedelta(days=context_days)
        e = min(e, df.index[-1])
    else:
        e = df.index[-1]

    sl = df.loc[(df.index >= s) & (df.index <= e)]
    return {
        "dates":   [d.strftime("%Y-%m-%d") for d in sl.index],
        "opens":   [round(float(v), 2) for v in sl["Open"]],
        "highs":   [round(float(v), 2) for v in sl["High"]],
        "lows":    [round(float(v), 2) for v in sl["Low"]],
        "closes":  [round(float(v), 2) for v in sl["Close"]],
        "volumes": [int(v) for v in sl["Volume"]],
    }


# ── Batch fetch ───────────────────────────────────────────────

ProgressCallback = Callable[[int, int, str], None]


def fetch_multiple(
    tickers:           list[str],
    period:            str = DEFAULT_PERIOD,
    progress_callback: Optional[ProgressCallback] = None,
) -> dict[str, pd.DataFrame]:
    """Download *tickers* in parallel (≤ 5 concurrent), calling *progress_callback*(done, total, ticker)."""
    result:    dict[str, pd.DataFrame] = {}
    total     = len(tickers)
    completed = 0
    pool      = ThreadPoolExecutor(max_workers=_MAX_WORKERS)
    futures   = {pool.submit(fetch_ticker, t, period): t for t in tickers}

    for future in as_completed(futures):
        ticker     = futures[future]
        completed += 1
        try:
            df = future.result()
            if not df.empty:
                result[ticker] = df
        except Exception as exc:
            logger.debug("fetch_multiple %s: %s", ticker, exc)
        if progress_callback:
            try:
                progress_callback(completed, total, ticker)
            except Exception:
                pass

    pool.shutdown(wait=False)
    return result


def clear_cache() -> None:
    """Clear in-memory cache (disk cache is preserved)."""
    with _lock:
        _mem.clear()
