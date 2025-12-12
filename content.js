// Content Script (Production)

let capturedHighRes = [];

window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data && event.data.type === 'CAPCUT_INTERCEPTOR_DATA') {
        const newImages = event.data.images;
        if (Array.isArray(newImages)) {
            const existingIds = new Set(capturedHighRes.map(img => img.url));
            newImages.forEach(img => {
                if (!existingIds.has(img.url)) {
                    capturedHighRes.push(img);
                    existingIds.add(img.url);
                }
            });
        }
    }
});

function getHash(url) {
    if (!url) return '';
    const match = url.match(/[a-f0-9]{32}/);
    return match ? match[0] : null;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'quick_scan') {
        quickScanImages().then(images => sendResponse({ images }));
        return true;
    } else if (request.action === 'deep_scan') {
        deepScanImages(request.indices);
        sendResponse({ status: 'Deep scan started' });
        return true;
    }
});

async function quickScanImages() {
    const images = [];

    console.log(`CapCut Downloader: Quick Scan. DB has ${capturedHighRes.length} items.`);

    // Broad Selection: All images
    const domImages = document.querySelectorAll('img');

    // Create Lookup
    const highResMap = {};
    capturedHighRes.forEach(item => {
        const h1 = getHash(item.url);
        if (h1) highResMap[h1] = item.url;
        const h2 = getHash(item.thumb);
        if (h2) highResMap[h2] = item.url;
    });

    domImages.forEach((img, index) => {
        let src = img.src || img.dataset.bgSrc;

        // Basic Validity
        if (!src || !src.includes('ibyteimg.com')) return;

        // SIZE FILTER RESTORED TO SAFE LEVELS
        // We accept anything > 140px. This filters icons (20-60px) but keeps cards (200px+).
        const width = img.width || img.naturalWidth || 0;
        const height = img.height || img.naturalHeight || 0;

        const isBigEnough = (width > 140 || height > 140);
        if (!isBigEnough) return;

        // Skip user avatars
        if (img.classList.contains('avatar') || img.closest('.user-avatar')) return;


        // Match Logic
        const domHash = getHash(src);
        let finalUrl = src;
        let isHighRes = false;

        if (domHash && highResMap[domHash]) {
            finalUrl = highResMap[domHash];
            isHighRes = true;
        }

        // UNMATCHED JUNK FILTER
        if (!isHighRes) {
            // If it didn't match our Database...
            // It might be a sidebar ad or unrelated image.
            // We only allow it if it's SIGNIFICANTLY large (likely a main asset we somehow missed).
            // If it's a small 200px image and UNMATCHED, we assume it's garbage.
            // This solves "Scan is scanning images out of my assets".
            if (width < 400 && height < 400) return;
        }

        images.push({
            url: finalUrl,
            backup: src,
            domIndex: index,
            isHighRes: isHighRes
        });
    });

    const unique = new Map();
    images.forEach(i => unique.set(i.url, i));
    const result = Array.from(unique.values());
    console.log(`CapCut Downloader: Scanned ${result.length} valid assets.`);

    return result;
}


