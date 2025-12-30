import { CONFIG } from "./config.js";
import { writeFile } from "fs/promises";
import { executeBrowserQL } from "./browserql.js";

/**
 * BrowserQL scraper - Fixed version using correct syntax
 * 
 * Uses BrowserQL's available mutations to scrape EnjoyTravel
 */

if (!CONFIG.browserless.apiKey) {
  console.error("ERROR: BROWSERLESS_API_KEY not set!");
  process.exit(1);
}

async function main() {
  try {
    console.log("🚀 Starting BrowserQL scraper...");
    console.log("✨ Using Browserless.io stealth features\n");
    
    const locationQuery = CONFIG.defaults.locationQuery;
    const pickup = CONFIG.defaults.pickup;
    const dropoff = CONFIG.defaults.dropoff;
    const time = CONFIG.defaults.time;
    
    // Step 1: Navigate and wait for Cloudflare
    console.log("📡 Step 1: Opening EnjoyTravel and waiting for Cloudflare...");
    
    const warmupMutation = `mutation WarmupSession {
      goto(url: "${CONFIG.baseUrl}", waitUntil: networkIdle) {
        status
        time
      }
    }`;

    await executeBrowserQL(warmupMutation);
    console.log("✅ Page loaded\n");

    // Step 2: Make location API call using BrowserQL's request capability
    // Since we can't use evaluate, we'll use BrowserQL to navigate to the API URL
    // and extract the JSON response
    console.log("🔍 Step 2: Fetching location ID...");
    
    const locationUrl = `https://www.enjoytravel.com/api/location/search-locations?${new URLSearchParams({ query: locationQuery, lang: 'en' })}`;
    
    const locationMutation = `mutation GetLocation {
      goto(url: "${locationUrl}", waitUntil: networkIdle) {
        status
      }
      text(selector: "body") {
        text
      }
    }`;

    const locationResult = await executeBrowserQL(locationMutation);
    const locationText = locationResult.text?.text || "[]";
    
    let locations;
    try {
      locations = JSON.parse(locationText);
    } catch (e) {
      // If it's HTML (blocked), try to extract JSON from it
      const jsonMatch = locationText.match(/\{.*\}|\[.*\]/s);
      if (jsonMatch) {
        locations = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse location response: " + locationText.substring(0, 200));
      }
    }
    
    if (!Array.isArray(locations) || locations.length === 0) {
      throw new Error("No locations returned");
    }

    const locationId = locations[0].id;
    console.log(`✅ Location ID: ${locationId}\n`);

    // Step 3: Fetch search results
    console.log("🚗 Step 3: Fetching search results...");
    console.log(`   📅 Pickup: ${pickup} at ${time}`);
    console.log(`   📅 Drop-off: ${dropoff} at ${time}`);
    
    const searchParams = new URLSearchParams({
      source: 'enjoy_google_brand',
      plocation: String(locationId),
      dlocation: String(locationId),
      pdate: pickup,
      ddate: dropoff,
      ptime: time,
      dtime: time,
      old: 'true',
    });
    
    const searchUrl = `https://www.enjoytravel.com/api/search?${searchParams.toString()}`;
    console.log(`   🔗 API URL: ${searchUrl}\n`);
    
    const searchMutation = `mutation GetSearchResults {
      goto(url: "${searchUrl}", waitUntil: networkIdle) {
        status
      }
      text(selector: "body") {
        text
      }
    }`;

    const searchResult = await executeBrowserQL(searchMutation);
    const searchText = searchResult.text?.text || "{}";
    
    let searchResults;
    try {
      searchResults = JSON.parse(searchText);
    } catch (e) {
      const jsonMatch = searchText.match(/\{.*\}|\[.*\]/s);
      if (jsonMatch) {
        searchResults = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse search response: " + searchText.substring(0, 200));
      }
    }

    // Process results - handle different response structures
    let items = [];
    
    // Priority 1: Extract from products array (contains ALL vehicles)
    if (searchResults?.products && Array.isArray(searchResults.products)) {
      items = searchResults.products.map(product => {
        // Each product has a listProduct with vehicle details
        const vehicle = product.listProduct || product.referenceProduct || product;
        return {
          ...vehicle,
          // Include product-level fields
          supplier: product.supplierName || vehicle.supplier,
          rating: product.rating,
          recommended: product.recommended,
          price: vehicle.price || product.payNowPayTotal || product.resultDisplayPrice,
          carId: product.carId,
          normalizedTypeName: product.normalizedTypeName || vehicle.vehicleCategoryName,
        };
      });
    }
    // Fallback: Extract from categoryItems (only reference products)
    else if (searchResults?.categoryItems && Array.isArray(searchResults.categoryItems)) {
      items = searchResults.categoryItems.map(category => {
        const vehicle = category.referenceProduct || {};
        return {
          ...vehicle,
          categoryName: category.categoryName,
        };
      });
    } 
    // Other possible structures
    else {
      items =
        searchResults?.results ||
        searchResults?.Results ||
        searchResults?.cars ||
        searchResults?.Cars ||
        searchResults?.data ||
        searchResults?.vehicles ||
        [];
    }

    if (items.length === 0) {
      console.warn("⚠️  No offers found. Response structure:");
      console.log(JSON.stringify(searchResults, null, 2).slice(0, 500));
    }

    const offers = items.map((it) => ({
      brand: it?.vehicle?.make || it?.make || it?.brand || null,
      carType: it?.normalizedTypeName || it?.vehicleCategoryName || it?.vehicle?.category || it?.categoryName || it?.carType || it?.type || null,
      price:
        it?.price ??
        it?.payNowPayTotal ??
        it?.resultDisplayPrice ??
        it?.price?.amount ??
        it?.totalPrice ??
        it?.Price ??
        it?.premiumPrice ??
        null,
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

    console.log("=".repeat(60));
    console.log(`✅ SUCCESS! Found ${offers.length} car rental offers`);
    console.log("=".repeat(60) + "\n");
    
    // Convert to CSV
    const csvHeaders = [
      "Brand",
      "Car Type",
      "Vehicle Name",
      "Supplier",
      "Price",
      "Currency",
      "Price Per Day",
      "Rating",
      "Recommended",
      "Car ID",
      "Transmission",
      "Seats",
      "Fuel Type"
    ];
    
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
      offer.transmission || "",
      offer.seats || "",
      offer.fuelType || ""
    ]);
    
    // Escape CSV values (handle commas, quotes, newlines)
    const escapeCsvValue = (value) => {
      if (value === null || value === undefined) return "";
      const str = String(value);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    
    // Build CSV content
    const csvContent = [
      csvHeaders.map(escapeCsvValue).join(","),
      ...csvRows.map(row => row.map(escapeCsvValue).join(","))
    ].join("\n");
    
    // Save to CSV file
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
    const filename = `enjoytravel-offers-${timestamp}.csv`;
    
    await writeFile(filename, csvContent, "utf-8");
    console.log(`📄 CSV file saved: ${filename}`);
    console.log(`   Total offers: ${offers.length}`);
    console.log(`   File size: ${(csvContent.length / 1024).toFixed(2)} KB\n`);
    
    // Also show preview
    if (offers.length > 0) {
      console.log("Preview (first 5 offers):");
      console.log(JSON.stringify(offers.slice(0, 5), null, 2));
      
      if (offers.length > 5) {
        console.log(`\n... and ${offers.length - 5} more offers (see CSV file)`);
      }
    } else {
      console.log("No offers to display");
    }

  } catch (err) {
    console.error("\n" + "=".repeat(60));
    console.error("❌ ERROR:", err.message);
    console.error("=".repeat(60));
    if (err.stack) {
      console.error("\nStack trace:");
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();

