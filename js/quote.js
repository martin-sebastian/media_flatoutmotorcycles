/* global bootstrap, numeral, moment, ClipboardJS, PriceCalculator */

/**
 * CONFIGURATION CONSTANTS
 * Main application configuration settings
 */
const CONFIG = {
  API_URL: "https://newportal.flatoutmotorcycles.com/portal/public/api", // Base API endpoint for vehicle data
  MAIN_LOTS: ["SUZ", "KAW", "POL", "PREOWNED", "PRE OWNED"], // Vehicle lot categories for inventory status
  DEFAULT_INTEREST_RATE: 6.99, // Default APR for payment calculations
  CUSTOM_ACCESSORY_ROWS: 4, // Number of blank accessory input rows
};

/**
 * CUSTOM ACCESSORIES STORAGE
 * Stores user-added accessories that aren't in the API data
 */
let customAccessories = [];
const CUSTOM_ACCESSORIES_KEY = "quoteCustomAccessories";

/**
 * INITIALIZE CLIPBOARD TOOLTIPS
 * Sets up clipboard copy functionality with Bootstrap tooltips for any elements with data-clipboard-target attribute
 * Uses ClipboardJS library for copy functionality and Bootstrap tooltips for user feedback
 */
function initializeClipboardTooltips() {
  const clipboardButtons = document.querySelectorAll("[data-clipboard-target]");
  clipboardButtons.forEach((button) => {
    // Initialize ClipboardJS for each button
    new ClipboardJS(button);
    
    // Create initial tooltip showing "Copy to clipboard"
    const tooltip = new bootstrap.Tooltip(button, {
      title: "Copy to clipboard",
      placement: "top",
      trigger: "hover",
    });

    // Handle click event to show "Copied!" feedback
    button.addEventListener("click", () => {
      tooltip.dispose(); // Remove existing tooltip
      const newTooltip = new bootstrap.Tooltip(button, {
        title: "Copied!",
        placement: "top",
        trigger: "manual",
      });
      newTooltip.show();
      // Auto-hide the "Copied!" tooltip after 1 second
      setTimeout(() => {
        newTooltip.dispose();
        tooltip.dispose();
      }, 1000);
    });
  });
}

/**
 * Update the loader with baseline XML info if available.
 * @param {string} stockNumber Stock number to lookup.
 * @param {HTMLElement} loader Loader element to update.
 */
async function loadQuoteBaseline(stockNumber, loader) {
  if (!loader || !stockNumber) return;
  try {
    const xmlData = await window.getCachedXmlVehicle(stockNumber);
    if (!xmlData) return;
    const title = `${xmlData.ModelYear || ""} ${xmlData.Manufacturer || ""} ${xmlData.ModelName || ""}`.trim();
    loader.innerHTML = `
      <i class="fa fa-spinner fa-spin fa-3x"></i>
      <p>Loading latest pricing...</p>
      <div class="small text-muted">${title || ""}</div>
      <div class="small text-muted">${xmlData.StockNumber || ""}</div>
    `;
  } catch (error) {
    console.warn("Cached XML baseline failed:", error);
  }
}

/**
 * URL PARAMETER HANDLING
 * Extract stock number from URL query parameters for vehicle lookup
 */
const queryString = window.location.search; // Get full query string from URL
const urlParams = new URLSearchParams(queryString); // Parse query parameters
const stockNum = urlParams.get("search"); // Extract 'search' parameter (stock number)

console.log("Attempting to fetch data for stock number:", stockNum);

/**
 * PAYMENT CALCULATOR FUNCTION
 * Calculates monthly payment based on loan amount, down payment, term, and interest rate
 * Updates the payment display in real-time as user adjusts sliders
 */
function showpay() {
  // Get form values
  var princ = document.calc.loan.value;        // Principal loan amount (total vehicle price)
  var down = document.calc.downpayment.value;  // Down payment percentage
  var dp = (princ / 100) * down;               // Calculate down payment amount
  var term = document.calc.months.value;       // Loan term in months
  var intr = document.calc.rate.value / 1200;  // Monthly interest rate (annual rate / 12 / 100)
  
  // Calculate monthly payment using standard loan payment formula
  // Payment = (P - DP) * r / (1 - (1 + r)^-n)
  // Where P = Principal, DP = Down Payment, r = monthly rate, n = number of payments
  document.calc.pay.value = ((princ - dp) * intr) / (1 - Math.pow(1 / (1 + intr), term));
  document.calc.pay.value = document.calc.pay.value;
  var payment = ((princ - dp) * intr) / (1 - Math.pow(1 / (1 + intr), term));
  var payment = payment.toFixed(); // Round to nearest dollar

  // Update payment display on the page
  document.getElementById("payment").innerHTML = payment;

  // Update APR slider display value
  var slider2 = document.getElementById("percentRange");
  var output2 = document.getElementById("percentRangeValue");
  output2.innerHTML = slider2.value;
  slider2.oninput = function () {
    output2.innerHTML = this.value;
  };

  // Update down payment slider display value
  var slider4 = document.getElementById("downpaymentRange");
  var output4 = document.getElementById("downpaymentRangeValue");
  output4.innerHTML = slider4.value;
  slider4.oninput = function () {
    output4.innerHTML = this.value;
  };
}

/**
 * UPDATE TRADE-IN DETAILS
 * Updates the quote display when trade-in information is provided
 * Recalculates total price by subtracting trade-in value from original OTD price
 * This affects the final quote image that gets shared via messenger/SMS
 */
function updateTradeDetails() {
  const tradeValueElement = document.getElementById("tradeValueDisplay");
  const otdElement = document.getElementById("otdPriceDisplay");
  
  // Get trade-in form values
  const year = document.getElementById("InputYear").value;
  const vehicle = document.getElementById("InputVehicle").value;
  const condition = document.getElementById("InputCondition").value;
  const value = document.getElementById("InputTradeValue").value;

  if (tradeValueElement && value && value > 0) {
    // Show trade-in section and update description
    tradeValueElement.style.display = "list-item";
    const tradeDescription = `Trade-in: ${year} ${vehicle}${condition ? `, ${condition}` : ""}`;
    tradeValueElement.innerHTML = `
      ${tradeDescription}
      <span class="float-end">${numeral(value).format("$0,0.00")}</span>
    `;

    // Update total price by subtracting trade-in value
    if (otdElement) {
      const originalOTD = window.originalOTDPrice; // Use stored global value
      const newOTD = originalOTD - parseFloat(value);
      otdElement.innerHTML = `
        Total O.T.D. Price: 
        <span class="float-end">${numeral(newOTD).format("$0,0.00")}</span>
      `;
    }
  } else {
    // Hide trade-in section and reset to original price if no trade value
    tradeValueElement.style.display = "none";
    if (otdElement) {
      otdElement.innerHTML = `
        Total Price: 
        <span class="float-end">${numeral(window.originalOTDPrice).format("$0,0.00")}</span>
      `;
    }
  }
}

// Debug logging to verify script execution
console.log("Script starting...");

/**
 * TRADE-IN FORM TEMPLATE
 * HTML template for trade-in form (currently unused but available for future implementation)
 * Could be used to allow customers to input trade-in details directly in the quote interface
 */
const tradeInFormTemplate = `
  <div class="trade-in-form hidden">
    <!-- Your trade-in form HTML goes here -->
    <h3>Trade-In Form</h3>
    <form>
      <label for="tradeYear">Year:</label>
      <input type="text" id="tradeYear" name="tradeYear">
      
      <label for="tradeMake">Make:</label>
      <input type="text" id="tradeMake" name="tradeMake">
      
      <label for="tradeModel">Model:</label>
      <input type="text" id="tradeModel" name="tradeModel">
      
      <button type="submit">Submit</button>
    </form>
  </div>
`;

/**
 * SIDEBAR INITIALIZATION
 * Sets up collapsible sidebar functionality for the quote interface
 * Allows users to hide/show the sidebar to have more space for quote editing
 */
function initializeSidebar() {
  const sidebar = document.querySelector(".d-flex.flex-column.flex-shrink-0");
  const collapseButton = document.querySelector(".navbar-brand i.bi-arrows-collapse-vertical");

  if (sidebar && collapseButton) {
    collapseButton.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
      // Update the icon to reflect current state
      collapseButton.classList.toggle("bi-arrows-expand-vertical");
      collapseButton.classList.toggle("bi-arrows-collapse-vertical");
    });
  }
}

/**
 * ZOOM FUNCTIONALITY
 * Provides zoom controls for the quote interface to help with quote editing and review
 * Users can zoom in/out to better see details or get overview of the quote card
 */
let currentZoom = 1.0;        // Current zoom level (1.0 = 100%)
const MIN_ZOOM = 0.2;         // Minimum zoom level (20%)
const MAX_ZOOM = 2.0;         // Maximum zoom level (200%)
const ZOOM_STEP = 0.1;        // Zoom increment/decrement step

