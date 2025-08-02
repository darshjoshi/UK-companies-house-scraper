// Reports page functionality
let userSessionId = localStorage.getItem('userSessionId') || null;
let currentPage = 1;
let totalPages = 1;
const reportsPerPage = 10;

document.addEventListener('DOMContentLoaded', function() {
    initReportsPage();
    
    // Event listeners
    document.getElementById('searchReports').addEventListener('input', debounce(searchReports, 300));
    document.getElementById('refreshReports').addEventListener('click', loadReports);
    document.getElementById('exportReports').addEventListener('click', exportReports);
    document.getElementById('prevPage').addEventListener('click', () => changePage(currentPage - 1));
    document.getElementById('nextPage').addEventListener('click', () => changePage(currentPage + 1));
    document.getElementById('closeModal').addEventListener('click', closeModal);
    
    // Close modal on background click
    document.getElementById('reportModal').addEventListener('click', (e) => {
        if (e.target.id === 'reportModal') {
            closeModal();
        }
    });
});

async function initReportsPage() {
    showLoading(true);
    
    // Check database status
    await checkDatabaseStatus();
    
    // Try to load reports regardless of session
    try {
        await loadReports();
        if (userSessionId) {
            await loadSessionStats();
        } else {
            // Show info that we're showing all reports
            showSessionStatus('Showing all available reports. Extract a company report to create your personal session.', 'info');
        }
    } catch (error) {
        console.error('Error loading reports:', error);
        showSessionStatus('Error loading reports. Please try again.', 'danger');
    }
    
    showLoading(false);
}

async function checkDatabaseStatus() {
    try {
        const response = await fetch('/api/health');
        const health = await response.json();
        
        const statusDiv = document.getElementById('databaseStatus');
        const statusText = document.getElementById('databaseStatusText');
        
        if (health.dependencies?.supabase) {
            statusDiv.className = 'alert alert-success';
            statusDiv.querySelector('.icon').textContent = '✅';
            statusText.textContent = 'Database connected and ready';
        } else {
            statusDiv.className = 'alert alert-warning';
            statusDiv.querySelector('.icon').textContent = '⚠️';
            statusText.textContent = 'Database not configured - reports will not be available';
        }
        
        statusDiv.style.display = 'flex';
    } catch (error) {
        console.error('Error checking database status:', error);
        const statusDiv = document.getElementById('databaseStatus');
        statusDiv.className = 'alert alert-danger';
        statusDiv.querySelector('.icon').textContent = '❌';
        document.getElementById('databaseStatusText').textContent = 'Error connecting to server';
        statusDiv.style.display = 'flex';
    }
}

async function loadSessionStats() {
    if (!userSessionId) return;
    
    try {
        const response = await fetch(`/api/sessions/${userSessionId}/stats`);
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('totalReportsCount').textContent = data.stats.totalReports;
            document.getElementById('recentReportsCount').textContent = data.stats.recentReports;
            document.getElementById('avgQualityScore').textContent = data.stats.averageQualityScore;
            document.getElementById('reportsStats').style.display = 'grid';
            
            showSessionStatus(`Session active with ${data.stats.totalReports} reports`, 'success');
        }
    } catch (error) {
        console.error('Error loading session stats:', error);
        showSessionStatus('Error loading session statistics', 'warning');
    }
}

