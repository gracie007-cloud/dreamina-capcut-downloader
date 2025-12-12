# ⚡ CapCut High-Res Asset Downloader

A Chrome Extension that enables **one-click downloading of High-Resolution (1440p+) assets** from CapCut/Dreamina, bypassing the low-res previews.

![Icon](icon.png)

## 🚀 Features

*   **⚡ Native Speed:** Uses a smart network interceptor that imposes **zero lag** on scrolling.
*   **📸 High-Res Quality:** Captures the original 1440x2560 source files (filtering out 600px thumbnails).
*   **🛡️ Smart Filtering:** Automatically ignores sidebar/recommended junk images.
*   **🖱️ Batch Selection:** Select All / Select None controls for bulk downloading.

## 🛠️ Installation

1.  **Clone or Download** this repository.
2.  Open Chrome and go to `chrome://extensions`.
3.  Enable **"Developer mode"** (top right).
4.  Click **"Load unpacked"**.
5.  Select the folder containing this `manifest.json`.

## 📖 How to Use

1.  Navigate to your CapCut/Dreamina assets page.
2.  Scroll down to load your images (the extension captures them silently in the background).
3.  Open the extension popup.
4.  Click **"QUICK SCAN"** ⚡.
5.  Select the images you want (or **SELECT ALL**).
6.  Click **"DOWNLOAD FULL QUALITY"**.

## 🔧 Technical Details

*   **Manifest V3:** Fully compliant with modern Chrome security standards.
*   **Main World Injection:** Uses `world: "MAIN"` to lazily intercept specific API calls (`get_local_item_list`) while strictly ignoring binary data to preserve performance.

## 📄 License
MIT
