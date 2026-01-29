/**
 * Key Tag Component
 * Renders and prints vehicle key tags using XML data only.
 * @module key-tag
 */

/**
 * Render a horizontal key tag into a container.
 * @param {object} data - Vehicle data object with StockNumber, Usage, ModelYear, etc.
 * @param {HTMLElement|string} container - Container element or selector.
 */
function renderKeyTag(data, container) {
  const el = typeof container === "string" ? document.querySelector(container) : container;
  if (!el) {
    console.error("Key tag container not found");
    return;
  }

  const safeText = (value) => value || "N/A";

  el.innerHTML = `
    <div class="key-tag-horizontal">
      <div class="kt-row kt-usage">${safeText(data.Usage)}</div>
      <div class="kt-row kt-stock">${safeText(data.StockNumber)}</div>
      <div class="kt-row kt-year">${safeText(data.ModelYear)}</div>
      <div class="kt-row kt-manufacturer">${safeText(data.Manufacturer)}</div>
      <div class="kt-row kt-model">${safeText(data.ModelName)}</div>
      <div class="kt-row kt-code">${safeText(data.ModelCode)}</div>
      <div class="kt-row kt-color">${safeText(data.Color)}</div>
      <div class="kt-row kt-vin">${safeText(data.VIN)}</div>
    </div>
  `;
}

/**
 * Render a vertical key tag into a container.
 * @param {object} data - Vehicle data object.
 * @param {HTMLElement|string} container - Container element or selector.
 */
function renderKeyTagVertical(data, container) {
  const el = typeof container === "string" ? document.querySelector(container) : container;
  if (!el) {
    console.error("Vertical key tag container not found");
    return;
  }

  // Line 1: Year Manufacturer
  const line1 = `${data.ModelYear || ""} ${data.Manufacturer || ""}`.trim() || "N/A";
  // Line 2: Model + VIN
  const line2 = `${data.ModelName || ""} ${data.VIN || ""}`.trim() || "N/A";

  el.innerHTML = `
    <div class="key-tag-vertical">
      <span class="kt-v-line kt-v-line-1">${line1}</span>
      <span class="kt-v-line kt-v-line-2">${line2}</span>
    </div>
  `;
}

/**
 * Clear a key tag container and show placeholders.
 * @param {HTMLElement|string} container - Container element or selector.
 * @param {string} type - "horizontal" or "vertical".
 */
function clearKeyTag(container, type = "horizontal") {
  const el = typeof container === "string" ? document.querySelector(container) : container;
  if (!el) return;

  if (type === "vertical") {
    el.innerHTML = `
      <div class="key-tag-vertical">
        <span class="kt-v-line kt-v-line-1"><span class="kt-placeholder"></span></span>
        <span class="kt-v-line kt-v-line-2"><span class="kt-placeholder"></span></span>
      </div>
    `;
  } else {
    el.innerHTML = `
      <div class="key-tag-horizontal">
        <div class="kt-row kt-usage"><span class="kt-placeholder w-50"></span></div>
        <div class="kt-row kt-stock"><span class="kt-placeholder w-75"></span></div>
        <div class="kt-row kt-year"><span class="kt-placeholder w-50"></span></div>
        <div class="kt-row kt-manufacturer"><span class="kt-placeholder w-75"></span></div>
        <div class="kt-row kt-model"><span class="kt-placeholder w-100"></span></div>
        <div class="kt-row kt-code"><span class="kt-placeholder w-50"></span></div>
        <div class="kt-row kt-color"><span class="kt-placeholder w-75"></span></div>
        <div class="kt-row kt-vin"><span class="kt-placeholder w-100"></span></div>
      </div>
    `;
  }
}

/**
 * Print key tags using browser print dialog.
 * @param {HTMLElement|string} horizontalContainer - Horizontal tag container.
 * @param {HTMLElement|string} verticalContainer - Vertical tag container (optional).
 * @param {boolean} includeVertical - Whether to include vertical tag.
 */
function printKeyTag(horizontalContainer, verticalContainer = null, includeVertical = false) {
  const horizontal = typeof horizontalContainer === "string" 
    ? document.querySelector(horizontalContainer) 
    : horizontalContainer;
  
  if (!horizontal) {
    console.error("Horizontal key tag container not found for printing");
    return;
  }

  // Create print container
  const printContainer = document.createElement("div");
  printContainer.className = "kt-print-container";
  
  // Clone horizontal tag
  const horizontalClone = horizontal.cloneNode(true);
  horizontalClone.classList.add("kt-print-page");
  printContainer.appendChild(horizontalClone);

  // Optionally clone vertical tag
  if (includeVertical && verticalContainer) {
    const vertical = typeof verticalContainer === "string"
      ? document.querySelector(verticalContainer)
      : verticalContainer;
    
    if (vertical) {
      const verticalClone = vertical.cloneNode(true);
      verticalClone.classList.add("kt-print-page");
      printContainer.appendChild(verticalClone);
    }
  }

  // Create print iframe for isolated printing
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Key Tag Print</title>
      <link rel="stylesheet" href="/key-tags/key-tag.css">
      <style>
        @page {
          size: 1.625in 2.125in;
          margin: 0.06in;
        }
        body {
          margin: 0;
          padding: 0;
        }
        .kt-print-page {
          page-break-after: always;
        }
        .kt-print-page:last-child {
          page-break-after: avoid;
        }
        .kt-placeholder {
          display: none !important;
        }
      </style>
    </head>
    <body>
      ${printContainer.innerHTML}
    </body>
    </html>
  `);
  iframeDoc.close();

  // Wait for styles to load then print
  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      // Remove iframe after print dialog closes
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 250);
  };
}

/**
 * Find vehicle data in the cached items array by stock number.
 * @param {Array} items - Array of vehicle items (from State.allItems).
 * @param {string} stockNumber - Stock number to find.
 * @returns {object|null} - Matching vehicle data or null.
 */
function findVehicleByStockNumber(items, stockNumber) {
  if (!items || !stockNumber) return null;
  const target = stockNumber.trim().toUpperCase();
  return items.find(item => {
    const itemStock = (item.stockNumber || item.StockNumber || "").trim().toUpperCase();
    return itemStock === target;
  }) || null;
}

/**
 * Normalize vehicle data from XML format to component format.
 * @param {object} item - Raw vehicle item from XML/cache.
 * @returns {object} - Normalized data object.
 */
function normalizeVehicleData(item) {
  if (!item) return null;
  return {
    StockNumber: item.stockNumber || item.StockNumber || "",
    Usage: item.usage || item.Usage || "",
    ModelYear: item.year || item.ModelYear || "",
    Manufacturer: item.manufacturer || item.Manufacturer || "",
    ModelName: item.modelName || item.ModelName || "",
    ModelCode: item.modelCode || item.ModelCode || "",
    Color: item.color || item.Color || "",
    VIN: item.vin || item.VIN || "",
  };
}

// Export for ES modules
if (typeof window !== "undefined") {
  window.KeyTagComponent = {
    render: renderKeyTag,
    renderVertical: renderKeyTagVertical,
    clear: clearKeyTag,
    print: printKeyTag,
    findVehicle: findVehicleByStockNumber,
    normalize: normalizeVehicleData,
  };
}
