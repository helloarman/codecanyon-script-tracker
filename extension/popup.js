// DOM Elements
const pageStatus = document.getElementById('pageStatus');
const newGroupName = document.getElementById('newGroupName');
const addGroupBtn = document.getElementById('addGroupBtn');
const groupsList = document.getElementById('groupsList');
const openDashboardBtn = document.getElementById('openDashboardBtn');

// Dashboard URL - open the index.html from inside the extension
const DASHBOARD_URL = chrome.runtime.getURL('index.html');

let groups = [];
let pageType = 'other'; // 'dashboard' or 'other'
let expandedGroupId = null;

// Initialize
async function init() {
    await detectPageType();
    await loadGroups();
    renderGroups();
}

// Detect if we're on the dashboard page
async function detectPageType() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const url = tab.url || '';

        if (url.includes('codecanyon-scraper') || url.includes('index.html')) {
            pageType = 'dashboard';
            pageStatus.className = 'status-badge dashboard';
            pageStatus.textContent = 'Dashboard';
        } else if (url.includes('codecanyon.net')) {
            pageType = 'codecanyon';
            pageStatus.className = 'status-badge codecanyon';
            pageStatus.textContent = 'CodeCanyon';
        } else {
            pageType = 'other';
            pageStatus.className = 'status-badge';
            pageStatus.textContent = 'Ready';
        }
    } catch (err) {
        console.error('Error detecting page:', err);
    }
}

// Load groups from storage
async function loadGroups() {
    const data = await chrome.storage.local.get('cc_groups');
    groups = data.cc_groups || [];
}

// Save groups to storage
async function saveGroups() {
    await chrome.storage.local.set({ cc_groups: groups });
}

// Add new group
async function addGroup() {
    const name = newGroupName.value.trim();
    if (!name) return;

    const newGroup = {
        id: 'group_' + Date.now(),
        name: name,
        links: [],
        scripts: []
    };

    groups.push(newGroup);
    await saveGroups();
    newGroupName.value = '';

    // Auto-expand the new group so user can add links immediately
    expandedGroupId = newGroup.id;

    renderGroups();
}

// Delete group
async function deleteGroup(groupId) {
    if (!confirm('Delete this group and all its data?')) return;
    groups = groups.filter(g => g.id !== groupId);
    await saveGroups();
    renderGroups();
}

// Add link to group
async function addLinkToGroup(groupId, url) {
    if (!url || !url.includes('codecanyon.net')) {
        alert('Please enter a valid CodeCanyon URL');
        return;
    }

    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    if (group.links.includes(url)) {
        alert('This URL is already in the group');
        return;
    }

    group.links.push(url);
    await saveGroups();
    renderGroups();
}

// Remove link from group
async function removeLinkFromGroup(groupId, url) {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    group.links = group.links.filter(l => l !== url);
    await saveGroups();
    renderGroups();
}

// Scrape all links in a group
async function scrapeGroup(groupId) {
    const group = groups.find(g => g.id === groupId);
    if (!group || group.links.length === 0) {
        alert('No links to scrape in this group');
        return;
    }

    const scrapeBtn = document.querySelector(`[data-scrape-btn="${groupId}"]`);
    const progressContainer = document.querySelector(`[data-progress="${groupId}"]`);
    const progressBar = progressContainer.querySelector('.fill');
    const progressText = progressContainer.querySelector('.progress-text');

    scrapeBtn.disabled = true;
    scrapeBtn.innerHTML = '<span class="spinner"></span> Scraping...';
    progressContainer.classList.remove('hidden');

    try {
        const total = group.links.length;
        let completed = 0;

        for (const url of group.links) {
            progressText.textContent = `Scraping ${completed + 1} of ${total}...`;
            progressBar.style.width = `${(completed / total) * 100}%`;

            // Open tab, scrape, close
            try {
                const tab = await chrome.tabs.create({ url, active: false });

                // Wait for load
                await new Promise(resolve => {
                    const listener = (tabId, info) => {
                        if (tabId === tab.id && info.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve();
                        }
                    };
                    chrome.tabs.onUpdated.addListener(listener);
                    setTimeout(() => {
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve();
                    }, 20000);
                });

                // Extra wait for dynamic content
                await new Promise(r => setTimeout(r, 2000));

                // Scrape
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: scrapeCodeCanyon
                });

                const data = results[0]?.result;

                if (data && data.title) {
                    // Add or update script in group
                    const existingIdx = group.scripts.findIndex(s => s.url === data.url || s.url === url);

                    if (existingIdx >= 0) {
                        group.scripts[existingIdx].title = data.title;
                        group.scripts[existingIdx].image = data.image;
                        group.scripts[existingIdx].author = data.author;
                        group.scripts[existingIdx].history.push({
                            date: new Date().toISOString(),
                            sales: data.sales,
                            price: data.price
                        });
                    } else {
                        group.scripts.push({
                            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
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
                        });
                    }
                }

                // Close tab
                await chrome.tabs.remove(tab.id);

            } catch (err) {
                console.error('Error scraping', url, err);
            }

            completed++;
            progressBar.style.width = `${(completed / total) * 100}%`;
        }

        await saveGroups();
        progressText.textContent = `Done! Scraped ${completed} items`;

        setTimeout(() => {
            progressContainer.classList.add('hidden');
            renderGroups();
        }, 2000);

    } catch (err) {
        console.error('Batch scrape error:', err);
        alert('Error during scraping: ' + err.message);
    }

    scrapeBtn.disabled = false;
    scrapeBtn.innerHTML = '⚡ Scrape All';
}

