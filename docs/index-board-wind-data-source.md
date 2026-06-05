# Index Board Wind Data Source Plan

## Goal

Use Wind as the primary upstream for index-board market data, with public APIs as fallback only when Wind is unavailable. Business endpoints should read cached MySQL data. Online requests must not call Wind directly.

## Source Boundary

- Frontend static constants:
  - Global top 10 market capitalization ranking. This is low-change reference data and should stay in index-board source code with a visible data date.
- Backend daily cache:
  - Index cards, market style, fund flow, industry flow, crowding, value stock current indicators.
- Backend monthly or quarterly history:
  - Index 10-year monthly K-line, PE/PB/market-cap history, GDP/Buffett indicator.
  - Index revenue/profit TTM should use reporting-period data, then render as quarterly points or step-filled monthly values.

## Wind Probe Result

Current probe command:

```bash
pnpm run probe-wind-market-source
```

Validated capabilities:

| Dataset | Wind route | Update | Notes |
| --- | --- | --- | --- |
| Index card snapshot | `index_data.get_index_price_indicators` | Daily after close | Supports close, change %, turnover, advance/decline counts. |
| Index 10-year monthly K-line | `index_data.get_index_kline` with `period=12` | Monthly incremental | Cold start returns one table for 10 years; then fetch only latest month. |
| Index PE/PB/market-cap history | `analytics_data.get_financial_data` | Monthly incremental | Structured query works better than `get_index_fundamentals` for 10-year month-end tables. |
| Index revenue/profit TTM | `analytics_data.get_financial_data` | Quarterly incremental | Must ask for reporting-period date; monthly wording may omit date. |
| Hong Kong index snapshot | `index_data.get_index_price_indicators` | Daily after close | `HSI.HI` works for Hang Seng snapshot. |
| Wind level-1 industry matrix | `analytics_data.get_financial_data` | Daily after close | One request can return industry cap, turnover, change %, turnover rate, PE. |
| ETF snapshot | `fund_data.get_fund_price_indicators` | Daily after close | Fund size works; fund latest shares may be `INVALID`, so use size + price/quote as fallback. |
| Value stock snapshot | `stock_data.get_stock_price_indicators` | Monthly snapshot | Supports price, dividend yield, PE, market cap. |
| Value stock events | `stock_data.get_stock_events` | Weekly or monthly | Supports dividend, SEO, rights issue, event scan. |
| China GDP | `economic_data.get_economic_data` | Monthly check, quarterly data | Use as Buffett denominator. |
| Fund cluster | `analytics_data.get_financial_data` | Quarterly after fund disclosure | Use for top holdings and industry concentration. |

## Minimal Upstream Request Plan

Daily after close:

- 1 request for each tracked index snapshot, or batch through analytics if the Wind route proves stable.
- 1 request for Wind level-1 industry matrix.
- 1 request for ETF flow ranking candidate set.
- 1 request for value stock latest indicators if cards need same-day refresh; otherwise monthly only.

Monthly on the first trading day:

- For each tracked index:
  - Fetch the last month K-line only.
  - Fetch the last month PE/PB/market-cap only.
  - Recalculate PE percentile and Buffett indicator from stored history.
- For style rotation:
  - Derive the month winner from monthly return, fund flow, industry flow, and crowding.

Quarterly after reports/fund disclosure:

- For each tracked index:
  - Fetch latest reporting-period revenue/profit TTM.
- For crowding:
  - Refresh fund top holdings and industry concentration.
- For value stocks:
  - Refresh dividend events, financing events, and major risk events.

Cold start:

- Index history: roughly 3 requests per index:
  - monthly K-line,
  - PE/PB/market-cap history,
  - revenue/profit reporting-period history.
- Market style/crowding/value: one batch request per logical dataset where possible.

## Data Model Direction

Keep market tables isolated from blog data:

- `market_instrument`
  - One row per index, industry, ETF, stock, macro indicator.
- `market_observation`
  - Time-series metrics: `instrument_id`, `metric_key`, `period_type`, `data_date`, `value`, `unit`, `source`.
- `market_dataset_cache`
  - API payload cache for frontend endpoints.
- `market_origin_status`
  - Wind/public source call status, latency, message, fetched time.
- `market_origin_job`
  - Future job run records for monitoring and retries.

## Endpoint Contract

Frontend should continue using:

- `GET /blogapi/market/overview`
- `GET /blogapi/market/style`
- `GET /blogapi/market/crowding`
- `GET /blogapi/market/value`
- `GET /blogapi/market/history?id=csi300&years=10`

Each endpoint should expose:

- `updatedAt`: payload generation time.
- `dataAsOf`: latest data date used by this module.
- `source`: `wind`, `public`, or `mixed`.
- `sourceStatus`: concise upstream status for hover/debug.

## Important Caveats

- Do not use Wind as a live request dependency for public traffic.
- Natural-language Wind queries are useful but must be pinned and monitored; if returned columns change, mark the dataset stale and keep the previous cache.
- Historical revenue/profit should use reporting-period dates, not month-end natural-language wording, because month-end wording may return values without usable dates.
- ETF latest shares may be unavailable for some funds; fall back to fund size, NAV/price, and prior size delta.

Data source: Wind Financial Data Service.
