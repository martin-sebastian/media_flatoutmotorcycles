/**
 * Hang Tag Component
 * Renders and prints vehicle hang tags using XML/portal data.
 * @module hang-tag
 */

/**
 * Format a number as currency.
 * @param {number|string} value - Value to format.
 * @returns {string} Formatted currency string.
 */
function formatCurrency(value) {
  if (typeof numeral !== "undefined") {
    return numeral(value).format("$0,0.00");
  }
  const num = parseFloat(value) || 0;
  return "$" + num.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, "$&,");
}

/**
 * Format a date string.
 * @param {string} dateStr - Date string to format.
 * @returns {string} Formatted date.
 */
function formatDate(dateStr) {
  if (typeof moment !== "undefined") {
    return moment(dateStr).format("MM/DD/YYYY");
  }
  const d = new Date(dateStr);
  return d.toLocaleDateString();
}

/**
 * Clean description text - strip disclaimer and highlights, keep only specs.
 * @param {string} description - Raw description text.
 * @returns {string} Cleaned description starting from Engine Type.
 */
function cleanDescription(description) {
  if (!description) return "";
  
  // Look for "Engine Type" (case insensitive) and keep from there
  const engineTypeMatch = description.match(/Engine Type[:\s]/i);
  if (engineTypeMatch) {
    const startIndex = description.indexOf(engineTypeMatch[0]);
    return description.substring(startIndex).trim();
  }
  
  // Fallback: if no Engine Type found, return original
  return description;
}

/**
 * Generate list items HTML from an array.
 * @param {Array} items - Array of items with Description and Amount.
 * @param {number} maxItems - Maximum items to show.
 * @returns {string} HTML string.
 */
function generateListItems(items, maxItems = 10) {
  if (!items || !items.length) return "";
  return items
    .slice(0, maxItems)
    .map((item) => `<li class="ht-list-item">${item.Description} <span class="ht-amount">${formatCurrency(item.Amount)}</span></li>`)
    .join("");
}

/**
 * Get unit location label based on lot code.
 * @param {string} lot - Lot code.
 * @param {string} arrivalDate - Estimated arrival date.
 * @returns {string} Location HTML.
 */
function getUnitLocation(lot, arrivalDate) {
  const mainLots = ["SUZ", "KAW", "POL", "PREOWNED", "PRE OWNED"];
  const onOrderLots = ["ONORDER", "ON ORDER"];
  if (mainLots.includes(lot)) {
    return `<small class="ht-location ht-location-stock">IN STOCK - Main Showroom</small>`;
  }
  if (onOrderLots.includes(lot)) {
    return `<small class="ht-location ht-location-order">ON ORDER - Arriving ${arrivalDate}</small>`;
  }
  if (lot === "VH") {
    return `<small class="ht-location ht-location-stock">IN STOCK - Vanderhall Showroom</small>`;
  }
  if (lot === "IMC") {
    return `<small class="ht-location ht-location-stock">IN STOCK - Indian Showroom</small>`;
  }
  return "";
}

/**
 * Normalize hang tag data from portal API response.
 * @param {object} data - Portal API data.
 * @returns {object} Normalized data.
 */