/**
 * Adjusts zoom level by the specified delta amount
 * @param {number} delta - Amount to change zoom (positive to zoom in, negative to zoom out)
 */
function adjustZoom(delta) {
  const newZoom = Math.min(Math.max(currentZoom + delta, MIN_ZOOM), MAX_ZOOM);
  if (newZoom !== currentZoom) {
    currentZoom = newZoom;
    updateZoom();
  }
}

/**
 * Resets zoom level back to 100% (1.0)
 */
function resetZoom() {
  currentZoom = 1.0;
  updateZoom();
}

/**
 * Applies the current zoom level to the page container and updates zoom display
 */
function updateZoom() {
  const container = document.querySelector(".page-container.zoom-container");
  if (container) {
    container.style.transform = `scale(${currentZoom})`;
    document.getElementById("zoomLevel").textContent = `${Math.round(currentZoom * 100)}%`;
  }
}

// Add keyboard shortcuts for zoom
document.addEventListener("keydown", function (e) {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === "=") {
      e.preventDefault();
      adjustZoom(ZOOM_STEP);
    } else if (e.key === "-") {
      e.preventDefault();
      adjustZoom(-ZOOM_STEP);
    } else if (e.key === "0") {
      e.preventDefault();
      resetZoom();
    }
  }
});

