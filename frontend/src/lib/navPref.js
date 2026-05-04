/**
 * Driver's preferred navigation app — stored in localStorage.
 * Used by every "directions" link in the Wrecker module so we respect
 * what the driver actually has installed (and uses) on their phone.
 */
const KEY = 'hp_nav_app';

export const NAV_APPS = [
  { key: 'google', label: 'Google Maps', short: 'Google' },
  { key: 'apple',  label: 'Apple Maps',  short: 'Apple' },
  { key: 'waze',   label: 'Waze',        short: 'Waze' },
];

export function getNavApp() {
  try { return localStorage.getItem(KEY) || 'google'; }
  catch (e) { return 'google'; }
}

export function setNavApp(key) {
  try { localStorage.setItem(KEY, key); }
  catch (e) { /* ignore */ }
  // notify listeners on this tab
  window.dispatchEvent(new CustomEvent('hp-nav-app-change', { detail: key }));
}

/**
 * Build a turn-by-turn directions URL for the driver's preferred app.
 * Falls back gracefully on devices that don't have the chosen app installed.
 */
export function navUrl(address, lat, lng) {
  if (!address && !(lat && lng)) return '#';
  const dest = (lat && lng) ? `${lat},${lng}` : encodeURIComponent(address);
  switch (getNavApp()) {
    case 'apple':
      // maps.apple.com works on iOS and falls back to Apple Maps web on others
      return `https://maps.apple.com/?daddr=${dest}&dirflg=d`;
    case 'waze':
      return `https://waze.com/ul?q=${dest}&navigate=yes`;
    case 'google':
    default:
      return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
  }
}
