"""
VCP (Volatility Contraction Pattern) signal detection.

A valid signal requires ALL THREE conditions simultaneously:
  1. PROXIMITY TO HIGH  – close within X% of the N-day highest high (or above it).
  2. BB CONTRACTION     – Bollinger Band Width < threshold for K consecutive bars.
  3. VOLUME SPIKE       – current bar volume > multiplier × 20-day rolling average.
"""

import logging
from datetime import datetime
from typing import Optional

import pandas as pd

from indicators import atr as calc_atr, bb_width as calc_bb_width

logger = logging.getLogger("vcp_detector")

# ── Default screener configuration ───────────────────────────
DEFAULT_CONFIG: dict = {
    "high_period_days":     252,    # ~52-week high
    "proximity_threshold":  5.0,    # % below high still qualifies (was 3 — too strict)
    "bb_period":            20,
    "bb_std":               2.0,
    "bb_width_threshold":   8.0,    # band width must be < this % (was 6 — too strict)
    "bb_contraction_bars":  3,      # consecutive bars required (was 5)
    "volume_multiplier":    1.3,    # vol > X × 20d avg (was 1.5)
    "volume_period":        20,
    "atr_period":           14,
    "min_bars":             200,    # warmup bars (was 300)
}


def detect_signal(ticker: str, df: pd.DataFrame,
                  cfg: dict = DEFAULT_CONFIG) -> Optional[dict]:
    """
    Analyse the most recent bar of `df` and return a signal dict, or None.
    Used by the live screener.
    """
    if df is None or len(df) < cfg["min_bars"]:
        logger.debug("%-6s  SKIP  bars=%d < min=%d", ticker, len(df) if df is not None else 0, cfg["min_bars"])
        return None

    # ── Condition 1: proximity to N-day high ─────────────────
    high_n   = df["High"].iloc[-cfg["high_period_days"]:].max()
    last_c   = float(df["Close"].iloc[-1])
    dist_pct = (last_c - float(high_n)) / float(high_n) * 100
    if dist_pct < -cfg["proximity_threshold"]:
        logger.debug("%-6s  C1 FAIL  dist=%.1f%%  (threshold=%.1f%%)", ticker, dist_pct, -cfg["proximity_threshold"])
        return None

    # ── Condition 2: BB contraction for K bars ───────────────
    bbw    = calc_bb_width(df, cfg["bb_period"], cfg["bb_std"])
    recent = bbw.iloc[-cfg["bb_contraction_bars"]:]
    bb_max = float(recent.max()) if not recent.isna().all() else 999
    if recent.isna().any() or (recent > cfg["bb_width_threshold"]).any():
        logger.debug("%-6s  C2 FAIL  bb_max=%.1f%%  (threshold=%.1f%%)", ticker, bb_max, cfg["bb_width_threshold"])
        return None

    # ── Condition 3: volume spike ────────────────────────────
    vol_ma    = float(df["Volume"].shift(1).rolling(cfg["volume_period"]).mean().iloc[-1])
    cur_vol   = float(df["Volume"].iloc[-1])
    vol_ratio = cur_vol / vol_ma if vol_ma > 0 else 0.0
    if vol_ratio < cfg["volume_multiplier"]:
        logger.debug("%-6s  C3 FAIL  vol_ratio=%.2fx  (min=%.2fx)", ticker, vol_ratio, cfg["volume_multiplier"])
        return None

    # ── Build signal dict ────────────────────────────────────
    atr_val = float(calc_atr(df, cfg["atr_period"]).iloc[-1])
    bb_val  = float(bbw.iloc[-1])

    return {
        "ticker":              ticker,
        "currentPrice":        round(last_c, 2),
        "distanceFromHighPct": round(dist_pct, 2),
        "bbWidthPct":          round(bb_val, 2),
        "atr14":               round(atr_val, 2),
        "volumeRatio":         round(vol_ratio, 2),
        "highPeriodDays":      cfg["high_period_days"],
        "highPeriodPrice":     round(float(high_n), 2),
        "putCallRatio":        0,
        "signalStrength":      _classify(dist_pct, bb_val, vol_ratio),
        "detectedAt":          datetime.now().isoformat(),
    }


def is_signal_at(df: pd.DataFrame, idx: int, cfg: dict) -> bool:
    """
    Check VCP conditions at bar `idx` (0-based) using only data up to that bar.
    Used by the backtesting engine.
    """
    min_required = max(cfg["min_bars"], cfg["high_period_days"] + cfg["bb_contraction_bars"])
    if idx < min_required:
        return False

    sub = df.iloc[: idx + 1]

    # Condition 1
    high_n   = sub["High"].iloc[-cfg["high_period_days"]:].max()
    last_c   = float(sub["Close"].iloc[-1])
    dist_pct = (last_c - float(high_n)) / float(high_n) * 100
    if dist_pct < -cfg["proximity_threshold"]:
        return False

    # Condition 2
    bbw = calc_bb_width(sub, cfg["bb_period"], cfg["bb_std"])
    recent = bbw.iloc[-cfg["bb_contraction_bars"]:]
    if recent.isna().any() or (recent > cfg["bb_width_threshold"]).any():
        return False

    # Condition 3
    vol_ma  = float(sub["Volume"].shift(1).rolling(cfg["volume_period"]).mean().iloc[-1])
    cur_vol = float(sub["Volume"].iloc[-1])
    if vol_ma <= 0 or (cur_vol / vol_ma) < cfg["volume_multiplier"]:
        return False

    return True


def _classify(dist: float, bbw: float, vol: float) -> str:
    score = 0
    if dist >= 0:    score += 2
    elif dist > -1:  score += 1
    if bbw < 4.0:    score += 2
    elif bbw < 5.5:  score += 1
    if vol > 2.5:    score += 2
    elif vol > 1.8:  score += 1
    return "STRONG" if score >= 5 else "MODERATE" if score >= 3 else "WATCH"
