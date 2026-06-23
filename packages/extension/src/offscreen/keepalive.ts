/**
 * Keep-alive ping (PLAN §22, Layer 1).
 * Sends a runtime message every 25s so the service worker idle timer resets.
 */
const PING_INTERVAL_MS = 25_000;

setInterval(() => {
  chrome.runtime.sendMessage({ type: 'keepalive_ping' }).catch(() => {
    // Worker may be momentarily down; the next tick retries.
  });
}, PING_INTERVAL_MS);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'clipboard_write') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = message.text;
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      sendResponse({ ok });
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }
  if (message.type === 'clipboard_read') {
    try {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();
      const ok = document.execCommand('paste');
      const text = textarea.value;
      textarea.remove();
      sendResponse({ ok, text });
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }
  if (message.type === 'crop_image') {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          sendResponse({ ok: false, error: 'Could not get canvas context.' });
          return;
        }

        const dpr = message.rect.devicePixelRatio || 1;
        const sx = message.rect.x * dpr;
        const sy = message.rect.y * dpr;
        const sw = message.rect.width * dpr;
        const sh = message.rect.height * dpr;

        canvas.width = sw;
        canvas.height = sh;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

        const croppedDataUrl = canvas.toDataURL('image/png');
        sendResponse({ ok: true, croppedDataUrl });
      } catch (e) {
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    };
    img.onerror = () => {
      sendResponse({ ok: false, error: 'Failed to load source image.' });
    };
    img.src = message.dataUrl;
    return true;
  }
  if (message.type === 'compare_images') {
    const img1 = new Image();
    const img2 = new Image();
    let loaded = 0;
    const onload = () => {
      loaded++;
      if (loaded === 2) {
        try {
          const w = Math.max(img1.width, img2.width);
          const h = Math.max(img1.height, img2.height);

          const canvas1 = document.createElement('canvas');
          canvas1.width = w;
          canvas1.height = h;
          const ctx1 = canvas1.getContext('2d')!;
          ctx1.drawImage(img1, 0, 0);

          const canvas2 = document.createElement('canvas');
          canvas2.width = w;
          canvas2.height = h;
          const ctx2 = canvas2.getContext('2d')!;
          ctx2.drawImage(img2, 0, 0);

          const imgData1 = ctx1.getImageData(0, 0, w, h);
          const imgData2 = ctx2.getImageData(0, 0, w, h);

          const canvasDiff = document.createElement('canvas');
          canvasDiff.width = w;
          canvasDiff.height = h;
          const ctxDiff = canvasDiff.getContext('2d')!;
          const imgDataDiff = ctxDiff.createImageData(w, h);

          let diffPixels = 0;
          const totalPixels = w * h;

          for (let i = 0; i < totalPixels * 4; i += 4) {
            const r1 = imgData1.data[i];
            const g1 = imgData1.data[i + 1];
            const b1 = imgData1.data[i + 2];
            const a1 = imgData1.data[i + 3];

            const r2 = imgData2.data[i];
            const g2 = imgData2.data[i + 1];
            const b2 = imgData2.data[i + 2];
            const a2 = imgData2.data[i + 3];

            const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2) + Math.abs(a1 - a2);

            if (diff > 20) {
              diffPixels++;
              imgDataDiff.data[i] = 255;
              imgDataDiff.data[i + 1] = 0;
              imgDataDiff.data[i + 2] = 255;
              imgDataDiff.data[i + 3] = 255;
            } else {
              imgDataDiff.data[i] = r1;
              imgDataDiff.data[i + 1] = g1;
              imgDataDiff.data[i + 2] = b1;
              imgDataDiff.data[i + 3] = 50;
            }
          }

          ctxDiff.putImageData(imgDataDiff, 0, 0);
          const diffDataUrl = canvasDiff.toDataURL('image/png');
          const mismatchPercent = (diffPixels / totalPixels) * 100;

          sendResponse({
            ok: true,
            diffDataUrl,
            mismatchPercent,
            diffPixels,
            totalPixels,
            dimensions: { width: w, height: h },
          });
        } catch (e) {
          sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
        }
      }
    };

    img1.onload = onload;
    img2.onload = onload;
    img1.onerror = () => sendResponse({ ok: false, error: 'Failed to load baseline image.' });
    img2.onerror = () => sendResponse({ ok: false, error: 'Failed to load current image.' });

    img1.src = message.img1;
    img2.src = message.img2;
    return true;
  }
  if (message.type === 'ocr_tesseract') {
    (async () => {
      try {
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng', 1, {
          workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
          corePath: chrome.runtime.getURL('tesseract/tesseract-core.wasm.js'),
          langPath: 'https://tessdata.projectnaptha.com/4.0.0',
          workerBlobURL: false,
        });
        const { data: { text } } = await worker.recognize(message.dataUrl);
        await worker.terminate();
        sendResponse({ ok: true, text });
      } catch (e) {
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return true;
  }
});
