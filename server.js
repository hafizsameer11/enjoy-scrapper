import express from "express";
import cors from "cors";
import { CONFIG } from "./config.js";
import { executeBrowserQL } from "./browserql.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Initialize CSV storage
app.locals.csvFiles = app.locals.csvFiles || {};

// API: Search for location
app.post("/api/search-location", async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: "Location query is required" });
    }

    // First warm up the session
    await executeBrowserQL(`mutation { goto(url: "${CONFIG.baseUrl}", waitUntil: networkIdle) { status } }`);

    // Navigate to location API endpoint
    const locationUrl = `https://www.enjoytravel.com/api/location/search-locations?${new URLSearchParams({ query, lang: 'en' })}`;
    
    const locationMutation = `mutation GetLocation {
      goto(url: "${locationUrl}", waitUntil: networkIdle) {
        status
      }
      locationData: text(selector: "body") {
        text
      }
    }`;
    
    const locationResult = await executeBrowserQL(locationMutation);
    const locationText = locationResult.locationData?.text || "[]";
    
    let locations;
    try {
      locations = JSON.parse(locationText);
    } catch (e) {
      // Try to extract JSON from response
      const jsonMatch = locationText.match(/\{.*\}|\[.*\]/s);
      if (jsonMatch) {
        locations = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse location response: " + locationText.substring(0, 200));
      }
    }
    
    if (!Array.isArray(locations) || locations.length === 0) {
      return res.status(404).json({ error: "No locations found" });
    }

    res.json({ locations });
  } catch (error) {
    console.error("Location search error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Store for progress updates (in production, use Redis or similar)
const progressStore = new Map();
const bulkProgressStore = new Map();

// API: Get progress updates
app.get("/api/scrape-progress/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const progress = progressStore.get(sessionId) || { status: 'idle', message: 'Waiting...', progress: 0 };
  res.json(progress);
});

// API: Run scraper
app.post("/api/scrape", async (req, res) => {
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Initialize progress
  progressStore.set(sessionId, { status: 'starting', message: 'Initializing scraper...', progress: 0 });
  
  // Run scraper asynchronously
  (async () => {
    try {
      const { locationId, pickup, dropoff, pickupTime, dropoffTime } = req.body;
      
      if (!locationId || !pickup || !dropoff) {
        progressStore.set(sessionId, { status: 'error', message: 'Missing required fields', progress: 0 });
        return;
      }

      const ptime = pickupTime || CONFIG.defaults.time;
      const dtime = dropoffTime || CONFIG.defaults.time;

      // Step 1: Warm up session
      progressStore.set(sessionId, { status: 'running', message: '🌐 Connecting to EnjoyTravel...', progress: 10 });
      await executeBrowserQL(`mutation { goto(url: "${CONFIG.baseUrl}", waitUntil: networkIdle) { status } }`);
      
      progressStore.set(sessionId, { status: 'running', message: '✅ Connected! Waiting for Cloudflare challenge...', progress: 20 });
      await new Promise(resolve => setTimeout(resolve, 2000)); // Small delay

      // Step 2: Fetch search results
      progressStore.set(sessionId, { status: 'running', message: '🔍 Fetching car rental offers...', progress: 40 });
      
      const searchParams = new URLSearchParams({
        source: 'enjoy_google_brand',
        plocation: String(locationId),
        dlocation: String(locationId),
        pdate: pickup,
        ddate: dropoff,
        ptime: ptime,
        dtime: dtime,
        old: 'true',
      });
      
      const searchUrl = `https://www.enjoytravel.com/api/search?${searchParams.toString()}`;
      
      const searchMutation = `mutation GetSearchResults {
        goto(url: "${searchUrl}", waitUntil: networkIdle) {
          status
        }
        searchData: text(selector: "body") {
          text
        }
      }`;

      progressStore.set(sessionId, { status: 'running', message: '📡 Calling search API...', progress: 50 });
      const searchResult = await executeBrowserQL(searchMutation);
      const searchText = searchResult.searchData?.text || "{}";
    
      progressStore.set(sessionId, { status: 'running', message: '📦 Parsing API response...', progress: 60 });
      
      let searchResults;
      try {
        searchResults = JSON.parse(searchText);
      } catch (e) {
        const jsonMatch = searchText.match(/\{.*\}|\[.*\]/s);
        if (jsonMatch) {
          searchResults = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("Could not parse search response");
        }
      }

      progressStore.set(sessionId, { status: 'running', message: '🔄 Processing results...', progress: 70 });
      
      // Process results
    let items = [];
    
    if (searchResults?.products && Array.isArray(searchResults.products)) {
      items = searchResults.products.map(product => {
        const vehicle = product.listProduct || product.referenceProduct || product;
        return {
          ...vehicle,
          supplier: product.supplierName || vehicle.supplier,
          rating: product.rating,
          recommended: product.recommended,
          price: vehicle.price || product.payNowPayTotal || product.resultDisplayPrice,
          carId: product.carId,
          normalizedTypeName: product.normalizedTypeName || vehicle.vehicleCategoryName,
        };
      });
    } else if (searchResults?.categoryItems && Array.isArray(searchResults.categoryItems)) {
      items = searchResults.categoryItems.map(category => {
        const vehicle = category.referenceProduct || {};
        return {
          ...vehicle,
          categoryName: category.categoryName,
        };
      });
    }

    const offers = items.map((it) => ({
      brand: it?.vehicle?.make || it?.make || it?.brand || null,
      carType: it?.normalizedTypeName || it?.vehicleCategoryName || it?.vehicle?.category || it?.categoryName || it?.carType || it?.type || null,
      price: it?.price ?? it?.payNowPayTotal ?? it?.resultDisplayPrice ?? it?.price?.amount ?? it?.totalPrice ?? it?.Price ?? it?.premiumPrice ?? null,
      currency: it?.currency || it?.localCurrency || "USD",
      supplier: it?.supplier || it?.supplierName || it?.provider || null,
      vehicleName: it?.vehicle?.name || it?.name || it?.vehicleName || null,
      priceDayRate: it?.priceDayRate || it?.premiumPriceDayRate || null,
      rating: it?.rating || null,
      recommended: it?.recommended || false,
      carId: it?.carId || null,
      transmission: it?.transmission || null,
      seats: it?.seats || null,
      fuelType: it?.fuelType || null,
      acrissCode: it?.acrissCode || null,
    }));

    // Generate CSV
    const csvHeaders = [
      "Brand", "Car Type", "Vehicle Name", "Supplier", "Price", "Currency",
      "Price Per Day", "Rating", "Recommended", "Car ID", "ACRISS Code", "Transmission", "Seats", "Fuel Type"
    ];
    
    const escapeCsvValue = (value) => {
      if (value === null || value === undefined) return "";
      const str = String(value);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    
    const csvRows = offers.map(offer => [
      offer.brand || "",
      offer.carType || "",
      offer.vehicleName || "",
      offer.supplier || "",
      offer.price || "",
      offer.currency || "",
      offer.priceDayRate || "",
      offer.rating || "",
      offer.recommended ? "Yes" : "No",
      offer.carId || "",
      offer.acrissCode || "",
      offer.transmission || "",
      offer.seats || "",
      offer.fuelType || ""
    ]);
    
    const csvContent = [
      csvHeaders.map(escapeCsvValue).join(","),
      ...csvRows.map(row => row.map(escapeCsvValue).join(","))
    ].join("\n");

      progressStore.set(sessionId, { status: 'running', message: '💾 Generating CSV file...', progress: 85 });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
      const filename = `enjoytravel-offers-${timestamp}.csv`;
      
      // Store CSV in memory (in production, use file system or database)
      // Ensure csvFiles is initialized
      if (!app.locals.csvFiles) {
        app.locals.csvFiles = {};
      }
      app.locals.csvFiles[filename] = csvContent;
      console.log(`📄 CSV stored: ${filename} (${offers.length} offers, ${csvContent.length} bytes)`);
      console.log(`📦 Total CSV files in memory: ${Object.keys(app.locals.csvFiles).length}`);
      
      progressStore.set(sessionId, { 
        status: 'completed', 
        message: `✅ Success! Found ${offers.length} car rental offers`, 
        progress: 100,
        result: {
          success: true,
          offers,
          total: offers.length,
          csvFilename: filename,
        }
      });
    } catch (error) {
      console.error("Scraping error:", error);
      progressStore.set(sessionId, { 
        status: 'error', 
        message: `❌ Error: ${error.message}`, 
        progress: 0 
      });
    }
  })();

  // Return session ID immediately
  res.json({ sessionId, message: 'Scraping started. Use /api/scrape-progress/:sessionId to get updates.' });
});

// API: Download CSV
app.get("/api/download-csv/:filename", (req, res) => {
  let { filename } = req.params;
  
  // Decode filename in case it's URL encoded
  filename = decodeURIComponent(filename);
  
  console.log(`📥 CSV download requested: ${filename}`);
  console.log(`📦 Available CSV files:`, Object.keys(app.locals.csvFiles || {}));
  
  // Try exact match first
  let csvContent = app.locals.csvFiles?.[filename];
  
  // If not found, try to find a matching file (case-insensitive or partial match)
  if (!csvContent && app.locals.csvFiles) {
    const availableFiles = Object.keys(app.locals.csvFiles);
    const match = availableFiles.find(f => 
      f.toLowerCase() === filename.toLowerCase() || 
      f.includes(filename) || 
      filename.includes(f)
    );
    if (match) {
      console.log(`🔍 Found matching file: ${match}`);
      csvContent = app.locals.csvFiles[match];
      filename = match; // Use the actual filename
    }
  }
  
  if (!csvContent) {
    console.error(`❌ CSV file not found: ${filename}`);
    console.error(`Available files:`, Object.keys(app.locals.csvFiles || {}));
    return res.status(404).json({ 
      error: "CSV file not found. It may have expired or the session was cleared.",
      requested: filename,
      available: Object.keys(app.locals.csvFiles || {})
    });
  }
  
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csvContent);
  console.log(`✅ CSV downloaded successfully: ${filename} (${csvContent.length} bytes)`);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});


// Store for bulk progress updates

// API: Get bulk scrape progress
app.get("/api/bulk-scrape-progress/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const progress = bulkProgressStore.get(sessionId) || { status: 'idle', message: 'Waiting...', progress: 0 };
  res.json(progress);
});

