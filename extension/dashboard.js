// Dashboard JavaScript - Vanilla JS for Manifest V3 CSP compliance

let groups = [];
let expandedGroupId = null;
let chartPeriod = '7d'; // Default to 7 days

// DOM Elements
const mainEl = document.getElementById('main');
const totalGroupsEl = document.getElementById('totalGroups');
const totalScriptsEl = document.getElementById('totalScripts');
const totalSalesEl = document.getElementById('totalSales');
const totalRevenueEl = document.getElementById('totalRevenue');

// Initialize
async function init() {
    console.log('Dashboard: Initializing...');
    await loadGroups();
    render();

    // Listen for storage changes
    if (chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.cc_groups) {
                console.log('Dashboard: Storage changed, reloading...');
                groups = changes.cc_groups.newValue || [];
                render();
            }
        });
    }
}

// Load groups from chrome.storage.local
async function loadGroups() {
    return new Promise((resolve) => {
        if (chrome.storage && chrome.storage.local) {
            chrome.storage.local.get('cc_groups', (data) => {
                console.log('Dashboard: Loaded data:', data);
                groups = data.cc_groups || [];
                resolve();
            });
        } else {
            console.log('Dashboard: No chrome.storage, using empty array');
            groups = [];
            resolve();
        }
    });
}

// Calculate stats
function getStats() {
    let totalScripts = 0;
    let totalSales = 0;
    let totalRevenue = 0;

    groups.forEach(group => {
        const scripts = group.scripts || [];
        totalScripts += scripts.length;

        scripts.forEach(script => {
            const latest = getLatest(script);
            totalSales += latest.sales || 0;
            totalRevenue += (latest.sales || 0) * (latest.price || 0);
        });
    });

    return { totalGroups: groups.length, totalScripts, totalSales, totalRevenue };
}

// Get latest history entry
function getLatest(script) {
    if (!script.history || script.history.length === 0) return {};
    return script.history[script.history.length - 1];
}

// Format date (just date, no hour)
function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Get date key (YYYY-MM-DD)
function getDateKey(dateStr) {
    return new Date(dateStr).toISOString().split('T')[0];
}

// Filter history by period
function filterByPeriod(history, period) {
    const now = new Date();
    let cutoff;

    switch (period) {
        case '1d': cutoff = new Date(now - 24 * 60 * 60 * 1000); break;
        case '3d': cutoff = new Date(now - 3 * 24 * 60 * 60 * 1000); break;
        case '7d': cutoff = new Date(now - 7 * 24 * 60 * 60 * 1000); break;
        default: cutoff = new Date(now - 7 * 24 * 60 * 60 * 1000);
    }

    return history.filter(h => new Date(h.date) >= cutoff);
}

