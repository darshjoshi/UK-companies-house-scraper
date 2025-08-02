// Session management
let userSessionId = localStorage.getItem('userSessionId') || null;

document.addEventListener('DOMContentLoaded', function() {
    // Search form handling
    document.getElementById('searchForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await extractCompanyData();
    });

    // Initialize saved reports functionality
    initSavedReports();
    
    // Initialize performance monitoring
    initPerformanceMonitoring();
    
    // Check if a report ID is provided in URL parameters
    checkForReportIdInURL();
});

async function extractCompanyData() {
    const companyName = document.getElementById('companyInput').value.trim();
    const maxPages = document.getElementById('maxPages')?.value || 10;
    const maxPeoplePages = document.getElementById('maxPeoplePages')?.value || 5;
    const loadingSection = document.getElementById('loadingSection');
    const resultsContainer = document.getElementById('resultsContainer');
    const searchButton = document.getElementById('searchButton');

    // Check for existing report first
    const shouldProceed = await checkForDuplicateReport(companyName);
    if (!shouldProceed) {
        return; // User chose not to proceed
    }

    loadingSection.style.display = 'block';
    loadingSection.classList.add('fade-in');
    resultsContainer.style.display = 'none';
    resultsContainer.classList.remove('fade-in');
    searchButton.disabled = true;
    searchButton.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div> Extracting Intelligence...';
    searchButton.classList.add('loading');

    // Start progress simulation
    simulateProgressForLongExtraction(parseInt(maxPages));

    try {
        const response = await fetch('/api/enhanced-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                company: companyName,
                maxPages: parseInt(maxPages),
                maxPeoplePages: parseInt(maxPeoplePages)
            })
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
        loadingSection.classList.remove('fade-in');
        searchButton.disabled = false;
        searchButton.innerHTML = 'Extract Complete Intelligence';
        searchButton.classList.remove('loading');
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
    resultsContainer.classList.add('fade-in');

    // Display quality banner with animation
    displayQualityBanner(data.metadata.qualityAssessment);

    // Display database status and save option
    displayDatabaseStatus(data.metadata.database);

    // Display PDF diagnostics
    showPDFExtractionStats(data);

    // Display enhanced statistics
    if (data.metadata.filingStatistics) {
        displayEnhancedStatistics(data.metadata.filingStatistics);
    }

    // Clear previous results
    dataGrid.innerHTML = '';
    dataGrid.classList.add('stagger-animation');

    // Display sections with animations
    if (data.data.overview) {
        const overviewCard = createOverviewCard(data.data.overview);
        overviewCard.classList.add('hover-lift');
        dataGrid.appendChild(overviewCard);
    }

    // Enhanced people display with clickable links
    if (data.data.people && data.data.people.officers && data.data.people.officers.length > 0) {
        // Add enhanced people card with clickable links
        const peopleCard = UIComponents.createEnhancedPeopleCard(data.data.people);
        peopleCard.classList.add('hover-lift');
        dataGrid.appendChild(peopleCard);
        
        // Add people statistics card
        const peopleStatsCard = UIComponents.createPeopleStatsCard(data.data.people);
        if (peopleStatsCard) {
            peopleStatsCard.classList.add('hover-lift');
            dataGrid.appendChild(peopleStatsCard);
        }
    }

    if (data.data.charges) {
        const chargesCard = createChargesCard(data.data.charges);
        chargesCard.classList.add('hover-lift');
        dataGrid.appendChild(chargesCard);
    }

    if (data.data.filing && data.data.filing.filings && data.data.filing.filings.length > 0) {
        const filingCard = createEnhancedFilingTable(data.data.filing, data.metadata.filingStatistics);
        filingCard.classList.add('hover-lift');
        dataGrid.appendChild(filingCard);
    }

    if (data.llm_summary) {
        const summaryCard = createSummaryCard(data.llm_summary, data.metadata);
        summaryCard.classList.add('hover-lift');
        dataGrid.appendChild(summaryCard);
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

// ===== SAVED REPORTS FUNCTIONALITY =====

// Initialize saved reports functionality
function initSavedReports() {
    // Update session ID from response if available
    if (userSessionId) {
        localStorage.setItem('userSessionId', userSessionId);
    }
    
    // Add saved reports section to the page if it doesn't exist
    addSavedReportsSection();
    
    // Load saved reports on page load
    loadSavedReports();
}

// Add saved reports section to the page
function addSavedReportsSection() {
    const existingSection = document.getElementById('savedReportsSection');
    if (existingSection) return;
    
    const mainContainer = document.querySelector('.container');
    const savedReportsHTML = `
        <div id="savedReportsSection" class="saved-reports-section" style="margin-top: 2rem; display: none;">
            <div class="section-header">
                <h2>📚 Saved Reports</h2>
                <button id="toggleSavedReports" class="btn btn-secondary">Show Saved Reports</button>
            </div>
            <div id="savedReportsContainer" class="saved-reports-container" style="display: none;">
                <div class="saved-reports-controls">
                    <input type="text" id="searchSavedReports" placeholder="Search saved reports..." class="search-input">
                    <button id="refreshSavedReports" class="btn btn-secondary">🔄 Refresh</button>
                </div>
                <div id="savedReportsList" class="saved-reports-list">
                    <div class="loading-placeholder">Loading saved reports...</div>
                </div>
            </div>
        </div>
    `;
    
    mainContainer.insertAdjacentHTML('beforeend', savedReportsHTML);
    
    // Add event listeners
    document.getElementById('toggleSavedReports').addEventListener('click', toggleSavedReportsDisplay);
    document.getElementById('refreshSavedReports').addEventListener('click', loadSavedReports);
    document.getElementById('searchSavedReports').addEventListener('input', debounce(searchSavedReports, 300));
}

// Display database status and save functionality
function displayDatabaseStatus(databaseInfo) {
    const existingStatus = document.getElementById('databaseStatus');
    if (existingStatus) {
        existingStatus.remove();
    }
    
    const statusContainer = document.createElement('div');
    statusContainer.id = 'databaseStatus';
    statusContainer.className = 'database-status';
    
    if (!databaseInfo.storageEnabled) {
        statusContainer.innerHTML = `
            <div class="alert alert-info">
                <span class="icon">ℹ️</span>
                <span>Database storage is not configured. Reports are not being saved.</span>
            </div>
        `;
    } else if (databaseInfo.saved) {
        statusContainer.innerHTML = `
            <div class="alert alert-success">
                <span class="icon">✅</span>
                <span>Report saved successfully! ID: ${databaseInfo.reportId}</span>
                <button onclick="viewSavedReport('${databaseInfo.reportId}')" class="btn btn-sm btn-outline">View Saved Report</button>
            </div>
        `;
        
        // Update session ID if we got one
        if (databaseInfo.sessionId) {
            userSessionId = databaseInfo.sessionId;
            localStorage.setItem('userSessionId', userSessionId);
        }
        
        // Show saved reports section
        const savedReportsSection = document.getElementById('savedReportsSection');
        if (savedReportsSection) {
            savedReportsSection.style.display = 'block';
        }
    } else {
        statusContainer.innerHTML = `
            <div class="alert alert-warning">
                <span class="icon">⚠️</span>
                <span>Report could not be saved to database.</span>
            </div>
        `;
    }
    
    // Insert after quality banner
    const qualityBanner = document.querySelector('.quality-banner');
    if (qualityBanner) {
        qualityBanner.parentNode.insertBefore(statusContainer, qualityBanner.nextSibling);
    }
}

// Toggle saved reports display
function toggleSavedReportsDisplay() {
    const container = document.getElementById('savedReportsContainer');
    const button = document.getElementById('toggleSavedReports');
    
    if (container.style.display === 'none') {
        // Show loading state with animation
        button.disabled = true;
        button.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div> Extracting Intelligence...';
        button.classList.add('loading');
        
        // Hide any previous results with fade out
        resultsContainer.style.display = 'none';
        resultsContainer.classList.remove('fade-in');
        button.textContent = 'Show Saved Reports';
    }
}

// Load saved reports
async function loadSavedReports() {
    if (!userSessionId) {
        document.getElementById('savedReportsList').innerHTML = `
            <div class="no-reports">
                <p>No session found. Extract a company report first to see saved reports.</p>
            </div>
        `;
        return;
    }
    
    try {
        const response = await fetch(`/api/reports?sessionId=${userSessionId}&limit=20`);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to load reports');
        }
        
        displaySavedReports(data.reports);
    } catch (error) {
        console.error('Error loading saved reports:', error);
        document.getElementById('savedReportsList').innerHTML = `
            <div class="error-message">
                <p>❌ Error loading saved reports: ${error.message}</p>
            </div>
        `;
    }
}

// Display saved reports
function displaySavedReports(reports) {
    const container = document.getElementById('savedReportsList');
    
    if (!reports || reports.length === 0) {
        container.innerHTML = `
            <div class="no-reports">
                <p>📝 No saved reports found. Extract some company data to see reports here!</p>
            </div>
        `;
        return;
    }
    
    const reportsHTML = reports.map(report => {
        const date = new Date(report.extraction_timestamp).toLocaleDateString();
        const time = new Date(report.extraction_timestamp).toLocaleTimeString();
        const qualityColor = report.quality_score >= 80 ? 'green' : report.quality_score >= 60 ? 'orange' : 'red';
        
        return `
            <div class="saved-report-item" data-report-id="${report.id}">
                <div class="report-header">
                    <h4>${report.company_name || report.company_number}</h4>
                    <div class="report-meta">
                        <span class="quality-score" style="color: ${qualityColor}">
                            Quality: ${report.quality_score || 'N/A'}/100
                        </span>
                        <span class="extraction-date">${date} ${time}</span>
                    </div>
                </div>
                <div class="report-summary">
                    <p><strong>Company:</strong> ${report.company_number}</p>
                    <p><strong>Config:</strong> ${report.extraction_config?.maxPages || 'N/A'} pages, ${report.extraction_config?.maxPeoplePages || 'N/A'} people pages</p>
                    <p><strong>Duration:</strong> ${report.extraction_duration_ms ? Math.round(report.extraction_duration_ms / 1000) + 's' : 'N/A'}</p>
                </div>
                <div class="report-actions">
                    <button onclick="viewSavedReport('${report.id}')" class="btn btn-primary btn-sm">📖 View Report</button>
                    <button onclick="deleteSavedReport('${report.id}')" class="btn btn-danger btn-sm">🗑️ Delete</button>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = reportsHTML;
}

// View a saved report
async function viewSavedReport(reportId) {
    try {
        const response = await fetch(`/api/reports/${reportId}`);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to load report');
        }
        
        // Display the saved report data
        displayResults({
            success: true,
            company: data.report.company_name || data.report.company_number,
            data: data.report.raw_data,
            llm_summary: data.report.ai_summary,
            metadata: {
                processingTime: data.report.extraction_duration_ms + 'ms',
                extractionTimestamp: data.report.extraction_timestamp,
                qualityAssessment: {
                    score: data.report.quality_score,
                    issues: [],
                    recommendations: []
                },
                database: {
                    saved: true,
                    reportId: reportId,
                    storageEnabled: true,
                    fromSaved: true
                }
            }
        });
        
        // Scroll to results
        document.getElementById('resultsContainer').scrollIntoView({ behavior: 'smooth' });
        
    } catch (error) {
        console.error('Error loading saved report:', error);
        alert(`Error loading report: ${error.message}`);
    }
}

// Delete a saved report
async function deleteSavedReport(reportId) {
    if (!confirm('Are you sure you want to delete this report?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/reports/${reportId}?sessionId=${userSessionId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to delete report');
        }
        
        // Remove from display
        const reportElement = document.querySelector(`[data-report-id="${reportId}"]`);
        if (reportElement) {
            reportElement.remove();
        }
        
        // Refresh the list
        loadSavedReports();
        
    } catch (error) {
        console.error('Error deleting report:', error);
        alert(`Error deleting report: ${error.message}`);
    }
}

// Search saved reports
async function searchSavedReports() {
    const searchTerm = document.getElementById('searchSavedReports').value.trim();
    
    if (!searchTerm) {
        loadSavedReports();
        return;
    }
    
    try {
        const response = await fetch(`/api/reports/search/${encodeURIComponent(searchTerm)}?sessionId=${userSessionId}`);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Search failed');
        }
        
        displaySavedReports(data.reports);
    } catch (error) {
        console.error('Error searching reports:', error);
        document.getElementById('savedReportsList').innerHTML = `
            <div class="error-message">
                <p>❌ Search error: ${error.message}</p>
            </div>
        `;
    }
}

// Utility function for debouncing
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Check for reportId in URL parameters and load the report
function checkForReportIdInURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const reportId = urlParams.get('reportId');
    
    if (reportId) {
        console.log('Found reportId in URL:', reportId);
        // Load the report automatically
        viewSavedReport(reportId);
        
        // Optionally, clean up the URL (remove the reportId parameter)
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }
}

// Check for duplicate reports before extraction
async function checkForDuplicateReport(companyName) {
    if (!companyName) return true;
    
    try {
        let url = `/api/reports/check/${encodeURIComponent(companyName)}`;
        if (userSessionId) {
            url += `?sessionId=${userSessionId}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success && data.exists) {
            const existingReport = data.report;
            const extractionDate = new Date(existingReport.extraction_timestamp).toLocaleDateString();
            
            const message = `A report for "${existingReport.company_name}" already exists:\n\n` +
                          `• Extracted: ${extractionDate}\n` +
                          `• Quality Score: ${existingReport.quality_score}/100\n\n` +
                          `Would you like to:\n` +
                          `• Click "OK" to create a new report (will replace the old one)\n` +
                          `• Click "Cancel" to view the existing report instead`;
            
            const shouldProceed = confirm(message);
            
            if (!shouldProceed) {
                // User chose to view existing report
                viewSavedReport(existingReport.id);
                return false;
            }
        }
        
        return true; // Proceed with extraction
    } catch (error) {
        console.error('Error checking for duplicates:', error);
        return true; // If check fails, proceed anyway
    }
}

// Extract company number from input (handles both company names and numbers)
function extractCompanyNumber(input) {
    // If input looks like a company number (digits), return it
    const numberMatch = input.match(/\b\d{8}\b/);
    if (numberMatch) {
        return numberMatch[0];
    }
    
    // For company names, we can't easily extract the number
    // So we'll use the input as-is for the check
    return input.trim();
}