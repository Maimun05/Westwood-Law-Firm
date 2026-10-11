// The firm's public contact address, shown on the Contact page, the footer,
// the About page, and everywhere an unregistered visitor is pointed to when
// an inquiry CTA is not available to them.

export const FIRM_EMAIL = "westwoodlawfirm1@gmail.com";
export const FIRM_EMAIL_HREF = `mailto:${FIRM_EMAIL}`;

export const FIRM_NAME = "Westwood Law Firm";

// Structured contact details, kept here as the machine-readable copy for SEO
// (the JSON-LD in index.html and src/lib/seo.ts). The Contact and About pages
// keep their own multi-line display copy — if the office moves or the numbers
// change, update all three places together.
export const FIRM_STREET = "Suite 1004 Atlanta Center, 31 Annapolis St., Greenhills";
export const FIRM_CITY = "San Juan City";
export const FIRM_REGION = "Metro Manila";
export const FIRM_POSTAL_CODE = "1502";
export const FIRM_COUNTRY = "PH";
export const FIRM_PHONE = "(02) 7957 2121";
export const FIRM_HOURS = "Monday – Friday, 8:30 AM – 5:30 PM (closed on Philippine holidays)";
export const FIRM_FOUNDED = "1998-08";

// Single-line office address for Google Maps (the Contact page keeps its own
// multi-line display version). Opening this URL drops the visitor straight into
// directions with the office as the destination.
const FIRM_MAPS_DESTINATION =
  "Westwood Law Firm, Suite 1004 Atlanta Center, 31 Annapolis St., Greenhills, 1502 San Juan City, Metro Manila, Philippines";

export const FIRM_DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
  FIRM_MAPS_DESTINATION,
)}`;