// Render the dashboard
function render() {
    // Update stats
    const stats = getStats();
    totalGroupsEl.textContent = stats.totalGroups;
    totalScriptsEl.textContent = stats.totalScripts;
    totalSalesEl.textContent = stats.totalSales.toLocaleString();
    totalRevenueEl.textContent = '$' + stats.totalRevenue.toLocaleString();

    // Render main content
    if (groups.length === 0) {
        mainEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i class="ri-folder-add-line"></i></div>
                <h2>No Groups Yet</h2>
                <p>Use the <strong>CodeCanyon Tracker</strong> extension to create groups, add links, scrape data, and it will appear here automatically.</p>
            </div>
        `;
        return;
    }

    mainEl.innerHTML = `<div class="groups-list">${groups.map(renderGroup).join('')}</div>`;

    // Add event listeners
    addEventListeners();
}

function addEventListeners() {
    document.querySelectorAll('.group-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.closest('.btn-icon')) return;
            const groupId = header.dataset.groupId;
            expandedGroupId = expandedGroupId === groupId ? null : groupId;
            render();
        });
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const groupName = btn.dataset.groupName;
            if (confirm(`Delete group "${groupName}" and all its data?`)) {
                groups = groups.filter(g => g.name !== groupName);
                chrome.storage.local.set({ cc_groups: groups });
                render();
            }
        });
    });

    // Chart period buttons
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            chartPeriod = btn.dataset.period;
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Re-render all charts for all groups
            groups.forEach(group => {
                const groupId = group.id || group.name;
                if (group.scripts) {
                    renderCharts(groupId, group.scripts, chartPeriod);
                }
            });
        });
    });

    // Render charts for each expanded group
    groups.forEach(group => {
        const isExpanded = expandedGroupId === group.id || expandedGroupId === group.name;
        if (isExpanded && group.scripts) {
            setTimeout(() => {
                renderCharts(group.id || group.name, group.scripts, chartPeriod);
            }, 50);
        }
    });
}

// Render a group card
function renderGroup(group) {
    const isExpanded = expandedGroupId === group.id || expandedGroupId === group.name;
    const scripts = group.scripts || [];

    let totalSales = 0;
    let totalRevenue = 0;
    scripts.forEach(script => {
        const latest = getLatest(script);
        totalSales += latest.sales || 0;
        totalRevenue += (latest.sales || 0) * (latest.price || 0);
    });

    return `
        <div class="group-card ${isExpanded ? 'expanded' : ''}">
            <div class="group-header" data-group-id="${group.id || group.name}">
                <div class="group-info">
                    <div class="group-icon"><i class="ri-folder-3-fill"></i></div>
                    <div>
                        <div class="group-name">${escapeHtml(group.name)}</div>
                        <div class="group-count">${scripts.length} scripts tracked</div>
                    </div>
                </div>
                <div class="group-stats">
                    <div class="group-stat">
                        <div class="group-stat-value sales">${totalSales.toLocaleString()}</div>
                        <div class="group-stat-label">Total Sales</div>
                    </div>
                    <div class="group-stat">
                        <div class="group-stat-value revenue">$${totalRevenue.toLocaleString()}</div>
                        <div class="group-stat-label">Est. Revenue</div>
                    </div>
                </div>
                <div class="group-actions">
                    <button class="btn-icon btn-delete" data-group-name="${escapeHtml(group.name)}">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                    <i class="ri-arrow-down-s-line chevron"></i>
                </div>
            </div>
            <div class="group-body">
                ${scripts.length > 0 ? `
                    ${renderComparisonTable(scripts)}
                    ${renderChartSection(group)}
                ` : '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">No scripts in this group yet.</p>'}
            </div>
        </div>
    `;
}

// Render comparison table with history columns (one per day)
function renderComparisonTable(scripts) {
    // Get all unique DATES (not datetime) from all scripts (last 15 days)
    const allDates = new Set();
    scripts.forEach(script => {
        (script.history || []).forEach(h => {
            allDates.add(getDateKey(h.date));
        });
    });

    // Sort dates and get last 15
    const sortedDates = Array.from(allDates).sort().slice(-15);

    // Sort scripts by latest sales
    const sortedScripts = [...scripts].sort((a, b) => {
        const aLatest = getLatest(a);
        const bLatest = getLatest(b);
        return (bLatest.sales || 0) - (aLatest.sales || 0);
    });

    return `
        <div class="comparison-container">
            <table class="comparison-table">
                <thead>
                    <tr>
                        <th class="sticky-col">Script Details</th>
                        ${sortedDates.map(date => `<th class="date-col">${formatDate(date)}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${sortedScripts.map((script, index) => renderComparisonRow(script, index, sortedDates)).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Render comparison row
function renderComparisonRow(script, index, dates) {
    const latest = getLatest(script);
    const revenue = (latest.sales || 0) * (latest.price || 0);

    // Create a map of dateKey -> latest history entry for that day
    const historyByDate = {};
    (script.history || []).forEach(h => {
        const dateKey = getDateKey(h.date);
        // Keep the latest entry for each date
        if (!historyByDate[dateKey] || new Date(h.date) > new Date(historyByDate[dateKey].date)) {
            historyByDate[dateKey] = h;
        }
    });

    return `
        <tr>
            <td class="sticky-col script-details">
                <div class="script-cell">
                    <span class="script-rank">${index + 1}</span>
                    ${script.image
            ? `<img src="${script.image}" alt="" class="script-image">`
            : '<div class="script-placeholder"><i class="ri-code-box-line"></i></div>'}
                    <div class="script-info">
                        <div class="script-title" title="${escapeHtml(script.title)}">${escapeHtml(script.title)}</div>
                        <div class="script-author">by ${escapeHtml(script.author || 'Unknown')}</div>
                        <div class="script-meta">
                            <span class="meta-revenue">≈ $${revenue.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </td>
            ${dates.map(dateKey => {
                const entry = historyByDate[dateKey];
                if (entry) {
                    return `
                        <td class="history-cell">
                            <div class="cell-sales">${entry.sales.toLocaleString()}</div>
                            <div class="cell-price">$${entry.price}</div>
                        </td>
                    `;
                }
                return `<td class="history-cell empty">—</td>`;
            }).join('')}
        </tr>
    `;
}

// Render chart section with multiple charts
function renderChartSection(group) {
    const groupId = (group.id || group.name).replace(/[^a-zA-Z0-9]/g, '_');
    return `
        <div class="chart-section">
            <div class="chart-header">
                <h3><i class="ri-line-chart-line"></i> Analytics</h3>
                <div class="period-buttons">
                    <button class="period-btn ${chartPeriod === '1d' ? 'active' : ''}" data-period="1d">1 Day</button>
                    <button class="period-btn ${chartPeriod === '3d' ? 'active' : ''}" data-period="3d">3 Days</button>
                    <button class="period-btn ${chartPeriod === '7d' ? 'active' : ''}" data-period="7d">7 Days</button>
                </div>
            </div>
            
            <div class="charts-grid">
                <!-- Line Chart - Sales Trend -->
                <div class="chart-box">
                    <h4><i class="ri-line-chart-fill"></i> Sales Trend</h4>
                    <div class="chart-container" data-group-id="${group.id || group.name}" data-chart-type="line">
                        <canvas id="line_${groupId}"></canvas>
                    </div>
                </div>
                
                <!-- Bar Chart - Sales by Script -->
                <div class="chart-box">
                    <h4><i class="ri-bar-chart-fill"></i> Sales by Script</h4>
                    <div class="chart-container" data-group-id="${group.id || group.name}" data-chart-type="bar">
                        <canvas id="bar_${groupId}"></canvas>
                    </div>
                </div>
                
                <!-- Pie Chart - Revenue Distribution -->
                <div class="chart-box">
                    <h4><i class="ri-pie-chart-fill"></i> Revenue Share</h4>
                    <div class="chart-container" data-group-id="${group.id || group.name}" data-chart-type="pie">
                        <canvas id="pie_${groupId}"></canvas>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Render all charts
function renderCharts(groupId, scripts, period) {
    const containers = document.querySelectorAll(`.chart-container[data-group-id="${groupId}"]`);
    containers.forEach(container => {
        const type = container.dataset.chartType;
        const canvas = container.querySelector('canvas');
        if (!canvas) return;

        // Set canvas size
        canvas.width = container.offsetWidth || 400;
        canvas.height = 200;

        switch (type) {
            case 'line': renderLineChart(canvas, scripts, period); break;
            case 'bar': renderBarChart(canvas, scripts); break;
            case 'pie': renderPieChart(canvas, scripts); break;
        }
    });
}

// Line Chart - Sales Trend
function renderLineChart(canvas, scripts, period) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Aggregate data by date
    const dataByDate = {};
    scripts.forEach(script => {
        const filtered = filterByPeriod(script.history || [], period);
        filtered.forEach(h => {
            const key = getDateKey(h.date);
            if (!dataByDate[key]) dataByDate[key] = 0;
            dataByDate[key] += h.sales || 0;
        });
    });

    const dates = Object.keys(dataByDate).sort();
    if (dates.length === 0) {
        drawNoData(ctx, width, height);
        return;
    }

    const values = dates.map(d => dataByDate[d]);
    const maxVal = Math.max(...values, 1);

    const padding = { top: 20, right: 20, bottom: 30, left: 50 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Draw grid
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
    }

    // Draw line
    ctx.strokeStyle = '#6cc832';
    ctx.lineWidth = 3;
    ctx.beginPath();
    values.forEach((val, i) => {
        const x = padding.left + (i / Math.max(values.length - 1, 1)) * chartW;
        const y = padding.top + chartH - (val / maxVal) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw points
    ctx.fillStyle = '#6cc832';
    values.forEach((val, i) => {
        const x = padding.left + (i / Math.max(values.length - 1, 1)) * chartW;
        const y = padding.top + chartH - (val / maxVal) * chartH;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
    });

    // Y-axis labels
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
        const val = Math.round((maxVal / 4) * (4 - i));
        const y = padding.top + (chartH / 4) * i + 4;
        ctx.fillText(val.toLocaleString(), padding.left - 5, y);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    const step = Math.ceil(dates.length / 5);
    dates.forEach((d, i) => {
        if (i % step === 0 || i === dates.length - 1) {
            const x = padding.left + (i / Math.max(dates.length - 1, 1)) * chartW;
            ctx.fillText(formatDate(d), x, height - 5);
        }
    });
}

// Bar Chart - Sales by Script
function renderBarChart(canvas, scripts) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    if (scripts.length === 0) {
        drawNoData(ctx, width, height);
        return;
    }

    // Get latest sales for each script (top 6)
    const data = scripts.slice(0, 6).map(s => ({
        name: (s.title || 'Unknown').substring(0, 12),
        sales: getLatest(s).sales || 0
    }));

    const maxVal = Math.max(...data.map(d => d.sales), 1);
    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;
    const barW = chartW / data.length * 0.7;
    const gap = chartW / data.length * 0.3;

    const colors = ['#6cc832', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

    data.forEach((d, i) => {
        const x = padding.left + (chartW / data.length) * i + gap / 2;
        const barH = (d.sales / maxVal) * chartH;
        const y = padding.top + chartH - barH;

        // Draw bar
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(x, y, barW, barH);

        // Draw value on top
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(d.sales.toLocaleString(), x + barW / 2, y - 5);

        // Draw label
        ctx.fillStyle = '#64748b';
        ctx.font = '9px Inter, sans-serif';
        ctx.save();
        ctx.translate(x + barW / 2, height - 5);
        ctx.rotate(-0.3);
        ctx.fillText(d.name, 0, 0);
        ctx.restore();
    });
}

// Pie Chart - Revenue Distribution
function renderPieChart(canvas, scripts) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    if (scripts.length === 0) {
        drawNoData(ctx, width, height);
        return;
    }

    // Get revenue for each script (top 5)
    const data = scripts.slice(0, 5).map(s => {
        const latest = getLatest(s);
        return {
            name: (s.title || 'Unknown').substring(0, 10),
            revenue: (latest.sales || 0) * (latest.price || 0)
        };
    }).filter(d => d.revenue > 0);

    if (data.length === 0) {
        drawNoData(ctx, width, height);
        return;
    }

    const total = data.reduce((acc, d) => acc + d.revenue, 0);
    const colors = ['#6cc832', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6'];

    const centerX = width / 2 - 40;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 30;

    let startAngle = -Math.PI / 2;

    data.forEach((d, i) => {
        const sliceAngle = (d.revenue / total) * Math.PI * 2;

        // Draw slice
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();

        startAngle += sliceAngle;
    });

    // Draw legend
    ctx.font = '9px Inter, sans-serif';
    data.forEach((d, i) => {
        const y = 20 + i * 18;
        const x = width - 80;

        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(x, y - 8, 10, 10);

        ctx.fillStyle = '#1e293b';
        ctx.textAlign = 'left';
        ctx.fillText(d.name, x + 14, y);
    });
}

// Draw "No data" message
function drawNoData(ctx, width, height) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data available', width / 2, height / 2);
}

// Escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Start
init();