function normalizeHangTagData(data) {
  if (!data) return null;
  
  const msrp = data.MSRP || 0;
  const accessoryTotal = data.AccessoryItemsTotal || 0;
  const matTotal = data.MatItemsTotal || 0;
  const discountTotal = data.DiscountItemsTotal || 0;
  const tradeInTotal = data.TradeInItemsTotal || 0;
  
  return {
    // Basic info
    stockNumber: data.StockNumber || "",
    vin: data.VIN || "",
    modelYear: data.ModelYear || "",
    manufacturer: data.Manufacturer || "",
    modelName: data.B50ModelName || data.ModelName || "",
    modelCode: data.ModelCode || "",
    color: data.Color || "",
    usage: data.Usage || "",
    
    // Metrics
    metricType: data.B50MetricType || "",
    metricValue: data.B50MetricValue || "",
    
    // Pricing
    msrp: msrp,
    msrpUnit: data.MSRPUnit || msrp,
    msrpTitle: data.MSRPTitle || "MSRP",
    msrpPlusAccessories: msrp + accessoryTotal,
    ourPrice: msrp + accessoryTotal + matTotal + discountTotal + tradeInTotal,
    savings: (discountTotal + matTotal + tradeInTotal) * -1,
    quotePrice: data.QuotePrice || 0,
    salePrice: data.Price || 0,
    otdPrice: data.OTDPrice || 0,
    
    // Dates
    salePriceExpireDate: data.SalePriceExpireDate || "",
    floorExpireDate: data.FloorExpireDate || "",
    estimatedArrival: data.EstimatedArrival || "",
    expirationDate: data.ExpirationDate || "",
    
    // Content
    imageUrl: data.ImageUrl || "",
    detailUrl: data.DetailUrl || "",
    description: data.B50Desc || "",
    standardFeatures: data.StandardFeatures || "",
    disclaimer: data.Disclaimer || "",
    
    // Status
    lot: data.Lot || "",
    unitStatus: data.UnitStatus || "",
    quoteLevel: data.QuoteLevel || "",
    yellowTag: data.YellowTag || false,
    
    // Item lists
    accessoryItems: data.AccessoryItems || [],
    discountItems: data.DiscountItems || [],
    matItems: data.MatItems || [],
    otdItems: data.OTDItems || [],
    tradeInItems: data.TradeInItems || [],
  };
}

/**
 * Render the left hang tag (pricing focused).
 * @param {object} data - Normalized hang tag data.
 * @param {HTMLElement|string} container - Container element or selector.
 */
function renderHangTagLeft(data, container) {
  const el = typeof container === "string" ? document.querySelector(container) : container;
  if (!el) {
    console.error("Hang tag left container not found");
    return;
  }

  const title = `${data.manufacturer} ${data.modelName}`.trim();
  const yellowTagImg = data.yellowTag 
    ? `<img src="https://newportal.flatoutmotorcycles.com/Portal/content/icons/ylwtag.png" class="ht-yellow-tag">` 
    : "";
  const arrivalDate = formatDate(data.estimatedArrival);
  const expireDate = formatDate(data.salePriceExpireDate);
  
  // Hide MSRP and savings if no discount (MSRP equals our price)
  const hasDiscount = data.msrpPlusAccessories !== data.ourPrice && data.savings > 0;
  const msrpHtml = hasDiscount 
    ? `<div class="ht-msrp" id="msrpLine">MSRP: ${formatCurrency(data.msrpPlusAccessories)}</div>` 
    : "";
  const savingsHtml = hasDiscount 
    ? `<div class="ht-savings" id="savingsLine">
        <span class="ht-savings-label">Savings</span>
        <span class="ht-savings-arrow">→</span>
        <span class="ht-savings-value">${formatCurrency(data.savings)}</span>
      </div>` 
    : "";

  el.innerHTML = `
    <div class="ht-print-tag">
      <div class="ht-hole"></div>
      <div class="ht-logo-container">
        <img src="../img/fom-app-logo.svg" alt="Flat Out Motorsports" class="ht-logo">
      </div>
      
      <div class="ht-header">
        <div class="ht-badges">
          <span class="ht-badge ht-badge-usage">${data.usage}</span>
          <span class="ht-badge ht-badge-year">${data.modelYear}</span>
          <span class="ht-badge ht-badge-metric">${data.metricValue} ${data.metricType}</span>
        </div>
        <h1 class="ht-title">${title}</h1>
        <div class="ht-stock-badge">${data.stockNumber}</div>
      </div>
      
      <div class="ht-body">
        <div class="ht-price-card">
          <div class="ht-price-card-header">
            ${msrpHtml}
            <div class="ht-our-price">${yellowTagImg} ${formatCurrency(data.ourPrice)}</div>
            ${savingsHtml}
            <div class="ht-expires">Sale Program Ends: ${expireDate}</div>
          </div>
          <div class="ht-price-card-body">
            <ul class="ht-list">
              <li class="ht-list-item ht-list-header">${data.msrpTitle} <span class="ht-amount">${formatCurrency(data.msrpUnit)}</span></li>
              <div id="rebatesLine">${generateListItems(data.matItems, 4)}</div>
              <div id="discountsLine">${generateListItems(data.discountItems, 20)}</div>
              <div id="tradeInsLine">${generateListItems(data.tradeInItems, 5)}</div>
              <div id="feesLine">${generateListItems(data.otdItems, 9)}</div>
            </ul>
          </div>
        </div>
        
        <div class="ht-qr-container" id="qrcode"></div>
      </div>
      
      <div class="ht-footer" id="footerLineLeft">
        <div class="ht-footer-price">${yellowTagImg} ${formatCurrency(data.ourPrice)}</div>
        <div class="ht-footer-expires">Sale Program Ends: ${expireDate}</div>
      </div>
    </div>
  `;
}

