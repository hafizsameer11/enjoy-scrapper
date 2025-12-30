export const CONFIG = {
    // Browserless.io BrowserQL settings
    browserless: {
      apiKey: process.env.BROWSERLESS_API_KEY || "2TgK6KkhRownDqrf0f9e0061093bb3d11095c95fd7b8170f1",
      // BrowserQL endpoint with stealth features
      endpoint: "https://production-sfo.browserless.io/stealth/bql",
    },
    
    proxy: {
      server: "http://us.decodo.com:10009",
      username: "spknrovh6o",
      password: "pnY38juxojFJ7e2e_K",
    },
  
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
  
    baseUrl: "https://www.enjoytravel.com/en/car-hire",
  
    defaults: {
      pickup: "2026-01-03",
      dropoff: "2026-01-10",
      time: "12:00",
      locationQuery: "Miami Airport",
    },
  };
  