// API: Run bulk scraper
app.post("/api/bulk-scrape", async (req, res) => {
  const sessionId = `bulk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Initialize progress
  bulkProgressStore.set(sessionId, { 
    status: 'starting', 
    message: 'Initializing bulk search...', 
    progress: 0,
    currentDay: 0,
    totalDays: 0
  });
  
  // Run bulk scraper asynchronously
  (async () => {
    try {
      const { locationId, startDate, endDate, time } = req.body;
      
      if (!locationId || !startDate || !endDate) {
        bulkProgressStore.set(sessionId, { 
          status: 'error', 
          message: 'Missing required fields', 
          progress: 0 
        });
        return;
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffTime = Math.abs(end - start);
      const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      if (totalDays > 365) {
        bulkProgressStore.set(sessionId, { 
          status: 'error', 
          message: 'Maximum 365 days allowed', 
          progress: 0 
        });
        return;
      }

      const allOffers = [];
      const rentalTime = time || CONFIG.defaults.time;

      // Warm up session once
      bulkProgressStore.set(sessionId, { 
        status: 'running', 
        message: '🌐 Connecting to EnjoyTravel...', 
        progress: 5,
        currentDay: 0,
        totalDays
      });
      await executeBrowserQL(`mutation { goto(url: "${CONFIG.baseUrl}", waitUntil: networkIdle) { status } }`);
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Iterate through each day
      for (let i = 0; i < totalDays; i++) {
        const currentDate = new Date(start);
        currentDate.setDate(start.getDate() + i);
        const dateStr = currentDate.toISOString().split('T')[0];
        
        bulkProgressStore.set(sessionId, { 
          status: 'running', 
          message: `🔍 Searching ${dateStr} (one-day rental)...`, 
          progress: 10 + (i / totalDays) * 85,
          currentDay: i + 1,
          totalDays,
          currentDate: dateStr
        });

        try {
          // For one-day rental, pickup and dropoff are the same day
          const searchParams = new URLSearchParams({
            source: 'enjoy_google_brand',
            plocation: String(locationId),
            dlocation: String(locationId),
            pdate: dateStr,
            ddate: dateStr,
            ptime: rentalTime,
            dtime: rentalTime,
            old: 'true',
          });
          
          const searchUrl = `https://www.enjoytravel.com/api/search?${searchParams.toString()}`;
          
          const searchMutation = `mutation GetSearchResults {
            goto(url: "${searchUrl}", waitUntil: networkIdle) {
              status
            }
            searchData: text(selector: "body") {
              text
            }
          }`;

          const searchResult = await executeBrowserQL(searchMutation);
          const searchText = searchResult.searchData?.text || "{}";
          
          let searchResults;
          try {
            searchResults = JSON.parse(searchText);
          } catch (e) {
            const jsonMatch = searchText.match(/\{.*\}|\[.*\]/s);
            if (jsonMatch) {
              searchResults = JSON.parse(jsonMatch[0]);
            } else {
              console.error(`Error parsing results for ${dateStr}:`, searchText.substring(0, 200));
              continue;
            }
          }

          // Process results
          let items = [];
          
          if (searchResults?.products && Array.isArray(searchResults.products)) {
            items = searchResults.products.map(product => {
              const vehicle = product.listProduct || product.referenceProduct || product;
              return {
                ...vehicle,
                supplier: product.supplierName || vehicle.supplier,
                rating: product.rating,
                recommended: product.recommended,
                price: vehicle.price || product.payNowPayTotal || product.resultDisplayPrice,
                carId: product.carId,
                normalizedTypeName: product.normalizedTypeName || vehicle.vehicleCategoryName,
                rentalDate: dateStr,
              };
            });
          } else if (searchResults?.categoryItems && Array.isArray(searchResults.categoryItems)) {
            items = searchResults.categoryItems.map(category => {
              const vehicle = category.referenceProduct || {};
              return {
                ...vehicle,
                categoryName: category.categoryName,
                rentalDate: dateStr,
              };
            });
          }

          const offers = items.map((it) => ({
            rentalDate: dateStr,
            brand: it?.vehicle?.make || it?.make || it?.brand || null,
            carType: it?.normalizedTypeName || it?.vehicleCategoryName || it?.vehicle?.category || it?.categoryName || it?.carType || it?.type || null,
            price: it?.price ?? it?.payNowPayTotal ?? it?.resultDisplayPrice ?? it?.price?.amount ?? it?.totalPrice ?? it?.Price ?? it?.premiumPrice ?? null,
            currency: it?.currency || it?.localCurrency || "USD",
            supplier: it?.supplier || it?.supplierName || it?.provider || null,
            vehicleName: it?.vehicle?.name || it?.name || it?.vehicleName || null,
            priceDayRate: it?.priceDayRate || it?.premiumPriceDayRate || null,
            rating: it?.rating || null,
            recommended: it?.recommended || false,
            carId: it?.carId || null,
            transmission: it?.transmission || null,
            seats: it?.seats || null,
            fuelType: it?.fuelType || null,
          }));

          allOffers.push(...offers);
          
          // Small delay between requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`Error searching ${dateStr}:`, error.message);
          // Continue to next day even if one fails
        }
      }

      // Generate CSV for all offers
      bulkProgressStore.set(sessionId, { 
        status: 'running', 
        message: '💾 Generating CSV file...', 
        progress: 95,
        currentDay: totalDays,
        totalDays
      });

      const csvHeaders = [
        "Rental Date", "Brand", "Car Type", "Vehicle Name", "Supplier", "Price", "Currency",
        "Price Per Day", "Rating", "Recommended", "Car ID", "ACRISS Code", "Transmission", "Seats", "Fuel Type"
      ];
      
      const escapeCsvValue = (value) => {
        if (value === null || value === undefined) return "";
        const str = String(value);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      
      const csvRows = allOffers.map(offer => [
        offer.rentalDate || "",
        offer.brand || "",
        offer.carType || "",
        offer.vehicleName || "",
        offer.supplier || "",
        offer.price || "",
        offer.currency || "",
        offer.priceDayRate || "",
        offer.rating || "",
        offer.recommended ? "Yes" : "No",
        offer.carId || "",
        offer.acrissCode || "",
        offer.transmission || "",
        offer.seats || "",
        offer.fuelType || ""
      ]);
      
      const csvContent = [
        csvHeaders.map(escapeCsvValue).join(","),
        ...csvRows.map(row => row.map(escapeCsvValue).join(","))
      ].join("\n");

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
      const filename = `enjoytravel-bulk-${startDate}-to-${endDate}-${timestamp}.csv`;
      
      if (!app.locals.csvFiles) {
        app.locals.csvFiles = {};
      }
      app.locals.csvFiles[filename] = csvContent;
      console.log(`📄 Bulk CSV stored: ${filename} (${allOffers.length} offers from ${totalDays} days)`);

      bulkProgressStore.set(sessionId, { 
        status: 'completed', 
        message: `✅ Bulk search completed! Found ${allOffers.length} total offers`, 
        progress: 100,
        currentDay: totalDays,
        totalDays,
        result: {
          success: true,
          allOffers,
          totalOffers: allOffers.length,
          totalDays,
          csvFilename: filename,
        }
      });
    } catch (error) {
      console.error("Bulk scraping error:", error);
      bulkProgressStore.set(sessionId, { 
        status: 'error', 
        message: `❌ Error: ${error.message}`, 
        progress: 0 
      });
    }
  })();

  // Return session ID immediately
  res.json({ sessionId, message: 'Bulk scraping started. Use /api/bulk-scrape-progress/:sessionId to get updates.' });
});
