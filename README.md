# Enjoy Travel Browser Scraper

A web scraper for extracting car rental offers from EnjoyTravel.com with a beautiful web interface.

## Features

- ✅ **Web Interface**: User-friendly frontend for searching and viewing results
- ✅ **Location Search**: Search and select locations with automatic ID detection
- ✅ **Date/Time Selection**: Pick custom pickup and drop-off dates and times
- ✅ **Cloudflare Bypass**: Uses Browserless.io's stealth endpoint (`/stealth/bql`)
- ✅ **CSV Export**: Download results as CSV file
- ✅ **Tabular Display**: Beautiful table view of all car rental offers
- ✅ **Real-time Results**: See results as they're scraped

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API Key

Your Browserless.io API key is already configured in `config.js`. If you need to change it:

**Option A: Environment Variable (Recommended)**
```bash
export BROWSERLESS_API_KEY='your-api-key-here'
```

**Option B: Direct Configuration**
Update `config.js` directly with your API key in the `browserless.apiKey` field.

### 3. Start the Server

```bash
npm start
# or
npm run server
```

The server will start on `http://localhost:3000`

### 4. Open in Browser

Open your browser and navigate to:
```
http://localhost:3000
```

## Usage

### Web Interface

1. **Search Location**: Enter a location (e.g., "Miami Airport", "New York") and click "Search"
2. **Select Location**: Click on a location from the results to select it
3. **Set Dates & Times**: Choose pickup and drop-off dates and times
4. **Search Rentals**: Click "🔍 Search Car Rentals" to start scraping
5. **View Results**: Results will appear in a table below
6. **Export CSV**: Click "📥 Download CSV" to download all results

### Command Line (Alternative)

**BrowserQL Scraper:**
```bash
npm run scrape:browserql
```

**Playwright Scraper (Local):**
```bash
npm run scrape
```

## API Endpoints

### POST `/api/search-location`
Search for locations by name.

**Request:**
```json
{
  "query": "Miami Airport"
}
```

**Response:**
```json
{
  "locations": [
    {
      "id": 4866,
      "name": "Miami Airport",
      "address": "..."
    }
  ]
}
```

### POST `/api/scrape`
Run the scraper with location and dates.

**Request:**
```json
{
  "locationId": 4866,
  "pickup": "2026-01-03",
  "dropoff": "2026-01-10",
  "pickupTime": "12:00",
  "dropoffTime": "12:00"
}
```

**Response:**
```json
{
  "success": true,
  "offers": [...],
  "total": 175,
  "csvFilename": "enjoytravel-offers-2025-12-27T14-10-49.csv"
}
```

### GET `/api/download-csv/:filename`
Download a CSV file.

**Example:**
```
GET /api/download-csv/enjoytravel-offers-2025-12-27T14-10-49.csv
```

## Configuration

Edit `config.js` to customize defaults:

```javascript
export const CONFIG = {
  browserless: {
    apiKey: process.env.BROWSERLESS_API_KEY || "your-api-key",
    endpoint: "https://production-sfo.browserless.io/stealth/bql",
  },
  defaults: {
    pickup: "2026-01-03",
    dropoff: "2026-01-10",
    time: "12:00",
    locationQuery: "Miami Airport",
  },
};
```

## Project Structure

```
enjoy-browser-scraper/
├── server.js              # Express.js backend server
├── browserql.js           # Shared BrowserQL execution function
├── scrape-browserql.js   # BrowserQL scraper (CLI)
├── scrape.js              # Playwright scraper (CLI)
├── config.js              # Configuration
├── public/
│   └── index.html         # Web frontend
└── package.json           # Dependencies
```

## Output Format

### CSV Columns

- Brand
- Car Type
- Vehicle Name
- Supplier
- Price
- Currency
- Price Per Day
- Rating
- Recommended
- Car ID
- Transmission
- Seats
- Fuel Type

### Example Output

```json
{
  "brand": null,
  "carType": "Small",
  "vehicleName": "Nissan Tiida",
  "supplier": "Economy Rent a Car",
  "price": 51.39,
  "currency": "USD",
  "priceDayRate": 7.34,
  "rating": 3,
  "recommended": false,
  "carId": "gx-42899-ECAR-88880-5",
  "transmission": "Automatic",
  "seats": "5",
  "fuelType": "Petrol"
}
```

## Troubleshooting

### Server Won't Start

**"Port 3000 already in use"**
- Change the port: `PORT=3001 npm start`
- Or kill the process using port 3000

### Location Search Fails

- Check your Browserless.io API key is valid
- Verify you have credits in your Browserless.io account
- Check browser console for errors

### Scraping Returns No Results

- Verify the location ID is correct
- Check that dates are in the future
- Ensure Browserless.io account has credits

### CSV Download Fails

- Make sure you've run a search first
- Check that the filename matches the one returned in the API response

## Development

### Running in Development Mode

```bash
npm start
```

The server will restart automatically on file changes (if using nodemon).

### Testing API Endpoints

```bash
# Search location
curl -X POST http://localhost:3000/api/search-location \
  -H "Content-Type: application/json" \
  -d '{"query": "Miami Airport"}'

# Run scraper
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "locationId": 4866,
    "pickup": "2026-01-03",
    "dropoff": "2026-01-10",
    "pickupTime": "12:00",
    "dropoffTime": "12:00"
  }'
```

## References

- [BrowserQL Documentation](https://docs.browserless.io/browserql/getting-started)
- [Browserless.io](https://www.browserless.io/)
- [Express.js](https://expressjs.com/)

## License

ISC
# enjoy-scrapper
