// Content script for CodeCanyon Tracker Dashboard
// This script bridges chrome.storage.local with the page's localStorage

console.log('[CC Tracker] Content script loaded on:', window.location.href);

// Function to sync extension data to page localStorage
async function syncToLocalStorage() {
    try {
        const data = await chrome.storage.local.get('cc_scripts');
        const scripts = data.cc_scripts || [];

        // Write to localStorage so the page can read it
        localStorage.setItem('cc_extension_scripts', JSON.stringify(scripts));
        localStorage.setItem('cc_extension_ready', 'true');
        localStorage.setItem('cc_extension_timestamp', Date.now().toString());

        console.log('[CC Tracker] Synced', scripts.length, 'scripts to localStorage');

        // Dispatch a custom event so the page knows data is ready
        window.dispatchEvent(new CustomEvent('cc_extension_synced', {
            detail: { count: scripts.length }
        }));
    } catch (err) {
        console.error('[CC Tracker] Sync error:', err);
    }
}

// Mark extension as ready immediately
localStorage.setItem('cc_extension_ready', 'true');

// Sync on load
syncToLocalStorage();

// Also sync after delays to ensure React has mounted
setTimeout(syncToLocalStorage, 1000);
setTimeout(syncToLocalStorage, 3000);

// Listen for manual sync requests via custom event
window.addEventListener('cc_request_sync', () => {
    console.log('[CC Tracker] Manual sync requested');
    syncToLocalStorage();
});

// Clear extension data if requested
window.addEventListener('cc_clear_extension', async () => {
    try {
        await chrome.storage.local.remove('cc_scripts');
        localStorage.removeItem('cc_extension_scripts');
        console.log('[CC Tracker] Extension data cleared');
    } catch (err) {
        console.error('[CC Tracker] Clear error:', err);
    }
});
