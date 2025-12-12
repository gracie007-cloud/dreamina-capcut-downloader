// Intercept XHR and Fetch - BROAD CAPTURE + HEADER SAFETY
(function () {
    let foundImages = new Map();
    let isScanning = false;
    let scanQueue = [];

    // BROAD WHITELIST: Catch everything that *might* be data.
    // Rely on Content-Type check to filter out the noise (images/html).
    const TARGET_KEYWORDS = [
        'list', 'search', 'feed', 'query', 'api', 'item', 'category',
        'recommend', 'material', 'get', 'find'
    ];

    // BLACKLIST: Secondary guard for obvious statics
    const IGNORED_EXTENSIONS = [
        '.css', '.js', '.woff', '.ttf', '.ico', '.svg', '.mp4'
    ];
    // Note: We removed .jpg/.png from blacklist to allow "api?file=image.jpg".
    // The Content-Type check will save us from parsing actual .jpg files.

    function isTargetUrl(url) {
        if (!url) return false;
        const lowUrl = url.toLowerCase();

        // 1. BLACKLIST (Non-content types)
        if (IGNORED_EXTENSIONS.some(ext => lowUrl.includes(ext))) return false;
        if (lowUrl.includes('log') || lowUrl.includes('pixel') || lowUrl.includes('telemetry')) return false;

        // 2. WHITELIST (Broad)
        return TARGET_KEYWORDS.some(k => lowUrl.includes(k));
    }

    function scheduleScan(data) {
        scanQueue.push(data);
        if (!isScanning) {
            isScanning = true;
            if ('requestIdleCallback' in window) {
                requestIdleCallback(processQueue, { timeout: 2000 });
            } else {
                setTimeout(processQueue, 500);
            }
        }
    }

    function processQueue(deadline) {
        while (scanQueue.length > 0) {
            if (deadline && deadline.timeRemaining() < 2) {
                requestIdleCallback(processQueue);
                return;
            }
            const data = scanQueue.shift();
            scanObjectForImages(data);
        }
        isScanning = false;
    }

    function scanObjectForImages(obj, depth = 0) {
        if (!obj || typeof obj !== 'object' || depth > 8) return;

        if (obj.large_images && Array.isArray(obj.large_images)) {
            processPotentialImageItem(obj);
            return;
        }
        if (obj.image && obj.image.large_images) {
            processPotentialImageItem(obj);
        }

        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                scanObjectForImages(obj[i], depth + 1);
            }
            return;
        }

        for (const key in obj) {
            if (key.length > 25 || key === 'common_attr' || key === 'extra') continue;
            if (obj.hasOwnProperty(key)) {
                scanObjectForImages(obj[key], depth + 1);
            }
        }
    }

    function processPotentialImageItem(item) {
        try {
            let bestUrl = null;
            let thumbUrl = null;

            if (item.large_images && Array.isArray(item.large_images) && item.large_images.length > 0) {
                bestUrl = item.large_images[0].image_url;
            } else if (item.image && item.image.large_images && item.image.large_images.length > 0) {
                bestUrl = item.image.large_images[0].image_url;
            } else if (item.image_url && typeof item.image_url === 'string') {
                bestUrl = item.image_url;
            }

            if (item.cover && item.cover.url_list) thumbUrl = item.cover.url_list[0];
            if (item.uri) thumbUrl = item.uri;

            if (bestUrl && bestUrl.includes('http')) {
                if (!foundImages.has(bestUrl)) {
                    foundImages.set(bestUrl, { url: bestUrl, thumb: thumbUrl });

                    if (!this._broadcastTimeout) {
                        this._broadcastTimeout = setTimeout(() => {
                            broadcast();
                            this._broadcastTimeout = null;
                        }, 1500);
                    }
                }
            }
        } catch (e) { }
    }

    function broadcast() {
        const list = Array.from(foundImages.values());
        window.postMessage({
            type: 'CAPCUT_INTERCEPTOR_DATA',
            images: list
        }, '*');
    }

    // 1. Intercept XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
        this._reqUrl = url;
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
        if (this._reqUrl && isTargetUrl(this._reqUrl)) {
            this.addEventListener('load', function () {
                // SAFETY CHECK: Content-Type Header
                // Prevents accessing responseText of binary images
                const contentType = this.getResponseHeader('content-type');
                if (contentType && !contentType.includes('json')) {
                    return; // Ignore non-JSON
                }

                try {
                    const text = this.responseText;
                    if (text && (text.startsWith('{') || text.startsWith('['))) {
                        const data = JSON.parse(text);
                        scheduleScan(data);
                    }
                } catch (e) { }
            });
        }
        return originalSend.apply(this, arguments);
    };

    // 2. Intercept Fetch
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
        let url = input;
        if (input instanceof Request) url = input.url;

        if (!isTargetUrl(url)) {
            return originalFetch.apply(this, arguments);
        }

        return originalFetch.apply(this, arguments).then(response => {
            // SAFETY CHECK: Content-Type Header
            const contentType = response.headers.get('content-type');
            if (contentType && !contentType.includes('json')) {
                return response;
            }

            try {
                const clone = response.clone();
                clone.json().then(data => scheduleScan(data)).catch(() => { });
            } catch (e) { }

            return response;
        });
    };
})();
