# Pakistan Market Desk

Premium Pakistan stock market research dashboard built with React Native Web and a small Node data adapter.

## Features

- Mobile responsive React Native interface for web.
- Top 10 Pakistan Stock Exchange stock ranking using profit momentum, year to date movement, liquidity, and valuation bands.
- Top 10 broker board from the Pakistan Stock Exchange broker ranking page.
- Expert Opinion button backed by a Python technical analysis engine.
- Pakistan Stock Exchange data adapter with caching and demo fallback data when the remote source is unavailable.

## Python analysis

The Expert Opinion API calls `scripts/psx_analyzer.py`. The Python engine fetches historical end of day price and volume data, then calculates six-month and one-year momentum, moving averages, relative strength, trend slope, volatility, drawdown, liquidity, and valuation-aware scores.

## Run locally

Install dependencies:

```bash
npm install
```

Start the API:

```bash
npm run api
```

Start the web app in another terminal:

```bash
npm run dev
```

Open `http://127.0.0.1:3000`.

## Data and compliance

The adapter reads public Pakistan Stock Exchange Data Portal pages only for a small cached research snapshot. For production, public redistribution, commercial use, or near-real-time market data, obtain the relevant Pakistan Stock Exchange data rights/license.

The Expert Opinion output is research support only. It is not investment advice and should be reviewed with a licensed professional before trading.
