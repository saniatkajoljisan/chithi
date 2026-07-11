// ============================================================
//  avatar-helper.js
//  Shared "avatar" rendering + photo compression logic.
//
//  Used everywhere an avatar circle shows up: dashboard profile
//  preview, QR code center image, send-letter page, and the
//  letter status / reply thread (delete.js, track.js).
//
//  Design:
//   • No Firebase Storage (Spark/free plan) — photos are stored
//     as a compressed base64 JPEG data URL directly on the user
//     document (users/{uid}.photoData).
//   • If photoData is present, it is shown via CSS background-image
//     on the SAME circle element that would otherwise show the
//     color+initial — so shape/size/border/shadow are identical,
//     no layout shift, no new DOM structure needed.
//   • If photoData is absent/null, behavior is 100% unchanged from
//     before this feature existed (color circle + first initial).
// ============================================================

/**
 * Paint an avatar circle element — photo if available, otherwise the
 * existing color + initial fallback. Safe to call with a null/undefined
 * element (no-op) so callers can map over optional DOM refs.
 *
 * @param {HTMLElement} el        The avatar circle element (any existing
 *                                 avatar class: .avatar-circle,
 *                                 .profile-avatar-preview, .receipt-avatar,
 *                                 .reply-avatar, etc.)
 * @param {Object} opts
 * @param {string|null|undefined} opts.photoData  Base64 data URL, or falsy for none.
 * @param {string} [opts.color]   Fallback background color (avatarColor).
 * @param {string} [opts.name]    Display name/username used for the initial.
 */
export function applyAvatar(el, { photoData, color, name } = {}) {
  if (!el) return;
  const initial = String(name || "?").trim().charAt(0).toUpperCase() || "?";

  if (photoData) {
    el.textContent = "";
    el.style.backgroundImage = `url("${photoData}")`;
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
    el.style.backgroundColor = "transparent";
    el.classList.add("has-photo");
  } else {
    el.style.backgroundImage = "none";
    el.classList.remove("has-photo");
    el.textContent = initial;
    el.style.background = color || "#2c1e0f";
  }
}

/**
 * Compress an uploaded image file (client-side, canvas-based, no libs)
 * into a small base64 JPEG data URL suitable for storing directly on a
 * Firestore document field. Iteratively drops quality and then
 * dimensions until under the target byte budget.
 *
 * @param {File} file
 * @param {Object} [opts]
 * @param {number} [opts.maxDim=360]      Max width/height in px.
 * @param {number} [opts.quality=0.72]    Initial JPEG quality (0-1).
 * @param {number} [opts.targetBytes=150*1024]  Soft size ceiling.
 * @returns {Promise<string>} data URL, e.g. "data:image/jpeg;base64,..."
 */
export function compressImageFile(file, opts = {}) {
  const {
    maxDim = 360,
    quality = 0.72,
    targetBytes = 150 * 1024
  } = opts;

  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load that image."));
      img.onload = () => {
        try {
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height >= width && height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }

          let canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          let ctx = canvas.getContext("2d");
          // Flatten transparency onto a paper-colored background so PNGs
          // with alpha don't turn black when converted to JPEG.
          ctx.fillStyle = "#fffdf7";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          let q = quality;
          let dataUrl = canvas.toDataURL("image/jpeg", q);

          // Step 1: drop quality first.
          let qAttempts = 0;
          while (estimateBytes(dataUrl) > targetBytes && q > 0.4 && qAttempts < 6) {
            q = Math.max(0.4, q - 0.1);
            dataUrl = canvas.toDataURL("image/jpeg", q);
            qAttempts++;
          }

          // Step 2: if still too big, shrink dimensions further.
          let dimAttempts = 0;
          while (estimateBytes(dataUrl) > targetBytes && dimAttempts < 4) {
            width = Math.max(80, Math.round(width * 0.8));
            height = Math.max(80, Math.round(height * 0.8));
            canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            ctx = canvas.getContext("2d");
            ctx.fillStyle = "#fffdf7";
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            dataUrl = canvas.toDataURL("image/jpeg", q);
            dimAttempts++;
          }

          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function estimateBytes(dataUrl) {
  // Rough base64 -> byte size estimate (base64 payload is ~4/3 the byte size).
  const commaIdx = dataUrl.indexOf(",");
  const base64 = commaIdx === -1 ? dataUrl : dataUrl.slice(commaIdx + 1);
  return Math.round(base64.length * 0.75);
}

/**
 * Turn a photo data URL into a circular PNG (white ring + cover-fit photo,
 * clipped to a circle), matching the look of the initials-avatar QR image.
 * Needed because embedding the raw rectangular photo into the QR image
 * shows up as a square — QR libraries paste the image as-is and don't
 * respect CSS border-radius the way on-page avatar circles do.
 *
 * @param {string} photoData  Data URL of the (already compressed) photo.
 * @param {number} [size=200] Output canvas size in px.
 * @returns {Promise<string>} PNG data URL of the circular result.
 */
export function createCircularPhotoImage(photoData, size = 200) {
  return new Promise((resolve, reject) => {
    if (!photoData) { reject(new Error("No photo to render.")); return; }

    const img = new Image();
    img.onerror = () => reject(new Error("Could not load photo for QR image."));
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const r = size / 2;

        // White ring, same proportions as the initials-avatar QR image.
        ctx.beginPath();
        ctx.arc(r, r, r - 2, 0, Math.PI * 2);
        ctx.fillStyle = "#fffdf7";
        ctx.fill();

        // Clip to a smaller inset circle, then cover-fit the photo into it.
        const inset = r * 0.86;
        ctx.save();
        ctx.beginPath();
        ctx.arc(r, r, inset, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        const scale = Math.max((inset * 2) / img.width, (inset * 2) / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        ctx.drawImage(img, r - drawW / 2, r - drawH / 2, drawW, drawH);
        ctx.restore();

        resolve(canvas.toDataURL("image/png"));
      } catch (err) {
        reject(err);
      }
    };
    img.src = photoData;
  });
}