/**
 * Render the right hang tag (image/description focused).
 * @param {object} data - Normalized hang tag data.
 * @param {HTMLElement|string} container - Container element or selector.
 */
function renderHangTagRight(data, container) {
  const el = typeof container === "string" ? document.querySelector(container) : container;
  if (!el) {
    console.error("Hang tag right container not found");
    return;
  }

  const title = `${data.manufacturer} ${data.modelName}`.trim();
  const yellowTagImg = data.yellowTag 
    ? `<img src="https://newportal.flatoutmotorcycles.com/Portal/content/icons/ylwtag.png" class="ht-yellow-tag">` 
    : "";
  const expireDate = formatDate(data.salePriceExpireDate);

  // Build accessories section
  let accessoriesHtml = "";
  if (data.accessoryItems && data.accessoryItems.length > 0) {
    accessoriesHtml = `
      <div class="ht-accessories">
        <h5 class="ht-section-title">Added Accessories</h5>
        <ul class="ht-list">${generateListItems(data.accessoryItems, 30)}</ul>
      </div>
    `;
  }

  // Build description section (cleaned - specs only)
  let descriptionHtml = "";
  const cleanedDesc = cleanDescription(data.description);
  if (cleanedDesc) {
    descriptionHtml = `
      <div class="ht-description" id="descriptionLine">
        <h5 class="ht-section-title">Specifications</h5>
        <div class="ht-description-content">${cleanedDesc}</div>
      </div>
    `;
  }

  // Build features section
  let featuresHtml = "";
  if (data.standardFeatures && data.standardFeatures.trim()) {
    featuresHtml = `
      <div class="ht-features">
        <h5 class="ht-section-title">Standard Features</h5>
        <div class="ht-features-content">${data.standardFeatures}</div>
      </div>
    `;
  }

  el.innerHTML = `
    <div class="ht-print-tag">
      <div class="ht-hole"></div>
      <div class="ht-logo-container">
        <img src="../img/fom-app-logo.svg" alt="Flat Out Motorsports" class="ht-logo">
      </div>
      
      <div class="ht-header">
        <div class="ht-badges">
          <span class="ht-badge ht-badge-usage">${data.usage}</span>
          <span class="ht-badge ht-badge-year">${data.modelYear}</span>
          <span class="ht-badge ht-badge-metric">${data.metricValue} ${data.metricType}</span>
        </div>
        <h1 class="ht-title">${title}</h1>
        <div class="ht-stock-badge">${data.stockNumber}</div>
      </div>
      
      <div class="ht-body">
        <div class="ht-image-container" id="photoLine">
          ${data.imageUrl ? `<img src="${data.imageUrl}" alt="${title}" class="ht-image">` : ""}
        </div>
        
        ${accessoriesHtml}
        ${descriptionHtml}
        ${featuresHtml}
        
        <div class="ht-barcode-container">
          <svg id="barcode" class="ht-barcode"></svg>
        </div>
      </div>
      
      <div class="ht-footer" id="footerLineRight">
        <div class="ht-footer-price">${yellowTagImg} ${formatCurrency(data.ourPrice)}</div>
        <div class="ht-footer-expires">Sale Program Ends: ${expireDate}</div>
      </div>
    </div>
  `;
}

