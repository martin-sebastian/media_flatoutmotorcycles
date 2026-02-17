/**
 * PRICE CALCULATOR MODULE
 * Reusable price calculation utilities for vehicle quotes
 * Can be used across quote page, details page, and other areas
 */
const PriceCalculator = {
  /**
   * Calculate all price components and totals from vehicle data
   * @param {object} params - Price calculation inputs
   * @param {number} params.msrp - Base MSRP/DSRP price
   * @param {Array} params.accessories - Accessory items [{Description, Amount, Included}]
   * @param {Array} params.customAccessories - User-added accessories [{name, price}]
   * @param {Array} params.discounts - Discount items [{Description, Amount}]
   * @param {Array} params.rebates - Manufacturer rebate items [{Description, Amount}]
   * @param {Array} params.fees - OTD fee items [{Description, Amount}]
   * @param {number} params.tradeIn - Trade-in value (positive number, will be subtracted)
   * @returns {object} Calculated totals and breakdowns
   */
  calculate({
    msrp = 0,
    accessories = [],
    customAccessories = [],
    discounts = [],
    rebates = [],
    fees = [],
    tradeIn = 0,
  }) {
    // Sum accessories (only non-included items add to price)
    const accessoriesTotal = accessories.reduce((sum, item) => {
      return sum + (item.Included ? 0 : (item.Amount || 0));
    }, 0);

    // Sum custom accessories
    const customAccessoriesTotal = customAccessories.reduce((sum, item) => {
      return sum + (parseFloat(item.price) || 0);
    }, 0);

    // Sum discounts (typically negative values)
    const discountsTotal = discounts.reduce((sum, item) => sum + (item.Amount || 0), 0);

    // Sum manufacturer rebates (typically negative values)
    const rebatesTotal = rebates.reduce((sum, item) => sum + (item.Amount || 0), 0);

    // Sum fees (positive values)
    const feesTotal = fees.reduce((sum, item) => sum + (item.Amount || 0), 0);

    // Calculate prices
    const allAccessoriesTotal = accessoriesTotal + customAccessoriesTotal;
    const salesPrice = msrp + discountsTotal + rebatesTotal + allAccessoriesTotal;
    const subtotal = salesPrice; // Subtotal before fees/taxes
    const totalPrice = salesPrice + feesTotal;
    const totalWithTradeIn = totalPrice - tradeIn;

    // Calculate savings (absolute value of negative adjustments)
    const savings = Math.abs(discountsTotal + rebatesTotal);

    return {
      msrp,
      accessoriesTotal,
      customAccessoriesTotal,
      allAccessoriesTotal,
      discountsTotal,
      rebatesTotal,
      feesTotal,
      salesPrice,
      subtotal,
      totalPrice,
      totalWithTradeIn,
      savings,
      tradeIn,
    };
  },

  /**
   * Format a number as currency
   * @param {number} amount - Amount to format
   * @returns {string} Formatted currency string
   */
  format(amount) {
    // Use numeral.js if available, otherwise basic formatting
    if (typeof numeral !== "undefined") {
      return numeral(amount).format("$0,0.00");
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  },

  /**
   * Format a number as currency without decimals
   * @param {number} amount - Amount to format
   * @returns {string} Formatted currency string
   */
  formatWhole(amount) {
    if (typeof numeral !== "undefined") {
      return numeral(amount).format("$0,0");
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  },

  /**
   * Calculate monthly payment
   * @param {number} principal - Loan amount
   * @param {number} downPaymentPercent - Down payment as percentage (0-100)
   * @param {number} annualRate - Annual interest rate as percentage (e.g., 6.99)
   * @param {number} termMonths - Loan term in months
   * @returns {number} Monthly payment amount
   */
  calculatePayment(principal, downPaymentPercent, annualRate, termMonths) {
    const downPayment = (principal * downPaymentPercent) / 100;
    const loanAmount = principal - downPayment;
    const monthlyRate = annualRate / 100 / 12;

    if (monthlyRate === 0) {
      return loanAmount / termMonths;
    }

    const payment =
      (loanAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));
    return Math.round(payment);
  },
};

// Export for module systems, also available as global
if (typeof module !== "undefined" && module.exports) {
  module.exports = PriceCalculator;
}
