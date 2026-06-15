"""
Backtesting engine — VCP strategy.
Processes each ticker bar-by-bar, entering on the next open after a VCP signal.
Supports fixed-dollar position sizing and optional trailing stop.
"""

import datetime
import logging
from collections import defaultdict
from typing import Callable, Optional

import numpy as np
import pandas as pd

from indicators import atr as calc_atr
from market_data import fetch_ticker_range, get_dividends
from vcp_detector import is_signal_at

logger = logging.getLogger(__name__)


def run_backtest(
    config:            dict,
    progress_callback: Optional[Callable[[str, int, int], None]] = None,
) -> dict:
    tickers    = config.get("tickers", [])
    start_date = config.get("startDate", "")
    end_date   = config.get("endDate", "")

    if not tickers or not start_date or not end_date:
        return {"errorMessage": "tickers, startDate e endDate sono obbligatori."}

    initial_capital = float(config.get("initialCapital", 100_000))
    position_usd    = float(config.get("positionSizeUsd", 10_000))

    all_trades: list[dict] = []
    total = len(tickers)

    for idx, ticker in enumerate(tickers, 1):
        if progress_callback:
            try:
                progress_callback(ticker, idx, total)
            except Exception:
                pass
        try:
            start_dt     = datetime.date.fromisoformat(start_date)
            warmup_days  = config.get("highPeriodDays", 252) + 90
            warmup_start = (start_dt - datetime.timedelta(days=warmup_days)).isoformat()

            df = fetch_ticker_range(ticker, warmup_start, end_date)
            if df.empty or len(df) < 60:
                logger.warning("Not enough data for %s, skipping", ticker)
                continue

            trades = _run_ticker(ticker, df, start_date, end_date, config, position_usd)
            all_trades.extend(trades)
            logger.info("%s: %d trade(s)", ticker, len(trades))
        except Exception as exc:
            logger.error("Backtest error %s: %s", ticker, exc)

    all_trades.sort(key=lambda t: t["entryDate"])

    max_pos = int(config.get("maxOpenPositions", 0))
    if max_pos > 0:
        all_trades = _filter_max_positions(all_trades, max_pos)

    return _compute_metrics(
        all_trades,
        initial_capital  = initial_capital,
        position_size_usd = position_usd,
        max_open_pos     = max_pos,
    )


# ── Per-ticker simulation ─────────────────────────────────────

