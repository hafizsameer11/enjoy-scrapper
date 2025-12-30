import { CONFIG } from "./config.js";

/**
 * Shared BrowserQL execution function
 */
export async function executeBrowserQL(mutation, variables = {}, operationName = null) {
  const BROWSERLESS_ENDPOINT = CONFIG.browserless.endpoint;
  const API_KEY = CONFIG.browserless.apiKey;
  
  if (!API_KEY) {
    throw new Error("BROWSERLESS_API_KEY not set!");
  }
  
  const url = new URL(BROWSERLESS_ENDPOINT);
  url.searchParams.set('token', API_KEY);
  
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: mutation,
      ...(variables && Object.keys(variables).length > 0 && { variables }),
      ...(operationName && { operationName }),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BrowserQL request failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  
  if (result.errors) {
    throw new Error(`BrowserQL errors: ${JSON.stringify(result.errors, null, 2)}`);
  }

  return result.data;
}

