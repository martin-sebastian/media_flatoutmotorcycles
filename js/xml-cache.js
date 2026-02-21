/**
 * Vehicle baseline data provider.
 * Fetches from Supabase unit_inventory (replaced the removed service-worker XML cache).
 * Returns the same data shape all downstream consumers expect (hang tags, key tags, quote, etc.).
 */

/** In-memory cache so repeated lookups don't re-fetch. */
var _xmlCacheMap = {};

/**
 * Fetch baseline vehicle data for a stock number from Supabase REST API.
 * @param {string} stockNumber Stock number to lookup.
 * @returns {Promise<object|null>} Vehicle data in legacy shape, or null.
 */
async function getCachedXmlVehicle(stockNumber) {
  if (!stockNumber || !stockNumber.trim()) return null;

  var key = stockNumber.trim().toUpperCase();
  if (_xmlCacheMap[key]) return _xmlCacheMap[key];

  var url = window.__SUPABASE_URL__;
  var anonKey = window.__SUPABASE_ANON_KEY__;
  if (!url || !anonKey) {
    console.warn("Supabase config not available for baseline lookup");
    return null;
  }

  try {
    var endpoint = url + "/rest/v1/unit_inventory?stocknumber=eq." + encodeURIComponent(stockNumber.trim()) + "&limit=1";
    var resp = await fetch(endpoint, {
      headers: { apikey: anonKey, Authorization: "Bearer " + anonKey }
    });
    if (!resp.ok) return null;

    var rows = await resp.json();
    if (!rows || rows.length === 0) return null;

    var row = rows[0];
    var images = Array.isArray(row.images) ? row.images : [];
    var year = row.year != null ? String(row.year) : "";
    var manufacturer = row.manufacturer || "";
    var modelName = row.model_name || "";

    var data = {
      StockNumber: row.stocknumber || "",
      Usage: row.usage || "",
      ModelYear: year,
      Manufacturer: manufacturer,
      ModelName: modelName,
      Title: [year, manufacturer, modelName].filter(Boolean).join(" "),
      ModelCode: "",
      Color: row.color || "",
      VIN: row.vin || "",
      Images: images,
      ImageUrl: images[0] || "",
      Description: row.description || "",
      ModelType: row.model_type || "",
      Location: row.location || "",
      Updated: row.updated || "",
      Miles: row.metric_value != null ? String(row.metric_value) : "",
      MilesType: row.metric_type || "",
      B50MetricType: row.metric_type || "",
      B50MetricValue: row.metric_value != null ? String(row.metric_value) : "",
      MetricType: row.metric_type || "",
      MetricValue: row.metric_value != null ? String(row.metric_value) : ""
    };

    _xmlCacheMap[key] = data;
    return data;
  } catch (err) {
    console.warn("Supabase baseline lookup failed:", err);
    return null;
  }
}

window.getCachedXmlVehicle = getCachedXmlVehicle;
