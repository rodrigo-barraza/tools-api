# Tools API — Unified Data Aggregator

A consolidated Node.js API that continuously collects and serves data from multiple domains — events, market, products, trends, and weather — through a single unified service. Merges the functionality of five standalone APIs into one composable service for the Sun ecosystem.

## Domains

| Domain      | Route       | Description                                                                |
| ----------- | ----------- | -------------------------------------------------------------------------- |
| **Event**   | `/event`    | Local events from Ticketmaster, SeatGeek, Craigslist, UBC, movie releases  |
| **Market**  | `/market`   | Stock quotes, commodity snapshots, and market data via Yahoo Finance & CME |
| **Product** | `/product`  | Product listings from Best Buy, Product Hunt, eBay, Etsy, and more         |
| **Trend**   | `/trend`    | Trending topics from Reddit, Google Trends, Hacker News, and X (Twitter)   |
| **Weather** | `/weather`  | Weather, air quality, earthquakes, space weather, tides, wildfires, ISS    |

## Prerequisites

- **Node.js** v20+ (ES Modules)
- **MongoDB** — single `tools` database for all domain collections

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure secrets

```bash
cp secrets.example.js secrets.js
```

Edit `secrets.js` and fill in your API keys:

| Secret                   | Domain  | Required | Description                          |
| ------------------------ | ------- | -------- | ------------------------------------ |
| `TOOLS_PORT`             | Server  | No       | Default `5590`                       |
| `MONGODB_URI`            | Server  | No       | Default `mongodb://localhost:27017/tools` |
| `LATITUDE` / `LONGITUDE` | Shared  | No       | Default Vancouver (49.28, -123.12)   |
| `TICKETMASTER_API_KEY`   | Event   | Yes      | Ticketmaster Discovery API           |
| `SEATGEEK_CLIENT_ID`     | Event   | Yes      | SeatGeek Platform API                |
| `TMDB_API_KEY`           | Event   | Yes      | TMDB movie data                      |
| `GOOGLE_PLACES_API_KEY`  | Event   | Yes      | Google Places for venue enrichment   |
| `BESTBUY_API_KEY`        | Product | Yes      | Best Buy Products API                |
| `PRODUCTHUNT_API_KEY`    | Product | Yes      | Product Hunt API                     |
| `EBAY_CLIENT_ID`         | Product | Yes      | eBay Browse API                      |
| `ETSY_API_KEY`           | Product | Yes      | Etsy Open API                        |
| `REDDIT_CLIENT_ID`       | Trend   | Yes      | Reddit API (OAuth)                   |
| `REDDIT_CLIENT_SECRET`   | Trend   | Yes      | Reddit API (OAuth)                   |
| `X_BEARER_TOKEN`         | Trend   | Yes      | X (Twitter) API v2                   |
| `TOMORROWIO_API_KEY`     | Weather | Yes      | Tomorrow.io weather data             |
| `NASA_API_KEY`           | Weather | No       | Default `DEMO_KEY`                   |
| `GOOGLE_API_KEY`         | Weather | Yes      | Google Air Quality API               |

### 3. Run

```bash
# Development (hot-reload)
npm run dev

# Production
npm start
```

Default port: **5590**

## Project Structure

```
tools-api/
├── server.js              # Express app, collector scheduling, route mounting
├── config.js              # Unified config (imports from secrets.js)
├── constants.js           # All enums, intervals, categories, source lists
├── utilities.js           # Shared helpers
├── db.js                  # MongoDB connection
├── routes/                # Express routers per domain
│   ├── EventRoutes.js
│   ├── MarketRoutes.js
│   ├── ProductRoutes.js
│   ├── TrendRoutes.js
│   └── WeatherRoutes.js
├── collectors/            # Scheduled data-collection orchestrators
│   ├── EventCollector.js
│   ├── MarketCollector.js
│   ├── ProductCollector.js
│   ├── TrendCollector.js
│   └── WeatherCollector.js
├── fetchers/              # Per-source HTTP fetchers
│   ├── event/
│   ├── market/
│   ├── product/
│   ├── trend/
│   └── weather/
├── caches/                # In-memory caches (20 modules)
├── models/                # MongoDB document schemas
└── secrets.example.js     # Template for secrets.js
```

## Scripts

| Script               | Description                        |
| -------------------- | ---------------------------------- |
| `npm start`          | Start the server                   |
| `npm run dev`        | Start with nodemon (hot-reload)    |
| `npm run lint`       | Run ESLint                         |
| `npm run lint:fix`   | Run ESLint with auto-fix           |
| `npm run format`     | Format all files with Prettier     |
| `npm run format:check` | Check formatting                 |

## Part of [Sun](https://github.com/rodrigo-barraza)

Tools API is one service in the Sun ecosystem — a collection of composable backend services and frontends designed to be mixed and matched.
