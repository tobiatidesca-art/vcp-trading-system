"""
Live screener service.
Pushes typed WebSocket messages:
  {"type": "progress", "current": N, "total": 50, "ticker": "AAPL"}
  {"type": "signals",  "data": [...]}
"""

import asyncio
import logging
from typing import Awaitable, Callable, Optional

from market_data import fetch_multiple, DEFAULT_WATCHLIST, DEFAULT_PERIOD
from vcp_detector import detect_signal, DEFAULT_CONFIG

logger = logging.getLogger(__name__)

# Async function that accepts any serialisable object and broadcasts it.
BroadcastFn = Callable[[object], Awaitable[None]]


class ScreenerService:

    def __init__(self) -> None:
        self.watchlist: list[str]     = list(DEFAULT_WATCHLIST)
        self._latest:   list[dict]    = []
        self._lock                    = asyncio.Lock()
        self.broadcast: Optional[BroadcastFn] = None   # wired up from main.py

    def get_latest(self) -> list[dict]:
        return list(self._latest)

    async def scan(self) -> list[dict]:
        logger.info("Screener scan — %d tickers, period=%s", len(self.watchlist), DEFAULT_PERIOD)
        loop           = asyncio.get_event_loop()
        watchlist_copy = list(self.watchlist)
        total          = len(watchlist_copy)

        # ── progress callback runs in download worker threads ─────
        def _progress(current: int, _total: int, ticker: str) -> None:
            if self.broadcast and loop and not loop.is_closed():
                asyncio.run_coroutine_threadsafe(
                    self.broadcast({
                        "type":    "progress",
                        "current": current,
                        "total":   total,
                        "ticker":  ticker,
                    }),
                    loop,
                )

        # ── download (blocking — runs in thread pool) ─────────────
        data: dict = await loop.run_in_executor(
            None,
            lambda: fetch_multiple(watchlist_copy, DEFAULT_PERIOD, _progress),
        )

        # ── detect VCP signals on each downloaded series ──────────
        signals: list[dict] = []
        for ticker, df in data.items():
            try:
                sig = detect_signal(ticker, df, DEFAULT_CONFIG)
                if sig:
                    signals.append(sig)
            except Exception as exc:
                logger.debug("Signal error %s: %s", ticker, exc)

        _order = {"STRONG": 0, "MODERATE": 1, "WATCH": 2}
        signals.sort(key=lambda s: (_order.get(s["signalStrength"], 3), -s["volumeRatio"]))

        async with self._lock:
            self._latest = signals

        logger.info("Screener done — %d signals", len(signals))
        return signals
