// DOM Elements
const statusEl = document.getElementById('status');
const storageCountEl = document.getElementById('storageCount');
const countNumEl = document.getElementById('countNum');

const extractSection = document.getElementById('extractSection');
const extractBtn = document.getElementById('extractBtn');
const extractBtnText = document.getElementById('extractBtnText');
const dataPreview = document.getElementById('dataPreview');

const exportSection = document.getElementById('exportSection');
const exportBtn = document.getElementById('exportBtn');
const exportBtnText = document.getElementById('exportBtnText');
const exportSuccess = document.getElementById('exportSuccess');

const otherSection = document.getElementById('otherSection');
const instructions = document.getElementById('instructions');

let currentTabId = null;
let pageType = 'other'; // 'codecanyon', 'dashboard', 'other'

// Update storage count display
async function updateStorageCount() {
    try {
        const data = await chrome.storage.local.get('cc_scripts');
        const scripts = data.cc_scripts || [];
        countNumEl.textContent = scripts.length;
        storageCountEl.classList.toggle('hidden', scripts.length === 0);
    } catch (err) {
        console.error('Error getting storage count:', err);
    }
}

// Check what type of page we're on
async function checkCurrentTab() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        currentTabId = tab.id;
        const url = tab.url || '';

        if (url.includes('codecanyon.net/item/')) {
            pageType = 'codecanyon';
            statusEl.className = 'status codecanyon';
            statusEl.textContent = '✓ CodeCanyon item detected';
            extractSection.classList.remove('hidden');
            exportSection.classList.add('hidden');
            otherSection.classList.add('hidden');
            instructions.textContent = 'Click to extract and save this item\'s data.';

        } else if (url.includes('codecanyon-scraper') || url.includes('index.html')) {
            pageType = 'dashboard';
            statusEl.className = 'status dashboard';
            statusEl.textContent = '✓ Dashboard page detected';
            extractSection.classList.add('hidden');
            exportSection.classList.remove('hidden');
            otherSection.classList.add('hidden');
            instructions.textContent = 'Export your collected data to the dashboard.';

        } else {
            pageType = 'other';
            statusEl.className = 'status other';
            statusEl.textContent = 'ℹ Navigate to CodeCanyon or Dashboard';
            extractSection.classList.add('hidden');
            exportSection.classList.add('hidden');
            otherSection.classList.remove('hidden');
            instructions.textContent = 'Go to a CodeCanyon item page or your dashboard.';
        }

        await updateStorageCount();

    } catch (err) {
        console.error('Error checking tab:', err);
        statusEl.className = 'status other';
        statusEl.textContent = '✗ Unable to check page';
    }
}

// Extract data from CodeCanyon page
async function extractData() {
    if (!currentTabId) return;

    extractBtnText.innerHTML = '<span class="spinner"></span> Extracting...';
    extractBtn.disabled = true;

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: currentTabId },
            func: scrapeCodeCanyon
        });

        const data = results[0]?.result;

        if (data && data.title) {
            // Show preview
            document.getElementById('previewTitle').textContent = data.title;
            document.getElementById('previewAuthor').textContent = data.author;
            document.getElementById('previewPrice').textContent = '$' + data.price;
            document.getElementById('previewSales').textContent = data.sales + ' sales';
            dataPreview.classList.remove('hidden');

            // Save to chrome storage
            const savedScripts = await chrome.storage.local.get('cc_scripts');
            const scripts = savedScripts.cc_scripts || [];

            const existingIndex = scripts.findIndex(s => s.url === data.url);

            if (existingIndex >= 0) {
                scripts[existingIndex].history.push({
                    date: new Date().toISOString(),
                    sales: data.sales,
                    price: data.price
                });
                scripts[existingIndex].title = data.title;
                scripts[existingIndex].image = data.image;
            } else {
                scripts.unshift({
                    id: Date.now().toString(),
                    url: data.url,
                    title: data.title,
                    image: data.image,
                    author: data.author,
                    history: [{
                        date: new Date().toISOString(),
                        sales: data.sales,
                        price: data.price
                    }]
                });
            }

            await chrome.storage.local.set({ cc_scripts: scripts });
            await updateStorageCount();

            statusEl.textContent = existingIndex >= 0 ? '✓ Data updated!' : '✓ Data saved!';
            extractBtnText.textContent = '✓ Saved!';

            setTimeout(() => {
                extractBtnText.textContent = 'Extract Again';
                extractBtn.disabled = false;
            }, 1500);

        } else {
            throw new Error('Could not extract data from page');
        }

    } catch (err) {
        console.error('Extraction error:', err);
        statusEl.className = 'status other';
        statusEl.textContent = '✗ ' + (err.message || 'Extraction failed');
        extractBtnText.textContent = 'Try Again';
        extractBtn.disabled = false;
    }
}

