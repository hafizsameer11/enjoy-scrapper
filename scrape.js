import { chromium } from "playwright";
import { CONFIG } from "./config.js";

async function main() {
  const browser = await chromium.launch({
    headless: false, // IMPORTANT: headful for CF reliability
    proxy: CONFIG.proxy,
  });

  const context = await browser.newContext({
    userAgent: CONFIG.userAgent,
    locale: "en-US",
    viewport: { width: 1920, height: 1080 },
    // Add stealth features
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
  });

  const page = await context.newPage();

  try {
    // 1) Warm Cloudflare session
    console.log("Opening EnjoyTravel to warm session...");
    await page.goto(CONFIG.baseUrl, { waitUntil: "domcontentloaded", timeout: 120000 });

    // Wait for Cloudflare challenge to complete
    console.log("Waiting for Cloudflare challenge to complete...");
    try {
      // Wait for "Just a moment" text to disappear (max 30 seconds)
      await page.waitForFunction(
        () => !document.body.innerText.includes("Just a moment"),
        { timeout: 30000 }
      );
      console.log("Cloudflare challenge passed!");
    } catch (e) {
      console.log("Challenge check timeout, proceeding anyway...");
    }

    // Wait for page to be fully interactive
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    
    // Additional human-like pause
    await page.waitForTimeout(5000);

    // Verify page is ready (not showing Cloudflare challenge)
    const pageContent = await page.content();
    if (pageContent.includes("Just a moment") || pageContent.includes("Checking your browser")) {
      throw new Error("Cloudflare challenge still active. Please wait longer or check your proxy/network.");
    }

    // 2) Call Location Search API INSIDE browser
    console.log("Fetching location ID...");
    const locations = await page.evaluate(async (query) => {
      const url =
        "https://www.enjoytravel.com/api/location/search-locations?" +
        new URLSearchParams({ query, lang: "en" });

      const r = await fetch(url, { 
        credentials: "include",
        headers: {
          'Accept': 'application/json',
          'Referer': window.location.href,
        }
      });
      
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        const t = await r.text();
        throw new Error("Blocked / non-JSON response:\n" + t.slice(0, 300));
      }
      return r.json();
    }, CONFIG.defaults.locationQuery);

    if (!Array.isArray(locations) || locations.length === 0) {
      throw new Error("No locations returned");
    }

    const locationId = locations[0].id;
    console.log("Location ID:", locationId);

    // 3) Call Search API INSIDE browser
    console.log("Fetching search results...");
    const searchResults = await page.evaluate(
      async ({ locationId, pickup, dropoff, time }) => {
        const params = new URLSearchParams({
          source: "enjoy_google_brand",
          plocation: String(locationId),
          dlocation: String(locationId),
          pdate: pickup,
          ddate: dropoff,
          ptime: time,
          dtime: time,
          old: "true",
        });

        const url = "https://www.enjoytravel.com/api/search?" + params.toString();
        const r = await fetch(url, { 
          credentials: "include",
          headers: {
            'Accept': 'application/json',
            'Referer': window.location.href,
          }
        });
        const ct = r.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          const t = await r.text();
          throw new Error("Blocked / non-JSON response:\n" + t.slice(0, 300));
        }
        return r.json();
      },
      {
        locationId,
        pickup: CONFIG.defaults.pickup,
        dropoff: CONFIG.defaults.dropoff,
        time: CONFIG.defaults.time,
      }
    );

    // 4) Normalize results (keys may vary; adjust if needed)
    const items =
      searchResults?.results ||
      searchResults?.Results ||
      searchResults?.cars ||
      searchResults?.Cars ||
      [];

    const offers = items.map((it) => ({
      brand: it?.vehicle?.make || it?.brand || null,
      carType: it?.vehicle?.category || it?.carType || null,
      price:
        it?.price?.amount ??
        it?.totalPrice ??
        it?.Price ??
        null,
      currency:
        it?.price?.currency ??
        it?.Currency ??
        null,
      supplier: it?.supplier || null,
      vehicleName: it?.vehicle?.name || it?.vehicleName || null,
    }));

    console.log("Offers found:", offers.length);
    console.log(JSON.stringify(offers.slice(0, 10), null, 2)); // preview

    // Optionally keep browser open for inspection
    // await page.waitForTimeout(60000);

  } catch (err) {
    console.error("ERROR:", err.message);
  } finally {
    // Close when done
    await browser.close();
  }
}

main();