def _run_ticker(
    ticker:       str,
    df:           pd.DataFrame,
    start_date:   str,
    end_date:     str,
    cfg:          dict,
    position_usd: float = 10_000,
) -> list[dict]:

    scan_cfg = {
        "high_period_days":    cfg.get("highPeriodDays", 252),
        "proximity_threshold": cfg.get("proximityThreshold", 5.0),
        "bb_period":           cfg.get("bbPeriod", 20),
        "bb_std":              cfg.get("bbStdDev", 2.0),
        "bb_width_threshold":  cfg.get("bbWidthThresholdPct", 8.0),
        "bb_contraction_bars": cfg.get("bbContractionBars", 3),
        "volume_multiplier":   cfg.get("volumeMultiplier", 1.3),
        "volume_period":       20,
        "atr_period":          cfg.get("atrPeriod", 14),
        "min_bars":            cfg.get("highPeriodDays", 252) + 30,
    }

    # Strip timezone if still present
    if df.index.tz is not None:
        df = df.copy()
        df.index = pd.to_datetime(df.index.date)

    atr_series = calc_atr(df, scan_cfg["atr_period"])

    # Pre-fetch dividend series once per ticker (disk-cached)
    try:
        divs = get_dividends(ticker)
    except Exception:
        divs = pd.Series(dtype=float)

    dates     = df.index.normalize()
    start_ts  = pd.Timestamp(start_date).normalize()
    end_ts    = pd.Timestamp(end_date).normalize()
    start_arr = np.where(dates >= start_ts)[0]
    end_arr   = np.where(dates <= end_ts)[0]

    if len(start_arr) == 0 or len(end_arr) == 0:
        return []

    start_idx = int(start_arr[0])
    end_idx   = int(end_arr[-1])

    trades: list[dict] = []
    in_pos           = False
    entry_px = stop_loss = highest = entry_atr = 0.0
    shares           = 0
    entry_idx_local  = 0
    entry_date_str   = ""

    i = start_idx
    while i <= end_idx:
        bar      = df.iloc[i]
        cur_open = float(bar["Open"])
        cur_high = float(bar["High"])
        cur_low  = float(bar["Low"])
        cur_cls  = float(bar["Close"])

        if not in_pos:
            if is_signal_at(df, i, scan_cfg) and i + 1 <= end_idx:
                nxt       = df.iloc[i + 1]
                entry_px  = float(nxt["Open"])
                shares    = int(position_usd // entry_px) if entry_px > 0 else 0
                if shares == 0:
                    i += 1
                    continue
                entry_atr = float(atr_series.iloc[i]) if not pd.isna(atr_series.iloc[i]) else (cur_high - cur_low)
                stop_loss = entry_px - cfg.get("stopLossAtrMultiplier", 1.5) * entry_atr
                highest   = entry_px
                entry_idx_local = i + 1
                entry_date_str  = str(df.index[i + 1].date())
                in_pos    = True
                i += 2
                continue
        else:
            highest = max(highest, cur_high)

            trail = (highest - cfg.get("trailingStopAtrMultiplier", 2.0) * entry_atr
                     if cfg.get("useTrailingStop", True) else stop_loss)
            active_stop = max(stop_loss, trail)

            held_days    = i - entry_idx_local
            max_hold     = cfg.get("maxHoldingDays", 60)
            stop_hit     = cur_low <= active_stop
            max_hold_hit = max_hold > 0 and held_days >= max_hold
            end_reached  = i == end_idx

            if stop_hit or max_hold_hit or end_reached:
                if stop_hit:
                    exit_px = max(active_stop, cur_open)
                    reason  = "TRAILING_STOP" if trail > stop_loss else "STOP_LOSS"
                elif max_hold_hit:
                    exit_px = cur_cls
                    reason  = "MAX_HOLD"
                else:
                    exit_px = cur_cls
                    reason  = "END_OF_TEST"

                ret_pct  = (exit_px - entry_px) / entry_px * 100
                pnl_usd  = (exit_px - entry_px) * shares
                exit_date_str = str(df.index[i].date())

                # Dividends paid during holding period
                div_per_share = 0.0
                if not divs.empty:
                    entry_ts = pd.Timestamp(entry_date_str)
                    exit_ts  = pd.Timestamp(exit_date_str)
                    mask = (divs.index > entry_ts) & (divs.index <= exit_ts)
                    div_per_share = float(divs[mask].sum())
                div_yield_pct = div_per_share / entry_px * 100 if entry_px > 0 else 0.0
                div_usd       = div_per_share * shares

                invested_usd = round(entry_px * shares, 2)
                trades.append({
                    "ticker":           ticker,
                    "entryDate":        entry_date_str,
                    "exitDate":         exit_date_str,
                    "entryPrice":       round(entry_px, 2),
                    "exitPrice":        round(exit_px, 2),
                    "stopLossPrice":    round(stop_loss, 2),
                    "returnPct":        round(ret_pct, 2),
                    "pnlUsd":           round(pnl_usd, 2),
                    "investedUsd":      invested_usd,
                    "shares":           shares,
                    "dividendPerShare": round(div_per_share, 4),
                    "dividendYieldPct": round(div_yield_pct, 4),
                    "dividendUsd":      round(div_usd, 2),
                    "holdingDays":      held_days,
                    "exitReason":       reason,
                    "winner":           ret_pct > 0,
                })
                in_pos = False

        i += 1

    return trades


# ── Portfolio filter: max concurrent open positions ───────────

def _filter_max_positions(trades: list[dict], max_pos: int) -> list[dict]:
    """
    Greedily accept trades (sorted by entryDate) only when the number of
    currently open positions is below *max_pos*.
    A position is "open" on date D if entryDate <= D <= exitDate.
    """
    accepted: list[dict] = []
    for trade in trades:  # already sorted by entryDate
        entry = trade["entryDate"]
        open_now = sum(
            1 for t in accepted
            if t["entryDate"] <= entry <= t["exitDate"]
        )
        if open_now < max_pos:
            accepted.append(trade)
    logger.info("Max-pos filter %d: %d → %d trades", max_pos, len(trades), len(accepted))
    return accepted


# ── Aggregate metrics ─────────────────────────────────────────

def _compute_metrics(
    trades:           list[dict],
    initial_capital:  float = 100_000,
    position_size_usd: float = 10_000,
    max_open_pos:     int   = 5,
) -> dict:
    if not trades:
        return {
            "errorMessage": (
                "Nessun segnale trovato nel periodo selezionato. "
                "Prova ad allargare la finestra temporale o allentare i filtri."
            ),
            "totalTrades":    0,
            "initialCapital": initial_capital,
            "finalCapital":   initial_capital,
            "equityCurve":    [initial_capital],
            "equityLabels":   ["Start"],
            "trades":         [],
        }

    wins   = [t for t in trades if t["winner"]]
    losses = [t for t in trades if not t["winner"]]

    n_total = len(trades)
    n_wins  = len(wins)
    n_loss  = len(losses)

    gross_profit = sum(t["returnPct"] for t in wins)
    gross_loss   = abs(sum(t["returnPct"] for t in losses))

    win_rate      = n_wins / n_total * 100
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else gross_profit
    avg_win       = gross_profit / n_wins if n_wins > 0 else 0.0
    avg_loss      = gross_loss / n_loss  if n_loss  > 0 else 0.0
    expectancy    = (win_rate / 100) * avg_win - (1 - win_rate / 100) * avg_loss

    # Dollar equity curve
    equity: list[float] = [initial_capital]
    labels: list[str]   = ["Start"]
    current = initial_capital
    for t in trades:
        current += t.get("pnlUsd", 0.0)
        equity.append(round(current, 2))
        labels.append(f"{t['exitDate']} {t['ticker']}")

    total_return_pct = (current - initial_capital) / initial_capital * 100

    # Maximum drawdown
    peak   = initial_capital
    max_dd = 0.0
    for eq in equity:
        peak   = max(peak, eq)
        max_dd = max(max_dd, (peak - eq) / peak * 100)

    total_pnl = sum(t.get("pnlUsd", 0.0) for t in trades)

    # ── Daily capital deployment series (for metric 3) ───────────
    # For each calendar day, how much capital is deployed across all open positions?
    _min_d = pd.Timestamp(min(t["entryDate"] for t in trades))
    _max_d = pd.Timestamp(max(t["exitDate"]  for t in trades))
    _daily = pd.Series(0.0, index=pd.date_range(_min_d, _max_d, freq="D"))
    for t in trades:
        d1 = pd.Timestamp(t["entryDate"])
        d2 = pd.Timestamp(t["exitDate"])
        _daily.loc[d1:d2] += t.get("investedUsd", 0.0)
    # Average daily deployed capital per year
    _avg_dep_by_year: dict[int, float] = (
        _daily.groupby(_daily.index.year).mean().to_dict()
    )

    # Metric 2 denominator: max capital theoretically at risk at any moment
    _eff_max_pos  = max_open_pos if max_open_pos > 0 else max(
        int(_daily.max() // position_size_usd) if position_size_usd > 0 else 1, 1
    )
    _max_cap_risk = position_size_usd * _eff_max_pos

    # ── Annual & monthly breakdown (by exitDate) ──────────────
    _ann: dict[int, dict]   = defaultdict(lambda: {"n": 0, "w": 0, "pnl": 0.0})
    _mon: dict[tuple, dict] = defaultdict(lambda: {"n": 0, "w": 0, "pnl": 0.0})

    for t in trades:
        ed    = t["exitDate"]
        year  = int(ed[:4])
        month = int(ed[5:7])
        _ann[year]["n"]   += 1
        _ann[year]["w"]   += 1 if t["winner"] else 0
        _ann[year]["pnl"] += t.get("pnlUsd", 0.0)
        _mon[(year, month)]["n"]   += 1
        _mon[(year, month)]["w"]   += 1 if t["winner"] else 0
        _mon[(year, month)]["pnl"] += t.get("pnlUsd", 0.0)

    annual_stats = []
    for year in sorted(_ann):
        d    = _ann[year]
        n    = d["n"]
        pnl  = d["pnl"]
        # Metric 1: return on initial capital
        roi1 = round(pnl / initial_capital * 100, 2) if initial_capital > 0 else 0.0
        # Metric 2: return on max capital at risk
        roi2 = round(pnl / _max_cap_risk * 100, 2) if _max_cap_risk > 0 else 0.0
        # Metric 3: return on average daily deployed capital (time-weighted)
        avg_dep = _avg_dep_by_year.get(year, 0.0)
        roi3 = round(pnl / avg_dep * 100, 2) if avg_dep > 0 else 0.0
        annual_stats.append({
            "year":                  year,
            "trades":                n,
            "wins":                  d["w"],
            "losses":                n - d["w"],
            "winRate":               round(d["w"] / n * 100, 1) if n else 0,
            "pnlUsd":                round(pnl, 0),
            "roiOnInitialCapPct":    roi1,
            "roiOnMaxRiskCapPct":    roi2,
            "roiOnAvgDeployedPct":   roi3,
            "avgDeployedUsd":        round(avg_dep, 0),
        })

    # monthly_stats: { "2023": { "4": {trades, wins, pnlUsd, winRate} } }
    monthly_stats: dict[str, dict[str, dict]] = {}
    for (year, month), d in _mon.items():
        n = d["n"]
        monthly_stats.setdefault(str(year), {})[str(month)] = {
            "trades":  n,
            "wins":    d["w"],
            "pnlUsd":  round(d["pnl"], 0),
            "winRate": round(d["w"] / n * 100, 1) if n else 0,
        }

    return {
        "totalTrades":    n_total,
        "winningTrades":  n_wins,
        "losingTrades":   n_loss,
        "winRate":        round(win_rate, 2),
        "profitFactor":   round(profit_factor, 2),
        "maxDrawdownPct": round(max_dd, 2),
        "totalReturnPct": round(total_return_pct, 2),
        "totalPnlUsd":    round(total_pnl, 2),
        "avgWinPct":      round(avg_win, 2),
        "avgLossPct":     round(avg_loss, 2),
        "expectancyPct":  round(expectancy, 2),
        "initialCapital": initial_capital,
        "finalCapital":   round(current, 2),
        "equityCurve":    equity,
        "equityLabels":   labels,
        "trades":         trades,
        "annualStats":    annual_stats,
        "monthlyStats":   monthly_stats,
    }
