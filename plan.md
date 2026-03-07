You are a senior backend engineer and quantitative trading infrastructure architect.

Your task is to design and implement a **production-grade backend for a Crypto RSI Market Screener** that will monitor **100–500 cryptocurrency trading pairs in near real-time** and calculate **RSI indicators across multiple timeframes**.

The system must use **modern 2026 backend best practices**, clean architecture, high performance streaming, and be optimized for **low infrastructure cost and reliability**.

The screener will use **Binance public market data streams** as the primary data source.

Your goal is to generate the **complete backend architecture, folder structure, core services, and code implementation plan**.

---

# 1. System Goals

Build a backend service that:

• Connects to Binance real-time WebSocket streams
• Monitors 100–500 crypto trading pairs
• Processes live candlestick data
• Calculates RSI indicators continuously
• Supports multiple timeframes
• Exposes screener results through an API
• Runs efficiently on a small server

Target latency: **1–3 seconds**

The system must be designed to scale to **1000+ pairs in the future**.

---

# 2. Technical Stack (2026 Best Practices)

Use the following stack:

Runtime
Node.js (latest LTS)

Language
TypeScript (strict mode)

Framework
Next.js API routes or Fastify backend


The code must follow:

• modular architecture
• dependency separation
• typed interfaces
• proper error handling
• reconnection logic

---

# 3. Binance Market Data Integration

Use Binance WebSocket streams.

Stream type:

symbol@kline_1m

Example streams:

btcusdt@kline_1m
ethusdt@kline_1m
solusdt@kline_1m

Endpoint:

wss://stream.binance.com:9443/stream

Use **combined streams** to subscribe to many symbols per connection.

Binance limits:

• maximum ~200 streams per connection
• connections reset every 24 hours

Implement:

• automatic reconnection
• heartbeat monitoring
• stream resubscription

The system must automatically split symbols across multiple WebSocket connections if needed.

---

# 4. Candle Processing Engine

Create a real-time candle ingestion system.

Incoming data includes:

open
high
low
close
volume
timestamp
symbol

The system must:

• store the latest candles in memory
• maintain a rolling window of the last 100 candles per symbol
• update candles when new data arrives

Data structure example:

Map<symbol, Candle[]>

Each candle object:

symbol
open
high
low
close
volume
timestamp

---

# 5. Multi-Timeframe Candle Aggregation

The base stream is 1-minute candles.

Generate higher timeframes from this data.

Required timeframes:

1 minute
5 minutes
15 minutes

Implement a candle aggregation service that converts 1m candles into 5m and 15m candles.

This should run continuously as new candles arrive.

---

# 6. Indicator Engine

Create an indicator calculation module.

Indicators required:

RSI (Relative Strength Index)

Configuration:

default RSI period = 14

For each symbol calculate:

RSI_1m
RSI_5m
RSI_15m

The engine must:

• update RSI only when a new candle closes
• avoid unnecessary recalculation
• support adding more indicators in the future

Design this module to be extensible.

---

# 7. Screener Engine

Create a screener processor that produces the final output for each coin.

Output format example:

{
symbol: "BTCUSDT",
price: 64200,
rsi1m: 62.3,
rsi5m: 55.1,
rsi15m: 48.7,
signal: "neutral"
}

Signal logic:

RSI < 30 → oversold
RSI > 70 → overbought
otherwise → neutral

This engine should continuously update results in memory.

---

# 8. Coin Management

Create a configuration system that defines which coins are monitored.

Support:

100–500 coins

Example format:

BTCUSDT
ETHUSDT
SOLUSDT
BNBUSDT

Allow the system to easily extend this list.

Optional enhancement:

Auto-fetch top trading pairs from Binance REST API.

---

# 9. API Layer

Expose screener results through an HTTP API.

Endpoint:

GET /api/screener

Response:

array of screener objects.

The API must:

• be lightweight
• return results in <100ms
• read from memory cache

---

# 10. Performance Requirements

The system must:

• handle 500 coins
• process continuous market streams
• keep memory usage low
• run on a small VPS (~2GB RAM)

Use efficient data structures and avoid unnecessary loops.

---

# 11. Observability and Logging

Implement production logging.

Use structured logs.

Log:

• WebSocket connections
• reconnect events
• processing errors
• indicator updates

Make logs easy to monitor.

---

# 12. Folder Structure

Design a clean modular folder structure such as:

src
config
core
binance
candle-engine
indicator-engine
screener-engine
api
types
utils

Explain each module.

---

# 13. Fault Tolerance

The system must handle:

• WebSocket disconnections
• malformed messages
• exchange downtime

Implement retry logic and safeguards.

---

# 14. Future Extensibility

Design the system so it can easily support:

• additional indicators (MACD, EMA)
• alert system
• Telegram notifications
• trading strategies
• backtesting

---

# 15. Expected Output From You

Generate:

1. Complete backend architecture
2. Folder structure
3. Core service implementations
4. WebSocket ingestion logic
5. Candle aggregation system
6. RSI engine
7. Screener engine
8. API endpoint
9. TypeScript interfaces
10. Production ready code examples

Ensure the design is **clean, scalable, and production ready**.