/**
 * Render baseline placeholder while loading.
 * @param {object} xmlData - Basic XML data.
 * @param {HTMLElement|string} container - Container element or selector.
 */
function renderHangTagBaseline(xmlData, container) {
  const el = typeof container === "string" ? document.querySelector(container) : container;
  if (!el || !xmlData) return;

  const title = `${xmlData.ModelYear || ""} ${xmlData.Manufacturer || ""} ${xmlData.ModelName || ""}`.trim();
  const imageHtml = xmlData.ImageUrl 
    ? `<img src="${xmlData.ImageUrl}" class="ht-image">` 
    : "";

  el.innerHTML = `
    <div class="ht-print-tag ht-loading">
      <div class="ht-hole"></div>
      <div class="ht-logo-container">
        <img src="../img/fom-app-logo.svg" alt="Flat Out Motorsports" class="ht-logo">
      </div>
      <div class="ht-header">
        <h1 class="ht-title">${title || "Loading vehicle..."}</h1>
        <div class="ht-stock-badge">${xmlData.StockNumber || "Stock #"}</div>
      </div>
      <div class="ht-body">
        <div class="ht-image-container">${imageHtml}</div>
        <div class="ht-loading-message">Loading latest pricing...</div>
        <div class="h6 text-center fw-semibold text-secondary-emphasis">Not Found in Portal</div>
      </div>
    </div>
  `;
}

/**
 * Clear hang tag and show placeholders.
 * @param {HTMLElement|string} container - Container element or selector.
 */
function clearHangTag(container) {
  const el = typeof container === "string" ? document.querySelector(container) : container;
  if (!el) return;

  el.innerHTML = `
    <div class="ht-print-tag ht-placeholder">
      <div class="ht-hole"></div>
      <div class="ht-logo-container">
        <span class="ht-placeholder-bar" style="width: 60%;"></span>
      </div>
      <div class="ht-header">
        <div class="ht-badges">
          <span class="ht-placeholder-bar" style="width: 40px;"></span>
          <span class="ht-placeholder-bar" style="width: 50px;"></span>
        </div>
        <span class="ht-placeholder-bar" style="width: 80%; height: 24px;"></span>
        <span class="ht-placeholder-bar" style="width: 100px; height: 20px;"></span>
      </div>
      <div class="ht-body">
        <span class="ht-placeholder-bar" style="width: 100%; height: 150px;"></span>
        <span class="ht-placeholder-bar" style="width: 70%;"></span>
        <span class="ht-placeholder-bar" style="width: 90%;"></span>
        <span class="ht-placeholder-bar" style="width: 60%;"></span>
      </div>
    </div>
  `;
}

/**
 * Initialize QR code for hang tag.
 * @param {string} url - URL to encode.
 * @param {string} selector - QR container selector.
 */
function initHangTagQR(url, selector = "#qrcode") {
  if (typeof QRCode === "undefined") {
    console.warn("QRCode library not loaded");
    return;
  }
  const el = document.querySelector(selector);
  if (el && url) {
    el.innerHTML = "";
    new QRCode(el, {
      text: url,
      width: 100,
      height: 100,
    });
  }
}

/**
 * Initialize barcode for hang tag.
 * @param {string} vin - VIN to encode.
 * @param {string} selector - Barcode SVG selector.
 */
function initHangTagBarcode(vin, selector = "#barcode") {
  if (typeof JsBarcode === "undefined") {
    console.warn("JsBarcode library not loaded");
    return;
  }
  if (vin) {
    JsBarcode(selector, vin, { height: 40 });
  }
}

/**
 * Fetch hang tag data from portal API with timeout.
 * @param {string} stockNumber - Stock number to fetch.
 * @param {number} timeout - Timeout in milliseconds.
 * @returns {Promise<object>} Normalized hang tag data.
 */
