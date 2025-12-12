document.addEventListener('DOMContentLoaded', () => {
    const scanBtn = document.getElementById('scanBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const imageList = document.getElementById('imageList');
    const statusDiv = document.getElementById('status');
    const countSpan = document.getElementById('count');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const selectNoneBtn = document.getElementById('selectNoneBtn');

    // Progress UI
    const progressContainer = document.getElementById('progressContainer');
    const progressBarFill = document.getElementById('progressBarFill');
    const progressText = document.getElementById('progressText');

    let foundImages = [];
    let selectedIndices = new Set();
    let isAutoDownload = false;

    // Selection Controls logic
    selectAllBtn.addEventListener('click', () => {
        const items = document.querySelectorAll('.image-item');
        items.forEach((div, index) => {
            selectedIndices.add(index);
            div.classList.add('selected');
        });
        updateCount();
    });

    selectNoneBtn.addEventListener('click', () => {
        selectedIndices.clear();
        document.querySelectorAll('.image-item').forEach(div => {
            div.classList.remove('selected');
        });
        updateCount();
    });

    // -- Quick Scan --
    scanBtn.addEventListener('click', async () => {
        isAutoDownload = false;
        runScan('quick_scan');
    });

    function displayImages(images) {
        foundImages = images;
        imageList.innerHTML = '';
        selectedIndices.clear();
        updateCount();

        if (!images || images.length === 0) {
            statusDiv.textContent = 'No images found.';
            document.getElementById('selectionControls').style.display = 'none';
            return;
        }

        document.getElementById('selectionControls').style.display = 'flex';

        images.forEach((imgObj, index) => {
            const div = document.createElement('div');
            div.className = 'image-item';
            div.dataset.index = index;

            const img = document.createElement('img');
            img.src = imgObj.url;
            img.referrerPolicy = "no-referrer";
            img.onerror = () => {
                if (imgObj.backup && img.src !== imgObj.backup) {
                    img.src = imgObj.backup;
                }
            };

            div.appendChild(img);

            const check = document.createElement('div');
            check.className = 'check';
            div.appendChild(check);

            div.addEventListener('click', () => toggleSelection(index, div));

            imageList.appendChild(div);
        });
    }

    async function runScan(actionName, indices = null) {
        if (actionName === 'deep_scan' && indices) {
            statusDiv.textContent = `Deep Scanning ${indices.length} items...`;
        } else {
            statusDiv.textContent = actionName === 'deep_scan' ? 'Starting Full Deep Scan...' : 'Scanning...';
            if (actionName === 'quick_scan') {
                imageList.innerHTML = '';
                selectedIndices.clear();
                updateCount();
            }
        }

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab) {
            statusDiv.textContent = 'No active tab found.';
            return;
        }

        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });

            chrome.tabs.sendMessage(tab.id, { action: actionName, indices: indices }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError);
                    statusDiv.textContent = 'Error connecting to page.';
                    return;
                }

                if (actionName === 'quick_scan') {
                    if (response && response.images && response.images.length > 0) {
                        displayImages(response.images);
                        statusDiv.textContent = `Found ${response.images.length} images.`;
                    } else {
                        statusDiv.textContent = 'No images found.';
                        document.getElementById('selectionControls').style.display = 'none';
                    }
                }
            });
        } catch (err) {
            console.error(err);
            statusDiv.textContent = 'Scan failed. REFRESH page.';
        }
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'progress') {
            if (progressContainer) progressContainer.style.display = 'block';
            const pct = Math.round((message.current / message.total) * 100);
            if (progressBarFill) progressBarFill.style.width = pct + '%';
            if (progressText) progressText.textContent = `Processing ${message.current}/${message.total}...`;
        } else if (message.type === 'deep_scan_complete') {
            if (progressContainer) progressContainer.style.display = 'none';
            if (message.images && message.images.length > 0) {
                updateImages(message.images);
                statusDiv.textContent = `Deep Scan complete. Updated ${message.images.length} images.`;

                if (isAutoDownload) {
                    statusDiv.textContent += ' Downloading...';
                    setTimeout(() => {
                        triggerDownload();
                    }, 500);
                }
            }
        }
    });

    function updateImages(results) {
        let updateCount = 0;
        results.forEach(res => {
            if (typeof res.index !== 'undefined') {
                if (foundImages[res.index]) {
                    foundImages[res.index] = { url: res.url, backup: res.backup };
                    const imgItem = document.querySelector(`.image-item[data-index="${res.index}"]`);
                    if (imgItem) {
                        const imgTag = imgItem.querySelector('img');
                        imgTag.src = res.url;
                    }
                    updateCount++;
                }
            }
        });

        if (updateCount === 0 && results.length > 0 && !results[0].index) {
            displayImages(results);
        }
    }

    function toggleSelection(index, element) {
        if (selectedIndices.has(index)) {
            selectedIndices.delete(index);
            element.classList.remove('selected');
        } else {
            selectedIndices.add(index);
            element.classList.add('selected');
        }
        updateCount();
    }

    function updateCount() {
        countSpan.textContent = selectedIndices.size;
        downloadBtn.disabled = selectedIndices.size === 0;
    }

    // Helper to convert images to PNG via Canvas
    function urlToPngBlob(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous"; // Require CORS for canvas export
            img.referrerPolicy = "no-referrer";
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob((blob) => {
                        if (blob) resolve(URL.createObjectURL(blob));
                        else reject(new Error("Canvas to Blob failed"));
                    }, 'image/png');
                } catch (e) {
                    reject(e);
                }
            };
            img.onerror = () => reject(new Error("Image load failed"));
            img.src = url;
        });
    }

    // Download Logic
    async function triggerDownload() {
        const indices = Array.from(selectedIndices);
        statusDiv.textContent = `Converting & Downloading ${indices.length} files...`;

        // Process downloads
        const downloadPromises = indices.map(async (index) => {
            const imgObj = foundImages[index];
            let downloadUrl = imgObj.url;
            let filename = `capcut_v2_${Date.now()}_${index}.png`;

            // Try conversion to PNG
            try {
                const blobUrl = await urlToPngBlob(imgObj.url);
                downloadUrl = blobUrl;
                // Filename is already .png
            } catch (e) {
                console.warn("PNG conversion failed (likely CORS), downloading original.", e);
                // Fallback: Use original URL, but keep .png extension request if possible, 
                // OR fallback to original extension.
                // User asked for PNG. If we can't convert, what's better? 
                // A broken png or a working webp? Working webp is better.
                try {
                    if (downloadUrl.includes('.jpg') || downloadUrl.includes('.jpeg')) filename = filename.replace('.png', '.jpg');
                    if (downloadUrl.includes('.webp')) filename = filename.replace('.png', '.webp');
                } catch (ex) { }
            }

            chrome.downloads.download({
                url: downloadUrl,
                filename: 'capcut_assets/' + filename,
                conflictAction: 'uniquify',
                saveAs: false
            });
        });

        // We don't necessarily need to wait for all to finish before resetting UI, 
        // but it's nice to handle errors.
        await Promise.allSettled(downloadPromises);

        statusDiv.textContent = `Download initiated for ${indices.length} items.`;
        isAutoDownload = false;
    }

    downloadBtn.addEventListener('click', () => {
        triggerDownload();
    });
});
