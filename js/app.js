// Near the top of the file, add a cache object
const DOM = {
	table: null,
	tableBody: null,
	filters: {},
	pagination: {
		pageSizeSelect: null,
		prevPageBtn: null,
		nextPageBtn: null,
		pageInfo: null,
	},
	// Refresh filter references based on active group.
	refreshFilters() {
		this.filters = {
			search: getActiveFilterElement("search"),
			year: getActiveFilterElement("year"),
			manufacturer: getActiveFilterElement("manufacturer"),
			model: getActiveFilterElement("model"),
			type: getActiveFilterElement("type"),
			usage: getActiveFilterElement("usage"),
			updated: getActiveFilterElement("updated"),
			photos: getActiveFilterElement("photos"),
		};
	},
	init() {
		this.table = document.getElementById("vehiclesTable");
		this.tableBody = this.table?.getElementsByTagName("tbody")[0];
		this.refreshFilters();
		this.pagination = {
			pageSizeSelect: document.getElementById("pageSizeSelect"),
			prevPageBtn: document.getElementById("prevPage"),
			nextPageBtn: document.getElementById("nextPage"),
			pageInfo: document.getElementById("pageInfo"),
		};
	},
};

// Near the top of the file, add a global storage fallback
let memoryStorage = {
	vehiclesCache: null,
	vehiclesCacheTimestamp: null,
	tablePagination: null,
};

// Global state for table data and pagination
const State = {
	allItems: [],
	filteredItems: [],
	currentItems: [],
	pagination: {
		currentPage: 1,
		pageSize: 25,
		totalPages: 1,
	},
	saveState() {
		const stateToSave = {
			currentPage: this.pagination.currentPage,
			pageSize: this.pagination.pageSize,
		};
		try {
			if (checkLocalStorageAvailability().available) {
				localStorage.setItem("tablePagination", JSON.stringify(stateToSave));
			} else {
				memoryStorage.tablePagination = stateToSave;
			}
		} catch (e) {
			memoryStorage.tablePagination = stateToSave;
		}
	},
	loadState() {
		try {
			let parsedState;
			if (checkLocalStorageAvailability().available) {
				const savedState = localStorage.getItem("tablePagination");
				if (savedState) {
					parsedState = JSON.parse(savedState);
				}
			} else if (memoryStorage.tablePagination) {
				parsedState = memoryStorage.tablePagination;
			}
			if (parsedState) {
				this.pagination.currentPage = parsedState.currentPage || 1;
				this.pagination.pageSize = parsedState.pageSize || 25;
			}
		} catch (e) {
			console.error("Error loading saved state:", e);
		}
	},
};

// Return the active filter group based on Bootstrap md breakpoint.
function getActiveFilterGroupName() {
	return window.matchMedia("(min-width: 768px)").matches ? "desktop" : "mobile";
}

// Return all filter elements for a given filter name.
function getFilterElementsByName(name) {
	return Array.from(document.querySelectorAll(`[data-filter="${name}"]`));
}

// Return the active filter element for a given filter name.
function getActiveFilterElement(name) {
	const group = getActiveFilterGroupName();
	return document.querySelector(
		`[data-filter-group="${group}"] [data-filter="${name}"]`,
	);
}

/**
 * Read hidden column preferences from localStorage.
 * @returns {Set<string>} Hidden column keys.
 */
function getHiddenColumns() {
	const stored = localStorage.getItem("hiddenColumns");
	if (!stored) return new Set();
	try {
		const parsed = JSON.parse(stored);
		return new Set(Array.isArray(parsed) ? parsed : []);
	} catch (error) {
		console.warn("Invalid hiddenColumns storage:", error);
		return new Set();
	}
}

/**
 * Persist hidden column preferences to localStorage.
 * @param {Set<string>} hiddenColumns Hidden column keys.
 */
function saveHiddenColumns(hiddenColumns) {
	localStorage.setItem("hiddenColumns", JSON.stringify([...hiddenColumns]));
}

/**
 * Sync column toggle inputs with stored preferences.
 * @param {Set<string>} hiddenColumns Hidden column keys.
 */
function syncColumnToggleInputs(hiddenColumns) {
	document.querySelectorAll(".column-toggle").forEach((input) => {
		input.checked = !hiddenColumns.has(input.value);
	});
}

/**
 * Apply column visibility based on stored preferences.
 */
function applyColumnVisibility() {
	const hiddenColumns = getHiddenColumns();
	document.querySelectorAll("[data-column]").forEach((element) => {
		const key = element.dataset.column;
		element.classList.toggle("column-hidden", hiddenColumns.has(key));
	});
	syncColumnToggleInputs(hiddenColumns);
}

/**
 * Initialize column visibility toggle handlers.
 */
function initializeColumnToggles() {
	document.querySelectorAll(".column-toggle").forEach((input) => {
		input.addEventListener("change", () => {
			const hiddenColumns = getHiddenColumns();
			if (input.checked) {
				hiddenColumns.delete(input.value);
			} else {
				hiddenColumns.add(input.value);
			}
			saveHiddenColumns(hiddenColumns);
			applyColumnVisibility();
		});
	});
	applyColumnVisibility();
}

// Update model dropdown options with all known models.
function updateModelDropdownOptions() {
	const modelFilters = getFilterElementsByName("model");
	if (!modelFilters.length) return;

	const models = new Set();

	State.allItems.forEach((item) => {
		if (item.modelName && item.modelName !== "N/A") {
			models.add(item.modelName);
		}
	});

	const sortedModels = [...models].sort();

	modelFilters.forEach((modelFilter) => {
		const currentValue = modelFilter.value;

		while (modelFilter.options.length > 2) {
			modelFilter.remove(2);
		}

		sortedModels.forEach((modelName) => {
			const option = document.createElement("option");
			option.value = modelName;
			option.textContent = modelName;
			modelFilter.appendChild(option);
		});

		modelFilter.value = sortedModels.includes(currentValue) ? currentValue : "";
	});
}

// Enable active filter group and disable the inactive group.
function setFilterGroupState() {
	const activeGroup = getActiveFilterGroupName();
	const inactiveGroup = activeGroup === "desktop" ? "mobile" : "desktop";

	document
		.querySelectorAll(`[data-filter-group="${activeGroup}"] [data-filter]`)
		.forEach((element) => {
			element.disabled = false;
		});

	document
		.querySelectorAll(`[data-filter-group="${inactiveGroup}"] [data-filter]`)
		.forEach((element) => {
			element.disabled = true;
		});
}

// Add this function near the top of your file, with other utility functions
function normalizeDate(dateString) {
	if (!dateString) return null;

	// Parse the date
	const parsedDate = moment(dateString);

	// If the date is in the future (likely due to timezone issues), adjust it
	if (parsedDate.isAfter(moment())) {
		// Use the current date for display purposes
		return moment();
	}

	return parsedDate;
}

// Add near the top with other utility functions
function populateManufacturerDropdown(manufacturers) {
	const manufacturerFilters = getFilterElementsByName("manufacturer");
	if (!manufacturerFilters.length) return;

	// Sort manufacturers alphabetically
	manufacturers.sort();

	manufacturerFilters.forEach((manufacturerFilter) => {
		// Clear existing options except the first two (default options)
		while (manufacturerFilter.options.length > 2) {
			manufacturerFilter.remove(2);
		}

		// Add manufacturers to dropdown
		manufacturers.forEach((manufacturer) => {
			const option = document.createElement("option");
			option.value = manufacturer;
			option.textContent = manufacturer;
			manufacturerFilter.appendChild(option);
		});
	});
}

// Add near the populateManufacturerDropdown function
function populateYearDropdown(years) {
	const yearFilters = getFilterElementsByName("year");
	if (!yearFilters.length) return;

	// Sort years in descending order (newest first)
	years.sort((a, b) => b - a);

	yearFilters.forEach((yearFilter) => {
		// Clear existing options except the first two (default options)
		while (yearFilter.options.length > 2) {
			yearFilter.remove(2);
		}

		// Add years to dropdown
		years.forEach((year) => {
			const option = document.createElement("option");
			option.value = year;
			option.textContent = year;
			yearFilter.appendChild(option);
		});
	});
}

// Add near the populateManufacturerDropdown function
function populateTypeDropdown(types) {
	const typeFilters = getFilterElementsByName("type");
	if (!typeFilters.length) return;

	// Sort types alphabetically
	types.sort();

	typeFilters.forEach((typeFilter) => {
		// Clear existing options except the first two (default options)
		while (typeFilter.options.length > 2) {
			typeFilter.remove(2);
		}

		// Add types to dropdown
		types.forEach((type) => {
			const option = document.createElement("option");
			option.value = type;
			option.textContent = type;
			typeFilter.appendChild(option);
		});
	});
}