// Sync group to dashboard
async function syncToDashboard(groupId) {
    const group = groups.find(g => g.id === groupId);
    if (!group || group.scripts.length === 0) {
        alert('No scraped data to sync. Scrape some links first!');
        return;
    }

    const syncBtn = document.querySelector(`[data-sync-btn="${groupId}"]`);
    syncBtn.disabled = true;
    syncBtn.innerHTML = '<span class="spinner"></span> Syncing...';

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: injectGroupToDashboard,
            args: [group.name, group.scripts]
        });

        syncBtn.innerHTML = '✓ Synced!';

        setTimeout(() => {
            syncBtn.disabled = false;
            syncBtn.innerHTML = '📤 Sync to Dashboard';
        }, 2000);

    } catch (err) {
        console.error('Sync error:', err);
        alert('Error syncing: ' + err.message);
        syncBtn.disabled = false;
        syncBtn.innerHTML = '📤 Sync to Dashboard';
    }
}

// Function injected to dashboard
function injectGroupToDashboard(groupName, scripts) {
    try {
        // Get existing data
        const existingStr = localStorage.getItem('cc_tracker_groups');
        const existingGroups = existingStr ? JSON.parse(existingStr) : [];

        // Find or create group
        let groupIdx = existingGroups.findIndex(g => g.name === groupName);
        if (groupIdx === -1) {
            existingGroups.push({ name: groupName, scripts: [] });
            groupIdx = existingGroups.length - 1;
        }

        const group = existingGroups[groupIdx];

        // Merge scripts
        scripts.forEach(newScript => {
            const existingIdx = group.scripts.findIndex(s => s.url === newScript.url);
            if (existingIdx >= 0) {
                // Merge history
                const existingDates = new Set(group.scripts[existingIdx].history.map(h => h.date));
                const newHistory = newScript.history.filter(h => !existingDates.has(h.date));
                group.scripts[existingIdx].history.push(...newHistory);
                group.scripts[existingIdx].title = newScript.title;
                group.scripts[existingIdx].image = newScript.image;
            } else {
                group.scripts.push(newScript);
            }
        });

        existingGroups[groupIdx] = group;
        localStorage.setItem('cc_tracker_groups', JSON.stringify(existingGroups));

        // Reload page
        location.reload();

        return { success: true };
    } catch (err) {
        console.error('Inject error:', err);
        return { success: false, error: err.message };
    }
}

// Scraping function
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
            const priceSelectors = ['.js-adi__item-sale-price', '.adi__item-sale-price'];
            for (const sel of priceSelectors) {
                const el = document.querySelector(sel);
                if (el) {
                    const cleaned = el.innerText.replace(/[^0-9.]/g, '');
                    if (cleaned) { price = parseFloat(cleaned); break; }
                }
            }
        }

        let sales = 0;
        const salesWrapper = document.querySelector('.item-header__sales-count');
        if (salesWrapper) {
            const strongTag = salesWrapper.querySelector('strong');
            if (strongTag) {
                sales = parseInt(strongTag.innerText.replace(/[^0-9]/g, ''), 10) || 0;
            }
            if (!sales) {
                sales = parseInt(salesWrapper.innerText.replace(/[^0-9]/g, ''), 10) || 0;
            }
        }

        const imageEl = document.querySelector('meta[property="og:image"]');
        const image = imageEl ? imageEl.content : null;

        const authorEl = document.querySelector('a.js-by-author');
        const author = authorEl ? authorEl.innerText.trim() : 'Unknown';

        return { title, price, sales, image, author, url: window.location.href };
    } catch (err) {
        return null;
    }
}

