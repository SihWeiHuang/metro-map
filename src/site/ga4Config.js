/** GA4 Measurement ID (G-…) from Google Analytics → Admin → Data streams. */
export const GA4_MEASUREMENT_ID = import.meta.env.VITE_GA4_MEASUREMENT_ID?.trim() || "";

/**
 * @returns {boolean}
 */
export function isGa4Configured() {
  return /^G-[A-Z0-9]+$/i.test(GA4_MEASUREMENT_ID);
}
