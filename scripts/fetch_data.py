#!/usr/bin/env python3
"""
Fetch daily OHLCV + dividend data from Yahoo Finance and write static JSON
files consumed by the GitHub Pages frontend (docs/app.js).

Outputs:
  docs/data/screener.json   — last 2 years, all tickers (screener page)
  docs/data/{TICKER}.json   — full history + dividends (backtest + chart)

Run by GitHub Actions on a daily schedule (see .github/workflows/update_data.yml).
"""
import json
import datetime
import sys
import time
from pathlib import Path

try:
    import yfinance as yf
except ImportError:
    sys.exit("ERROR: yfinance not installed. Run: pip install yfinance")

# ── Config ────────────────────────────────────────────────────────
DATA_START     = "1985-01-01"
SCREENER_YEARS = 2      # years of history included in screener.json
RETRY_WAIT     = 5      # seconds between retries

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
        "CON.DE","MRK.DE","FRE.DE","FME.DE","BEI.DE","SHL.DE","P911.DE",
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

# ── Helpers ───────────────────────────────────────────────────────

def df_to_dict(df, divs=None):
    """Convert a yfinance OHLCV DataFrame to a compact JSON-serialisable dict.
    Optionally attach dividend data as {d:[dates], a:[amounts]}.
    """
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
        "v": [int(v) for v in df["Volume"]],
    }
    if divs:
        result["divs"] = divs
    return result


def fetch_dividends(ticker: str) -> dict | None:
    """Download dividend history for a ticker. Returns {d:[...], a:[...]} or None."""
    try:
        t    = yf.Ticker(ticker)
        divs = t.dividends
        if divs is None or divs.empty:
            return None
        divs = divs.dropna()
        # Remove timezone from index
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
            "a": [round(float(v), 6) for v in divs.values],
        }
    except Exception:
        return None


def fetch_with_retry(ticker: str, start: str, retries: int = 3):
    kwargs = dict(start=start, progress=False, auto_adjust=True)
    for attempt in range(1, retries + 1):
        try:
            df = yf.download(ticker, **kwargs)
            # Flatten MultiIndex columns if present
            if hasattr(df.columns, "levels"):
                df.columns = df.columns.get_level_values(0)
            return df
        except Exception as exc:
            print(f"    attempt {attempt}/{retries} failed: {exc}", flush=True)
            if attempt < retries:
                time.sleep(RETRY_WAIT)
    return None


# ── Main ──────────────────────────────────────────────────────────

def main():
    today          = datetime.date.today()
    screener_start = today - datetime.timedelta(days=int(SCREENER_YEARS * 365 * 1.1))
    docs_data      = Path("docs/data")
    docs_data.mkdir(parents=True, exist_ok=True)

    total_ok = total_fail = 0

    for market_code, watchlist in MARKETS.items():
        print(f"\n{'='*60}", flush=True)
        print(f"  Market: {market_code}  ({len(watchlist)} tickers)", flush=True)
        print(f"{'='*60}", flush=True)

        screener_tickers: dict = {}
        ok = fail = 0

        for i, ticker in enumerate(watchlist, 1):
            print(f"[{i}/{len(watchlist)}] {ticker} ...", end=" ", flush=True)
            try:
                df_full = fetch_with_retry(ticker, DATA_START)
                if df_full is None or df_full.empty:
                    print("NO DATA")
                    fail += 1
                    continue

                divs = fetch_dividends(ticker)
                div_count = len(divs["d"]) if divs else 0

                full_dict = df_to_dict(df_full, divs)
                if full_dict:
                    (docs_data / f"{ticker}.json").write_text(
                        json.dumps(full_dict, separators=(",", ":")), encoding="utf-8"
                    )

                screener_df = df_full[df_full.index.normalize().date >= screener_start]
                screener_dict = df_to_dict(screener_df)
                if screener_dict:
                    screener_tickers[ticker] = screener_dict

                print(f"OK ({len(df_full)} bars, {div_count} dividends)", flush=True)
                ok += 1

            except Exception as exc:
                print(f"ERROR: {exc}", flush=True)
                fail += 1

        # Write per-market screener file
        screener = {"updated": today.isoformat(), "market": market_code, "tickers": screener_tickers}
        out_file = docs_data / f"screener_{market_code}.json"
        out_file.write_text(json.dumps(screener, separators=(",", ":")), encoding="utf-8")
        print(f"\n  → screener_{market_code}.json: {len(screener_tickers)} tickers  ({ok} OK, {fail} failed)", flush=True)
        total_ok += ok
        total_fail += fail

    print(f"\n{'='*60}", flush=True)
    print(f"  TOTAL: {total_ok} OK, {total_fail} failed", flush=True)
    print(f"{'='*60}", flush=True)


if __name__ == "__main__":
    main()
