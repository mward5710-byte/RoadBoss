/**
 * Photo capture helper — opens camera, resizes locally, returns base64 data URL.
 * Photos stay IN the app (uploaded to backend), never written to camera roll.
 */
const MAX_DIM = 1280;       // resize max edge to 1280px (saves ~70% bytes)
const JPEG_QUALITY = 0.82;  // 82% quality

/**
 * Compress an image File to a base64 JPEG data URL.
 */
export async function fileToCompressedDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > MAX_DIM) {
          height = Math.round(height * (MAX_DIM / width));
          width = MAX_DIM;
        } else if (height > MAX_DIM) {
          width = Math.round(width * (MAX_DIM / height));
          height = MAX_DIM;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
          resolve(dataUrl);
        } catch (err) { reject(err); }
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Open native camera (or file picker on desktop) and return a compressed data URL.
 * Returns null if the user cancels.
 */
export function openCameraAsDataUrl({ accept = 'image/*', capture = 'environment' } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (capture) input.setAttribute('capture', capture);
    input.style.display = 'none';
    let resolved = false;
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) { resolved = true; resolve(null); return; }
      try {
        const data = await fileToCompressedDataUrl(file);
        resolved = true;
        resolve(data);
      } catch (e) {
        resolved = true;
        resolve(null);
      } finally {
        document.body.removeChild(input);
      }
    };
    document.body.appendChild(input);
    input.click();
    // Safety: if user cancels, the dialog never fires onchange. We can't reliably detect that.
    // Caller should treat unresolved as "user closed".
  });
}
