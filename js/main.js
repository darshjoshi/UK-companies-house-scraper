document.addEventListener('DOMContentLoaded', function() {
    // Search form handling
    document.getElementById('searchForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await extractCompanyData();
    });

    // Initialize performance monitoring
    initPerformanceMonitoring();
});

async function extractCompanyData() {
    const companyName = document.getElementById('companyInput').value.trim();
    const loadingSection = document.getElementById('loadingSection');
    const resultsContainer = document.getElementById('resultsContainer');
    const searchButton = document.getElementById('searchButton');

    loadingSection.style.display = 'block';
    resultsContainer.style.display = 'none';
    searchButton.disabled = true;
    searchButton.textContent = 'Extracting...';

    try {
        const response = await fetch('/api/enhanced-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ company: companyName })
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Failed to extract company data');
        }

        displayResults(result);

    } catch (error) {
        displayError(error.message);
    } finally {
        loadingSection.style.display = 'none';
        searchButton.disabled = false;
        searchButton.textContent = 'Extract Complete Intelligence';
    }
}

function displayError(message) {
    document.getElementById('resultsContainer').innerHTML = 
        `<div class="error-message">❌ <strong>Error:</strong> ${message}</div>`;
    document.getElementById('resultsContainer').style.display = 'block';
}

function displayResults(data) {
    console.log('Received enhanced data:', data);
    
    const resultsContainer = document.getElementById('resultsContainer');
    const dataGrid = document.getElementById('dataGrid');
    
    resultsContainer.style.display = 'block';

    // Display quality banner
    displayQualityBanner(data.metadata.qualityAssessment);

    // Display PDF diagnostics
    showPDFExtractionStats(data);

    // Display enhanced statistics
    if (data.metadata.filingStatistics) {
        displayEnhancedStatistics(data.metadata.filingStatistics);
    }

    // Clear previous results
    dataGrid.innerHTML = '';

    // Display sections
    if (data.data.overview) {
        dataGrid.appendChild(createOverviewCard(data.data.overview));
    }

    if (data.data.people && data.data.people.officers && data.data.people.officers.length > 0) {
        dataGrid.appendChild(createOfficersCard(data.data.people.officers));
    }

    if (data.data.charges) {
        dataGrid.appendChild(createChargesCard(data.data.charges));
    }

    if (data.data.filing && data.data.filing.filings && data.data.filing.filings.length > 0) {
        dataGrid.appendChild(createEnhancedFilingTable(data.data.filing, data.metadata.filingStatistics));
    }

    if (data.llm_summary) {
        dataGrid.appendChild(createSummaryCard(data.llm_summary, data.metadata));
    }
}

function displayQualityBanner(qualityAssessment) {
    const banner = document.getElementById('qualityBanner');
    const score = qualityAssessment.score;
    
    let scoreClass = 'excellent';
    let bannerClass = '';
    let icon = '✅';
    
    if (score < 40) {
        scoreClass = 'poor';
        bannerClass = 'error';
        icon = '❌';
    } else if (score < 60) {
        scoreClass = 'fair';
        bannerClass = 'warning';
        icon = '⚠️';
    } else if (score < 80) {
        scoreClass = 'good';
        icon = '🔶';
    }
    
    banner.className = `quality-banner ${bannerClass}`;
    banner.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div class="quality-score ${scoreClass}">${icon} Quality Score: ${score}/100</div>
                <div style="font-size: 0.9rem; margin-top: 0.5rem;">
                    ${qualityAssessment.issues.length} issues detected, 
                    ${qualityAssessment.recommendations.length} recommendations
                </div>
            </div>
            <div style="text-align: right; font-size: 0.8rem; color: var(--text-secondary);">
                Enhanced v3.0 Assessment
            </div>
        </div>
    `;
}

function displayEnhancedStatistics(stats) {
    const statsHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number">${stats.totalFilings || 0}</div>
                <div class="stat-label">Total Filings</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.filingsWithPDFs || 0}</div>
                <div class="stat-label">PDF Documents</div>
                <div class="success-indicator">
                    📄 ${stats.pdfSuccessRate || 0}% extracted
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.totalPDFPages || 0}</div>
                <div class="stat-label">Total PDF Pages</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.pagesScraped || 1}</div>
                <div class="stat-label">Pages Scraped</div>
            </div>
        </div>
    `;
    document.getElementById('statsSection').innerHTML = statsHTML;
}

function createOverviewCard(overview) {
    const statusClass = overview.status?.toLowerCase().includes('active') ? 'status-active' : 
                       overview.status?.toLowerCase().includes('dissolved') ? 'status-dissolved' : 'status-default';

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
        <div class="card-header">
            📋 Company Overview
            <div class="card-badge">v3.0</div>
        </div>
        <div class="card-content">
            <div class="info-row">
                <span class="info-label">Company Name</span>
                <span class="info-value">${overview.companyName || 'N/A'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Company Number</span>
                <span class="info-value">${overview.companyNumber || 'N/A'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Status</span>
                <span class="info-value">
                    <span class="status-badge ${statusClass}">${overview.status || 'Unknown'}</span>
                </span>
            </div>
            <div class="info-row">
                <span class="info-label">Incorporated</span>
                <span class="info-value">${overview.incorporationDate || 'N/A'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Company Type</span>
                <span class="info-value">${overview.companyType || 'N/A'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Address</span>
                <span class="info-value">${overview.registeredAddress || 'N/A'}</span>
            </div>
        </div>
    `;
    return card;
}

function createSummaryCard(summary, metadata) {
    const card = document.createElement('div');
    card.className = 'card summary-section';
    card.innerHTML = `
        <div class="card-header">
            🤖 Enhanced AI Business Intelligence
            <div class="card-badge">v3.0</div>
        </div>
        <div class="summary-content">${summary}</div>
        <div class="performance-info">
            <strong>Extraction Performance:</strong> 
            ${metadata.processingTime} | 
            Quality Score: ${metadata.qualityAssessment.score}/100 | 
            Multi-strategy extraction enabled
        </div>
    `;
    return card;
}

// Performance monitoring
function initPerformanceMonitoring() {
    // Track page load performance
    window.addEventListener('load', function() {
        const pageLoadTime = performance.now();
        console.log(`Page loaded in ${Math.round(pageLoadTime)}ms`);
    });
    
    // Track API response times
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const start = performance.now();
        try {
            const response = await originalFetch.apply(this, args);
            const end = performance.now();
            const url = args[0];
            console.log(`API call to ${url} completed in ${Math.round(end - start)}ms`);
            return response;
        } catch (error) {
            const end = performance.now();
            console.error(`API call failed after ${Math.round(end - start)}ms`, error);
            throw error;
        }
    };
}