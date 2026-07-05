// Rough Kanto-only prefecture classifier from lat/lng.
// ODPT's coverage is entirely Greater Tokyo (observed lat 35.39-36.09, lng 139.40-140.12),
// so this uses coarse bounding boxes rather than a real polygon/geocoder.
// KNOWN LIMITATION (documented in README): stations near prefectural borders
// (e.g. Tokyo/Saitama, Tokyo/Kanagawa, Tokyo/Chiba) can be misclassified.
// Contributions of a proper boundary-based lookup are welcome.
export function guessPrefecture(lat, lng) {
  if (lat == null || lng == null) return "";
  if (lat >= 35.85) return "Saitama";
  if (lng >= 139.9) return "Chiba";
  if (lat < 35.6) return "Kanagawa";
  return "Tokyo";
}

// Haversine distance in meters.
export function distMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Normalize a Japanese station name for matching: strip trailing 駅, whitespace, full/half-width variance.
export function normalizeStationName(name) {
  return (name || "")
    .trim()
    .replace(/駅$/u, "")
    .replace(/\s+/g, "")
    .normalize("NFKC");
}
