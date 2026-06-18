"""
Technical indicators for VCP pattern detection.
All functions accept a pandas DataFrame with columns: Open, High, Low, Close, Volume.
"""

import pandas as pd
import numpy as np


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """Wilder's Average True Range."""
    h  = df['High']
    l  = df['Low']
    pc = df['Close'].shift(1)
    tr = pd.concat([
        h - l,
        (h - pc).abs(),
        (l - pc).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()


def bb_width(df: pd.DataFrame, period: int = 20, n_std: float = 2.0) -> pd.Series:
    """
    Bollinger Band Width as a percentage of the mid-price (SMA).
    Low values indicate price compression / low volatility.
    """
    c   = df['Close']
    mid = c.rolling(period).mean()
    std = c.rolling(period).std(ddof=0)   # population std (same as TradingView)
    return (2 * n_std * std / mid) * 100


def highest_high(df: pd.DataFrame, period: int) -> pd.Series:
    return df['High'].rolling(period).max()


def sma(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(period).mean()


def avg_volume_before(df: pd.DataFrame, period: int = 20) -> pd.Series:
    """Rolling average of volume excluding the current bar (shift(1))."""
    return df['Volume'].shift(1).rolling(period).mean()
