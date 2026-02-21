/**
 * Hang Tag Component
 * Modular template system for rendering vehicle hang tags.
 * @module hang-tag
 */

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

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
 * Looks for first spec starting with "Engine" (Engine Type, Engine HP, etc.)
 * @param {string} description - Raw description text.
 * @returns {string} Cleaned description starting from first Engine spec.
 */
function cleanDescription(description) {
  if (!description) return "";
  
  // Look for "Engine" followed by a word and colon (Engine Type:, Engine HP:, Engine:, etc.)
  const engineMatch = description.match(/Engine\s*\w*\s*:/i);
  if (engineMatch) {
    const startIndex = description.indexOf(engineMatch[0]);
    return description.substring(startIndex).trim();
  }
  
  // Fallback: look for common spec patterns (Word: Value)
  const specMatch = description.match(/\b(Displacement|Cylinders|Horsepower|HP|Deck|Weight|Capacity|Fuel)\s*:/i);
  if (specMatch) {
    const startIndex = description.indexOf(specMatch[0]);
    return description.substring(startIndex).trim();
  }
  
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

// ===========================================
// SHARED TEMPLATE PARTIALS
// ===========================================

const HangTagPartials = {
  /**
   * Render the hang hole punch circle.
   */
  hole: () => `<div class="ht-hole"></div>`,

  /**
   * Render the logo container.
   */
  logo: () => `
    <div class="ht-logo-container">
      <img src="../img/fom-app-logo.svg" alt="Flat Out Motorsports" class="ht-logo">
    </div>
  `,

  /**
   * Render badges row.
   * @param {object} options - Badge options.
   */
  badges: ({ stockNumber, year, usage, metricValue, metricType }) => {
    const stockBadge = stockNumber ? `<span class="ht-badge ht-badge-stock">${stockNumber}</span>` : "";
    const yearBadge = year ? `<span class="ht-badge ht-badge-year">${year}</span>` : "";
    const usageBadge = usage ? `<span class="ht-badge ht-badge-${usage.toLowerCase()}">${usage}</span>` : "";
    let metricBadge = "";
    if (metricValue && parseFloat(metricValue) > 0) {
      const label = metricType || "Miles";
      metricBadge = `<span class="ht-badge ht-badge-metric">${Number(metricValue).toLocaleString()} ${label}</span>`;
    }
    return `<div class="ht-badges">${stockBadge}${yearBadge}${usageBadge}${metricBadge}</div>`;
  },

  /**
   * Render title and stock badge.
   * @param {string} title - Vehicle title.
   * @param {string} stockNumber - Stock number.
   */
  titleBlock: (title) => `
    <h2 class="ht-title">${title}</h2>
  `,

  /**
   * Render yellow tag image if applicable.
   * @param {boolean} hasYellowTag - Whether to show yellow tag.
   */
  yellowTag: (hasYellowTag) => hasYellowTag 
    ? `<img src="https://newportal.flatoutmotorcycles.com/Portal/content/icons/ylwtag.png" class="ht-yellow-tag">` 
    : "",

  /**
   * Render image container.
   * @param {string} imageUrl - Image URL.
   * @param {string} alt - Alt text.
   */
  image: (imageUrl, alt) => imageUrl 
    ? `<div class="ht-image-container" id="photoLine"><img src="${imageUrl}" alt="${alt}" class="ht-image"></div>` 
    : "",

  /**
   * Render QR code container.
   */
  qrCode: () => `<div class="ht-qr-container" id="qrcode"></div>`,

  /**
   * Render barcode container.
   * @param {string} id - Unique ID for barcode SVG.
   */
  barcode: (id = "barcode") => `
    <div class="ht-barcode-container">
      <svg id="${id}" class="ht-barcode"></svg>
    </div>
  `,

  /**
   * Render description section.
   * @param {string} description - Description text.
   * @param {string} title - Section title.
   * @param {boolean} clean - Whether to clean the description.
   */
  description: (description, title = "Specifications", clean = true) => {
    const content = clean ? cleanDescription(description) : description;
    if (!content) return "";
    return `
      <div class="ht-description" id="descriptionLine">
        <h5 class="ht-section-title">${title}</h5>
        <div class="ht-description-content">${content}</div>
      </div>
    `;
  },

  /**
   * Render accessories section.
   * @param {Array} items - Accessory items.
   */
  accessories: (items) => {
    if (!items || !items.length) return "";
    return `
      <div class="ht-accessories">
        <h5 class="ht-section-title">Added Accessories</h5>
        <ul class="ht-list">${generateListItems(items, 30)}</ul>
      </div>
    `;
  },

  /**
   * Render standard footer with price.
   * @param {object} options - Footer options.
   */
  footer: ({ price, expireDate, yellowTag, id = "footerLine" }) => `
    <div class="ht-footer" id="${id}">
      <div class="ht-footer-price">${HangTagPartials.yellowTag(yellowTag)} ${formatCurrency(price)}</div>
      <div class="ht-footer-expires">Sale Program Ends: ${expireDate}</div>
    </div>
  `,

  /**
   * Render sold footer with strikethrough price.
   * @param {string} price - Original price (formatted).
   */
  footerSold: (price) => price 
    ? `
      <div class="ht-footer ht-footer-sold">
        <div class="ht-footer-sold-label">price</div>
        <div class="ht-footer-price ht-price-strikethrough">${price}</div>
      </div>
    ` 
    : `
      <div class="ht-footer ht-footer-sold">
        <div class="ht-footer-price">SOLD</div>
      </div>
    `,

  /**
   * Render SOLD banner.
   */
  soldBanner: () => `<div class="ht-sold-banner">SOLD</div>`,
};

// ===========================================
// DATA NORMALIZATION
// ===========================================

/**
 * Normalize portal API data into hang tag format.
 * @param {object} data - Raw API data.
 * @returns {object} Normalized data.
 */
function normalizeHangTagData(data) {
  const msrp = data.MSRPUnit || data.MSRP || 0;
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
    matItems: data.MatItems || [],
    discountItems: data.DiscountItems || [],
    tradeInItems: data.TradeInItems || [],
    otdItems: data.OTDItems || [],
  };
}