// Add near the other dropdown population functions
function populateSearchSuggestions(itemsArray) {
	// This function is called when data is loaded, but suggestions
	// will only show when user types 1-2 characters

	// Store all possible suggestions in a global object for later filtering
	// We'll use this when the user starts typing
	window.searchSuggestions = {
		stockNumbers: [],
		vins: [],
		makeModels: [],
		yearMakeModels: [],
		types: [],
	};

	// Extract all searchable values from the data
	itemsArray.forEach((item) => {
		// Get key data fields that users might search for
		const stockNumber =
			item.getElementsByTagName("stocknumber")[0]?.textContent || "";
		const vin = item.getElementsByTagName("vin")[0]?.textContent || "";
		const manufacturer =
			item.getElementsByTagName("manufacturer")[0]?.textContent || "";
		const modelName =
			item.getElementsByTagName("model_name")[0]?.textContent || "";
		const modelType =
			item.getElementsByTagName("model_type")[0]?.textContent || "";
		const year = item.getElementsByTagName("year")[0]?.textContent || "";

		// Store in our global object
		if (stockNumber) window.searchSuggestions.stockNumbers.push(stockNumber);
		if (vin) window.searchSuggestions.vins.push(vin);
		if (manufacturer && modelName)
			window.searchSuggestions.makeModels.push(`${manufacturer} ${modelName}`);
		if (year && manufacturer && modelName)
			window.searchSuggestions.yearMakeModels.push(
				`${year} ${manufacturer} ${modelName}`,
			);
		if (modelType && modelType !== "N/A" && modelType !== manufacturer)
			window.searchSuggestions.types.push(modelType);
	});

	// Remove duplicates and sort
	Object.keys(window.searchSuggestions).forEach((key) => {
		window.searchSuggestions[key] = [
			...new Set(window.searchSuggestions[key]),
		].sort();
	});
}

// This function will be called when the user types in the search box
function updateSearchSuggestions(query) {
	if (!query || query.length < 1) {
		// Clear suggestions if query is empty or too short
		clearSearchSuggestions();
		return;
	}

	// Find or create the custom dropdown
	let suggestionsDropdown = document.getElementById("custom-suggestions");
	const searchInput = getActiveFilterElement("search");
	if (!searchInput) return;

	// Create a container for the search input and dropdown if it doesn't exist
	let searchContainer = searchInput.closest(".search-container");
	if (!searchContainer) {
		// Wrap the search input in a container with relative positioning
		searchContainer = document.createElement("div");
		searchContainer.className = "search-container";
		searchInput.parentNode.insertBefore(searchContainer, searchInput);
		searchContainer.appendChild(searchInput);
	}

	if (!suggestionsDropdown) {
		suggestionsDropdown = document.createElement("div");
		suggestionsDropdown.id = "custom-suggestions";
		suggestionsDropdown.className = "search-suggestions-dropdown";

		// Append the dropdown to our container
		searchContainer.appendChild(suggestionsDropdown);
	}

	// Clear existing options
	suggestionsDropdown.innerHTML = "";

	if (!window.searchSuggestions) return;

	// Convert query to uppercase for case-insensitive matching
	const upperQuery = query.trim().toUpperCase();

	// Maximum suggestions to show
	const MAX_SUGGESTIONS = 20;
	let suggestionsCount = 0;

	// Prioritize suggestions in this order
	const suggestionTypes = [
		{ key: "stockNumbers", weight: 10 }, // Stock numbers are highest priority
		{ key: "yearMakeModels", weight: 5 }, // Year+Make+Model combinations next
		{ key: "makeModels", weight: 3 }, // Make+Model combinations
		{ key: "vins", weight: 2 }, // VINs
		{ key: "types", weight: 1 }, // Model types lowest priority
	];

	// Filter and score matched suggestions from all categories
	const matchedSuggestions = [];

	suggestionTypes.forEach(({ key, weight }) => {
		window.searchSuggestions[key].forEach((suggestion) => {
			const upperSuggestion = suggestion.toUpperCase();

			// Check if suggestion matches query
			if (upperSuggestion.includes(upperQuery)) {
				// Calculate score - exact matches score higher
				let score = weight;

				// Bonus for matches at start of string or word
				if (upperSuggestion.startsWith(upperQuery)) {
					score += 5; // Big bonus for starts with
				} else if (upperSuggestion.includes(" " + upperQuery)) {
					score += 3; // Smaller bonus for start of word
				}

				// Bonus for shorter matches (more precise)
				score += (20 - Math.min(20, suggestion.length)) / 10;

				matchedSuggestions.push({ suggestion, score });
			}
		});
	});

	// Sort by score (highest first) and limit
	matchedSuggestions
		.sort((a, b) => b.score - a.score)
		.slice(0, MAX_SUGGESTIONS)
		.forEach(({ suggestion }) => {
			const item = document.createElement("div");
			item.className = "suggestion-item";
			item.textContent = suggestion;

			// Add data type for styling
			// Determine the type by checking all categories
			if (window.searchSuggestions.stockNumbers.includes(suggestion)) {
				item.setAttribute("data-type", "stockNumbers");
			} else if (window.searchSuggestions.vins.includes(suggestion)) {
				item.setAttribute("data-type", "vins");
			} else if (window.searchSuggestions.yearMakeModels.includes(suggestion)) {
				item.setAttribute("data-type", "yearMakeModels");
			} else if (window.searchSuggestions.makeModels.includes(suggestion)) {
				item.setAttribute("data-type", "makeModels");
			} else if (window.searchSuggestions.types.includes(suggestion)) {
				item.setAttribute("data-type", "types");
			}

			// Add event to select the suggestion when clicked
			item.addEventListener("click", () => {
				const searchInput = getActiveFilterElement("search");
				if (searchInput) {
					searchInput.value = suggestion;
					searchInput.focus();
					filterTable();
					clearSearchSuggestions();
				}
			});

			suggestionsDropdown.appendChild(item);
			suggestionsCount++;
		});

	// Show or hide the dropdown based on matches
	if (suggestionsCount > 0) {
		suggestionsDropdown.style.display = "block";

		// Ensure the dropdown is visible by scrolling to it if needed
		if (searchInput) {
			// If the search input is not in view, scroll to it
			const inputRect = searchInput.getBoundingClientRect();
			if (inputRect.bottom > window.innerHeight) {
				searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
			}
		}
	} else {
		suggestionsDropdown.style.display = "none";
	}

	console.log(`Showing ${suggestionsCount} search suggestions for "${query}"`);
}

function clearSearchSuggestions() {
	const suggestionsDropdown = document.getElementById("custom-suggestions");
	if (suggestionsDropdown) {
		suggestionsDropdown.style.display = "none";
	}
}

