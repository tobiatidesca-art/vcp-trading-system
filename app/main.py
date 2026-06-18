"""
VCP Trading System — FastAPI entry point.
Serves REST API, WebSocket push, and the static frontend.
"""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backtest import run_backtest
from market_data import DEFAULT_WATCHLIST, clear_cache, get_isin, get_chart_data
from screener import ScreenerService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logging.getLogger("vcp_detector").setLevel(logging.DEBUG)
logger = logging.getLogger(__name__)

BASE_DIR   = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"


# ── WebSocket connection manager ──────────────────────────────

class _ConnectionManager:
    def __init__(self) -> None:
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.append(ws)
        logger.info("WS client connected (%d total)", len(self._connections))

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self._connections:
            self._connections.remove(ws)

    async def broadcast(self, data: object) -> None:
        text = json.dumps(data, default=str)
        dead: list[WebSocket] = []
        for ws in list(self._connections):
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager  = _ConnectionManager()
screener = ScreenerService()
screener.broadcast = manager.broadcast


# ── Lifespan ──────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("VCP Trading System started — port %s", os.environ.get("PORT", 8080))

    async def _loop() -> None:
        await asyncio.sleep(3)
        while True:
            try:
                signals = await screener.scan()
                await manager.broadcast({"type": "signals", "data": signals})
            except Exception as exc:
                logger.error("Screener loop error: %s", exc)
            await asyncio.sleep(60)

    task = asyncio.create_task(_loop())
    yield
    task.cancel()
    logger.info("VCP Trading System stopped")


app = FastAPI(title="VCP Trading System", version="3.0", lifespan=lifespan)


# ── Screener API ──────────────────────────────────────────────

@app.get("/api/screener/signals")
async def get_signals():
    return screener.get_latest()


@app.post("/api/screener/refresh")
async def refresh():
    signals = await screener.scan()
    await manager.broadcast({"type": "signals", "data": signals})
    return signals


@app.get("/api/screener/watchlist")
async def get_watchlist():
    return screener.watchlist


@app.post("/api/screener/watchlist")
async def set_watchlist(body: dict):
    tickers = [t.strip().upper() for t in body.get("tickers", []) if t.strip()]
    if not tickers:
        return {"error": "Lista ticker vuota"}
    screener.watchlist = tickers
    clear_cache()
    return {"message": "Watchlist aggiornata", "count": len(tickers)}


# ── Ticker info API ───────────────────────────────────────────

@app.get("/api/ticker/{symbol}/isin")
async def ticker_isin(symbol: str):
    loop = asyncio.get_event_loop()
    isin = await loop.run_in_executor(None, lambda: get_isin(symbol.upper()))
    return {"isin": isin}


@app.get("/api/ticker/{symbol}/chart")
async def ticker_chart(
    symbol:  str,
    start:   str = "",
    end:     str = "",
    context: int = 60,
):
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(
        None, lambda: get_chart_data(symbol.upper(), start, end, context)
    )
    return data


# ── Backtest API ──────────────────────────────────────────────

@app.post("/api/backtest/run")
async def run_bt(config: dict):
    loop = asyncio.get_event_loop()

    async def _push(ticker: str, current: int, total: int) -> None:
        await manager.broadcast({
            "type": "bt_progress",
            "ticker": ticker,
            "current": current,
            "total": total,
        })

    def _run_sync() -> dict:
        def cb(ticker: str, current: int, total: int) -> None:
            asyncio.run_coroutine_threadsafe(_push(ticker, current, total), loop)
        return run_backtest(config, progress_callback=cb)

    result = await loop.run_in_executor(None, _run_sync)
    return result


@app.get("/api/backtest/tickers")
async def get_tickers():
    return DEFAULT_WATCHLIST


# ── WebSocket ─────────────────────────────────────────────────

@app.websocket("/ws/signals")
async def ws_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    latest = screener.get_latest()
    if latest:
        await websocket.send_text(
            json.dumps({"type": "signals", "data": latest}, default=str)
        )
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ── Static files ──────────────────────────────────────────────

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
async def root():
    return FileResponse(STATIC_DIR / "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False, log_level="info")
