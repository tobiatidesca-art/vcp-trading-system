#!/usr/bin/env python3
"""
Incremental data fetcher for VCP Trading System.

First run : downloads full history for every ticker.
Subsequent runs : only downloads bars newer than the last saved date,
                  then merges with the existing file (no re-download of old data).

Outputs:
  docs/data/screener_MARKET.json  -- last 2 years, all tickers (screener)
  docs/data/{TICKER}.json         -- full history + dividends (backtest + chart)
  docs/data/{TICKER}_1h.json      -- rolling ~2-year 1h intraday, US only
"""
import io
import json
import logging
import datetime
import sys
import time
import contextlib
from pathlib import Path

try:
    import yfinance as yf
except ImportError:
    sys.exit("ERROR: yfinance not installed. Run: pip install yfinance")

# Salva stdout/stderr reali prima di qualsiasi redirect
_OUT = sys.stdout
_ERR = sys.stderr

@contextlib.contextmanager
def _silent():
    """Cattura stdout, stderr e logging di yfinance: la barra rimane pulita."""
    buf = io.StringIO()
    sys.stdout = buf
    sys.stderr = buf
    # Silenzia anche il logging di yfinance/urllib3
    loggers = ['yfinance', 'peewee', 'urllib3', 'requests']
    saved = {n: logging.getLogger(n).level for n in loggers}
    for n in loggers:
        logging.getLogger(n).setLevel(logging.CRITICAL)
    try:
        yield
    finally:
        sys.stdout = _OUT
        sys.stderr = _ERR
        for n, lv in saved.items():
            logging.getLogger(n).setLevel(lv)

# -- Config ----------------------------------------------------------------
DATA_START     = "1985-01-01"
SCREENER_YEARS = 2
RETRY_WAIT     = 5
OVERLAP_DAYS   = 5   # re-download this many extra days to catch late corrections

MARKETS: dict[str, list[str]] = {
    "US": [
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
    ],
    "IT": [
        "ENI.MI","ENEL.MI","ISP.MI","UCG.MI","STM.MI","G.MI","PRY.MI",
        "MB.MI","LDO.MI","RACE.MI","MONC.MI","FBK.MI","BAMI.MI","BPE.MI",
        "NEXI.MI","PIRC.MI","TRN.MI","SRG.MI","A2A.MI","HER.MI","SPM.MI",
        "TEN.MI","AZM.MI","DIA.MI","AMP.MI","REC.MI","BC.MI","BZU.MI",
        "STLAM.MI","TIT.MI","PST.MI","ERG.MI","INWIT.MI","IP.MI",
        "SFER.MI","BMPS.MI",
    ],
    "DE": [
        "SAP.DE","SIE.DE","ALV.DE","BMW.DE","MBG.DE","BAYN.DE","BAS.DE",
        "DTE.DE","DB1.DE","MUV2.DE","VOW3.DE","ADS.DE","RWE.DE","HEN3.DE",
        "EOAN.DE","DHL.DE","DBK.DE","IFX.DE","ENR.DE","MTX.DE",
        "MRK.DE","FRE.DE","FME.DE","BEI.DE","SHL.DE","P911.DE",
        "PAH3.DE","SY1.DE","PUM.DE","CBK.DE","ZAL.DE","VNA.DE",
        "QIA.DE","AFX.DE","HEI.DE",
    ],
    "FR": [
        "MC.PA","AIR.PA","TTE.PA","SAN.PA","BNP.PA","OR.PA","SU.PA",
        "AI.PA","RI.PA","GLE.PA","ACA.PA","CAP.PA","CS.PA","DG.PA",
        "EL.PA","HO.PA","KER.PA","LR.PA","ORA.PA","PUB.PA","RMS.PA",
        "RNO.PA","SAF.PA","SGO.PA","VIE.PA","VIV.PA","DSY.PA","ENGI.PA",
        "ERF.PA","CA.PA","BVI.PA","SW.PA","EN.PA","ML.PA","WLN.PA",
    ],
    "ES": [
        "SAN.MC","ITX.MC","IBE.MC","TEF.MC","BBVA.MC","REP.MC","ACS.MC",
        "FER.MC","AENA.MC","REE.MC","ENG.MC","MAP.MC","NTGY.MC","SAB.MC",
        "BKT.MC","ELE.MC","CLNX.MC","IAG.MC","IDR.MC","MRL.MC","CABK.MC",
        "GRF.MC","ACX.MC","VIS.MC","ANA.MC","LOG.MC","COL.MC","CIE.MC",
        "UNI.MC","PHM.MC",
    ],
    "NL": [
        "ASML.AS","HEIA.AS","ING.AS","PHIA.AS","SHELL.AS","UNA.AS",
        "ABN.AS","AH.AS","AKZA.AS","ASRNL.AS","NN.AS","PRX.AS",
        "RAND.AS","REN.AS","WKL.AS","DSMN.AS","IMCD.AS","ADYEN.AS",
        "AGN.AS","BESI.AS","KPN.AS","SBM.AS","URW.AS","VPK.AS","OCI.AS",
    ],
}