document.addEventListener("DOMContentLoaded", async () => {
	// Customize Moment.js relative time strings
	moment.updateLocale("en", {
		relativeTime: {
			future: "in %s",
			past: "%s ago",
			s: "%d sec.",
			ss: "%d sec.",
			m: "1 min.",
			mm: "%d min.",
			h: "1 hr.",
			hh: "%d hrs.",
			d: "1 day",
			dd: "%d days",
			M: "1 month",
			MM: "%d months",
			y: "1 year",
			yy: "%d years",
		},
	});

	DOM.init();
	setFilterGroupState();
	initializeColumnToggles();

	// Setup diagnostic monitoring
	const networkStatus = setupNetworkMonitoring();

	// Check for localStorage availability and display browser info
	const storageStatus = checkLocalStorageAvailability();
	console.log(`Browser info: ${navigator.userAgent}`);
	console.log(`Storage status: ${JSON.stringify(storageStatus)}`);
	console.log(`Network status: ${JSON.stringify(networkStatus)}`);

	// Theme handling - using existing theme functions instead of applyTheme
	const savedTheme = localStorage.getItem("theme");
	if (savedTheme) {
		document.body.setAttribute("data-bs-theme", savedTheme);
		updateThemeIcon(savedTheme);
	}

	// Add vertical key tag switch state handling
	const verticalKeyTagSwitch = document.getElementById("verticalKeyTagSwitch");
	const savedVerticalKeyTagState = localStorage.getItem("verticalKeyTagState");
	if (savedVerticalKeyTagState && verticalKeyTagSwitch) {
		verticalKeyTagSwitch.checked = savedVerticalKeyTagState === "true";
		// Trigger the toggle function to update the UI
		toggleVerticalKeyTag({ target: verticalKeyTagSwitch });
	}

	// Make sure search inputs are wrapped for dropdown positioning
	getFilterElementsByName("search").forEach((searchInput) => {
		if (searchInput && !searchInput.closest(".search-container")) {
			const searchContainer = document.createElement("div");
			searchContainer.className = "search-container";
			searchInput.parentNode.insertBefore(searchContainer, searchInput);
			searchContainer.appendChild(searchInput);
		}
	});

	// Add event listeners using delegation where possible
	document.addEventListener("click", handleGlobalClicks);

	// Add filter listeners with debounce
	const searchInputs = getFilterElementsByName("search");
	const handleSearchInputDebounced = debounce((value) => {
		handleSearchInput(value);
	}, 250);

	searchInputs.forEach((searchInput) => {
		// Add a class for custom styling
		searchInput.classList.add("search-with-suggestions");

		searchInput.addEventListener("input", (e) => {
			handleSearchInputDebounced(e.target.value);
		});

		// Handle keyboard navigation inside the dropdown
		searchInput.addEventListener("keydown", (e) => {
			const dropdown = document.getElementById("custom-suggestions");
			if (!dropdown || dropdown.style.display === "none") return;

			const items = dropdown.querySelectorAll(".suggestion-item");
			if (items.length === 0) return;

			// Find currently highlighted item
			const highlighted = dropdown.querySelector(
				".suggestion-item.highlighted",
			);
			let index = -1;

			if (highlighted) {
				index = Array.from(items).indexOf(highlighted);
			}

			// Handle arrow keys
			if (e.key === "ArrowDown") {
				e.preventDefault();
				if (index < items.length - 1) {
					if (highlighted) highlighted.classList.remove("highlighted");
					items[index + 1].classList.add("highlighted");
					items[index + 1].scrollIntoView({ block: "nearest" });
				}
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				if (index > 0) {
					if (highlighted) highlighted.classList.remove("highlighted");
					items[index - 1].classList.add("highlighted");
					items[index - 1].scrollIntoView({ block: "nearest" });
				}
			} else if (e.key === "Enter") {
				e.preventDefault();
				if (highlighted) {
					searchInput.value = highlighted.textContent;
					filterTable();
					clearSearchSuggestions();
				}
			} else if (e.key === "Escape") {
				clearSearchSuggestions();
			}
		});
	});

	// Handle document clicks to close the dropdown when clicking outside
	document.addEventListener("click", (e) => {
		if (
			!e.target.closest('[data-filter="search"]') &&
			!e.target.closest("#custom-suggestions")
		) {
			clearSearchSuggestions();
		}
	});

	// Add other filter change listeners
	document.querySelectorAll("[data-filter]").forEach((filter) => {
		if (filter.dataset.filter !== "search") {
			filter.addEventListener("change", () => {
				if (
					filter.dataset.filter === "year" ||
					filter.dataset.filter === "manufacturer"
				) {
					updateModelDropdownOptions();
				}
				filterTable();
			});
		}
	});

	// Load user preferences before fetching data
	State.loadState();

	// Fetch and process data
	await fetchData();

	// Initialize the table features (e.g., sorting)
	initializeTableFeatures();

	// Handle window resize to ensure dropdown stays with the search input
	window.addEventListener(
		"resize",
		debounce(() => {
			setFilterGroupState();
			updateModelDropdownOptions();
			const dropdown = document.getElementById("custom-suggestions");
			if (dropdown && dropdown.style.display !== "none") {
				// If dropdown is visible, update its position
				const searchInput = getActiveFilterElement("search");
				if (searchInput) {
					// Force a small delay to allow for DOM updates
					setTimeout(() => {
						// Simply hiding and showing refreshes the position
						dropdown.style.display = "none";
						setTimeout(() => {
							dropdown.style.display = "block";
						}, 10);
					}, 150);
				}
			}
		}, 250),
	);
});

function handleGlobalClicks(event) {
	const target = event.target;

	// Handle key tag button clicks
	if (target.closest("#keytagModalButton")) {
		const stockNumber =
			target.closest("#keytagModalButton").dataset.bsStocknumber;
		if (stockNumber) {
			document.getElementById("keytagModalLabel").innerHTML = stockNumber;
			keyTag(stockNumber);
		}
	}

	// Handle print button clicks
	if (target.closest("#printTag")) {
		window.print();
	}

	// Handle theme toggle
	if (target.closest("#toggleThemeButton")) {
		toggleTheme();
	}

	// Handle force refresh button
	if (target.closest("#forceRefreshBtn")) {
		forceRefresh();
	}
}

function handleSearchInput(value) {
	// Apply search filter with debounce
	filterTable();

	// Update search suggestions based on current input
	updateSearchSuggestions(value);
}

function showPlaceholder(rowCount = 10) {
	if (!DOM.tableBody) return;

	// Clear existing content first
	while (DOM.tableBody.firstChild) {
		DOM.tableBody.removeChild(DOM.tableBody.firstChild);
	}

	// Create a document fragment for better performance
	const fragment = document.createDocumentFragment();

	for (let i = 0; i < rowCount; i++) {
		const row1 = document.createElement("tr");
		const row2 = document.createElement("tr");

		row1.className = "placeholder-wave";
		row2.className = "placeholder-wave";

		// Set innerHTML once per row
		row1.innerHTML = `
    <td class="placeholder-wave"><span class="placeholder col-6"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-4"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-8"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-4"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-8"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-4"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-8"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-4"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-8"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-4"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-10"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-10"></span></td>
    `; // Your placeholder cells
		row2.innerHTML = `
    <td class="placeholder-wave"><span class="placeholder col-8"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-8"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-10"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-8"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-10"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-8"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-10"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-8"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-10"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-8"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-10"></span></td>
    <td class="placeholder-wave"><span class="placeholder col-10"></span></td>
    `; // Your placeholder cells

		fragment.appendChild(row1);
		fragment.appendChild(row2);
	}

	DOM.tableBody.appendChild(fragment);
}

function debounce(func, wait) {
	let timeout;
	return function executedFunction(...args) {
		const later = () => {
			clearTimeout(timeout);
			func(...args);
		};
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
	};
}

/**
 * Build a cache-busted XML request URL.
 * @param {string} baseUrl Base XML URL.
 * @returns {string} URL with cache-busting query.
 */
function buildXmlRequestUrl(baseUrl) {
	const url = new URL(baseUrl);
	url.searchParams.set("t", Date.now().toString());
	return url.toString();
}

/**
 * Force a fresh API call by clearing cache first.
 */
async function forceRefresh() {
	console.log("Force refresh - clearing cache...");
	
	// Show loading state on button
	const btn = document.getElementById("forceRefreshBtn");
	const originalContent = btn?.innerHTML;
	if (btn) {
		btn.disabled = true;
		btn.innerHTML = '<i class="bi bi-arrow-clockwise h6 my-1 spin"></i> <span class="mx-1 pe-2 fw-normal">Loading...</span>';
	}
	
	// Clear cache from both localStorage and memory
	try {
		localStorage.removeItem("vehiclesCache");
		localStorage.removeItem("vehiclesCacheTimestamp");
	} catch (e) {
		console.log("Could not clear localStorage cache");
	}
	memoryStorage.vehiclesCache = null;
	memoryStorage.vehiclesCacheTimestamp = null;
	
	// Fetch fresh data
	await fetchData();
	
	// Restore button state
	if (btn) {
		btn.disabled = false;
		btn.innerHTML = originalContent;
	}
}

