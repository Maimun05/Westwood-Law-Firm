// The firm's public contact address, shown on the Contact page, the footer,
// the About page, and everywhere an unregistered visitor is pointed to when
// an inquiry CTA is not available to them.

export const FIRM_EMAIL = "westwoodlawfirm1@gmail.com";
export const FIRM_EMAIL_HREF = `mailto:${FIRM_EMAIL}`;

// Single-line office address for Google Maps (the Contact page keeps its own
// multi-line display version). Opening this URL drops the visitor straight into
// directions with the office as the destination.
const FIRM_MAPS_DESTINATION =
  "Westwood Law Firm, Suite 1004 Atlanta Center, 31 Annapolis St., Greenhills, 1502 San Juan City, Metro Manila, Philippines";

export const FIRM_DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
  FIRM_MAPS_DESTINATION,
)}`;