/**
 * Normalize XML cache data into hang tag format.
 * @param {object} xmlData - Raw XML data.
 * @returns {object} Normalized data.
 */
function normalizeXmlData(xmlData) {
  return {
    stockNumber: xmlData.StockNumber || "",
    vin: xmlData.VIN || "",
    modelYear: xmlData.ModelYear || "",
    manufacturer: xmlData.Manufacturer || "",
    modelName: xmlData.ModelName || "",
    usage: xmlData.Usage || "",
    metricType: xmlData.B50MetricType || xmlData.MetricType || "",
    metricValue: xmlData.B50MetricValue || xmlData.MetricValue || "",
    imageUrl: xmlData.ImageUrl || "",
    description: xmlData.Description || xmlData.B50Desc || "",
    price: xmlData.Price || xmlData.MSRP || "",
    color: xmlData.Color || "",
  };
}

// ===========================================
// TEMPLATE REGISTRY
// ===========================================

/**
 * Template registry - add new templates here.
 * Each template has: name, description, renderLeft, renderRight
 */
const HangTagTemplates = {
  /**
   * Default template - pricing on left, image/specs on right.
   */
  default: {
    name: "Default",
    description: "Pricing details on left, image and specifications on right",
    
    renderLeft: (data, container) => {
      const el = typeof container === "string" ? document.querySelector(container) : container;
      if (!el) return;

      const title = `${data.manufacturer} ${data.modelName}`.trim();
      const expireDate = formatDate(data.salePriceExpireDate);
      const hasDiscount = data.msrpPlusAccessories > data.ourPrice && data.savings > 0;

      // MSRP - only show if there's a discount (crossed out)
      const msrpHtml = hasDiscount 
        ? `<p class="text-center text-secondary fw-semibold mb-0" id="msrpLine">MSRP: <span class="text-decoration-line-through">${formatCurrency(data.msrpPlusAccessories)}</span></p>`
        : "";

      // Our Price - large font with yellow tag
      const priceHtml = `
        <h1 class="text-center h1 mb-1" style="font-family:'Roboto',sans-serif;font-weight:900;color:#000;">
          ${HangTagPartials.yellowTag(data.yellowTag)}
          ${formatCurrency(data.ourPrice)}
        </h1>
      `;

      // Savings badge - only show if there's savings
      const savingsHtml = hasDiscount 
        ? `<h2 class="text-center h1 mb-1" id="savingsLine">
        <span class="badge bg-warning p-3">
            <span class="badge bg-dark me-2">Savings</span>
            <span class="text-black fw-bold"></span>
            <span class="text-dark fw-bold fs-5">${formatCurrency(data.savings)}</span>
        </span>
          </h2>` 
        : "";

      // Expiration line
      const expiresHtml = `<p class="text-center text-muted small mb-2">Sale Program Ends: ${expireDate}</p>`;

      // Build combined line items list
      let lineItems = [];
      
      // Unit Price (MSRP)
      lineItems.push({ Description: "Unit Price", Amount: data.msrpUnit });
      
      // Discounts
      if (data.discountItems && data.discountItems.length > 0) {
        lineItems = lineItems.concat(data.discountItems);
      }
      
      // MAT/Rebates  
      if (data.matItems && data.matItems.length > 0) {
        lineItems = lineItems.concat(data.matItems);
      }
      
      // Accessories
      if (data.accessoryItems && data.accessoryItems.length > 0) {
        lineItems = lineItems.concat(data.accessoryItems);
      }
      
      // OTD Items (fees, taxes)
      if (data.otdItems && data.otdItems.length > 0) {
        lineItems = lineItems.concat(data.otdItems);
      }

      // Generate line items as Bootstrap list group
      const lineItemsHtml = lineItems.length > 0
        ? `<ul class="list-group list-group-flush small">
            ${lineItems.map(item => `
              <li class="list-group-item d-flex justify-content-between align-items-center px-2 py-1">
                <span>${item.Description}</span>
                <span class="fw-semibold">${formatCurrency(item.Amount)}</span>
              </li>
            `).join("")}
          </ul>`
        : "";

      el.innerHTML = `
        <div class="ht-print-tag">
          ${HangTagPartials.hole()}
          ${HangTagPartials.logo()}
          
          <div class="ht-header">
            ${HangTagPartials.badges({ stockNumber: data.stockNumber, year: data.modelYear, usage: data.usage, metricValue: data.metricValue, metricType: data.metricType })}
            ${HangTagPartials.titleBlock(title)}
          </div>
          
          <div class="ht-body ht-body-pricing">
            <div class="text-center py-2 border-bottom">
              ${msrpHtml}
              ${priceHtml}
              ${savingsHtml}
              ${expiresHtml}
            </div>
            ${lineItemsHtml}
            ${HangTagPartials.qrCode()}
          </div>
          
          <div class="ht-footer-outline">
            ${HangTagPartials.footer({ price: data.ourPrice, expireDate, yellowTag: data.yellowTag, id: "footerLineLeft" })}
          </div>
        </div>
      `;
    },

    renderRight: (data, container) => {
      const el = typeof container === "string" ? document.querySelector(container) : container;
      if (!el) return;

      const title = `${data.manufacturer} ${data.modelName}`.trim();
      const expireDate = formatDate(data.salePriceExpireDate);

      el.innerHTML = `
        <div class="ht-print-tag">
          ${HangTagPartials.hole()}
          ${HangTagPartials.logo()}
          
          <div class="ht-header">
            ${HangTagPartials.badges({ stockNumber: data.stockNumber, year: data.modelYear, usage: data.usage, metricValue: data.metricValue, metricType: data.metricType })}
            ${HangTagPartials.titleBlock(title)}
          </div>
          
          <div class="ht-body">
            ${HangTagPartials.image(data.imageUrl, title)}
            ${HangTagPartials.accessories(data.accessoryItems)}
            ${HangTagPartials.description(data.description)}
            ${HangTagPartials.barcode()}
          </div>
          
          <div class="ht-footer-outline">
            ${HangTagPartials.footer({ price: data.ourPrice, expireDate, yellowTag: data.yellowTag, id: "footerLineRight" })}
          </div>
        </div>
      `;
    },
  },

  /**
   * Sold template - for units sold but awaiting pickup.
   */
  sold: {
    name: "Sold",
    description: "SOLD banner with strikethrough price for units awaiting pickup",
    
    renderLeft: (xmlData, container) => {
      const el = typeof container === "string" ? document.querySelector(container) : container;
      if (!el) return;

      const data = normalizeXmlData(xmlData);
      const title = `${data.manufacturer} ${data.modelName}`.trim();
      const priceDisplay = data.price ? formatCurrency(parseFloat(data.price) || 0) : "";
      const barcodeId = `barcode-left-${data.stockNumber.replace(/[^a-zA-Z0-9]/g, '')}`;

      el.innerHTML = `
        <div class="ht-print-tag ht-sold">
          ${HangTagPartials.hole()}
          ${HangTagPartials.logo()}
          
          <div class="ht-header">
            ${HangTagPartials.soldBanner()}
            ${HangTagPartials.badges({ stockNumber: data.stockNumber, year: data.modelYear, usage: data.usage, metricValue: data.metricValue, metricType: data.metricType })}
            ${HangTagPartials.titleBlock(title)}
          </div>
          
          <div class="ht-body">
            ${HangTagPartials.image(data.imageUrl, title)}
            ${HangTagPartials.description(data.description, "Description")}
            ${HangTagPartials.barcode(barcodeId)}
          </div>
          
          <div class="ht-footer-outline">
            ${HangTagPartials.footerSold(priceDisplay)}
          </div>
        </div>
      `;

      // Initialize barcode
      if (data.vin && typeof JsBarcode !== "undefined") {
        try {
          JsBarcode(`#${barcodeId}`, data.vin, { height: 40 });
        } catch (e) {
          console.warn("Barcode init failed:", e);
        }
      }
    },

    renderRight: (xmlData, container) => {
      // Same as left for sold template
      HangTagTemplates.sold.renderLeft(xmlData, container);
    },
  },

  /**
   * Simple template - works with XML cache data only.
   */
  simple: {
    name: "Simple",
    description: "Basic hang tag using XML cache data (no detailed pricing)",
    
    renderLeft: (xmlData, container) => {
      const el = typeof container === "string" ? document.querySelector(container) : container;
      if (!el) return;

      const data = normalizeXmlData(xmlData);
      const title = `${data.manufacturer} ${data.modelName}`.trim();
      const priceDisplay = data.price ? formatCurrency(parseFloat(data.price) || 0) : "";

      el.innerHTML = `
        <div class="ht-print-tag">
          ${HangTagPartials.hole()}
          ${HangTagPartials.logo()}
          
          <div class="ht-header">
            ${HangTagPartials.badges({ stockNumber: data.stockNumber, year: data.modelYear, usage: data.usage, metricValue: data.metricValue, metricType: data.metricType })}
            ${HangTagPartials.titleBlock(title)}
          </div>
          
          <div class="ht-body">
            ${HangTagPartials.image(data.imageUrl, title)}
            ${HangTagPartials.description(data.description, "Description")}
            ${HangTagPartials.barcode("barcode-left")}
          </div>
          
          <div class="ht-footer-outline">
          ${priceDisplay ? `
            <div class="ht-footer">
              <div class="ht-footer-price">${priceDisplay}</div>
            </div>
          ` : ""}
          </div>
        </div>
      `;
    },

    renderRight: (xmlData, container) => {
      const el = typeof container === "string" ? document.querySelector(container) : container;
      if (!el) return;

      const data = normalizeXmlData(xmlData);
      const title = `${data.manufacturer} ${data.modelName}`.trim();
      const priceDisplay = data.price ? formatCurrency(parseFloat(data.price) || 0) : "";

      el.innerHTML = `
        <div class="ht-print-tag">
          ${HangTagPartials.hole()}
          ${HangTagPartials.logo()}
          
          <div class="ht-header">
            ${HangTagPartials.badges({ stockNumber: data.stockNumber, year: data.modelYear, usage: data.usage, metricValue: data.metricValue, metricType: data.metricType })}
            ${HangTagPartials.titleBlock(title)}
          </div>
          
          <div class="ht-body">
            ${HangTagPartials.image(data.imageUrl, title)}
            ${HangTagPartials.description(data.description, "Specifications")}
            ${HangTagPartials.barcode("barcode-right")}
          </div>
          
          <div class="ht-footer-outline">
          ${priceDisplay ? `
            <div class="ht-footer">
              <div class="ht-footer-price">${priceDisplay}</div>
            </div>
          ` : ""}
          </div>
        </div>
      `;
    },
  },

  /**
   * Baseline/loading template - placeholder while data loads.
   */
  baseline: {
    name: "Baseline",
    description: "Loading placeholder with basic info from XML cache",
    
    renderLeft: (xmlData, container) => {
      const el = typeof container === "string" ? document.querySelector(container) : container;
      if (!el) return;

      const title = `${xmlData.Manufacturer || ""} ${xmlData.ModelName || ""}`.trim();
      const year = xmlData.ModelYear || "";
      const stockNumber = xmlData.StockNumber || "";
      const imageUrl = xmlData.ImageUrl || "";
      const price = xmlData.Price || "";
      const priceDisplay = price ? formatCurrency(parseFloat(price) || 0) : "Loading...";

      el.innerHTML = `
        <div class="ht-print-tag ht-baseline">
          ${HangTagPartials.hole()}
          ${HangTagPartials.logo()}
          
          <div class="ht-header">
            ${HangTagPartials.badges({ stockNumber, year })}
            ${HangTagPartials.titleBlock(title || "Loading...")}
          </div>
          
          <div class="ht-body">
            ${imageUrl ? HangTagPartials.image(imageUrl, title) : '<div class="ht-image-placeholder">Loading image...</div>'}
            <div class="ht-loading-indicator">
              <div class="spinner-border spinner-border-sm text-secondary" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
              <span class="ms-2 text-muted">Loading full details...</span>
            </div>
          </div>
          
          <div class="ht-footer-outline">
            <div class="ht-footer">
              <div class="ht-footer-price">${priceDisplay}</div>
            </div>
          </div>
        </div>
      `;
    },

    renderRight: (xmlData, container) => {
      HangTagTemplates.baseline.renderLeft(xmlData, container);
    },
  },

  /**
   * Error template - displays error message.
   */
  error: {
    name: "Error",
    description: "Error state with retry button",
    
    renderLeft: (message, container) => {
      const el = typeof container === "string" ? document.querySelector(container) : container;
      if (!el) return;

      el.innerHTML = `
        <div class="ht-print-tag ht-error">
          ${HangTagPartials.hole()}
          ${HangTagPartials.logo()}
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
    },

    renderRight: (message, container) => {
      HangTagTemplates.error.renderLeft(message, container);
    },
  },
};

// ===========================================
// PUBLIC API
// ===========================================

/**
 * Clear hang tag container.
 * @param {HTMLElement|string} container - Container element or selector.
 */
function clearHangTag(container) {
  const el = typeof container === "string" ? document.querySelector(container) : container;
  if (el) el.innerHTML = "";
}

/**
 * Initialize QR code in container.
 * @param {string} url - URL to encode.
 */
function initHangTagQR(url) {
  const qrContainer = document.getElementById("qrcode");
  if (qrContainer && url && typeof QRCode !== "undefined") {
    qrContainer.innerHTML = "";
    new QRCode(qrContainer, {
      text: url,
      width: 100,
      height: 100,
    });
  }
}

/**
 * Initialize barcode in container.
 * @param {string} vin - VIN to encode.
 * @param {string} selector - Barcode element selector.
 */
function initHangTagBarcode(vin, selector = "#barcode") {
  if (vin && typeof JsBarcode !== "undefined") {
    try {
      JsBarcode(selector, vin, { height: 40 });
    } catch (e) {
      console.warn("Barcode init failed:", e);
    }
  }
}

/**
 * Fetch hang tag data from portal API.
 * Uses the public API endpoint (CORS enabled).
 * @param {string} stockNumber - Stock number to fetch.
 * @returns {Promise<object>} Normalized hang tag data.
 */
async function fetchHangTagData(stockNumber) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(
      `https://newportal.flatoutmotorcycles.com/portal/public/api/majorunit/stocknumber/${encodeURIComponent(stockNumber)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    const data = await response.json();
    console.log("Portal API response for", stockNumber, ":", data);

    if (data && data.StockNumber) {
      return normalizeHangTagData(data);
    }
    return null;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error("Request timed out. Please check your connection and try again.");
    }
    throw error;
  }
}