document.addEventListener("DOMContentLoaded", function () {
  console.log("DOM Content Loaded");

  // Initialize Alpine.js data at the body level
  document.body.setAttribute(
    "x-data",
    JSON.stringify({
      firstName: "",
      lastName: "",
    })
  );

  // Initialize sidebar
  initializeSidebar();

  // Create a loader element that can be controlled
  const loader = document.createElement("div");
  loader.id = "page-loader";
  loader.className = "text-center";
  loader.innerHTML = '<i class="fa fa-spinner fa-spin fa-3x"></i><p>Loading...</p>';

  // Add error container to body early
  const errorContainer = document.createElement("div");
  errorContainer.id = "error-container";

  // Get the capture container or page container
  const pageContainer = document.querySelector("#pageContainer");
  const captureContainer = pageContainer ? pageContainer.querySelector(".capture-container") : null;

  if (pageContainer) {
    // Clear only the page container
    pageContainer.innerHTML = "";
    pageContainer.appendChild(loader);
    pageContainer.appendChild(errorContainer);
  } else if (captureContainer) {
    // Fallback to the capture container
    captureContainer.innerHTML = "";
    captureContainer.appendChild(loader);
    captureContainer.appendChild(errorContainer);
  } else {
    console.error("Could not find container for loading display");
  }

  if (!stockNum) {
    loader.style.display = "none"; // Hide loader
    showError("No stock number provided in URL");
    return;
  }

  loadQuoteBaseline(stockNum, loader);

  const apiUrl = `${CONFIG.API_URL}/majorunit/stocknumber/${stockNum}`;
  console.log("Attempting API call to:", apiUrl);

  fetch(apiUrl)
    .then((response) => {
      console.log("API Response received:", response.status);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(async (data) => {
      console.log("API Data received:", data);
      if (!data || !data.StockNumber) {
        throw new Error("Invalid data received from API");
      }

      // Merge XML data over API data (XML is more up to date)
      try {
        const xmlData = await window.getCachedXmlVehicle(data.StockNumber);
        if (xmlData) {
          console.log("XML Data found, merging:", xmlData);
          // Override API fields with XML data where available
          if (xmlData.ModelYear) data.ModelYear = xmlData.ModelYear;
          if (xmlData.Manufacturer) data.Manufacturer = xmlData.Manufacturer;
          if (xmlData.ModelName) data.B50ModelName = xmlData.ModelName;
          if (xmlData.Color) data.Color = xmlData.Color;
          if (xmlData.VIN) data.VIN = xmlData.VIN;
          if (xmlData.Usage) data.Usage = xmlData.Usage;
          if (xmlData.Description) data.Description = xmlData.Description;
          // Override first image if XML has images (API uses {ImgURL: "..."} format)
          if (xmlData.Images?.length > 0 && data.Images?.length > 0) {
            data.Images[0] = { ImgURL: xmlData.Images[0] };
          }
        }
      } catch (e) {
        console.warn("XML merge failed, using API data only:", e);
      }

      // Generate Title from current data (after XML merge)
      data.Title = [data.ModelYear, data.Manufacturer, data.B50ModelName].filter(Boolean).join(" ");

      // Store data globally
      window.vehicleData = data;

      // Get existing page container instead of creating a new one
      let pageContainer = document.querySelector("#pageContainer");
      if (!pageContainer) {
        console.error("Could not find page container");
        return;
      }

      // Store original OTD price globally
      // window.originalOTDPrice = data.OTDPrice;

      console.log("data.StockNumber", data.StockNumber);
      const stockNumber = data.StockNumber;
      const prodTitle = data.Title;
      const arrivalDate = moment(data.EstimatedArrival).format("MM/DD/YYYY");
      const newUsed = data.Usage === "New" ? "New" : "Pre-Owned";
      const msrpDsrpLabel = data.Usage === "New" ? "MSRP" : "DSRP";
      const milesHours = data.Miles;
      const inventoryStatus = data.UnitStatus;
      const qLevel = data.QuoteLevel;
     
      // Get OTD Items Total using reduce
      const otdItemsTotal = data?.OTDItems?.reduce((total, item) => total + item.Amount, 0) || 0;

      // calculate total price, total savings
      const msrpDisplay = numeral(data.MSRPUnit).format("$0,0.00");
      const dsrpDisplay = numeral(data.DSRPUnit).format("$0,0.00");
      const salesPrice = data.MSRPUnit + data.DiscountItemsTotal + data.MatItemsTotal + data.AccessoryItemsTotal;
      const salesPriceDisplay = numeral(salesPrice).format("$0,0.00");
      const totalPrice = data.MSRPUnit + data.DiscountItemsTotal + data.MatItemsTotal + data.AccessoryItemsTotal + otdItemsTotal;
      const totalPriceDisplay = numeral(totalPrice).format("$0,0.00");
      const totalSavings = data.DiscountItemsTotal + data.MatItemsTotal + data.TradeInItemsTotal + data.AccessoryItemsTotal;
      const totalSavingsPositive = totalSavings * -1;
      const totalSavingsDisplay = numeral(totalSavingsPositive).format("$0,0");
      

      // Update the qLevel, totalPrice, totalSavings
      // document.getElementById("qLevel").innerHTML = qLevel;
      // document.getElementById("totalPrice").innerHTML = totalPrice;
      // document.getElementById("totalSavings").innerHTML = totalSavings;


      // Quote Dates
      let quoteDate = moment(); // current date
      let quoteDateFormatted = quoteDate.format("MM/DD/YYYY");
      let quoteTime = quoteDate.format("h:mm a");
      let quoteExpirationDate = moment(quoteDate).add(3, 'days');
      let quoteExpirationDateFormatted = quoteExpirationDate.format("MM/DD/YYYY");

      let totalSavingsTemplate = ``;

      if (totalSavingsPositive > 0) {
        totalSavingsTemplate += `
      <div class="text-light fw-bold m-0 p-0">Savings:</div>
        <div class="fs-2 fw-bold p-0" style="letter-spacing: -1px; font-weight: 900 !important; margin-top: -10px;">
          ${totalSavingsDisplay}
        </div>
      </div>
      `
      } else {
        totalSavingsTemplate += `
        <div class="text-light fw-bold m-0 p-0"> OR </div>
        <div class="fs-2 fw-bold p-0" style="letter-spacing: -1px; font-weight: 900 !important; margin-top: -10px;">
          <i class="bi bi-arrow-right"></i>
        </div>
      </div>
        `;
      }

      var matItemsTemplate = data.MatItems?.length
        ? `
        <div class="card">
        <h5 class="card-title fs-6 my-0">Manufacturer Rebates</h5>
          ${data.MatItems.map(
            (item) => `
            <div class="d-flex justify-content-between align-items-center">
              <span>${item.Description}</span>
              <span class="text-danger fw-bold">${numeral(item.Amount).format("$0,0.00")}</span>
            </div>
          `
          ).join("")}
        </div>
      `
        : "";
      var OTDItemsTemplate = data.OTDItems?.length
        ? `
        <div class="card">
          <h5 class="card-title fs-6 my-0">Fees and Taxes</h5>
          ${data.OTDItems.map(
            (item) => `
            <div class="d-flex justify-content-between align-items-center">
              <span>${item.Description}</span>
              <span>${numeral(item.Amount).format("$0,0.00")}</span>
            </div>
          `
          ).join("")}
        </div>
      `
        : "";

      // Remove accessoryImageMap since we don't need it anymore
      var carouselImages = "";

      i = 0;
      while (i < data.Images.length) {
        // Create carousel slide with simplified caption
        carouselImages += `
          <div class="carousel-item ${i === 0 ? "active" : ""}">
            <img 
              src="${data.Images[i].ImgURL}" 
              class="d-block w-100" 
              alt="Vehicle Image"
            >
            <div class="carousel-caption visually-hidden">
              <h5>${prodTitle}</h5>
              <p>Vin: ${data.VIN} // Stock # ${stockNumber}</p>
            </div>
          </div>`;
        i++;
      }

      var tradeInItemsTemplate = data.TradeInItems?.length
        ? `
          <div class="card">
            <h5 class="card-title fs-6 my-0">Trade-In Allowance</h5>
            ${data.TradeInItems.map(
              (item) => `
              <div class="d-flex justify-content-between align-items-center">
                <span>${item.Description}</span>
                <span>${numeral(item.Amount).format("$0,0.00")}</span>
              </div>
            `
            ).join("")}
          </div>
        `
        : "";

      // Accessory Items Template
      var accessoryItemsTemplate = data.AccessoryItems?.length
        ? `
        <div class="card">
          <h5 class="card-title fs-6 my-0">Accessories</h5>
          ${data.AccessoryItems.map((item) => {
            const priceDisplay = item.Included
              ? `${item.Amount > 0 ? `${item.Description} (value: ${numeral(item.Amount).format("$0,0.00")})` : item.Description}`
              : item.Description;

            return `
              <div class="accessory-item w-100">
                <div class="d-flex justify-content-between align-items-center">
                  <span class="accessory-name flex-grow-1">${priceDisplay}</span>
                  <span class="accessory-price fw-bold text-end ms-2">
                    ${item.Included ? '<span class="included-text">Included</span>' : numeral(item.Amount).format("$0,0.00")}
                  </span>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      `
        : "";

      // Discount Items Template
      var discountItemsTemplate = data.DiscountItems?.length
        ? `
        <div class="card">
          <h5 class="card-title fs-6 my-0">Discounts</h5>
          ${data.DiscountItems.slice(0, 3)
            .map(
              (item) => `
              <div class="d-flex justify-content-between align-items-center">
                <span>${item.Description}</span>
                <span class="text-danger fw-bold">${numeral(item.Amount).format("$0,0.00")}</span>
              </div>
            `
            )
            .join("")}
        </div>
      `
        : "";
      
      // Discretion Items Template
      var discretionItemsTemplate = data.DiscretionItems?.length
        ? `
        <div class="card">
          <h5 class="card-title fs-6 my-0">Discretionary</h5>
          ${data.DiscretionItems.slice(0, 3)
            .map(
              (item) => `
              <div class="d-flex justify-content-between align-items-center">
                <span>${item.Description}</span>
                <span class="text-danger fw-bold">${numeral(item.Amount).format("$0,0.00")}</span>
              </div>
            `
            )
            .join("")}
        </div>
      `
        : "";
      

      // OTD Items Template
      var OTDItemsTemplate = data.OTDItems?.length
        ? `
        <div class="card">
          <h5 class="card-title fs-6 my-0">Fees and Taxes</h5>
          ${data.OTDItems.slice(0, 3)
            .map(
              (item) => `
              <div class="d-flex justify-content-between align-items-center">
                <span>${item.Description}</span>
                <span class="text-danger fw-bold">${numeral(item.Amount).format("$0,0.00")}</span>
              </div>
            `
            )
            .join("")}
        </div>
      `
        : "";



      // Freebie items - 3 items allowed
      var freebieItemsTemplate = ``;

      i = 0;
      while (i < 3) {
        if (data.FreeItems[i]) {
          freebieItemsTemplate += `<li class="list-group-item"><em>${data.FreeItems[i].Description} (value: ${numeral(data.FreeItems[i].Amount).format(
            "$0,0.00"
          )})</em> <span class="float-end">Free</span></li>`;
        }
        i++;
      }

      

      // Unit Numbers & status info
      var unitNumbersTemplate = ``;

      if (inventoryStatus !== null) {
        unitNumbersTemplate += `<li class="list-group-item">Status: <span class="float-end">${inventoryStatus}</span></li>`;
      }
      if (data.EstimatedArrival !== null) {
        unitNumbersTemplate += `<li class="list-group-item">Available: <span class="float-end">${arrivalDate}</span></li>`;
      }
      if (data.Usage.length) {
        unitNumbersTemplate += `<li class="list-group-item">Usage: <span class="float-end">${newUsed}</span></li>`;
      }
      if (data.Miles >= 0) {
        unitNumbersTemplate += `<li class="list-group-item">Miles/Hours: <span class="float-end">${milesHours}</span></li>`;
      }
      if (data.StockNumber.length) {
        unitNumbersTemplate += `<li class="list-group-item">Stock #: <span class="float-end">${stockNum}</span></li>`;
      }
      if (data.VIN.length) {
        unitNumbersTemplate += `<li class="list-group-item">VIN: <span class="float-end">${data.VIN}</span></li>`;
      }

      // Availability
      // var mainLots = ["SUZ", "KAW", "POL", "PREOWNED", "PRE OWNED"];
      // var onOrderLots = ["ONORDER", "ON ORDER"];

      // var unitLocation = ``;

      // if (mainLots.includes(data.Lot)) {
      //   unitLocation = `<small class="red bold">IN STOCK - Main Showroom</small>`;
      // } else if (onOrderLots.includes(data.Lot)) {
      //   unitLocation = `<small class="red bold">ON ORDER - Arriving ${arrivalDate}</small>`;
      // } else if (data.Lot === "VH") {
      //   unitLocation = `<small class="red bold">IN STOCK - Vanderhall Showroom</small>`;
      // } else if (data.Lot == "IMC") {
      //   unitLocation = `<small class="red bold">IN STOCK - Indian Showroom</small>`;
      // }

      // Yellow Tag
      if (data.YellowTag === true) {
        var yellowTag = `<img src="https://newportal.flatoutmotorcycles.com/Portal/content/icons/ylwtag.png">`;
      } else {
        var yellowTag = ``;
      }

      // Feature Highlights Card
      i = 0;
      var muImageCardTemplate = ``;
      if (data.AccessoryItems.length) {
        //data.AccessoryItems.sort((a, b) => a.Number - b.Number);

        while (i < data.AccessoryItems.length) {
          if (data.AccessoryItems[i].ImgURL && data.AccessoryItems[i].Included === false) {
            muImageCardTemplate += `
			<div class="accessory-items-card">
				<div class="mu-feature-card">
					<img style="width: 100%;"
					src="${data.AccessoryItems[i].ImgURL}">
					<div style="padding: 10px;">
					<h4 class="bold" style="margin: 0 5px; padding: 5px 0">${data.AccessoryItems[i].Description}</h4>
					<p style="margin: 0 6px; height: 35px;">${data.AccessoryItems[i].ImageDescription}</p>
					<h4 class="bold" style="margin: 0 5px;">$${data.AccessoryItems[i].Amount}</h4>
					</div>
				</div>
			</div>
			`;
          } else if (data.AccessoryItems[i].ImgURL && data.AccessoryItems[i].Included === true && data.AccessoryItems[i].Amount > 0) {
            muImageCardTemplate += `
			<div class="accessory-items-cards">
				<div class="mu-feature-card">
					<img style="width: 100%;"
					src="${data.AccessoryItems[i].ImgURL}">
					<div style="padding: 10px;">
					<h4 class="bold" style="margin: 0 5px; padding: 5px 0">${data.AccessoryItems[i].Description}</h4>
					<p style="margin: 0 6px; height: 35px;">${data.AccessoryItems[i].ImageDescription}</p>
					<h4 class="bold" style="margin: 0 5px;"><small>Value:</small> $${data.AccessoryItems[i].Amount} <small>Item included in price</small></h4>
					</div>
				</div>
			</div>
			`;
          } else if (data.AccessoryItems[i].ImgURL && data.AccessoryItems[i].Included === true && data.AccessoryItems[i].Amount === 0) {
            muImageCardTemplate += `
			<div class="accessory-items-list">
				<div class="mu-feature-card">
					<img style="width: 100%;"
					src="${data.AccessoryItems[i].ImgURL}">
					<div style="padding: 10px;">
					<h5 class="bold" style="margin: 0 5px; padding: 5px 0">${data.AccessoryItems[i].Description}</h5>
					<p style="margin: 0 6px; height: 35px;">${data.AccessoryItems[i].ImageDescription}</p>
					<h4 class="bold" style="margin: 0 5px;"><small>Item included in price</small></h4>
					</div>
				</div>
			</div>
			`;
          }
          i++;
        }
      }

      // Update the Vehicle Image Carousel container template
      const carousel = `
    <div class="carousel-container ratio ratio-16x9 cover">
      <div id="carousel-overlay-vehicle-info" 
            class="carousel slide" 
            data-bs-ride="false"
            data-bs-interval="false"
            data-interval="false">
        <div class="carousel-indicators">
          ${data.Images.map(
            (_, index) => `
            <button type="button" 
              data-bs-target="#carousel-overlay-vehicle-info" 
              data-bs-slide-to="${index}" 
              ${index === 0 ? 'class="active" aria-current="true"' : ""}
              aria-label="Slide ${index + 1}">
            </button>
          `
          ).join("")}
        </div>

        <div class="carousel-inner rounded">
          ${carouselImages}
        </div>

        <button class="carousel-control-prev" type="button" data-bs-target="#carousel-overlay-vehicle-info" data-bs-slide="prev">
          <span class="carousel-control-prev-icon" aria-hidden="true"></span>
          <span class="visually-hidden">Previous</span>
        </button>

        <button class="carousel-control-next" type="button" data-bs-target="#carousel-overlay-vehicle-info" data-bs-slide="next">
          <span class="carousel-control-next-icon" aria-hidden="true"></span>
          <span class="visually-hidden">Next</span>
        </button>
      </div>
    </div>
      `;

      
      // Brand Logo Template
      var brandHeaderTemplate = `
      <div class="brand-container pb-2 mb-2 w-100 d-flex flex-row justify-content-between align-items-center">
        <div class="brand-logo-container m-0 p-0">
          <img src="../img/fom-app-logo-02.svg" alt="Brand Logo" class="img-fluid m-0 p-0" style="max-width: 200px;">
        </div>
        <div class="brand-text-container d-flex flex-column justify-content-center align-items-end m-0 p-0 py-2" style="max-width: 300px;">
          <h6 class="h6 fw-bold mb-0">Flat Out Motorsports</h6>
          <p class="small mt-0 p-0">
            <small class="fw-bold pb-0 mb-0">7525 E. 88th Place</small>
            <small class="fw-bold pb-0 mb-0">Indianapolis, IN 46256</small><br>
            <small class="fw-bold p-0 m-0">(317) 890-9110</small><a href="mailto:sales@flatoutmotorcycles.com" class="sales-email text-decoration-none text-dark ms-2">sales@flatoutmotorcycles.com</a>
          </p>
        </div>
      </div>
    `;

      // Major Unit Header with Year, Make, Model, VIN, Stock Number.
      var muHeaderTemplate = `
      <div class="vehicle-header text-center">
        <h1 class="h3 vehicle-title fw-bold my-0">${prodTitle}</h1>
        <h6 class="h6 vehicle-subtitle small my-0">
          <small>Model: ${data.ModelCode} | ${newUsed} | Miles: ${milesHours} | Stock #: ${data.StockNumber}</small>
        </h6>
      </div>
    `;

      // Boat Terms for Payment Calculator
      var loanTerms = ``;
      if (data.B50ModelType === "Pontoons") {
        loanTerms += `
		<label class="btn btn-danger term-button">
		<input type="radio" name="months" id="option1" value="24" onChange="showpay()"> 24
		</label>
		<label class="btn btn-danger term-button">
			<input type="radio" name="months" id="option2" value="36" onChange="showpay()"> 36
		</label>
		<label class="btn btn-danger term-button">
			<input type="radio" name="months" id="option3" value="48" onChange="showpay()"> 48
		</label>
		<label class="btn btn-danger term-button">
			<input type="radio" name="months" id="option4" value="60" onChange="showpay()"> 60
		</label>
		<label class="btn btn-danger term-button">
			<input type="radio" name="months" id="option5" value="72" onChange="showpay()"> 72
		</label>
		<label class="btn btn-danger term-button">
			<input type="radio" name="months" id="option6" value="84" onChange="showpay()"> 84
		</label>
		<label class="btn btn-danger term-button">
			<input type="radio" name="months" id="option7" value="96" onChange="showpay()"> 96
		</label>
		<label class="btn btn-danger term-button">
			<input type="radio" name="months" id="option8" value="108" onChange="showpay()"> 108
		</label>
		<label class="btn btn-danger term-button">
			<input type="radio" name="months" id="option9" value="120" onChange="showpay()"> 120
		</label>
		<label class="btn btn-danger term-button">
			<input type="radio" name="months" id="option10" value="144" onChange="showpay()"> 144
		</label>
		<label class="btn btn-danger term-button active">
			<input type="radio" name="months" id="option11" value="180" checked onChange="showpay()"> 180
		</label>
		<label class="btn btn-danger term-button">
			<input type="radio" name="months" id="option12" value="210" onChange="showpay()"> 210
		</label>
		<label class="btn btn-danger term-button">
			<input type="radio" name="months" id="option13" value="240" onChange="showpay()"> 240
		</label>
		`;
      } else {
        loanTerms += `
		<label class="btn btn-danger term-button">
		<input type="radio" name="months" id="option1" value="24" onChange="showpay()"> 24
		</label>
		<label class="btn btn-danger term-button">
			<input type="radio" name="months" id="option2" value="36" onChange="showpay()"> 36
		</label>
		<label class="btn btn-danger term-button">
			<input type="radio" name="months" id="option3" value="48" onChange="showpay()"> 48
		</label>
		<label class="btn btn-danger term-button active">
			<input type="radio" name="months" id="option4" value="60" checked onChange="showpay()"> 60
		</label>
		<label class="btn btn-danger term-button">
			<input type="radio" name="months" id="option5" value="72" onChange="showpay()"> 72
		</label>
		`;
      }
      

      // Payment Calculator
      const paymentCalc = `
		<div class="payment-calculator-container">
      <form name="calc" method="POST">
        <button type="button" 
          class="payment-calculator-button btn btn-danger w-100 pt-2 mb-1"
          data-bs-toggle="collapse" 
          data-bs-target="#paymentSliders" 
          aria-expanded="false" 
          aria-controls="paymentSliders" 
          onClick="showpay()">
            <div class="d-flex justify-content-between">
              <div class="our-price-display m-auto text-left">
                <div class="text-light fw-bold m-0 p-0">${msrpDsrpLabel}: <s>${msrpDisplay}</s></div>
                <div class="fs-2 fw-bold p-0" style="letter-spacing: -1px; font-weight: 900 !important; margin-top: -10px;">
                  ${salesPriceDisplay}
                </div>
              </div>
              <div class="vr"></div>
              <div class="savings-display m-auto text-left">
                  ${totalSavingsTemplate}
              <div class="vr"></div>
              <div class="payment text-center mx-auto pt-0">
                  <span class="text-light fw-bold">Payment:</span>
                  <span class="fs-2 fw-bold">$</span>
                  <span id="payment" class="fs-2 fw-bold" style="letter-spacing: -1px; font-weight: 900 !important;">
                    <i class="fa fa-spinner fa-pulse fa-1x fa-fw"></i>
                  </span> <span class="text-light fw-bold">/mo.</span>
                  <div class="text-light supersmall" style="letter-spacing: 0px; margin-top: -6px;">Subject to credit approval.</div>
              </div>
            </div>
        </button>
        <input type="hidden" name="loan" size="10" value="${totalPrice}">
				<div class="text-center collapse" id="paymentSliders">
					<div class="payment-collapsed-container">

            <div class="downpayment-container">
							<div class="downpayment-label">
								<span class="updated-value-line badge bg-danger"><span class="badge bg-dark downpayment-value px-2 py-1 me-2" id="downpaymentRangeValue"></span>% Down</span>
							</div>

							<div class="slider-row">
                <span class="credit-slider-label">0%</span>
                  <input name="downpayment" type="range" min="0.00" max="30.00" value="10" step="5" class="range-slider downpayment-bg" id="downpaymentRange" onChange="showpay()">
                <span class="credit-slider-label">30%</span>
              </div>
            </div>

            <div class="apr-container">
              <div class="apr-label">
                <span class="updated-value-line"><span class="apr-value" id="percentRangeValue"></span>% APR</span>
              </div>
							
							<div class="slider-row">
                <span class="credit-slider-label">LOW</span>
                <input name="rate" type="range" min="3.99" max="19.99" value="6.99" step="1" class="range-slider credit-bg" id="percentRange" onChange="showpay()">
                <span class="credit-slider-label">HIGH</span>
              </div>
            </div>

            <div class="loan-term-container">
              <p class="loan-term-label">Loan Term (Months)</p>
              <div data-toggle="buttons">${loanTerms}</div>
            </div>
					</div>
					<input type="hidden" name="pay" size="10">
					<input type="hidden" onClick="showpay()" value="Calculate">
				</div>
			</form>
    </div>
		`;

      // Create a separate template for the price container
      const paymentCalcContainer = `
        <div class="text-center">
            ${paymentCalc}
        </div>
      `;
      

      // Trade In display template
      const tradeInVehicleTemplate = `
        <div id="tradeValueDisplay" style="display: none;">
          2020 Harley Davidson <span class="float-end">$10,000</span>
        </div>

      `;

      // Savings display template
      let savingsTemplate = ``;

      if (totalSavingsPositive > 0) {
        savingsTemplate += `
        <div id="savingsDisplay" class="card py-1 px-2">
          <div class="text-left fw-bold mx-1">Savings:<span class="float-end">${totalSavingsDisplay}</span></div>
        </div>
      
        `
      }


      // Our Price display template
      const totalPriceTemplate = `
        <div id="totalPriceDisplay" class="card py-1 px-2">
          <div class="text-left fs-5 fw-bold mx-1">Total:<span class="float-end">${totalPriceDisplay}</span></div>
        </div>

      `;

      // Customer info template
      let customerInfoTemplate = ``;

      // Expiration date template
      const quoteDateTemplate = `
        <div id="quoteDateDisplay" class="pt-1 px-2">
          <div class="text-left mx-1">
            <span class="float-start small">Quote Date: ${quoteDateFormatted} ${quoteTime}</span>
            <span class="float-end small">Quote Expires: ${quoteExpirationDateFormatted}</span>
          </div>
        </div>

      `;
      
      
      // Search and Controls Card template
      const searchControlsTemplate = `
        <div class="search-controls-container sidebar-card flex-column flex-nowrap text-start">
          <div class="sidebar-card-header">
            <h5 class="h6 small text-start">Quote Another Vehicle</h5>
          </div>
          <div class="sidebar-card-body">
            <!-- Search Input -->
            <div class="mb-3">
              <div class="input-group input-group-sm pt-3">
                <input type="text" class="form-control" id="sidebarStockSearch" placeholder="Enter stock number">
                <button class="btn btn-outline-secondary" type="button" onclick="handleSidebarSearch(event)">
                  <i class="bi bi-search"></i>
                </button>
              </div>
          </div>
        </div>
      `;

      // Visibility Toggle Checkboxes template
      const visibilityToggleTemplate = `
        <div class="show-hide-container sidebar-card flex-column flex-nowrap text-start">
          <div class="sidebar-card-header">
            <h5 class="h6 small text-start">Show & Hide Sections</h5>
          </div>
          <div class="sidebar-card-body">
          <div class="form-check form-check-reverse text-start form-switch my-2">
            <label class="form-check-label small" for="quoteBrandHeader">Flat Out Motorsports Header</label>
            <input class="form-check-input" type="checkbox" role="switch" id="quoteBrandHeader" checked />
          </div>
          <div class="form-check form-check-reverse text-start form-switch my-2">
            <label class="form-check-label small" for="quoteCustomerInfo">Customer Information</label>
            <input class="form-check-input" type="checkbox" role="switch" id="quoteCustomerInfo" checked />
          </div>
          <div class="form-check form-check-reverse text-start form-switch my-2">
            <label class="form-check-label small" for="quoteHeader">Year, Make, Model, Stock #...</label>
            <input class="form-check-input" type="checkbox" role="switch" id="quoteHeader" checked />
          </div>
          <div class="form-check form-check-reverse text-start form-switch my-2">
            <input class="form-check-input" type="checkbox" role="switch" id="quoteImages" checked />
            <label class="form-check-label small" for="quoteImages">Vehicle Images</label>
          </div>
          <div class="form-check form-check-reverse text-start form-switch my-2">
            <input class="form-check-input" type="checkbox" role="switch" id="quotePayment" checked />
            <label class="form-check-label small" for="quotePayment">Price, Savings & Payment</label>
          </div>
          <div class="form-check form-check-reverse text-start form-switch my-2">
            <input class="form-check-input" type="checkbox" role="switch" id="quotePaymentAmount" checked />
            <label class="form-check-label small" for="quotePaymentAmount">Monthly Payment</label>
          </div>
          <div class="form-check form-check-reverse text-start form-switch my-2">
            <input class="form-check-input" type="checkbox" role="switch" id="quoteAccessories" checked />
            <label class="form-check-label small" for="quoteAccessories">Accessories</label>
          </div>
          <div class="form-check form-check-reverse text-start form-switch my-2">
            <input class="form-check-input" type="checkbox" role="switch" id="quoteTradeIn" checked />
            <label class="form-check-label small" for="quoteTradeIn">Trade In Allowance</label>
          </div>
          <div class="form-check form-check-reverse text-start form-switch my-2">
            <input class="form-check-input" type="checkbox" role="switch" id="quoteRebates" checked />
            <label class="form-check-label small" for="quoteRebates">Manufacturer Rebates</label>
          </div>
          <div class="form-check form-check-reverse text-start form-switch my-2">
            <input class="form-check-input" type="checkbox" role="switch" id="quoteDiscounts" checked />
            <label class="form-check-label small" for="quoteDiscounts">Dealer Discounts</label>
          </div>
          <div class="form-check form-check-reverse text-start form-switch my-2">
            <input class="form-check-input" type="checkbox" role="switch" id="quoteDiscretionary" checked disabled />
            <label class="form-check-label small" for="quoteDiscretionary">Discretionary Discounts</label>
          </div>
          <div class="form-check form-check-reverse text-start form-switch my-2">
            <input class="form-check-input" type="checkbox" role="switch" id="quoteFees" checked />
            <label class="form-check-label small" for="quoteFees">Fees, Freight, Taxes</label>
          </div>
          <div class="form-check form-check-reverse text-start form-switch my-2">
            <input class="form-check-input" type="checkbox" role="switch" id="quoteSavings" checked />
            <label class="form-check-label small" for="quoteSavings">Savings</label>
          </div>
          <div class="form-check form-check-reverse text-start form-switch my-2">
            <input class="form-check-input" type="checkbox" role="switch" id="quoteTotal" checked />
              <label class="form-check-label small" for="quoteTotal">Total w/ Fees & Taxes</label>
            </div>
          </div>
        </div>
      `;

      // Render the search controls template
      const searchControlsContainer = document.getElementById("searchControlsContainer");
      if (searchControlsContainer) {
        searchControlsContainer.innerHTML = searchControlsTemplate;
      }

      // Render the visibility toggles template
      const visibilityToggleTemplateContainer = document.getElementById("visibilityToggleContainer");
      if (visibilityToggleTemplateContainer) {
        visibilityToggleTemplateContainer.innerHTML = visibilityToggleTemplate;
      }

      

      // Update the main page content structure
      const pageContent = `
        <div class="capture-container">
          <div class="brand-header">${brandHeaderTemplate}</div>
          <div class="customer-info-container">${customerInfoTemplate}</div>
          <div class="main-header">${muHeaderTemplate}</div>
          <div class="carousel-container">${carousel}</div>
          <div class="payment-calculator-container">${paymentCalc}</div>
          <div class="accessory-items-container">${accessoryItemsTemplate}</div>
          <div class="trade-in-container">${tradeInVehicleTemplate}</div>
          <div class="mat-items-container">${matItemsTemplate}</div>
          <div class="discount-items-container">${discountItemsTemplate}</div>
          <div class="otd-items-container">${OTDItemsTemplate}</div>
          <div class="savings-container">${savingsTemplate}</div>
          <div class="total-price-container">${totalPriceTemplate}</div>
          <div class="quote-date-container">${quoteDateTemplate}</div>
          </div>
        </div>
      `;

      // Replace the entire page content at once
      const pageContainerEl = document.querySelector(".page-container");
      if (pageContainerEl) {
        pageContainerEl.innerHTML = pageContent;
      } else {
        console.error("Could not find .page-container");
      }

      // Initialize carousel with vanilla JS
      const carouselElement = document.querySelector("#carousel-overlay-vehicle-info");
      if (carouselElement) {
        const carousel = new bootstrap.Carousel(carouselElement, {
          interval: false,
          ride: false,
          wrap: true,
          pause: true,
        });

        carousel.pause();
      }

      // Add event listener to stop carousel if it starts
      document.querySelector("#carousel-overlay-vehicle-info")?.addEventListener("slide.bs.carousel", function (e) {
        const carousel = bootstrap.Carousel.getInstance(this);
        if (carousel) {
          carousel.pause();
        }
      });

      showpay();
      initializeClipboardTooltips();
      initializeVisibilityToggles();
      initializeCustomerInfo();
      initializeSidebarState();
      restoreCustomAccessories();
      initializeCustomAccessoriesForm();
      renderCustomAccessoriesOnQuote();
      createExportButton();
      createFloatingZoomControls();

      // Remove loader once everything is ready
      loader.remove();

      // Add this to your style section or CSS file
      const styleElement = document.createElement("style");
      styleElement.textContent = `
        .capture-container {
            width: 650px;
            max-width: 650px;
            /* Optional: Limit height to ensure quotes always fit on screen */
            /* max-height: 80vh; */
            /* overflow-y: auto; */
        }

        .main-header,
        .customer-info-container,
        .carousel-container,
        .payment-calculator-container,
        .mat-items-container,
        .discount-items-container,
        .accessory-items-container,
        .otd-items-container,
        .savings-container,
        .total-price-container {
            overflow: hidden;
            transition: all 0.6s ease-in-out;
            max-height: 2000px;
            -webkit-font-smoothing: antialiased;
            text-rendering: optimizeLegibility; 
        }

        .section-hidden {
            opacity: 0;
            max-height: 0;
            margin: 0 !important;
            padding: 0 !important;
        }
      `;
      document.head.appendChild(styleElement);
    })
    .catch((error) => {
      console.error("Error in fetch:", error);
      loader.style.display = "none"; // Hide loader
      showError(`Failed to load data: ${error.message}`);
    });
});

// Add helper function for showing errors
function showError(message) {
  const errorHtml = `
    <div class="alert bg-white" style="border-right: 1px solid #eee; border-left: 5px solid #dc3545; border-top: 1px solid #eee; border-bottom: 1px solid #eee;">
    <i class="bi bi-cone-striped fs-1 float-end"></i>
      <h5>Error Loading Vehicle Data</h5>
      <p class="fw-semibold">${message}!</p>
      <pre style="auto: none;">${new Error().stack}</pre>
      <p class="small">Search for a new stock number in the bar above, or return to inventory and click quote next to a vehicle.</p>
      <a href="../" class="btn btn-secondary">
        <i class="bi bi-database"></i> View Available Data
      </a>
    </div>
  `;

  // First check the error container, then the capture container, then find the page container
  const container =
    document.getElementById("error-container") ||
    document.querySelector(".capture-container.zoom-container .page-container") ||
    document.querySelector(".capture-container.zoom-container");

  if (container) {
    container.innerHTML = errorHtml;
  } else {
    console.error("Could not find container to display error message:", message);
  }
}

// Add global error handler
window.addEventListener("error", function (event) {
  console.error("Global error:", event.error);
  showError(`Unexpected error: ${event.error?.message || "Unknown error"}`);
});

/**
 * Get current quote state (customer info, toggle states, accessories, and first image URL).
 * @returns {object} State object with name, info, hidden sections, accessories, and image.
 */
function getQuoteState() {
  const state = {
    name: document.getElementById("inputFullName")?.value || "",
    info: document.getElementById("inputLastName")?.value || "",
    hide: [],
    acc: getCustomAccessoriesParam(), // Custom accessories
    img: "", // First image URL (may be from XML merge)
  };

  // Get the first image URL from the current vehicleData (includes XML merge)
  if (window.vehicleData?.Images?.[0]?.ImgURL) {
    state.img = window.vehicleData.Images[0].ImgURL;
  }

  // Toggle IDs that map to sections
  const toggleIds = [
    "quoteBrandHeader",
    "quoteCustomerInfo", 
    "quoteHeader",
    "quoteImages",
    "quotePayment",
    "quotePaymentAmount",
    "quoteAccessories",
    "quoteTradeIn",
    "quoteRebates",
    "quoteDiscounts",
    "quoteFees",
    "quoteSavings",
    "quoteTotal",
  ];

  // Check which toggles are unchecked (hidden)
  toggleIds.forEach(id => {
    const checkbox = document.getElementById(id);
    if (checkbox && !checkbox.checked) {
      state.hide.push(id);
    }
  });

  return state;
}

/**
 * Build the save URL with current state.
 * @param {string} format - Image format (jpeg or png).
 * @returns {string} API URL with state params.
 */
function buildSaveUrl(format = "jpeg") {
  const stockNumber = window.vehicleData?.StockNumber || new URLSearchParams(window.location.search).get("search") || "";
  const state = getQuoteState();
  
  const params = new URLSearchParams();
  params.set("s", stockNumber);
  params.set("format", format);
  if (format === "jpeg") params.set("quality", "95");
  if (state.name) params.set("name", state.name);
  if (state.info) params.set("info", state.info);
  if (state.hide.length > 0) params.set("hide", state.hide.join(","));
  if (state.acc) params.set("acc", state.acc);
  if (state.img) params.set("img", state.img);
  
  return `/api/generate-image?${params.toString()}`;
}

/** Default button HTML for save dropdown. */
const SAVE_BUTTON_HTML = `<i class="bi bi-save2 h5 m-0"></i><span class="d-none d-sm-inline">Save As</span>`;

/**
 * Trigger save with current state. Shows loading spinner during generation.
 * @param {string} format - Image format.
 */
async function saveQuoteImage(format = "jpeg") {
  const dropdown = document.getElementById("saveQuoteDropdown");
  const btn = dropdown?.querySelector(".dropdown-toggle");
  
  // Show loading state
  if (btn) {
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Generating...`;
    btn.disabled = true;
  }
  
  try {
    const response = await fetch(buildSaveUrl(format));
    
    if (!response.ok) {
      throw new Error("Failed to generate image");
    }
    
    // Get filename from Content-Disposition header or build default
    const contentDisposition = response.headers.get("Content-Disposition");
    let filename = `quote.${format === "png" ? "png" : "jpg"}`;
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match) filename = match[1];
    }
    
    // Download the blob
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error("Save error:", error);
    alert("Failed to generate image. Please try again.");
  } finally {
    // Restore button to ready state
    if (btn) {
      btn.innerHTML = SAVE_BUTTON_HTML;
      btn.disabled = false;
    }
  }
}
// Export for inline onclick handlers
window.saveQuoteImage = saveQuoteImage;

/**
 * CREATE EXPORT BUTTON
 * Creates the "Save" button with dropdown for different export options.
 * Server-side generation provides better quality and no browser prompts.
 */
function createExportButton() {
  // Remove existing save button if it exists
  document.getElementById("saveQuoteBtn")?.remove();
  document.getElementById("saveQuoteDropdown")?.remove();

  // Create dropdown container
  const dropdownContainer = document.createElement("div");
  dropdownContainer.id = "saveQuoteDropdown";
  dropdownContainer.className = "dropdown mt-2 me-2";
  dropdownContainer.innerHTML = `
    <button class="btn btn-danger dropdown-toggle d-flex flex-row align-items-center gap-2" type="button" data-bs-toggle="dropdown" aria-expanded="false">
      ${SAVE_BUTTON_HTML}
    </button>
    <ul class="dropdown-menu dropdown-menu-end">
      <li><a class="dropdown-item fs-6 p-2" href="#" onclick="saveQuoteImage('jpeg'); return false;">
        <i class="bi bi-filetype-jpg me-2"></i> Save quote as .jpg
      </a></li>
      <li><hr class="dropdown-divider m-0"></li>
      <li><a class="dropdown-item fs-6 p-2" href="#" onclick="saveQuoteImage('png'); return false;">
        <i class="bi bi-filetype-png me-2"></i> Save quote as .png
      </a></li>
    </ul>
  `;

  // Add it to the right buttons container
  document.getElementById("rightButtons").appendChild(dropdownContainer);
}

/**
 * CREATE FLOATING ZOOM CONTROLS
 * Creates floating zoom buttons in the bottom-right corner for easy access
 * Includes zoom in, zoom out, reset, and current zoom level display
 */
function createFloatingZoomControls() {
  // Remove existing zoom controls if they exist
  document.getElementById("floatingZoomControls")?.remove();

  // Create the floating zoom controls container
  const zoomControls = document.createElement("div");
  zoomControls.id = "floatingZoomControls";
  zoomControls.className = "position-fixed bottom-0 end-0 m-3 z-3";
  zoomControls.innerHTML = `
    <div class="bg-light border rounded p-2 shadow-sm">
      <div class="text-center mb-2">
        <small class="text-muted"><span id="zoomLevel" class="small">100%</span></small>
      </div>
      <div class="btn-group-vertical" role="group">
        <button type="button" class="btn btn-outline-danger btn-sm" onclick="adjustZoom(0.1)" title="Zoom In">
          <i class="bi bi-zoom-in"></i>
        </button>
        <button type="button" class="btn btn-outline-danger btn-sm" onclick="resetZoom()" title="Reset Zoom">
          <i class="bi bi-arrow-clockwise"></i>
        </button>
        <button type="button" class="btn btn-outline-danger btn-sm" onclick="adjustZoom(-0.1)" title="Zoom Out">
          <i class="bi bi-zoom-out"></i>
        </button>
      </div>
    </div>
  `;

  // Add it to the body so it floats above everything
  document.body.appendChild(zoomControls);
}

function handleSearch(event) {
  event.preventDefault(); // Prevent form submission

  const searchInput = document.getElementById("stockNumberSearch");
  const stockNumber = searchInput.value.trim();

  if (stockNumber) {
    // Update URL and reload page
    window.location.href = `${window.location.pathname}?search=${encodeURIComponent(stockNumber)}`;
  }
}

/**
 * HANDLE SIDEBAR SEARCH
 * Handles search from the sidebar search input
 */
function handleSidebarSearch(event) {
  event.preventDefault(); // Prevent form submission

  const searchInput = document.getElementById("sidebarStockSearch");
  const stockNumber = searchInput.value.trim();

  if (stockNumber) {
    // Update URL and reload page
    window.location.href = `${window.location.pathname}?search=${encodeURIComponent(stockNumber)}`;
  }
}

function initializeVisibilityToggles() {
  const toggleMap = {
    quoteName: ".quote-name",
    quoteBrandHeader: ".brand-container",
    quoteCustomerInfo: ".customer-info-container",
    quoteHeader: ".main-header",
    quoteImages: ".carousel-container",
    quotePayment: ".payment-calculator-container",
    quotePaymentAmount: ".payment",
    quoteAccessories: ".accessory-items-container",
    quoteTradeIn: ".trade-in-container",
    quoteRebates: ".mat-items-container",
    quoteDiscounts: ".discount-items-container",
    quoteFees: ".otd-items-container",
    quoteSavings: ".savings-container",
    quoteTotal: ".total-price-container",
  };

  const TOGGLES_STATE_KEY = 'quoteTogglesState';

  // Function to save toggle states
  function saveToggleStates() {
    const states = {};
    Object.keys(toggleMap).forEach((checkboxId) => {
      const checkbox = document.getElementById(checkboxId);
      if (checkbox) {
        states[checkboxId] = checkbox.checked;
      }
    });
    localStorage.setItem(TOGGLES_STATE_KEY, JSON.stringify(states));
    console.log("Toggle states saved:", states);
  }

  // Function to restore toggle states
  function restoreToggleStates() {
    const savedStates = localStorage.getItem(TOGGLES_STATE_KEY);
    if (savedStates) {
      try {
        const states = JSON.parse(savedStates);
        Object.keys(states).forEach((checkboxId) => {
          const checkbox = document.getElementById(checkboxId);
          const container = document.querySelector(toggleMap[checkboxId]);
          
          if (checkbox && container) {
            checkbox.checked = states[checkboxId];
            
            // Apply the visibility state
            if (states[checkboxId]) {
              container.classList.remove("section-hidden");
            } else {
              container.classList.add("section-hidden");
            }
          }
        });
        console.log("Toggle states restored:", states);
      } catch (e) {
        console.error("Error restoring toggle states:", e);
      }
    }
  }

  // Set up event listeners for each toggle
  Object.keys(toggleMap).forEach((checkboxId) => {
    const checkbox = document.getElementById(checkboxId);
    if (checkbox) {
      checkbox.addEventListener("change", (e) => {
        const container = document.querySelector(toggleMap[checkboxId]);
        if (container) {
          if (e.target.checked) {
            container.classList.remove("section-hidden");
          } else {
            container.classList.add("section-hidden");
          }
        }
        
        // Save state after each change
        saveToggleStates();
      });
    }
  });

  // Restore states on initialization (unless URL params override)
  setTimeout(() => {
    if (!applyStateFromUrlParams()) {
      restoreToggleStates();
    }
  }, 100);
}

/**
 * Apply quote state from URL parameters.
 * Used by server-side screenshot to capture with correct visibility settings.
 * @returns {boolean} True if URL params were applied.
 */
function applyStateFromUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const hideParam = params.get("hide");
  const nameParam = params.get("name");
  const infoParam = params.get("info");
  const accParam = params.get("acc");
  const imgParam = params.get("img");
  
  // If no state params, return false to use localStorage instead
  if (!hideParam && !nameParam && !infoParam && !accParam && !imgParam) {
    return false;
  }
  
  // Toggle mapping for applying hide states
  const toggleMap = {
    quoteBrandHeader: ".brand-container",
    quoteCustomerInfo: ".customer-info-container",
    quoteHeader: ".main-header",
    quoteImages: ".carousel-container",
    quotePayment: ".payment-calculator-container",
    quotePaymentAmount: ".payment",
    quoteAccessories: ".accessory-items-container",
    quoteRebates: ".mat-items-container",
    quoteDiscounts: ".discount-items-container",
    quoteFees: ".otd-items-container",
    quoteSavings: ".savings-container",
    quoteTotal: ".total-price-container",
  };
  
  // Apply hidden sections from URL
  if (hideParam) {
    const hiddenSections = hideParam.split(",");
    Object.keys(toggleMap).forEach(toggleId => {
      const checkbox = document.getElementById(toggleId);
      const container = document.querySelector(toggleMap[toggleId]);
      
      if (checkbox && container) {
        const shouldHide = hiddenSections.includes(toggleId);
        checkbox.checked = !shouldHide;
        if (shouldHide) {
          container.classList.add("section-hidden");
        } else {
          container.classList.remove("section-hidden");
        }
      }
    });
  }
  
  // Apply customer name from URL (decode + signs back to spaces)
  if (nameParam) {
    const nameInput = document.getElementById("inputFullName");
    if (nameInput) {
      nameInput.value = nameParam.replace(/\+/g, " ");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  
  // Apply additional info from URL (decode + signs back to spaces)
  if (infoParam) {
    const infoInput = document.getElementById("inputLastName");
    if (infoInput) {
      infoInput.value = infoParam.replace(/\+/g, " ");
      infoInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  
  // Apply first image URL from URL param (overrides API image with XML-sourced image)
  if (imgParam) {
    const firstCarouselImg = document.querySelector(".carousel-inner .carousel-item.active img");
    if (firstCarouselImg) {
      firstCarouselImg.src = imgParam;
      console.log("Applied image URL from params:", imgParam);
    }
  }
  
  // Apply custom accessories from URL param
  if (accParam) {
    customAccessories = parseCustomAccessoriesParam(accParam);
    // Re-render accessories and recalculate
    setTimeout(() => {
      initializeCustomAccessoriesForm();
      renderCustomAccessoriesOnQuote();
      recalculatePrices();
    }, 100);
    console.log("Applied accessories from params:", customAccessories);
  }
  
  console.log("Applied state from URL params:", { hide: hideParam, name: nameParam, info: infoParam, acc: accParam ? "yes" : "no", img: imgParam ? "yes" : "no" });
  return true;
}

/**
 * INITIALIZE CUSTOMER INFO
 * Sets up event listeners for customer info form fields and updates the quote display
 * Connects sidebar form inputs to the customer-info-container in the quote card
 */
function initializeCustomerInfo() {
  const fullNameInput = document.getElementById("inputFullName");
  const additionalInfoInput = document.getElementById("inputLastName");
  const customerInfoContainer = document.querySelector(".customer-info-container");

  if (!fullNameInput || !additionalInfoInput || !customerInfoContainer) {
    console.log("Customer info elements not found");
    return;
  }

  // Function to generate customer info template HTML
  function generateCustomerInfoTemplate(fullName, additionalInfo) {
    if (!fullName && !additionalInfo) {
      return '';
    }      
    
    // Build single line content with separator if both exist
    let customerContent = '';
    if (fullName && additionalInfo) {
      customerContent = `<span class="fw-bold">${fullName}</span> <span class="text-muted">| ${additionalInfo}</span>`;
    } else if (fullName) {
      customerContent = `<span class="fw-bold">${fullName}</span>`;
    } else {
      customerContent = `<span class="text-muted">${additionalInfo}</span>`;
    }
    
    return `
      <div class="card py-1 px-2 mb-2">
        <div class="d-flex align-items-center mx-1">
          <i class="bi bi-person-circle me-2 text-danger"></i>
          <div>${customerContent}</div>
        </div>
      </div>
    `;
  }

  // Function to update the customer info display
  function updateCustomerInfoDisplay() {
    const fullName = fullNameInput.value.trim();
    const additionalInfo = additionalInfoInput.value.trim();

    // Generate new template and update the container
    const newCustomerInfoTemplate = generateCustomerInfoTemplate(fullName, additionalInfo);
    customerInfoContainer.innerHTML = newCustomerInfoTemplate;
  }

  const CUSTOMER_INFO_KEY = 'quoteCustomerInfo';

  // Function to save customer info
  function saveCustomerInfo() {
    const customerData = {
      fullName: fullNameInput.value.trim(),
      additionalInfo: additionalInfoInput.value.trim()
    };
    localStorage.setItem(CUSTOMER_INFO_KEY, JSON.stringify(customerData));
  }

  // Function to restore customer info
  function restoreCustomerInfo() {
    const savedData = localStorage.getItem(CUSTOMER_INFO_KEY);
    if (savedData) {
      try {
        const customerData = JSON.parse(savedData);
        fullNameInput.value = customerData.fullName || '';
        additionalInfoInput.value = customerData.additionalInfo || '';
        console.log("Customer info restored:", customerData);
      } catch (e) {
        console.error("Error restoring customer info:", e);
      }
    }
  }

  // Add event listeners to update display and save state in real-time
  fullNameInput.addEventListener("input", () => {
    updateCustomerInfoDisplay();
    saveCustomerInfo();
  });
  
  additionalInfoInput.addEventListener("input", () => {
    updateCustomerInfoDisplay();
    saveCustomerInfo();
  });

  // Restore customer info on initialization
  restoreCustomerInfo();

  // Initial update
  updateCustomerInfoDisplay();
}

/**
 * INITIALIZE SIDEBAR STATE MANAGEMENT
 * Saves and restores the sidebar open/closed state using localStorage
 * Remembers user preference for sidebar visibility between sessions
 */
function initializeSidebarState() {
  const sidebar = document.getElementById('sidebarOffcanvas');
  const SIDEBAR_STATE_KEY = 'quoteSidebarState';
  
  if (!sidebar) {
    console.log("Sidebar element not found");
    return;
  }

  // Function to save sidebar state
  function saveSidebarState(isOpen) {
    localStorage.setItem(SIDEBAR_STATE_KEY, isOpen ? 'open' : 'closed');
    console.log(`Sidebar state saved: ${isOpen ? 'open' : 'closed'}`);
  }

  // Function to restore sidebar state
  function restoreSidebarState() {
    const savedState = localStorage.getItem(SIDEBAR_STATE_KEY);
    
    if (savedState === 'open') {
      // Show the sidebar
      const bsOffcanvas = new bootstrap.Offcanvas(sidebar);
      bsOffcanvas.show();
      console.log("Sidebar restored to open state");
    }
    // If savedState is 'closed' or null, sidebar stays closed (default)
  }

  // Listen for sidebar events
  sidebar.addEventListener('shown.bs.offcanvas', function () {
    saveSidebarState(true);
  });

  sidebar.addEventListener('hidden.bs.offcanvas', function () {
    saveSidebarState(false);
  });

  // Restore state on page load (after a small delay to ensure Bootstrap is ready)
  setTimeout(() => {
    restoreSidebarState();
  }, 100);
}

/**
 * CUSTOM ACCESSORIES MANAGEMENT
 * Functions to add, remove, and manage user-added accessories
 */

/**
 * Initialize the custom accessories input form in the sidebar
 * Creates multiple blank input rows for adding accessories
 */
function initializeCustomAccessoriesForm() {
  const container = document.getElementById("customAccessoriesInputs");
  if (!container) return;

  let html = "";
  for (let i = 0; i < CONFIG.CUSTOM_ACCESSORY_ROWS; i++) {
    const acc = customAccessories[i] || { name: "", price: "" };
    html += `
      <div class="form-group d-flex flex-row align-items-center accessory-row" data-index="${i}">
        <input
          type="text"
          class="form-control form-control-sm flex-grow-1 me-1 mb-2 mt-2"
          id="accessoryName${i}"
          placeholder="Accessory Name"
          value="${acc.name || ""}"
          oninput="updateCustomAccessory(${i})"
        />
        <input
          type="number"
          class="form-control form-control-sm text-end ms-1 mb-2 mt-2"
          id="accessoryPrice${i}"
          placeholder="$0.00"
          value="${acc.price || ""}"
          style="width: 100px;"
          oninput="updateCustomAccessory(${i})"
        />
      </div>
    `;
  }
  container.innerHTML = html;
}

/**
 * Update a custom accessory from form input
 * @param {number} index - Index of the accessory row
 */
window.updateCustomAccessory = function updateCustomAccessory(index) {
  const nameInput = document.getElementById(`accessoryName${index}`);
  const priceInput = document.getElementById(`accessoryPrice${index}`);

  if (!nameInput || !priceInput) return;

  const name = nameInput.value.trim();
  const price = parseFloat(priceInput.value) || 0;

  // Update or create the accessory entry
  if (name || price > 0) {
    customAccessories[index] = { name, price };
  } else {
    customAccessories[index] = null;
  }

  // Save and re-render
  saveCustomAccessories();
  renderCustomAccessoriesOnQuote();
  recalculatePrices();
}

/**
 * Clear all custom accessories
 */
function clearAllCustomAccessories() {
  customAccessories = [];
  saveCustomAccessories();
  initializeCustomAccessoriesForm();
  renderCustomAccessoriesOnQuote();
  recalculatePrices();
}
// Export for inline onclick handler
window.clearAllCustomAccessories = clearAllCustomAccessories;

/**
 * Save custom accessories to localStorage
 */
function saveCustomAccessories() {
  const filtered = customAccessories.filter((a) => a && (a.name || a.price > 0));
  localStorage.setItem(CUSTOM_ACCESSORIES_KEY, JSON.stringify(filtered));
}

/**
 * Restore custom accessories from localStorage
 */
function restoreCustomAccessories() {
  const saved = localStorage.getItem(CUSTOM_ACCESSORIES_KEY);
  if (saved) {
    try {
      customAccessories = JSON.parse(saved) || [];
    } catch (e) {
      console.error("Error restoring custom accessories:", e);
      customAccessories = [];
    }
  }
}

/**
 * Render custom accessories on the quote card
 * Adds them to the accessory-items-container
 */
function renderCustomAccessoriesOnQuote() {
  const container = document.querySelector(".accessory-items-container");
  if (!container) return;

  // Get valid custom accessories
  const validAccessories = customAccessories.filter((a) => a && a.name);

  // Check if we have API accessories
  const hasApiAccessories = window.vehicleData?.AccessoryItems?.length > 0;

  // Build custom accessories HTML
  let customHtml = "";
  if (validAccessories.length > 0) {
    customHtml = validAccessories
      .map(
        (acc) => `
        <div class="accessory-item w-100 custom-accessory">
          <div class="d-flex justify-content-between align-items-center">
            <span class="accessory-name flex-grow-1">${acc.name}</span>
            <span class="accessory-price fw-bold text-end ms-2">
              ${PriceCalculator.format(acc.price)}
            </span>
          </div>
        </div>
      `
      )
      .join("");
  }

  // If no API accessories, we need to create the card structure
  if (!hasApiAccessories && validAccessories.length > 0) {
    container.innerHTML = `
      <div class="card">
        <h5 class="card-title fs-6 my-0">Accessories</h5>
        ${customHtml}
      </div>
    `;
  } else if (hasApiAccessories && validAccessories.length > 0) {
    // Append to existing card
    const card = container.querySelector(".card");
    if (card) {
      // Remove old custom accessories
      card.querySelectorAll(".custom-accessory").forEach((el) => el.remove());
      // Append new ones
      card.insertAdjacentHTML("beforeend", customHtml);
    }
  } else if (!hasApiAccessories && validAccessories.length === 0) {
    // Clear the container if no accessories at all
    container.innerHTML = "";
  } else {
    // Has API accessories but no custom - just remove custom ones
    const card = container.querySelector(".card");
    if (card) {
      card.querySelectorAll(".custom-accessory").forEach((el) => el.remove());
    }
  }
}

/**
 * Recalculate all prices using PriceCalculator
 * Updates the payment calculator display and totals
 */
function recalculatePrices() {
  if (!window.vehicleData) return;

  const data = window.vehicleData;
  const validCustomAccessories = customAccessories.filter((a) => a && a.name);

  // Calculate prices using PriceCalculator
  const prices = PriceCalculator.calculate({
    msrp: data.MSRPUnit || 0,
    accessories: data.AccessoryItems || [],
    customAccessories: validCustomAccessories,
    discounts: data.DiscountItems || [],
    rebates: data.MatItems || [],
    fees: data.OTDItems || [],
    tradeIn: 0, // Could add trade-in support later
  });

  // Update the hidden loan input for payment calculator
  const loanInput = document.querySelector('input[name="loan"]');
  if (loanInput) {
    loanInput.value = prices.totalPrice;
  }

  // Update sales price display
  const salesPriceDisplay = document.querySelector(".our-price-display .fs-2");
  if (salesPriceDisplay) {
    salesPriceDisplay.textContent = PriceCalculator.format(prices.salesPrice);
  }

  // Update total price display
  const totalPriceDisplay = document.getElementById("totalPriceDisplay");
  if (totalPriceDisplay) {
    totalPriceDisplay.innerHTML = `
      <div class="text-left fs-5 fw-bold mx-1">Total:<span class="float-end">${PriceCalculator.format(prices.totalPrice)}</span></div>
    `;
  }

  // Update savings display
  const savingsDisplay = document.getElementById("savingsDisplay");
  if (savingsDisplay && prices.savings > 0) {
    savingsDisplay.innerHTML = `
      <div class="text-left fw-bold mx-1">Savings:<span class="float-end">${PriceCalculator.formatWhole(prices.savings)}</span></div>
    `;
  }

  // Recalculate payment
  if (typeof showpay === "function") {
    showpay();
  }
}

/**
 * Get custom accessories as URL-safe string
 * @returns {string} Encoded accessories string (name:price,name:price)
 */
function getCustomAccessoriesParam() {
  const valid = customAccessories.filter((a) => a && a.name);
  if (valid.length === 0) return "";
  return valid.map((a) => `${encodeURIComponent(a.name)}:${a.price || 0}`).join(",");
}

/**
 * Parse custom accessories from URL param string
 * @param {string} param - Encoded accessories string
 * @returns {Array} Array of {name, price} objects
 */
function parseCustomAccessoriesParam(param) {
  if (!param) return [];
  return param.split(",").map((item) => {
    const [name, price] = item.split(":");
    return {
      name: decodeURIComponent(name || ""),
      price: parseFloat(price) || 0,
    };
  });
}
