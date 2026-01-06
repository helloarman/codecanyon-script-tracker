// Background service worker for CodeCanyon Tracker Extension

// Handle batch scraping messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'batchScrape') {
        handleBatchScrape(request.groupId, request.links)
            .then(results => sendResponse({ success: true, results }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // Keep channel open for async
    }

    if (request.action === 'getGroups') {
        chrome.storage.local.get('cc_groups', (data) => {
            sendResponse({ groups: data.cc_groups || [] });
        });
        return true;
    }
});

// Batch scrape all links in a group
async function handleBatchScrape(groupId, links) {
    const results = [];

    for (const url of links) {
        try {
            // Create a new tab
            const tab = await chrome.tabs.create({ url, active: false });

            // Wait for the tab to load
            await waitForTabLoad(tab.id);

            // Wait a bit more for dynamic content
            await delay(2000);

            // Execute scraping script
            const scrapeResults = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: scrapeCodeCanyon
            });

            const data = scrapeResults[0]?.result;

            if (data && data.title) {
                results.push({
                    success: true,
                    url,
                    data: {
                        id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
                        url: data.url,
                        title: data.title,
                        author: data.author,
                        price: data.price,
                        sales: data.sales,
                        image: data.image,
                        history: [{
                            date: new Date().toISOString(),
                            sales: data.sales,
                            price: data.price
                        }]
                    }
                });
            } else {
                results.push({ success: false, url, error: 'Failed to extract data' });
            }

            // Close the tab
            await chrome.tabs.remove(tab.id);

        } catch (err) {
            console.error('Scrape error for', url, err);
            results.push({ success: false, url, error: err.message });
        }
    }

    // Save results to the group
    await saveResultsToGroup(groupId, results);

    return results;
}

// Wait for tab to finish loading
function waitForTabLoad(tabId) {
    return new Promise((resolve) => {
        const listener = (changedTabId, changeInfo) => {
            if (changedTabId === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(listener);

        // Timeout after 30 seconds
        setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
        }, 30000);
    });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Save scrape results to the group
async function saveResultsToGroup(groupId, results) {
    const data = await chrome.storage.local.get('cc_groups');
    const groups = data.cc_groups || [];

    const groupIndex = groups.findIndex(g => g.id === groupId);
    if (groupIndex === -1) return;

    const group = groups[groupIndex];
    if (!group.scripts) group.scripts = [];

    for (const result of results) {
        if (!result.success) continue;

        const existingIndex = group.scripts.findIndex(s => s.url === result.data.url);
        if (existingIndex >= 0) {
            // Update existing script
            const existing = group.scripts[existingIndex];
            existing.title = result.data.title;
            existing.image = result.data.image;
            existing.history.push(result.data.history[0]);
        } else {
            // Add new script
            group.scripts.push(result.data);
        }
    }

    groups[groupIndex] = group;
    await chrome.storage.local.set({ cc_groups: groups });
}

// Scraping function (injected into CodeCanyon pages)
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

// Badge to show number of groups
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.cc_groups) {
        const count = changes.cc_groups.newValue?.length || 0;
        chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });
        chrome.action.setBadgeBackgroundColor({ color: '#8b5cf6' });
    }
});