// Export data to dashboard page
async function exportToDashboard() {
    if (!currentTabId) return;

    exportBtnText.innerHTML = '<span class="spinner"></span> Exporting...';
    exportBtn.disabled = true;

    try {
        // Get scripts from extension storage
        const data = await chrome.storage.local.get('cc_scripts');
        const scripts = data.cc_scripts || [];

        if (scripts.length === 0) {
            statusEl.textContent = 'ℹ No scripts to export. Extract some first!';
            exportBtnText.textContent = 'No Data to Export';
            setTimeout(() => {
                exportBtnText.textContent = 'Export Data to Dashboard';
                exportBtn.disabled = false;
            }, 2000);
            return;
        }

        // Inject script to write to page's localStorage
        await chrome.scripting.executeScript({
            target: { tabId: currentTabId },
            func: injectDataToDashboard,
            args: [scripts]
        });

        statusEl.textContent = '✓ Exported ' + scripts.length + ' script(s)!';
        exportSuccess.style.display = 'block';
        exportBtnText.textContent = '✓ Exported!';

        setTimeout(() => {
            exportBtnText.textContent = 'Export Again';
            exportBtn.disabled = false;
        }, 2000);

    } catch (err) {
        console.error('Export error:', err);
        statusEl.className = 'status other';
        statusEl.textContent = '✗ ' + (err.message || 'Export failed');
        exportBtnText.textContent = 'Try Again';
        exportBtn.disabled = false;
    }
}

// Function that runs on the dashboard page to inject data
function injectDataToDashboard(scripts) {
    try {
        // Get existing scripts from dashboard's localStorage
        const existingStr = localStorage.getItem('cc_tracker_scripts');
        const existing = existingStr ? JSON.parse(existingStr) : [];

        // Merge scripts
        const merged = [...existing];

        scripts.forEach(newScript => {
            const existingIdx = merged.findIndex(s => s.url === newScript.url);
            if (existingIdx >= 0) {
                // Merge history
                const existingDates = new Set(merged[existingIdx].history.map(h => h.date));
                const newHistory = newScript.history.filter(h => !existingDates.has(h.date));
                merged[existingIdx].history = [...merged[existingIdx].history, ...newHistory];
                merged[existingIdx].title = newScript.title;
                merged[existingIdx].image = newScript.image;
            } else {
                merged.unshift(newScript);
            }
        });

        // Save back to localStorage
        localStorage.setItem('cc_tracker_scripts', JSON.stringify(merged));

        // Trigger a storage event so React can pick it up
        window.dispatchEvent(new Event('storage'));

        // Also reload the page to show new data
        location.reload();

        return { success: true, count: scripts.length };
    } catch (err) {
        console.error('Inject error:', err);
        return { success: false, error: err.message };
    }
}

// Function that runs on CodeCanyon page to scrape data
function scrapeCodeCanyon() {
    try {
        const titleEl = document.querySelector('h1.t-heading');
        const title = titleEl ? titleEl.innerText.trim() : 'Unknown';

        let price = 0;
        const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of jsonLdScripts) {
            try {
                const data = JSON.parse(script.textContent);
                if (data['@type'] === 'Product' && data.offers?.price) {
                    price = parseFloat(data.offers.price);
                    break;
                }
            } catch (e) { }
        }

        if (!price) {
            const priceSelectors = ['.js-adi__item-sale-price', '.adi__item-sale-price', '.js-purchase-price'];
            for (const sel of priceSelectors) {
                const el = document.querySelector(sel);
                if (el) {
                    const cleaned = el.innerText.replace(/[^0-9.]/g, '');
                    if (cleaned && parseFloat(cleaned) > 0) {
                        price = parseFloat(cleaned);
                        break;
                    }
                }
            }
        }

        let sales = 0;
        const salesWrapper = document.querySelector('.item-header__sales-count');
        if (salesWrapper) {
            const strongTag = salesWrapper.querySelector('strong');
            if (strongTag) {
                const salesText = strongTag.innerText.replace(/[^0-9]/g, '');
                if (salesText) sales = parseInt(salesText, 10);
            }
            if (!sales) {
                const salesText = salesWrapper.innerText.replace(/[^0-9]/g, '');
                if (salesText) sales = parseInt(salesText, 10);
            }
        }

        const imageEl = document.querySelector('meta[property="og:image"]');
        const image = imageEl ? imageEl.content : null;

        const authorEl = document.querySelector('a.js-by-author');
        const author = authorEl ? authorEl.innerText.trim() : 'Unknown';

        return {
            title,
            price,
            sales,
            image,
            author,
            url: window.location.href
        };
    } catch (err) {
        console.error('Scrape error:', err);
        return null;
    }
}

// Event listeners
extractBtn.addEventListener('click', extractData);
exportBtn.addEventListener('click', exportToDashboard);

// Initialize
checkCurrentTab();