async function fetchHangTagData(stockNumber, timeout = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(
      `https://newportal.flatoutmotorcycles.com/portal/public/api/majorunit/stocknumber/${stockNumber}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log("Portal API response for", stockNumber, ":", data);
    
    // Check if API returned empty or error response
    if (!data || Object.keys(data).length === 0) {
      console.warn("Portal returned empty response for:", stockNumber);
      return null;
    }
    
    return normalizeHangTagData(data);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error("Request timed out - please try again");
    }
    throw error;
  }
}

/**
 * Show error message in hang tag container.
 * @param {string} message - Error message to display.
 * @param {HTMLElement|string} container - Container element or selector.
 */
function showHangTagError(message, container) {
  const el = typeof container === "string" ? document.querySelector(container) : container;
  if (!el) return;

  el.innerHTML = `
    <div class="ht-print-tag ht-error">
      <div class="ht-hole"></div>
      <div class="ht-logo-container">
        <img src="../img/fom-app-logo.svg" alt="Flat Out Motorsports" class="ht-logo">
      </div>
      <div class="ht-header">
        <h1 class="ht-title text-danger">Error Loading Data</h1>
      </div>
      <div class="ht-body text-center p-4">
        <i class="bi bi-exclamation-triangle text-warning" style="font-size: 48px;"></i>
        <p class="mt-3">${message}</p>
        <button class="btn btn-outline-secondary btn-sm mt-2" onclick="location.reload()">
          <i class="bi bi-arrow-clockwise me-1"></i>Retry
        </button>
      </div>
    </div>
  `;
}

/**
 * Load and render hang tags for a stock number.
 * @param {string} stockNumber - Stock number to load.
 */
async function loadHangTags(stockNumber) {
  if (!stockNumber || !stockNumber.trim()) {
    clearHangTag(".tag-left");
    clearHangTag(".tag-right");
    return;
  }

  let hasBaseline = false;

  // Try to load baseline from cached XML first
  try {
    if (typeof window.getCachedXmlVehicle === "function") {
      console.log("Fetching XML cache for:", stockNumber);
      const xmlData = await window.getCachedXmlVehicle(stockNumber);
      console.log("XML cache result:", xmlData);
      if (xmlData) {
        renderHangTagBaseline(xmlData, ".tag-left");
        renderHangTagBaseline(xmlData, ".tag-right");
        hasBaseline = true;
      } else {
        console.warn("No XML cache data found for:", stockNumber);
      }
    } else {
      console.warn("getCachedXmlVehicle function not available");
    }
  } catch (error) {
    console.error("Cached XML baseline failed:", error);
  }

  // Fetch full data from portal
  try {
    const data = await fetchHangTagData(stockNumber);
    
    if (data && data.stockNumber) {
      renderHangTagLeft(data, ".tag-left");
      renderHangTagRight(data, ".tag-right");
      
      // Initialize QR and barcode after render
      initHangTagQR(data.detailUrl);
      initHangTagBarcode(data.vin);
    } else {
      // Stock number not found in portal
      const message = `Stock number "${stockNumber}" not found in Digital IQ Portal.<br><small class="text-muted">Unit may be pending, sold, or not yet synced.</small>`;
      console.warn("No portal data for:", stockNumber);
      if (!hasBaseline) {
        showHangTagError(message, ".tag-left");
        showHangTagError(message, ".tag-right");
      } else {
        // We have baseline but no portal data - show a notice but keep baseline visible
        console.log("Showing cached baseline data only for:", stockNumber);
      }
    }
  } catch (error) {
    console.error("Error fetching hang tag data:", error);
    // Show error if we don't have baseline data to fall back on
    if (!hasBaseline) {
      showHangTagError(error.message || "Failed to load data", ".tag-left");
      showHangTagError(error.message || "Failed to load data", ".tag-right");
    }
  }
}

// Export for global use
if (typeof window !== "undefined") {
  window.HangTagComponent = {
    renderLeft: renderHangTagLeft,
    renderRight: renderHangTagRight,
    renderBaseline: renderHangTagBaseline,
    clear: clearHangTag,
    showError: showHangTagError,
    normalize: normalizeHangTagData,
    fetch: fetchHangTagData,
    load: loadHangTags,
    initQR: initHangTagQR,
    initBarcode: initHangTagBarcode,
  };
}