// Render groups
function renderGroups() {
    if (groups.length === 0) {
        groupsList.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
        </svg>
        <p>No groups yet. Create one above!</p>
      </div>
    `;
        return;
    }

    groupsList.innerHTML = groups.map(group => `
    <div class="group-card ${expandedGroupId === group.id ? 'expanded' : ''}" data-group-id="${group.id}">
      <div class="group-header">
        <span class="group-name">
          <span class="chevron">▶</span>
          ${escapeHtml(group.name)}
        </span>
        <div class="group-stats">
          <span>🔗 ${group.links.length}</span>
          <span>📦 ${group.scripts.length}</span>
        </div>
      </div>
      <div class="group-body">
        <!-- Add Link -->
        <div class="add-link-form">
          <input type="url" placeholder="Paste CodeCanyon URL" id="linkInput_${group.id}">
          <button class="btn btn-primary btn-sm" data-action="add-link">+</button>
        </div>
        
        <!-- Links -->
        ${group.links.length > 0 ? `
          <div class="link-list">
            ${group.links.map(link => `
              <div class="link-item">
                <a href="${link}" target="_blank" title="${link}">${getLinkTitle(link)}</a>
                <span class="remove-link" data-action="remove-link" data-url="${escapeHtml(link)}">✕</span>
              </div>
            `).join('')}
          </div>
        ` : '<p style="color:#64748b;font-size:11px;margin-bottom:10px;">No links added yet</p>'}
        
        <!-- Progress -->
        <div class="hidden" data-progress="${group.id}">
          <p class="progress-text">Preparing...</p>
          <div class="progress-bar"><div class="fill" style="width:0%"></div></div>
        </div>
        
        <!-- Scraped Scripts -->
        ${group.scripts.length > 0 ? `
          <div class="section-title" style="margin-top:10px;">Scraped Data (${group.scripts.length})</div>
          <div class="script-list">
            ${group.scripts.slice(0, 5).map(script => `
              <div class="script-item">
                ${script.image ? `<img src="${script.image}" alt="">` : '<div style="width:32px;height:32px;background:#334155;border-radius:4px;"></div>'}
                <div class="script-info">
                  <div class="script-title">${escapeHtml(script.title)}</div>
                  <div class="script-stats">
                    <span class="sales">${script.sales} sales</span> · 
                    <span class="price">$${script.price}</span>
                  </div>
                </div>
              </div>
            `).join('')}
            ${group.scripts.length > 5 ? `<p style="color:#64748b;font-size:10px;text-align:center;">+${group.scripts.length - 5} more</p>` : ''}
          </div>
        ` : ''}
        
        <!-- Actions -->
        <div class="group-actions">
          <button class="btn btn-success btn-sm" data-scrape-btn="${group.id}" data-action="scrape" ${group.links.length === 0 ? 'disabled' : ''}>
            ⚡ Scrape All
          </button>
          ${pageType === 'dashboard' ? `
            <button class="btn btn-primary btn-sm" data-sync-btn="${group.id}" data-action="sync" ${group.scripts.length === 0 ? 'disabled' : ''}>
              📤 Sync to Dashboard
            </button>
          ` : ''}
          <button class="btn btn-danger btn-sm" data-action="delete">🗑</button>
        </div>
      </div>
    </div>
  `).join('');
}

// Toggle group expand/collapse
function toggleGroup(groupId) {
    expandedGroupId = expandedGroupId === groupId ? null : groupId;
    renderGroups();
}

// Handle add link
function handleAddLink(groupId) {
    const input = document.getElementById(`linkInput_${groupId}`);
    if (input) {
        addLinkToGroup(groupId, input.value.trim());
        input.value = '';
    }
}

// Handle remove link
function handleRemoveLink(groupId, url) {
    removeLinkFromGroup(groupId, url);
}

// Extract item name from URL
function getLinkTitle(url) {
    try {
        const match = url.match(/\/item\/([^\/]+)/);
        if (match) {
            return match[1].replace(/-/g, ' ').replace(/\d+$/, '').trim();
        }
    } catch (e) { }
    return url;
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Event Listeners
addGroupBtn.addEventListener('click', addGroup);
newGroupName.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addGroup();
});

// Open dashboard button
openDashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: DASHBOARD_URL });
});

// Event delegation for dynamically created elements
groupsList.addEventListener('click', (e) => {
    const target = e.target;

    // Find the closest button or clickable element
    const groupHeader = target.closest('.group-header');
    const addLinkBtn = target.closest('[data-action="add-link"]');
    const removeLinkBtn = target.closest('[data-action="remove-link"]');
    const scrapeBtn = target.closest('[data-action="scrape"]');
    const syncBtn = target.closest('[data-action="sync"]');
    const deleteBtn = target.closest('[data-action="delete"]');

    // Get parent group card
    const groupCard = target.closest('.group-card');
    const groupId = groupCard?.dataset.groupId;

    if (groupHeader && groupId) {
        // Don't toggle if clicking on a button inside the header
        if (!target.closest('button')) {
            toggleGroup(groupId);
        }
    }

    if (addLinkBtn && groupId) {
        handleAddLink(groupId);
    }

    if (removeLinkBtn) {
        const url = removeLinkBtn.dataset.url;
        if (url && groupId) {
            removeLinkFromGroup(groupId, url);
        }
    }

    if (scrapeBtn && groupId) {
        scrapeGroup(groupId);
    }

    if (syncBtn && groupId) {
        syncToDashboard(groupId);
    }

    if (deleteBtn && groupId) {
        deleteGroup(groupId);
    }
});

// Initialize
init();