async function fetchData() {
	try {
		// Add mobile debugging info
		const isMobile =
			/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
				navigator.userAgent,
			);
		console.log(
			`Device info - Mobile: ${isMobile}, UserAgent: ${navigator.userAgent}`,
		);

		// Check if we're using localStorage or memory fallback
		const useMemoryFallback = !checkLocalStorageAvailability().available;

		// Check cache first (either localStorage or memory)
		let cache, cacheTimestamp;

		if (useMemoryFallback) {
			cache = memoryStorage.vehiclesCache;
			cacheTimestamp = memoryStorage.vehiclesCacheTimestamp;
			console.log("Using memory storage fallback");
		} else {
			cache = localStorage.getItem("vehiclesCache");
			cacheTimestamp = localStorage.getItem("vehiclesCacheTimestamp");
		}

		const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds

		// Use cached data if it exists and is less than 5 minutes old
		if (cache && cacheTimestamp) {
			const age =
				Date.now() -
				(typeof cacheTimestamp === "string" ?
					parseInt(cacheTimestamp)
				:	cacheTimestamp);
			if (age < CACHE_DURATION) {
				console.log("Using cached XML data...");
				try {
					const parser = new DOMParser();
					const xmlDoc = parser.parseFromString(cache, "text/xml");

					// Check for parsing errors
					const parseError = xmlDoc.querySelector("parsererror");
					if (parseError) {
						console.error("XML Parse Error:", parseError.textContent);
						throw new Error("XML parsing failed");
					}

					await processXMLData(xmlDoc);
					return;
				} catch (parseError) {
					console.error("Error parsing cached XML:", parseError);
					// If parse error, continue to fetch fresh data
				}
			}
		}

		// Fetch fresh data if cache is missing or expired
		console.log("Fetching fresh XML data...");
		
		// Show skeleton only when making API call
		showPlaceholder();

		try {
			// Set a longer timeout on mobile
			const timeoutDuration = isMobile ? 60000 : 30000; // 60 seconds on mobile, 30 on desktop
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);

			const xmlUrl = buildXmlRequestUrl(
				"https://www.flatoutmotorcycles.com/unitinventory_univ.xml",
			);
			const response = await fetch(xmlUrl, {
				signal: controller.signal,
				mode: "cors", // Explicitly request CORS
				headers: {
					Accept: "application/xml, text/xml",
				},
				cache: "no-store",
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				console.error(
					`Network response error: ${response.status} ${response.statusText}`,
				);
				throw new Error(`Network response error: ${response.status}`);
			}

			const data = await response.text();
			console.log(`Received data length: ${data.length} characters`);

			if (data.length < 100) {
				console.error("Response too short, likely not valid XML");
				throw new Error("Response too short");
			}

			// Validate XML before caching
			const parser = new DOMParser();
			const xmlDoc = parser.parseFromString(data, "text/xml");
			const parseError = xmlDoc.querySelector("parsererror");

			if (parseError) {
				console.error("XML Parse Error in fresh data:", parseError.textContent);
				throw new Error("XML parsing failed for fresh data");
			}

			// Update cache (either localStorage or memory)
			try {
				if (useMemoryFallback) {
					memoryStorage.vehiclesCache = data;
					memoryStorage.vehiclesCacheTimestamp = Date.now();
				} else {
					localStorage.setItem("vehiclesCache", data);
					localStorage.setItem("vehiclesCacheTimestamp", Date.now().toString());
				}
				console.log("Cache updated successfully");
			} catch (storageError) {
				console.error("Storage error (possibly quota exceeded):", storageError);
				// Fall back to memory if localStorage fails
				memoryStorage.vehiclesCache = data;
				memoryStorage.vehiclesCacheTimestamp = Date.now();
				console.log("Fell back to memory storage");
			}

			await processXMLData(xmlDoc);
		} catch (fetchError) {
			console.error("Fetch error details:", fetchError);
			throw fetchError; // Re-throw to be caught by outer try/catch
		}
	} catch (error) {
		console.error("Error fetching XML:", error);

		// Check if it's an abort error (timeout)
		if (error.name === "AbortError") {
			console.log("Request timed out - trying to use cached data as fallback");
		}

		// If there's an error fetching fresh data, try to use cached data as fallback
		const useMemoryFallback = !checkLocalStorageAvailability().available;
		const cache =
			useMemoryFallback ?
				memoryStorage.vehiclesCache
			:	localStorage.getItem("vehiclesCache");

		if (cache) {
			console.log("Using cached data as fallback...");
			try {
				const parser = new DOMParser();
				const xmlDoc = parser.parseFromString(cache, "text/xml");

				// Check for parsing errors in fallback
				const parseError = xmlDoc.querySelector("parsererror");
				if (parseError) {
					console.error(
						"XML Parse Error in fallback cache:",
						parseError.textContent,
					);
					showDataLoadError(
						"Could not load vehicle data. Please try again later.",
					);
					return;
				}

				await processXMLData(xmlDoc);
			} catch (fallbackError) {
				console.error("Error using fallback cache:", fallbackError);
				showDataLoadError(
					"Could not load vehicle data. Please try again later.",
				);
			}
		} else {
			console.error("No cache available and fetch failed");
			showDataLoadError("Could not load vehicle data. Please try again later.");
		}
	}
}

// Add a function to show error message to the user
function showDataLoadError(message) {
	if (!DOM.tableBody) return;

	// Clear existing content
	while (DOM.tableBody.firstChild) {
		DOM.tableBody.removeChild(DOM.tableBody.firstChild);
	}

	// Create error message row
	const row = document.createElement("tr");
	row.innerHTML = `
    <td colspan="13" class="text-center p-5">
      <div class="alert alert-danger" role="alert">
        <i class="bi bi-exclamation-triangle me-2"></i>
        ${message}
      </div>
      <button class="btn btn-outline-primary mt-3" onclick="location.reload()">
        <i class="bi bi-arrow-clockwise me-2"></i>Refresh
      </button>
    </td>
  `;

	DOM.tableBody.appendChild(row);
}

// Separate function to process the XML data
async function processXMLData(xmlDoc) {
	// Clear existing content including placeholders
	while (DOM.tableBody.firstChild) {
		DOM.tableBody.removeChild(DOM.tableBody.firstChild);
	}

	const items = xmlDoc.getElementsByTagName("item");
	if (!DOM.tableBody) return;

	// Convert NodeList to Array for sorting
	const itemsArray = Array.from(items);

	// Sort items by updated date (newest first)
	itemsArray.sort((a, b) => {
		const dateAStr = a.getElementsByTagName("updated")[0]?.textContent || "";
		const dateBStr = b.getElementsByTagName("updated")[0]?.textContent || "";

		// Use the normalizeDate function to handle potential timezone issues
		const dateA = normalizeDate(dateAStr);
		const dateB = normalizeDate(dateBStr);

		// Compare the normalized dates
		return dateB - dateA; // Most recent first
	});

	// Collect unique manufacturers for dropdown
	const manufacturers = new Set();
	const years = new Set();
	const types = new Set();

	// Process all items and store in State.allItems
	State.allItems = itemsArray.map((item) => {
		// Extract all data values once
		const imageUrl =
			item
				.getElementsByTagName("images")[0]
				?.getElementsByTagName("imageurl")[0]?.textContent || "N/A";
		const title = item.getElementsByTagName("title")[0]?.textContent || "N/A";
		const webURL = item.getElementsByTagName("link")[0]?.textContent || "N/A";
		const stockNumber =
			item.getElementsByTagName("stocknumber")[0]?.textContent || "N/A";
		const vin = item.getElementsByTagName("vin")[0]?.textContent || "N/A";
		const price = item.getElementsByTagName("price")[0]?.textContent || "N/A";
		const webPrice = numeral(price).format("$0,0.00");
		const manufacturer =
			item.getElementsByTagName("manufacturer")[0]?.textContent || "N/A";
		const year = item.getElementsByTagName("year")[0]?.textContent || "N/A";
		const modelName =
			item.getElementsByTagName("model_name")[0]?.textContent || "N/A";
		const modelType =
			item.getElementsByTagName("model_type")[0]?.textContent || "N/A";
		const modelCode =
			item.getElementsByTagName("model_code")[0]?.textContent || "N/A";
		const color = item.getElementsByTagName("color")[0]?.textContent || "N/A";
		const usage = item.getElementsByTagName("usage")[0]?.textContent || "N/A";
		const updated =
			item.getElementsByTagName("updated")[0]?.textContent || "N/A";

		// Count image elements
		const imageElements = item.getElementsByTagName("imageurl").length;

		// Add values to filter dropdown sets
		if (manufacturer && manufacturer !== "N/A") {
			manufacturers.add(manufacturer);
		}
		if (year && year !== "N/A") {
			years.add(year);
		}
		if (modelType && modelType !== "N/A") {
			types.add(modelType);
		}

		// Return a processed item object
		return {
			imageUrl,
			title,
			webURL,
			stockNumber,
			vin,
			price,
			webPrice,
			manufacturer,
			year,
			modelName,
			modelType,
			modelCode,
			color,
			usage,
			updated,
			imageElements,
		};
	});

	// Initialize with all items
	State.filteredItems = [...State.allItems];

	// Populate dropdowns
	populateManufacturerDropdown([...manufacturers]);
	populateYearDropdown([...years]);
	populateTypeDropdown([...types]);
	updateModelDropdownOptions();
	populateSearchSuggestions(itemsArray);

	// Load saved pagination state
	State.loadState();

	// Initialize pagination controls
	initializePagination();

	// Apply pagination and render the table
	applyPagination();

	// After data is loaded
	document.querySelectorAll(".placeholder-wave").forEach((el) => {
		el.classList.remove("placeholder-wave");
	});
}

// Helper function to initialize table features
function initializeTableFeatures() {
	// Add event listeners for sorting
	const headers = document.querySelectorAll("#vehiclesTable th");
	headers.forEach((header) => {
		header.addEventListener("click", () => sortTableByColumn(header));

		// Set default sort indicator on the updated column (assuming it's the 10th column, index 9)
		if (header.textContent.trim().toLowerCase().includes("updated")) {
			header.classList.add("sort-desc");
		}
	});

	// Initialize tooltips for date badges
	const dateBadges = document.querySelectorAll(
		".badge[data-bs-toggle='tooltip']",
	);
	dateBadges.forEach((badge) => {
		new bootstrap.Tooltip(badge);
	});

	// Count rows after data is loaded
	filterTable();
}

