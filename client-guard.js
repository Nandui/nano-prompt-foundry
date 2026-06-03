(function () {
  const targetBytes = 2400000;
  const maxSide = 1400;
  const initialQuality = 0.78;

  function payloadBytes(dataUrl) {
    const base64 = String(dataUrl).split(",")[1] || "";
    return Math.ceil((base64.length * 3) / 4);
  }

  function optimizeDataUrl(dataUrl) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        let side = maxSide;
        let quality = initialQuality;
        let optimized = dataUrl;

        for (let attempt = 0; attempt < 8; attempt += 1) {
          const scale = Math.min(1, side / Math.max(image.naturalWidth, image.naturalHeight));
          const width = Math.max(1, Math.round(image.naturalWidth * scale));
          const height = Math.max(1, Math.round(image.naturalHeight * scale));
          canvas.width = width;
          canvas.height = height;
          context.fillStyle = "#fff";
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          optimized = canvas.toDataURL("image/jpeg", quality);

          if (payloadBytes(optimized) <= targetBytes || side <= 700) {
            break;
          }

          side = Math.round(side * 0.82);
          quality = Math.max(0.56, quality - 0.08);
        }

        resolve(optimized);
      };
      image.onerror = () => resolve(dataUrl);
      image.src = dataUrl;
    });
  }

  const originalReadAsDataURL = FileReader.prototype.readAsDataURL;
  FileReader.prototype.readAsDataURL = function readAsOptimizedDataURL(blob) {
    if (!blob || !blob.type?.startsWith("image/")) {
      originalReadAsDataURL.call(this, blob);
      return;
    }

    const outerReader = this;
    const innerReader = new FileReader();
    innerReader.addEventListener("load", async () => {
      const optimized = await optimizeDataUrl(String(innerReader.result));
      Object.defineProperty(outerReader, "result", {
        configurable: true,
        value: optimized
      });
      outerReader.dispatchEvent(new ProgressEvent("load"));
      outerReader.dispatchEvent(new ProgressEvent("loadend"));
      if (typeof outerReader.onload === "function") {
        outerReader.onload(new ProgressEvent("load"));
      }
      if (typeof outerReader.onloadend === "function") {
        outerReader.onloadend(new ProgressEvent("loadend"));
      }
    });
    innerReader.addEventListener("error", () => {
      originalReadAsDataURL.call(outerReader, blob);
    });
    originalReadAsDataURL.call(innerReader, blob);
  };

  const originalJson = Response.prototype.json;
  Response.prototype.json = async function jsonWithTextFallback() {
    const clone = this.clone();
    try {
      return await originalJson.call(this);
    } catch (error) {
      const text = await clone.text().catch(() => "");
      const normalized = text.replace(/\s+/g, " ").trim();
      return {
        error: normalized.startsWith("Request En")
          ? "Image upload is too large for Vercel. The app compressed it, but this file is still over the limit. Try a smaller or lower-resolution image."
          : normalized || error.message
      };
    }
  };
})();