/**
 * Render hang tags using specified template.
 * @param {string} templateName - Template name from registry.
 * @param {object} data - Data to render.
 * @param {string} leftContainer - Left container selector.
 * @param {string} rightContainer - Right container selector.
 */
function renderHangTags(templateName, data, leftContainer = ".tag-left", rightContainer = ".tag-right") {
  const template = HangTagTemplates[templateName];
  if (!template) {
    console.error(`Template "${templateName}" not found`);
    return;
  }
  try {
    console.log(`Rendering template: ${templateName}`);
    template.renderLeft(data, leftContainer);
    template.renderRight(data, rightContainer);
    console.log(`Template ${templateName} rendered successfully`);
  } catch (error) {
    console.error(`Error rendering template ${templateName}:`, error);
  }
}

/**
 * Load and render hang tags for a stock number.
 * Uses XML cache as primary data source, with portal API as enhancement.
 * @param {string} stockNumber - Stock number to load.
 */
async function loadHangTags(stockNumber) {
  if (!stockNumber || !stockNumber.trim()) {
    clearHangTag(".tag-left");
    clearHangTag(".tag-right");
    return;
  }

  let xmlData = null;

  // Load from XML cache (primary data source)
  try {
    if (typeof window.getCachedXmlVehicle === "function") {
      console.log("Fetching XML cache for:", stockNumber);
      xmlData = await window.getCachedXmlVehicle(stockNumber);
      console.log("XML cache result:", xmlData);
    } else {
      console.warn("getCachedXmlVehicle function not available");
    }
  } catch (error) {
    console.error("XML cache fetch failed:", error);
  }

  // If we have XML data, render the simple template
  if (xmlData) {
    console.log("Rendering simple template with XML data");
    renderHangTags("simple", xmlData);
    
    // Initialize barcode
    if (xmlData.VIN) {
      initHangTagBarcode(xmlData.VIN, "#barcode-left");
      initHangTagBarcode(xmlData.VIN, "#barcode-right");
    }
  } else {
    // No data found
    const message = `Stock number "${stockNumber}" not found.<br><small class="text-muted">Unit may not be in inventory.</small>`;
    renderHangTags("error", message);
  }

  // Try to enhance with portal data (may fail due to CORS on localhost)
  try {
    console.log("Attempting portal API fetch for:", stockNumber);
    const portalData = await fetchHangTagData(stockNumber);
    
    if (portalData && portalData.stockNumber) {
      console.log("Portal data available, rendering full template");
      console.log("Portal data:", portalData);
      renderHangTags("default", portalData);
      initHangTagQR(portalData.detailUrl);
      initHangTagBarcode(portalData.vin);
    } else {
      console.log("Portal returned but no stockNumber:", portalData);
    }
  } catch {
    // Portal API failed (likely CORS) - keep showing XML-based template
    console.log("Portal API unavailable (CORS), using XML data only");
  }
}

/**
 * Get list of available templates.
 * @returns {Array} Array of template info objects.
 */
function getAvailableTemplates() {
  return Object.entries(HangTagTemplates).map(([key, template]) => ({
    id: key,
    name: template.name,
    description: template.description,
  }));
}

// Export for use in other modules
window.HangTagTemplates = HangTagTemplates;
window.HangTagPartials = HangTagPartials;
window.loadHangTags = loadHangTags;
window.renderHangTags = renderHangTags;
window.getAvailableTemplates = getAvailableTemplates;

// Backward compatible API
window.HangTagComponent = {
  load: loadHangTags,
  clear: clearHangTag,
  render: renderHangTags,
  templates: HangTagTemplates,
  partials: HangTagPartials,
};