function filterTable() {
	// Get the filter input values
	const searchInput =
		getActiveFilterElement("search")?.value.toUpperCase() || "";
	const yearFilter = getActiveFilterElement("year")?.value.toUpperCase() || "";
	const manufacturerFilter =
		getActiveFilterElement("manufacturer")?.value.toUpperCase() || "";
	const modelFilter =
		getActiveFilterElement("model")?.value.toUpperCase() || "";
	const typeFilter = getActiveFilterElement("type")?.value.toUpperCase() || "";
	const usageFilter =
		getActiveFilterElement("usage")?.value.toUpperCase() || "";
	const photosFilter =
		getActiveFilterElement("photos")?.value.toUpperCase() || "";
	const updatedFilter = getActiveFilterElement("updated")?.value || "";

	// Split search input into individual terms
	const searchTerms = searchInput
		.split(/\s+/)
		.filter((term) => term.length > 0);

	// Define filter conditions
	const filters = {
		manufacturer: manufacturerFilter,
		model: modelFilter,
		type: typeFilter,
		usage: usageFilter,
		year: yearFilter,
		photos: photosFilter,
		updated: updatedFilter,
	};

	// Apply filters to allItems
	State.filteredItems = State.allItems.filter((item) => {
		// Create a combined string of all searchable fields
		const searchText =
			`${item.stockNumber} ${item.vin} ${item.usage} ${item.year} ${item.manufacturer} ${item.modelName} ${item.modelType} ${item.color}`.toUpperCase();

		// Check if all search terms match
		const searchMatch =
			searchTerms.length === 0 ||
			searchTerms.every((term) => searchText.includes(term));

		// Check other filters
		const filterMatch = Object.entries(filters).every(([key, value]) => {
			if (!value) return true; // Skip empty filters

			let textToCompare = "";
			switch (key) {
				case "manufacturer":
					textToCompare = item.manufacturer || "";
					break;
				case "year":
					textToCompare = item.year || "";
					break;
				case "type":
					textToCompare = item.modelType || "";
					break;
				case "usage":
					textToCompare = item.usage || "";
					break;
				case "model":
					textToCompare = item.modelName || "";
					break;
				case "photos": {
					const hasInHousePhotos = Number(item.imageElements) > 10;
					if (value === "INHOUSE") return hasInHousePhotos;
					if (value === "STOCK") return !hasInHousePhotos;
					return true;
				}
				case "updated": {
					// Strip time components from both dates for comparison
					const itemDate = moment(item.updated)
						.startOf("day")
						.format("YYYY-MM-DD");
					const filterDate = moment(value).startOf("day").format("YYYY-MM-DD");
					return itemDate === filterDate;
				}
				default:
					textToCompare = "";
			}

			return textToCompare.toUpperCase().includes(value);
		});

		return searchMatch && filterMatch;
	});

	// Reset to first page when filters change
	State.pagination.currentPage = 1;

	// Apply pagination with the filtered items
	applyPagination();
}

function toggleTheme() {
	const body = document.body;
	const currentTheme = body.getAttribute("data-bs-theme");
	const newTheme = currentTheme === "dark" ? "light" : "dark";
	console.log(`Current theme: ${currentTheme}, New theme: ${newTheme}`);
	body.setAttribute("data-bs-theme", newTheme);

	const logo = document.getElementById("logo");
	if (logo) {
		logo.src =
			newTheme === "dark" ?
				"./img/fom-app-logo-01.svg"
			:	"./img/fom-app-logo-02.svg";
	}

	updateThemeIcon(newTheme);

	// Save the new theme to localStorage instead of sessionStorage
	localStorage.setItem("theme", newTheme);
}

function updateThemeIcon(theme) {
	const toggleThemeButton = document
		.getElementById("toggleThemeButton")
		?.querySelector("i");
	if (!toggleThemeButton) return;

	console.log(`Updating theme icon for theme: ${theme}`);
	if (theme === "dark") {
		toggleThemeButton.classList.remove("bi-brightness-high");
		toggleThemeButton.classList.add("bi-moon-stars");
	} else {
		toggleThemeButton.classList.remove("bi-moon-stars");
		toggleThemeButton.classList.add("bi-brightness-high");
	}
}

// Function to update row count (initial and filtered)
function updateRowCount() {
	// Guard against being called before data is loaded
	if (!State.allItems || !State.allItems.length) return;
	// Update rowCountDisplay with both visible rows and total rows
	const rowCountElement = document.getElementById("rowCountDisplay");
	if (rowCountElement) {
		const totalItems = State.allItems.length;
		const filteredItems = State.filteredItems.length;
		const visibleItems = State.currentItems.length;

		if (filteredItems === totalItems) {
			// No filtering applied, just show visible of total
			rowCountElement.innerHTML = `${visibleItems} of ${totalItems}`;
		} else {
			// Filtering is applied, show more detailed counts
			rowCountElement.innerHTML = `${visibleItems} of ${filteredItems} filtered (${totalItems} total)`;
		}
	}
}

document.addEventListener("DOMContentLoaded", () => {
	// Listen for clicks on elements that might trigger the modal
	document.addEventListener("click", function (event) {
		// Handle keytagModalButton click
		if (event.target.closest("#keytagModalButton")) {
			const keytagButton = event.target.closest("#keytagModalButton");
			const stockNumber = keytagButton.getAttribute("data-bs-stocknumber");

			if (stockNumber) {
				// Update the modal title with the stock number
				const modalTitle = document.getElementById("keytagModalLabel");
				if (modalTitle) modalTitle.innerHTML = stockNumber;

				// Load saved vertical toggle state
				const verticalToggle = document.getElementById("verticalKeyTagSwitch");
				const savedState = localStorage.getItem("verticalKeyTagState");
				if (verticalToggle) {
					verticalToggle.checked = savedState === "true";
					toggleVerticalKeyTag();
				}

				// Call the keyTag function and pass the stock number
				keyTag(stockNumber);
			} else {
				console.error("Stock number not found!");
			}
		}

		// Handle printKeyTagBtn button click
		if (event.target.closest("#printKeyTagBtn")) {
			printKeyTags();
		}

		// Handle printTag button click (legacy)
		if (event.target.closest("#printTag")) {
			window.print();
		}
	});

	// Handle vertical key tag toggle switch
	const verticalToggle = document.getElementById("verticalKeyTagSwitch");
	if (verticalToggle) {
		verticalToggle.addEventListener("change", toggleVerticalKeyTag);
	}
});

document.addEventListener("DOMContentLoaded", () => {
	initializeModalFocusGuards();
});

/**
 * Render key tag using cached XML data (no API call).
 * Uses KeyTagComponent from key-tag.js.
 * @param {string} stockNumber - Stock number to look up.
 */
function keyTag(stockNumber) {
	const messageEl = document.getElementById("keytagMessage");
	const horizontalContainer = document.getElementById("keytagHorizontal");
	const verticalContainer = document.getElementById("keytagVertical");

	// Clear previous message
	if (messageEl) messageEl.innerHTML = "";

	// Find vehicle in cached data
	const vehicle = State.allItems.find(
		(item) => (item.stockNumber || "").toUpperCase() === stockNumber.toUpperCase()
	);

	if (!vehicle) {
		// Show placeholder and error message
		if (window.KeyTagComponent) {
			KeyTagComponent.clear(horizontalContainer, "horizontal");
			KeyTagComponent.clear(verticalContainer, "vertical");
		}
		if (messageEl) {
			messageEl.innerHTML = `<div class="text-warning"><i class="bi bi-exclamation-triangle me-2"></i>Stock number not found in inventory.</div>`;
		}
		return;
	}

	// Normalize data for the component
	const data = {
		StockNumber: vehicle.stockNumber || "",
		Usage: vehicle.usage || "",
		ModelYear: vehicle.year || "",
		Manufacturer: vehicle.manufacturer || "",
		ModelName: vehicle.modelName || "",
		ModelCode: vehicle.modelCode || "",
		Color: vehicle.color || "",
		VIN: vehicle.vin || "",
	};

	// Render using component
	if (window.KeyTagComponent) {
		KeyTagComponent.render(data, horizontalContainer);
		KeyTagComponent.renderVertical(data, verticalContainer);
	}

	console.log("Key tag rendered from cached XML:", data);
}

/**
 * Toggle vertical key tag visibility.
 */
function toggleVerticalKeyTag() {
	const verticalContainer = document.getElementById("keytagVertical");
	const toggle = document.getElementById("verticalKeyTagSwitch");

	if (!verticalContainer || !toggle) return;

	// Save state to localStorage
	localStorage.setItem("verticalKeyTagState", toggle.checked);

	if (toggle.checked) {
		verticalContainer.classList.remove("d-none");
	} else {
		verticalContainer.classList.add("d-none");
	}
}

/**
 * Print key tags using the component.
 */
function printKeyTags() {
	const includeVertical = document.getElementById("verticalKeyTagSwitch")?.checked || false;
	if (window.KeyTagComponent) {
		KeyTagComponent.print("#keytagHorizontal", "#keytagVertical", includeVertical);
	}
}

let keyTagsModalLastFocus = null;

/**
 * Store the focused element before opening the key tags modal.
 */
function storeKeyTagsModalFocus() {
	keyTagsModalLastFocus =
		document.activeElement instanceof HTMLElement ?
			document.activeElement
		:	null;
}

/**
 * Restore focus after the key tags modal closes.
 */
