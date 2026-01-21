# RTE100 Index Dashboard

A Next.js dashboard for visualizing the RTE100 (Roblox Top Earning 100) index data.

## Features

- **Index Performance Chart**: Interactive SVG chart showing index level over time with daily returns
- **Top Games Table**: Sortable table displaying top-ranked games with key metrics
- **Dark Mode Support**: Automatic dark/light theme based on system preferences
- **Real-time Data**: Fetches the latest index data from the exports directory

## Getting Started

### Prerequisites

- Node.js 20+ installed
- npm or yarn package manager

### Installation

```bash
cd gui
npm install
```

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Building for Production

```bash
npm run build
npm start
```

## Project Structure

```
gui/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── index-data/       # API routes for fetching data
│   │   ├── layout.tsx            # Root layout with metadata
│   │   ├── page.tsx              # Main dashboard page
│   │   └── globals.css           # Global styles
│   └── components/
│       ├── IndexChart.tsx        # Chart component
│       └── TopGames.tsx          # Games table component
└── public/                       # Static assets
```

## API Endpoints

- `GET /api/index-data` - Returns the latest index data
- `GET /api/index-data/[date]` - Returns data for a specific date (YYYY-MM-DD)

## Data Format

The dashboard reads data from `../index_data/exports/` directory with the following structure:

```
index_data/exports/
└── YYYY-MM-DD/
    ├── rte100.json              # Game rankings and metrics
    └── rte100_index_level.json  # Index performance over time
```

## Key Metrics Displayed

- **Index Level**: Current index value (base 1000)
- **Daily Return**: Percentage change from previous day
- **Coverage**: Data coverage percentage
- **EDR (Estimated Daily Revenue)**: 7-day mean revenue
- **MoM (Month over Month)**: Revenue momentum multiplier
- **CCU (Concurrent Users)**: Average concurrent players
- **Visits**: Total game visits

## Technologies Used

- Next.js 16.1.1 (App Router)
- React 19.2.3
- TypeScript
- Tailwind CSS 4
- Server-side rendering for optimal performance
