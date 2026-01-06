// Background service worker for CodeCanyon Tracker Extension

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getScripts') {
        // Return saved scripts
        chrome.storage.local.get('cc_scripts', (data) => {
            sendResponse({ scripts: data.cc_scripts || [] });
        });
        return true; // Keep channel open for async response
    }

    if (request.action === 'clearScripts') {
        chrome.storage.local.remove('cc_scripts', () => {
            sendResponse({ success: true });
        });
        return true;
    }
});

// Optional: Badge to show number of tracked scripts
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.cc_scripts) {
        const count = changes.cc_scripts.newValue?.length || 0;
        chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });
        chrome.action.setBadgeBackgroundColor({ color: '#059669' });
    }
});