function restoreKeyTagsModalFocus() {
	if (keyTagsModalLastFocus?.focus) {
		keyTagsModalLastFocus.focus();
	}
}

function openKeyTagsByStockNumberModal(stockNumber) {
	storeKeyTagsModalFocus();
	const modalIframe = document.getElementById("keyTagsByStockNumberModal");
	modalIframe.src = `https://newportal.flatoutmotorcycles.com/apps/keytags/keytag.html?vehicle=`;
	const keyTagsByStockNumberModal = new bootstrap.Modal(
		document.getElementById("keyTagsByStockNumberModal"),
	);
	keyTagsByStockNumberModal.show();
}

function openHangTagsModal(stockNumber) {
	const modalIframe = document.getElementById("hangTagsIframe");
	modalIframe.src = `./hang-tags/?search=${stockNumber}`;
	const hangTagsModal = new bootstrap.Modal(
		document.getElementById("hangTagsModal"),
	);
	hangTagsModal.show();
}

function openOverlayModal(stockNumber) {
	const modalIframe = document.getElementById("overlayIframe");
	modalIframe.src = `./quote/?search=${stockNumber}`;
	const overlayModal = new bootstrap.Modal(
		document.getElementById("overlayModal"),
	);
	overlayModal.show();
}

function openNewOverlayModal(stockNumber) {
	const modalIframe = document.getElementById("newOverlayIframe");
	modalIframe.src = `./overlay/?search=${stockNumber}`;
	const overlayModal = new bootstrap.Modal(
		document.getElementById("newOverlayModal"),
	);
	overlayModal.show();
}

function openServiceCalendarModal() {
	const modalIframe = document.getElementById("serviceCalendarIframe");
	modalIframe.src = `./calendar/index.html`;
	const serviceCalendarModal = new bootstrap.Modal(
		document.getElementById("serviceCalendarModal"),
	);
	serviceCalendarModal.show();
}

function printIframeContent() {
	const iframe = document.getElementById("hangTagsIframe");
	if (iframe?.contentWindow) {
		iframe.contentWindow.focus();
		iframe.contentWindow.print();
	}
}

function printNewOverlayIframe() {
	const iframe = document.getElementById("newOverlayIframe");
	const printFrame = document.getElementById("printFrame");

	// Copy content from overlay iframe to print frame
	printFrame.srcdoc = iframe.contentDocument.documentElement.outerHTML;

	// Wait for content to load then print
	printFrame.onload = function () {
		printFrame.contentWindow.print();
	};
}

function sortTableByColumn(header) {
	const table = document.getElementById("vehiclesTable");
	const tbody = table.querySelector("tbody");
	const rows = Array.from(tbody.querySelectorAll("tr"));
	const columnIndex = Array.from(header.parentElement.children).indexOf(header);
	const isAscending = header.classList.toggle("sort-asc");

	// Remove sort classes from other headers
	header.parentElement.querySelectorAll("th").forEach((th) => {
		if (th !== header) {
			th.classList.remove("sort-asc", "sort-desc");
		}
	});

	// Toggle sort direction
	if (isAscending) {
		header.classList.remove("sort-desc");
	} else {
		header.classList.add("sort-desc");
	}

	// Sort the rows
	const sortedRows = rows.sort((a, b) => {
		const aValue = a.children[columnIndex]?.textContent.trim() || "";
		const bValue = b.children[columnIndex]?.textContent.trim() || "";

		// Check if values are numbers
		const aNum = parseFloat(aValue.replace(/[^0-9.-]+/g, ""));
		const bNum = parseFloat(bValue.replace(/[^0-9.-]+/g, ""));

		if (!isNaN(aNum) && !isNaN(bNum)) {
			return isAscending ? aNum - bNum : bNum - aNum;
		}

		// Handle date sorting - specifically for the updated column
		// Check if the column contains dates in our expected format
		if (aValue.includes("-") && bValue.includes("-")) {
			// Try to find the hidden date field first (MM-DD-YYYY format)
			const aHidden = a.children[columnIndex]
				?.querySelector(".small.text-muted")
				?.textContent.trim();
			const bHidden = b.children[columnIndex]
				?.querySelector(".small.text-muted")
				?.textContent.trim();

			// If hidden dates exist, use those for more accurate sorting
			if (aHidden && bHidden) {
				const aDate = normalizeDate(aHidden);
				const bDate = normalizeDate(bHidden);
				return isAscending ? aDate - bDate : bDate - aDate;
			}

			// Fallback to the visible date
			const aVisibleDate = normalizeDate(aValue);
			const bVisibleDate = normalizeDate(bValue);
			if (aVisibleDate && bVisibleDate) {
				return isAscending ?
						aVisibleDate - bVisibleDate
					:	bVisibleDate - aVisibleDate;
			}
		}

		// Default to string comparison
		return isAscending ?
				aValue.localeCompare(bValue)
			:	bValue.localeCompare(aValue);
	});

	// Clear and re-append sorted rows
	while (tbody.firstChild) {
		tbody.removeChild(tbody.firstChild);
	}
	tbody.append(...sortedRows);

	// Update row count after sorting
	updateRowCount();
}

function createImageCell(imageUrl) {
	// Base thumbnail URL
	const thumbBase =
		"https://cdnmedia.endeavorsuite.com/images/ThumbGenerator/Thumb.aspx";

	// Parameters for table thumbnails
	const params = {
		img: imageUrl,
		mw: 100, // Max width of 100px for table
		mh: 66, // Maintaining aspect ratio of ~1.5
		f: 1, // Format parameter
	};

	// Create thumbnail URL
	const thumbUrl = `${thumbBase}?img=${encodeURIComponent(params.img)}&mw=${params.mw}&mh=${params.mh}&f=${params.f}`;

	return `
    <td>
      <img src="${thumbUrl}" 
           alt="Vehicle Image" 
           class="img-fluid"
           loading="lazy">
    </td>
  `;
}

function initializeClipboardTooltips() {
	const clipboardButtons = document.querySelectorAll(
		".btn-icon[data-bs-toggle='tooltip']",
	);
	clipboardButtons.forEach((button) => {
		const tooltip = new bootstrap.Tooltip(button, {
			trigger: "hover focus",
			placement: "top",
			customClass: "clipboard-tooltip",
			popperConfig(defaultBsPopperConfig) {
				return {
					...defaultBsPopperConfig,
					modifiers: [
						...defaultBsPopperConfig.modifiers,
						{
							name: "offset",
							options: {
								offset: [0, 8],
							},
						},
					],
				};
			},
		});

		button.addEventListener("click", () => {
			tooltip.setContent({ ".tooltip-inner": "Copied!" });
			setTimeout(() => {
				tooltip.setContent({ ".tooltip-inner": "Copy to clipboard" });
			}, 2000);
		});
	});
}

/**
 * Ensure focus is cleared when modals close.
 */
function initializeModalFocusGuards() {
	const modalIds = [
		"keytagModal",
		"hangTagsModal",
		"overlayModal",
		"newOverlayModal",
		"serviceCalendarModal",
		"roTagModal",
		"textMessageModal",
	];

	modalIds.forEach((id) => {
		const modal = document.getElementById(id);
		if (!modal) return;
		modal.addEventListener("hidden.bs.modal", () => {
			if (document.activeElement && typeof document.activeElement.blur === "function") {
				document.activeElement.blur();
			}
		});
	});
}

/**
 * Initialize tooltips for truncated text cells.
 */
function initializeTextTooltips() {
	const tooltipElements = document.querySelectorAll(
		".text-tooltip[data-bs-toggle='tooltip']",
	);
	tooltipElements.forEach((element) => {
		const existingTooltip = bootstrap.Tooltip.getInstance(element);
		if (existingTooltip) {
			existingTooltip.dispose();
		}
		new bootstrap.Tooltip(element);
	});
}

// Pagination functions
function initializePagination() {
	// Set the page size select to the saved value
	if (DOM.pagination.pageSizeSelect) {
		const pageSizeValue =
			State.pagination.pageSize === Infinity ?
				"all"
			:	State.pagination.pageSize.toString();
		const option = Array.from(DOM.pagination.pageSizeSelect.options).find(
			(opt) => opt.value === pageSizeValue,
		);
		if (option) {
			option.selected = true;
		}

		// Add event listener for page size changes
		DOM.pagination.pageSizeSelect.addEventListener("change", function () {
			const newSize =
				this.value === "all" ? Infinity : parseInt(this.value, 10);
			State.pagination.pageSize = newSize;
			State.pagination.currentPage = 1; // Reset to first page on size change
			State.saveState();
			applyPagination();
		});
	}

	// Add event listeners for pagination buttons
	if (DOM.pagination.prevPageBtn) {
		DOM.pagination.prevPageBtn.addEventListener("click", function () {
			if (State.pagination.currentPage > 1) {
				State.pagination.currentPage--;
				State.saveState();
				applyPagination();
			}
		});
	}

	if (DOM.pagination.nextPageBtn) {
		DOM.pagination.nextPageBtn.addEventListener("click", function () {
			if (State.pagination.currentPage < State.pagination.totalPages) {
				State.pagination.currentPage++;
				State.saveState();
				applyPagination();
			}
		});
	}
}