async function loadReports(page = 1) {
    try {
        const offset = (page - 1) * reportsPerPage;
        let url = `/api/reports?limit=${reportsPerPage}&offset=${offset}`;
        
        // Add session ID if available
        if (userSessionId) {
            url += `&sessionId=${userSessionId}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to load reports');
        }
        
        displayReports(data.reports);
        updatePagination(page, data.reports.length);
        
    } catch (error) {
        console.error('Error loading reports:', error);
        showError(`Error loading reports: ${error.message}`);
    }
}

function displayReports(reports) {
    const container = document.getElementById('reportsList');
    
    if (!reports || reports.length === 0) {
        showNoReports('No saved reports found. Extract some company data to see reports here!');
        return;
    }
    
    const reportsHTML = reports.map(report => {
        const date = new Date(report.extraction_timestamp).toLocaleDateString();
        const time = new Date(report.extraction_timestamp).toLocaleTimeString();
        const qualityColor = getQualityColor(report.quality_score);
        
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
                    <p><strong>Company Number:</strong> ${report.company_number}</p>
                    <p><strong>Configuration:</strong> ${report.extraction_config?.maxPages || 'N/A'} pages, ${report.extraction_config?.maxPeoplePages || 'N/A'} people pages</p>
                    <p><strong>Duration:</strong> ${report.extraction_duration_ms ? Math.round(report.extraction_duration_ms / 1000) + 's' : 'N/A'}</p>
                    ${report.ai_summary ? '<p><strong>AI Summary:</strong> Available</p>' : '<p><strong>AI Summary:</strong> Not generated</p>'}
                </div>
                <div class="report-actions">
                    <button onclick="viewReportDetails('${report.id}')" class="btn btn-primary btn-sm">📖 View Details</button>
                    <button onclick="openReportInScraper('${report.id}')" class="btn btn-secondary btn-sm">🔗 Open in Scraper</button>
                    <button onclick="exportSingleReport('${report.id}')" class="btn btn-secondary btn-sm">📊 Export</button>
                    <button onclick="deleteReport('${report.id}')" class="btn btn-danger btn-sm">🗑️ Delete</button>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = reportsHTML;
}

async function viewReportDetails(reportId) {
    try {
        const response = await fetch(`/api/reports/${reportId}`);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to load report');
        }
        
        const report = data.report;
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        
        modalTitle.textContent = `${report.company_name || report.company_number} - Report Details`;
        
        modalBody.innerHTML = `
            <div class="report-detail">
                <div class="detail-section">
                    <h4>📊 Report Information</h4>
                    <p><strong>Company:</strong> ${report.company_name || 'N/A'}</p>
                    <p><strong>Company Number:</strong> ${report.company_number}</p>
                    <p><strong>Extraction Date:</strong> ${new Date(report.extraction_timestamp).toLocaleString()}</p>
                    <p><strong>Quality Score:</strong> <span style="color: ${getQualityColor(report.quality_score)}">${report.quality_score || 'N/A'}/100</span></p>
                    <p><strong>Duration:</strong> ${report.extraction_duration_ms ? Math.round(report.extraction_duration_ms / 1000) + 's' : 'N/A'}</p>
                </div>
                
                <div class="detail-section">
                    <h4>⚙️ Extraction Configuration</h4>
                    <p><strong>Max Pages:</strong> ${report.extraction_config?.maxPages || 'N/A'}</p>
                    <p><strong>Max People Pages:</strong> ${report.extraction_config?.maxPeoplePages || 'N/A'}</p>
                    <p><strong>Risk Assessment:</strong> ${report.extraction_config?.enableRiskAssessment ? 'Enabled' : 'Disabled'}</p>
                </div>
                
                ${report.ai_summary ? `
                <div class="detail-section">
                    <h4>🤖 AI Summary</h4>
                    <div class="ai-summary-content">
                        ${report.ai_summary.replace(/\n/g, '<br>')}
                    </div>
                </div>
                ` : ''}
                
                <div class="detail-section">
                    <h4>📋 Raw Data Summary</h4>
                    <p><strong>Overview:</strong> ${report.raw_data?.overview ? 'Available' : 'Not available'}</p>
                    <p><strong>Filing Data:</strong> ${report.raw_data?.filing?.filings?.length || 0} filings</p>
                    <p><strong>People Data:</strong> ${report.raw_data?.people?.officers?.length || 0} officers</p>
                    <p><strong>Charges Data:</strong> ${report.raw_data?.charges ? 'Available' : 'Not available'}</p>
                </div>
                
                <div class="modal-actions">
                    <button onclick="openReportInScraper('${report.id}')" class="btn btn-primary">🔗 Open in Main Interface</button>
                    <button onclick="exportSingleReport('${report.id}')" class="btn btn-secondary">📊 Export Report</button>
                </div>
            </div>
        `;
        
        document.getElementById('reportModal').style.display = 'flex';
        
    } catch (error) {
        console.error('Error loading report details:', error);
        alert(`Error loading report: ${error.message}`);
    }
}

function openReportInScraper(reportId) {
    // Open the main scraper page with the report loaded
    window.open(`/?reportId=${reportId}`, '_blank');
}

async function exportSingleReport(reportId) {
    try {
        const response = await fetch(`/api/reports/${reportId}`);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to load report');
        }
        
        const report = data.report;
        const exportData = {
            company_number: report.company_number,
            company_name: report.company_name,
            extraction_timestamp: report.extraction_timestamp,
            quality_score: report.quality_score,
            extraction_duration_ms: report.extraction_duration_ms,
            ai_summary: report.ai_summary,
            raw_data: report.raw_data
        };
        
        downloadJSON(exportData, `company-report-${report.company_number}-${new Date().toISOString().split('T')[0]}.json`);
        
    } catch (error) {
        console.error('Error exporting report:', error);
        alert(`Error exporting report: ${error.message}`);
    }
}

async function exportReports() {
    if (!userSessionId) {
        alert('No session found. Cannot export reports.');
        return;
    }
    
    try {
        // Get all reports for the session
        const response = await fetch(`/api/reports?sessionId=${userSessionId}&limit=1000`);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to load reports');
        }
        
        const exportData = {
            session_id: userSessionId,
            export_timestamp: new Date().toISOString(),
            total_reports: data.reports.length,
            reports: data.reports.map(report => ({
                company_number: report.company_number,
                company_name: report.company_name,
                extraction_timestamp: report.extraction_timestamp,
                quality_score: report.quality_score,
                extraction_duration_ms: report.extraction_duration_ms,
                ai_summary: report.ai_summary
                // Note: raw_data excluded to keep file size manageable
            }))
        };
        
        downloadJSON(exportData, `saved-reports-${new Date().toISOString().split('T')[0]}.json`);
        
    } catch (error) {
        console.error('Error exporting reports:', error);
        alert(`Error exporting reports: ${error.message}`);
    }
}

async function deleteReport(reportId) {
    if (!confirm('Are you sure you want to delete this report? This action cannot be undone.')) {
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
        
        // Refresh stats and reports
        await loadSessionStats();
        await loadReports(currentPage);
        
    } catch (error) {
        console.error('Error deleting report:', error);
        alert(`Error deleting report: ${error.message}`);
    }
}

async function searchReports() {
    const searchTerm = document.getElementById('searchReports').value.trim();
    
    if (!searchTerm) {
        loadReports(1);
        return;
    }
    
    try {
        const response = await fetch(`/api/reports/search/${encodeURIComponent(searchTerm)}?sessionId=${userSessionId}&limit=50`);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Search failed');
        }
        
        displayReports(data.reports);
        document.getElementById('pagination').style.display = 'none'; // Hide pagination for search results
        
    } catch (error) {
        console.error('Error searching reports:', error);
        showError(`Search error: ${error.message}`);
    }
}

function changePage(page) {
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    loadReports(page);
}

function updatePagination(page, reportCount) {
    currentPage = page;
    totalPages = Math.ceil(reportCount / reportsPerPage);
    
    const pagination = document.getElementById('pagination');
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');
    
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= totalPages || reportCount < reportsPerPage;
    pageInfo.textContent = `Page ${page} of ${Math.max(totalPages, 1)}`;
    
    pagination.style.display = totalPages > 1 ? 'flex' : 'none';
}

function closeModal() {
    document.getElementById('reportModal').style.display = 'none';
}

function showLoading(show) {
    document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

function showSessionStatus(message, type = 'info') {
    const statusDiv = document.getElementById('sessionStatus');
    const statusText = document.getElementById('sessionStatusText');
    
    statusDiv.className = `alert alert-${type}`;
    statusText.textContent = message;
    statusDiv.style.display = 'flex';
}

function showNoReports(message) {
    document.getElementById('reportsList').innerHTML = `
        <div class="no-reports">
            <p>📝 ${message}</p>
        </div>
    `;
}

function showError(message) {
    document.getElementById('reportsList').innerHTML = `
        <div class="error-message">
            <p>❌ ${message}</p>
        </div>
    `;
}

function getQualityColor(score) {
    if (score >= 80) return '#28a745';
    if (score >= 60) return '#fd7e14';
    return '#dc3545';
}

function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

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
