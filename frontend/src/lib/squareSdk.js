/**
 * Square Web Payments SDK loader (singleton).
 *
 * Loads the right CDN script (sandbox vs production) based on the connected
 * tenant's environment, then resolves to the global `window.Square` namespace.
 *
 * Reference: https://developer.squareup.com/reference/sdks/web/payments
 */

let loadingPromise = null;
let loadedEnv = null;

const CDN = {
  sandbox: 'https://sandbox.web.squarecdn.com/v1/square.js',
  production: 'https://web.squarecdn.com/v1/square.js',
};

/**
 * Load Square's Web Payments SDK for the given environment.
 * Returns a Promise resolving to `window.Square`.
 */
export function loadSquareSdk(environment = 'sandbox') {
  const env = environment === 'production' ? 'production' : 'sandbox';

  // If already loaded for the SAME env, reuse
  if (loadedEnv === env && window.Square) {
    return Promise.resolve(window.Square);
  }
  // If we're loading the same env, return the in-flight promise
  if (loadingPromise && loadedEnv === env) return loadingPromise;
  // Different env requested — reset (rare, only on environment switch)
  loadedEnv = env;

  loadingPromise = new Promise((resolve, reject) => {
    // Check if a script tag from a previous mount is already there
    const existing = document.querySelector(`script[data-sq-sdk="${env}"]`);
    if (existing && window.Square) {
      resolve(window.Square);
      return;
    }
    const script = document.createElement('script');
    script.src = CDN[env];
    script.async = true;
    script.dataset.sqSdk = env;
    script.onload = () => {
      if (window.Square) resolve(window.Square);
      else reject(new Error('Square SDK loaded but window.Square is missing'));
    };
    script.onerror = () => reject(new Error(`Failed to load Square SDK from ${CDN[env]}`));
    document.head.appendChild(script);
  });
  return loadingPromise;
}

/**
 * Convenience: initialize a `payments` object with the given application id + location.
 */
export async function initSquarePayments(applicationId, locationId, environment = 'sandbox') {
  const Square = await loadSquareSdk(environment);
  return Square.payments(applicationId, locationId);
}