function applyPagination() {
	const { currentPage, pageSize } = State.pagination;

	// Calculate total pages
	State.pagination.totalPages =
		pageSize === Infinity ? 1 : (
			Math.ceil(State.filteredItems.length / pageSize)
		);

	// Make sure current page is valid
	if (currentPage > State.pagination.totalPages) {
		State.pagination.currentPage = State.pagination.totalPages || 1;
	}

	// Calculate start and end indices
	const startIndex =
		pageSize === Infinity ? 0 : (State.pagination.currentPage - 1) * pageSize;
	const endIndex =
		pageSize === Infinity ? State.filteredItems.length : startIndex + pageSize;

	// Get items for current page
	State.currentItems = State.filteredItems.slice(startIndex, endIndex);

	// Update UI
	updateTable();
	updatePaginationUI();
}

function updatePaginationUI() {
	if (DOM.pagination.pageInfo) {
		DOM.pagination.pageInfo.textContent = `Page ${State.pagination.currentPage} of ${State.pagination.totalPages}`;
	}

	// Disable/enable prev/next buttons
	if (DOM.pagination.prevPageBtn) {
		DOM.pagination.prevPageBtn.disabled = State.pagination.currentPage <= 1;
		DOM.pagination.prevPageBtn.classList.toggle(
			"disabled",
			State.pagination.currentPage <= 1,
		);
	}

	if (DOM.pagination.nextPageBtn) {
		DOM.pagination.nextPageBtn.disabled =
			State.pagination.currentPage >= State.pagination.totalPages;
		DOM.pagination.nextPageBtn.classList.toggle(
			"disabled",
			State.pagination.currentPage >= State.pagination.totalPages,
		);
	}
}

// New function to update the table with the current items
function updateTable() {
	if (!DOM.tableBody) return;

	// Clear the table body
	while (DOM.tableBody.firstChild) {
		DOM.tableBody.removeChild(DOM.tableBody.firstChild);
	}

	// Create a document fragment for better performance
	const fragment = document.createDocumentFragment();

	// Add rows for the current page
	State.currentItems.forEach((item) => {
		// Extract values once to avoid repeated DOM access
		const imageUrl = item.imageUrl;
		const title = item.title;
		const webURL = item.webURL;
		const stockNumber = item.stockNumber;
		const vin = item.vin;
		const webPrice = item.webPrice;
		const manufacturer = item.manufacturer;
		const year = item.year;
		const modelName = item.modelName;
		const modelType = item.modelType;
		const color = item.color;
		const usage = item.usage;
		const updated = item.updated;
		const imageElements = item.imageElements;

		const row = document.createElement("tr");
		row.innerHTML = `
      <td data-column="select" class="text-center" style="width: 50px !important;" nowrap>
        <input type="checkbox" class="form-check-input p-2 tv-grid-select" data-stock="${stockNumber}" title="Select for TV Grid">
      </td>
      <td data-cell="image" data-column="image" class="text-center" nowrap>
        <a href="${webURL}" target="_blank">
          <div class="table-image-container">
          ${imageUrl !== "N/A" ? `<img src="${imageUrl}" alt="${title}" width="100%" height="100%" loading="lazy" />` : `<i class="bi bi-card-image fs-1"></i>`}
          </div>
          </a>
      </td>
	  <td nowrap>
		<div class="input-group input-group-sm flex-nowrap" style="width: 235px;">
		  <input type="text" class="form-control d-block" style="font-size: 13px !important;" name="stockNumber" value="${stockNumber}" placeholder="Stock Number" title="${stockNumber}" aria-label="stock number" aria-describedby="btnGroupAddon">
		  <div class="input-group-text" id="btnGroupAddon">
			<button type="button" 
			  class="btn-icon" 
			  data-bs-toggle="tooltip"
			  data-bs-placement="top"
			  data-bs-title="Copy to clipboard"
			  onclick="navigator.clipboard.writeText('${stockNumber}')">
			  <i class="bi bi-clipboard"></i>
			</button>
		  </div>
		</div>
	  </td>
      <td class="text-center" data-column="usage" nowrap><span class="badge ${usage === "New" ? "text-bg-success" : "text-bg-secondary"}">${usage}</span></td>
      <td class="text-center" nowrap>
        <span class="badge text-bg-dark border">${year}</span>
      </td>
      <td class="text-truncate" style="max-width: 150px;" nowrap>${manufacturer}</td>
      <td class="model-cell" nowrap>
        <span class="model-text text-tooltip" title="${modelName}" data-bs-toggle="tooltip" data-bs-placement="top">${modelName}</span>
        <span class="visually-hidden">
        ${stockNumber} ${vin} ${usage} ${year} ${manufacturer} ${modelName} ${modelType} ${color} ${moment(updated).format("YYYY-MM-DD")}
        </span>
      </td>
      <td data-column="type"><span class="column-type text-tooltip" title="${modelType}" data-bs-toggle="tooltip" data-bs-placement="top">${modelType}</span></td>
      <td class="color-cell" data-column="color"><span class="column-color text-tooltip" title="${color}" data-bs-toggle="tooltip" data-bs-placement="top">${color}</span></td>
      <td data-column="price" class="text-center" nowrap>
        <span class="badge text-bg-success h5 fw-bold price-badge">${webPrice}</span>
      </td>
      

      <td class="text-center" data-column="photos" nowrap>
		${
			parseInt(imageElements) > 10 ?
				`<span class="photos-status text-tooltip" title="In-House Photos Done" data-bs-toggle="tooltip" data-bs-placement="top"><i class="bi bi-camera2 text-warning"></i><span class="visually-hidden" style="font-size: 10px;">FOM PHOTOS</span></span>`
			:	`<span class="photos-status text-tooltip" title="Awaiting Photo Shoot" data-bs-toggle="tooltip" data-bs-placement="top"><i class="bi bi-camera2 text-secondary"></i><span class="visually-hidden" style="font-size: 10px;">STOCK PHOTOS</span></span>`
		}
      </td>

	  <td data-column="updated" class="text-center" nowrap>
        	<span class="badge text-secondary p-2 fw-semibold border updated-badge"
              title="${normalizeDate(updated).format("MM-DD-YYYY")}"
              data-bs-toggle="tooltip"
              data-bs-placement="top">
            	${normalizeDate(updated).fromNow()}
            </span>
          <span class="small text-muted d-none">${normalizeDate(updated).format("MM-DD-YYYY")}</span>
        </span>
        <span class="visually-hidden">${normalizeDate(updated).format("YYYY-MM-DD")}</span>
      </td>


      <td class="text-center nowrap action-cell">
        <div class="action-button-group" role="group" aria-label="Vehicles">

        <!-- Dropdown for creating keytags, hang tags, quotes, tv displays -->
          <div class="dropdown d-inline-block">
            <button class="btn btn-dark btn-sm rounded-pill px-3 d-flex align-items-center dropdown-toggle mx-1 no-caret" type="button" data-bs-toggle="dropdown" data-bs-boundary="viewport" data-bs-popper-config='{"strategy":"fixed"}' aria-expanded="false">
				<div class="tag-key-group position-relative d-inline-block mx-1">
					<i class="bi bi-tag" style="font-size: 1.35rem;"></i>
					<i class="bi bi-key-fill position-absolute top-0" style="font-size: 0.8rem; color: white; transform: rotate(45deg); display: inline-block; margin-left: -8px; margin-top: 5px;"></i>
				</div>
               <i class="bi bi-tags mx-1"></i> <i class="bi bi-card-image ms-1 me-2"></i> <i class="bi bi-card-heading mx-1"></i> <i class="bi bi-tv mx-1"></i> 
            </button>

            <ul class="dropdown-menu small text-capitalize text-start p-0 overflow-hidden">

				<li class="small">
					<a href="javascript:void(0);" type="button" id="keytagModalButton" class="dropdown-item pe-5" title="Key Tag" data-bs-toggle="modal" data-bs-target="#keytagModal" data-bs-stocknumber="${stockNumber}">
						<i class="bi bi-tag me-2"></i>
						Key Tags
					</a>
				</li>

				<li><hr class="dropdown-divider m-0"></li>

				<li class="small">
					<a href="javascript:void(0);" class="dropdown-item pe-5" onclick="openHangTagsModal('${stockNumber}')">
						<i class="bi bi-tags dropdown-icon me-2"></i>
						Hang Tags
					</a>
				</li>

				<li><hr class="dropdown-divider m-0"></li>

				<li class="small">
						<a class="dropdown-item pe-5" href="javascript:void(0);" onclick="openOverlayModal('${stockNumber}')">
							<i class="bi bi-card-image dropdown-icon small me-2"></i>
							Build a Quote
						</a>
					</li>
				
				<li><hr class="dropdown-divider m-0"></li>

				<li class="small">
					<a class="dropdown-item pe-5" href="javascript:void(0);" onclick="openQuoteModal('${stockNumber}')">
					<i class="bi bi-card-heading dropdown-icon small me-1"></i>
					Print Quote</a>
				</li>

				<li class="small">
					<a class="dropdown-item pe-5" href="javascript:void(0);" onclick="window.location.href = 'print/?s=${stockNumber}'">
					<i class="bi bi-card-heading dropdown-icon small me-1"></i>
					Print PDF</a>
				</li>
				
				<li><hr class="dropdown-divider m-0"></li>

				<li class="small">
					<a 
					href="javascript:void(0);" 
					type="button"
					class="dropdown-item pe-5"
					title="Goto TV Display Launcher"
					onclick="window.location.href = 'tv/?stockInput=${stockNumber}'">
					<i class="bi bi-tv dropdown-icon small me-1"></i>TV Display</a>
				</li>
			</ul>
		</div>

        <!-- hidden buttons for now -->          
        <div class="d-none">
          <button type="button" id="keytagModalButton" class="btn btn-danger action-button mx-1" title="Print Key Tag" data-bs-toggle="modal" data-bs-target="#keytagModal" data-bs-stocknumber="${stockNumber}">
            <i class="bi bi-tag"></i>
            <span style="font-size:10px; text-transform:uppercase;">Key Tags</span>
          </button>

          <button type="button" class="btn btn-danger action-button mx-1" title="Print Hang Tags" data-bs-toggle="modal" data-bs-target="#HangTagModal" data-bs-stocknumber="${stockNumber}" onclick="openHangTagsModal('${stockNumber}')">
            <i class="bi bi-tags"></i>
            <span style="font-size:10px; margin-top:-10px; padding:0; text-transform:uppercase;">Hang Tags</span>
          </button>
          
          <btn
            href="javascript:void(0);" 
            type="button" 
            class="btn btn-danger action-button mx-1"
            title="Quote this vehicle"
            onclick="window.location.href = 'quote/?search=${stockNumber}'"
          >
            <i class="bi bi-card-heading"></i>
            <span style="font-size:10px; text-transform:uppercase;">Quote</span>
          </btn>

          <btn
            href="javascript:void(0);" 
            type="button"
            class="d-none btn btn-danger action-button mx-1"
            title="Goto TV Display Launcher"
            onclick="window.location.href = 'tv/?stockInput=${stockNumber}'"
          >
            <i class="bi bi-tv"></i>
            <span style="font-size:10px; text-transform:uppercase;">TV DISPLAY</span>
          </btn>

          <btn
            href="javascript:void(0);" 
            type="button" 
            class="btn btn-danger action-button mx-1"
            style="display: none;"
            title="Pricing"
            data-bs-toggle="modal"
            data-bs-target="#pricingModal"
            onclick="openNewOverlayModal('${stockNumber}')"
          >
            <i class="bi bi-card-heading"></i>
            <span style="font-size:10px; text-transform:uppercase;">Overlay</span>
          </btn>
      </div>

        </div>  
      </td>`;

		fragment.appendChild(row);
	});

	// Append the fragment to the table body
	DOM.tableBody.appendChild(fragment);
	applyColumnVisibility();

	// Initialize tooltips for the new rows
	initializeClipboardTooltips();
	initializeTextTooltips();

	// Initialize tooltips for date badges
	const dateBadges = document.querySelectorAll(
		".badge[data-bs-toggle='tooltip']",
	);
	dateBadges.forEach((badge) => {
		new bootstrap.Tooltip(badge);
	});

	// Update row count after rendering
	updateRowCount();
}