# -- Persistence helpers ---------------------------------------------------

def load_existing(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def is_current(last_date_str: str) -> bool:
    """True when last bar is at most 1 calendar day old (yesterday or today).
    Threshold is 1 so a Wednesday run never skips a Tuesday bar.
    On Mondays, Friday data (3 days old) is re-downloaded but the merge
    deduplicates, so there is no data loss."""
    try:
        return (datetime.date.today() - datetime.date.fromisoformat(last_date_str)).days <= 1
    except Exception:
        return False


def merge_daily(existing: dict, new_data: dict) -> dict:
    """Merge two daily OHLCV dicts, deduplicate by date, sort ascending."""
    m: dict[str, tuple] = {}
    for i, d in enumerate(existing["d"]):
        m[d] = (existing["o"][i], existing["h"][i], existing["l"][i],
                existing["c"][i], existing["v"][i])
    for i, d in enumerate(new_data["d"]):
        m[d] = (new_data["o"][i], new_data["h"][i], new_data["l"][i],
                new_data["c"][i], new_data["v"][i])
    dates = sorted(m)
    return {
        "d": dates,
        "o": [m[d][0] for d in dates],
        "h": [m[d][1] for d in dates],
        "l": [m[d][2] for d in dates],
        "c": [m[d][3] for d in dates],
        "v": [m[d][4] for d in dates],
    }


def merge_1h(existing: dict, new_data: dict) -> dict:
    """Merge two 1h OHLCV dicts, deduplicate by datetime string, sort ascending."""
    m: dict[str, tuple] = {}
    for i, dt in enumerate(existing["dt"]):
        m[dt] = (existing["o"][i], existing["h"][i], existing["l"][i],
                 existing["c"][i], existing["v"][i])
    for i, dt in enumerate(new_data["dt"]):
        m[dt] = (new_data["o"][i], new_data["h"][i], new_data["l"][i],
                 new_data["c"][i], new_data["v"][i])
    dts = sorted(m)
    return {
        "dt": dts,
        "o": [m[dt][0] for dt in dts],
        "h": [m[dt][1] for dt in dts],
        "l": [m[dt][2] for dt in dts],
        "c": [m[dt][3] for dt in dts],
        "v": [m[dt][4] for dt in dts],
    }


def merge_divs(a: dict | None, b: dict | None) -> dict | None:
    """Merge two dividend dicts, deduplicate by date."""
    m: dict[str, float] = {}
    for src in (a, b):
        if src:
            for i, d in enumerate(src["d"]):
                m[d] = src["a"][i]
    if not m:
        return None
    dates = sorted(m)
    return {"d": dates, "a": [m[d] for d in dates]}


def slice_screener(data: dict, from_date: str) -> dict | None:
    """Return subset of a daily dict with only dates >= from_date."""
    if not data or not data.get("d"):
        return None
    idx = next((i for i, d in enumerate(data["d"]) if d >= from_date), None)
    if idx is None:
        return None
    return {k: data[k][idx:] for k in ("d", "o", "h", "l", "c", "v")}


# -- Download helpers ------------------------------------------------------

def df_to_dict(df, divs=None) -> dict | None:
    if df is None or df.empty:
        return None
    df = df.dropna(subset=["Close"])
    if df.empty:
        return None
    result = {
        "d": [d.strftime("%Y-%m-%d") for d in df.index.normalize()],
        "o": [round(float(v), 4) for v in df["Open"]],
        "h": [round(float(v), 4) for v in df["High"]],
        "l": [round(float(v), 4) for v in df["Low"]],
        "c": [round(float(v), 4) for v in df["Close"]],
        "v": [int(v)             for v in df["Volume"]],
    }
    if divs:
        result["divs"] = divs
    return result


def fetch_dividends(ticker: str) -> dict | None:
    try:
        with _silent():
            t    = yf.Ticker(ticker)
            divs = t.dividends
        if divs is None or divs.empty:
            return None
        divs = divs.dropna()
        try:
            divs.index = divs.index.tz_convert(None).normalize()
        except Exception:
            try:
                divs.index = divs.index.tz_localize(None).normalize()
            except Exception:
                divs.index = divs.index.normalize()
        if divs.empty:
            return None
        return {
            "d": [d.strftime("%Y-%m-%d") for d in divs.index],
            "a": [round(float(v), 6)     for v in divs.values],
        }
    except Exception:
        return None


def fetch_daily(ticker: str, start: str, retries: int = 3):
    kwargs = dict(start=start, progress=False, auto_adjust=True)
    for attempt in range(1, retries + 1):
        try:
            with _silent():
                df = yf.download(ticker, **kwargs)
            if hasattr(df.columns, "levels"):
                df.columns = df.columns.get_level_values(0)
            return df
        except Exception:
            if attempt < retries:
                time.sleep(RETRY_WAIT)
    return None


def fetch_1h(ticker: str, start: str | None = None, retries: int = 3):
    """
    If start is given (and within 730 days), download from that date.
    Otherwise use period='730d' (first-time download).
    """
    if start:
        kwargs = dict(start=start, interval="1h", progress=False, auto_adjust=True)
    else:
        kwargs = dict(period="730d", interval="1h", progress=False, auto_adjust=True)
    for attempt in range(1, retries + 1):
        try:
            with _silent():
                df = yf.download(ticker, **kwargs)
            if hasattr(df.columns, "levels"):
                df.columns = df.columns.get_level_values(0)
            return df
        except Exception:
            if attempt < retries:
                time.sleep(RETRY_WAIT)
    return None


def df_1h_to_dict(df) -> dict | None:
    if df is None or df.empty:
        return None
    df = df.dropna(subset=["Close"])
    if df.empty:
        return None
    idx = df.index
    try:
        idx = idx.tz_convert("America/New_York") if idx.tz else idx.tz_localize("UTC").tz_convert("America/New_York")
    except Exception:
        pass
    return {
        "dt": [t.strftime("%Y-%m-%dT%H:%M") for t in idx],
        "o":  [round(float(v), 4) for v in df["Open"]],
        "h":  [round(float(v), 4) for v in df["High"]],
        "l":  [round(float(v), 4) for v in df["Low"]],
        "c":  [round(float(v), 4) for v in df["Close"]],
        "v":  [int(v)             for v in df["Volume"]],
    }


def _progress(step: int, total: int, ticker: str, phase: str, errors: int) -> None:
    pct    = int(step / total * 100)
    filled = int(30 * step / total)
    bar    = "#" * filled + "-" * (30 - filled)
    _OUT.write(f"\r  [{bar}] {pct:3d}%  {ticker:<8}  {phase:<10}  err:{errors}   ")
    _OUT.flush()


# -- Main ------------------------------------------------------------------

def main():
    today          = datetime.date.today()
    screener_start = (today - datetime.timedelta(days=int(SCREENER_YEARS * 365 * 1.1))).isoformat()
    docs_data      = Path("docs/data")
    docs_data.mkdir(parents=True, exist_ok=True)

    total_steps = sum(len(wl) * 2 for wl in MARKETS.values())
    step = errors = total_ok = total_fail = skipped = 0
    summary: list[tuple[str, int, int, int]] = []
    error_log: list[str] = []

    _OUT.write(f"\n  Avvio -- {total_steps} operazioni totali\n\n")
    _OUT.flush()

    for market_code, watchlist in MARKETS.items():
        screener_tickers: dict = {}
        ok = fail = mkt_skip = 0

        for ticker in watchlist:
            daily_path = docs_data / f"{ticker}.json"
            h1_path    = docs_data / f"{ticker}_1h.json"

            # ── Daily ─────────────────────────────────────────────────
            step += 1
            existing_d = load_existing(daily_path)
            last_d     = existing_d["d"][-1] if existing_d and existing_d.get("d") else None

            if last_d and is_current(last_d):
                # Already up to date — skip download, reuse file
                _progress(step, total_steps, ticker, f"{market_code}-skip", errors)
                full_dict = existing_d
                mkt_skip += 1
            else:
                if last_d:
                    fetch_start = (datetime.date.fromisoformat(last_d)
                                   - datetime.timedelta(days=OVERLAP_DAYS)).isoformat()
                    phase = f"{market_code}-delt"
                else:
                    fetch_start = DATA_START
                    phase = f"{market_code}-full"

                _progress(step, total_steps, ticker, phase, errors)
                try:
                    df_new   = fetch_daily(ticker, fetch_start)
                    new_dict = df_to_dict(df_new)
                    divs     = fetch_dividends(ticker)

                    if new_dict:
                        full_dict = merge_daily(existing_d, new_dict) if existing_d else new_dict
                        full_dict["divs"] = merge_divs(
                            existing_d.get("divs") if existing_d else None, divs
                        )
                        daily_path.write_text(
                            json.dumps(full_dict, separators=(",", ":")), encoding="utf-8"
                        )
                        ok += 1
                    else:
                        full_dict = existing_d
                        fail += 1; errors += 1
                        error_log.append(f"  {ticker:<10} daily  no data")
                except Exception as exc:
                    full_dict = existing_d
                    fail += 1; errors += 1
                    error_log.append(f"  {ticker:<10} daily  {exc}")

            # Build screener slice from whatever we have
            if full_dict:
                sl = slice_screener(full_dict, screener_start)
                if sl:
                    screener_tickers[ticker] = sl

            # ── 1h ────────────────────────────────────────────────────
            step += 1
            existing_1h = load_existing(h1_path)
            last_1h     = existing_1h["dt"][-1][:10] if existing_1h and existing_1h.get("dt") else None

            if last_1h and is_current(last_1h):
                _progress(step, total_steps, ticker, "1h-skip", errors)
                mkt_skip += 1
            else:
                if last_1h:
                    delta_start = (datetime.date.fromisoformat(last_1h)
                                   - datetime.timedelta(days=OVERLAP_DAYS)).isoformat()
                    _progress(step, total_steps, ticker, "1h-delt", errors)
                    df_h1 = fetch_1h(ticker, start=delta_start)
                else:
                    _progress(step, total_steps, ticker, "1h-full", errors)
                    df_h1 = fetch_1h(ticker)   # period="730d"

                try:
                    d1h = df_1h_to_dict(df_h1)
                    if d1h:
                        merged_1h = merge_1h(existing_1h, d1h) if existing_1h else d1h
                        h1_path.write_text(
                            json.dumps(merged_1h, separators=(",", ":")), encoding="utf-8"
                        )
                    else:
                        errors += 1
                        error_log.append(f"  {ticker:<10} 1h     no data")
                except Exception as exc:
                    errors += 1
                    error_log.append(f"  {ticker:<10} 1h     {exc}")

        # Write per-market screener
        (docs_data / f"screener_{market_code}.json").write_text(
            json.dumps({"updated": today.isoformat(), "market": market_code,
                        "tickers": screener_tickers}, separators=(",", ":")),
            encoding="utf-8"
        )
        summary.append((market_code, ok, fail, mkt_skip))
        total_ok   += ok
        total_fail += fail
        skipped    += mkt_skip

    # Final summary
    _OUT.write(f"\n\n  {'='*52}\n")
    _OUT.write(f"  {'Mercato':<6}  {'OK':<5}  {'Errori':<7}  {'Saltati'}\n")
    _OUT.write(f"  {'-'*52}\n")
    for code, ok, fail, sk in summary:
        _OUT.write(f"  {code:<6}  {ok:<5}  {fail:<7}  {sk}\n")
    _OUT.write(f"  {'='*52}\n")
    _OUT.write(f"  TOTALE  OK: {total_ok}  Errori: {total_fail}  Saltati: {skipped}\n")
    _OUT.write(f"  {'='*52}\n")
    if error_log:
        _OUT.write(f"\n  Ticker con problemi ({len(error_log)}):\n")
        for line in error_log:
            _OUT.write(line + "\n")
    _OUT.write("\n")
    _OUT.flush()


if __name__ == "__main__":
    main()