// Add this function near the top with other utility functions
function checkLocalStorageAvailability() {
	try {
		// Test localStorage availability
		const testKey = "__storage_test__";
		localStorage.setItem(testKey, testKey);
		localStorage.removeItem(testKey);

		// Try estimating available space
		let totalBytes = 0;

		// Keep adding data until we hit a quota error
		try {
			// Get existing storage use
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				const value = localStorage.getItem(key);
				totalBytes += key.length + value.length;
			}

			// Test for additional space
			const oneKB = "a".repeat(1024); // 1KB of data
			let testCounter = 0;
			const testPrefix = "__space_test__";

			// Try to add up to 5MB more to see if we hit limits
			while (testCounter < 5) {
				localStorage.setItem(`${testPrefix}${testCounter}`, oneKB);
				testCounter++;
			}

			// Clean up test items
			for (let i = 0; i < testCounter; i++) {
				localStorage.removeItem(`${testPrefix}${i}`);
			}

			console.log(
				`LocalStorage: Approximately ${Math.round(totalBytes / 1024)}KB in use`,
			);
			return { available: true, quotaExceeded: false };
		} catch (e) {
			// Caught a quota error
			console.warn(
				"LocalStorage quota may be limited - will use memory fallbacks if needed",
			);
			return { available: true, quotaExceeded: true };
		}
	} catch (e) {
		console.error("LocalStorage not available", e);
		return { available: false, quotaExceeded: false };
	}
}

// Add near the top with other utility functions
function setupNetworkMonitoring() {
	const reportNetworkStatus = () => {
		const connection =
			navigator.connection ||
			navigator.mozConnection ||
			navigator.webkitConnection;

		const status = {
			online: navigator.onLine,
		};

		// Add connection info if available (mostly mobile browsers)
		if (connection) {
			status.type = connection.type;
			status.effectiveType = connection.effectiveType;
			status.downlinkMax = connection.downlinkMax;
			status.downlink = connection.downlink;
			status.rtt = connection.rtt;
			status.saveData = connection.saveData;
		}

		console.log("Network status:", status);
		return status;
	};

	// Report current status
	const initialStatus = reportNetworkStatus();

	// Add event listeners for network changes
	window.addEventListener("online", () => {
		console.log("Network came online");
		reportNetworkStatus();
	});

	window.addEventListener("offline", () => {
		console.log("Network went offline");
		reportNetworkStatus();
	});

	// Add connection change listener if available
	if (navigator.connection && navigator.connection.addEventListener) {
		navigator.connection.addEventListener("change", reportNetworkStatus);
	}

	return initialStatus;
}

// =============================================
// TV Grid Selection Functions
// =============================================

/**
 * Get all selected stock numbers for TV Grid.
 * @returns {string[]} Array of selected stock numbers.
 */
function getSelectedTvGridItems() {
	const checkboxes = document.querySelectorAll(".tv-grid-select:checked");
	return Array.from(checkboxes).map(cb => cb.dataset.stock).filter(Boolean);
}

/**
 * Update the TV Grid button state and count.
 */
function updateTvGridButton() {
	const selected = getSelectedTvGridItems();
	const btn = document.getElementById("sendToTvGridBtn");
	const countSpan = document.getElementById("selectedCount");
	
	if (btn) {
		btn.disabled = selected.length === 0;
	}
	if (countSpan) {
		countSpan.textContent = selected.length;
	}
}

/**
 * Send selected items to TV Grid launcher.
 */
function sendToTvGrid() {
	const selected = getSelectedTvGridItems();
	if (selected.length === 0) return;
	
	// Limit to 10 items
	const stocks = selected.slice(0, 10).join(",");
	window.location.href = `tv/?s=${encodeURIComponent(stocks)}&layout=grid`;
}

/**
 * Initialize TV Grid selection handlers.
 */
function initTvGridSelection() {
	// Select all checkbox
	const selectAllCheckbox = document.getElementById("selectAllCheckbox");
	if (selectAllCheckbox) {
		selectAllCheckbox.addEventListener("change", (e) => {
			const checkboxes = document.querySelectorAll(".tv-grid-select");
			checkboxes.forEach(cb => cb.checked = e.target.checked);
			updateTvGridButton();
		});
	}
	
	// Individual checkbox changes (delegated)
	document.addEventListener("change", (e) => {
		if (e.target.classList.contains("tv-grid-select")) {
			updateTvGridButton();
			// Update select all checkbox state
			const allCheckboxes = document.querySelectorAll(".tv-grid-select");
			const checkedCheckboxes = document.querySelectorAll(".tv-grid-select:checked");
			if (selectAllCheckbox) {
				selectAllCheckbox.checked = allCheckboxes.length === checkedCheckboxes.length;
				selectAllCheckbox.indeterminate = checkedCheckboxes.length > 0 && checkedCheckboxes.length < allCheckboxes.length;
			}
		}
	});
	
	// Send to TV Grid button
	const sendBtn = document.getElementById("sendToTvGridBtn");
	if (sendBtn) {
		sendBtn.addEventListener("click", sendToTvGrid);
	}
}

// Initialize TV Grid selection when DOM is ready
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initTvGridSelection);
} else {
	initTvGridSelection();
}
