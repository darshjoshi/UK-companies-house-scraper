/**
 * PDF Extraction-specific functionality
 */

// Display PDF extraction statistics and diagnostics
function showPDFExtractionStats(data) {
    if (!data.metadata || !data.metadata.filingStatistics) return;
    
    const stats = data.metadata.filingStatistics;
    const qualityScore = data.metadata.qualityAssessment.score;
    const companyNumber = data.data.overview?.companyNumber;
    
    if (!companyNumber) return;
    
    const pdfDiagnostics = `
        <div class="diagnostic-panel">
            <h3>📄 PDF Extraction Diagnostics</h3>
            <div class="diagnostic-content">
                <p>
                    <strong>PDF Success Rate:</strong> 
                    <span class="${stats.pdfSuccessRate > 80 ? 'success' : stats.pdfSuccessRate > 40 ? 'warning' : 'error'}">
                        ${stats.pdfSuccessRate}%
                    </span>
                </p>
                <p><strong>Filings with PDFs:</strong> ${stats.filingsWithPDFs} / ${stats.totalFilings}</p>
                <p><strong>Total PDF Pages:</strong> ${stats.totalPDFPages}</p>
                <p><strong>Data Quality Score:</strong> ${qualityScore}/100</p>
                <div class="pdf-test-button">
                    <button onclick="testPDFExtraction('${companyNumber}')" class="search-button pdf-test-btn">
                        Test PDF Extraction
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('pdf-diagnostics').innerHTML = pdfDiagnostics;
}

// Create enhanced filing table with PDF links
function createEnhancedFilingTable(filingData, stats) {
    const container = document.createElement('div');
    container.className = 'filing-table-container';
    
    const filings = filingData.filings || [];
    const successRate = stats?.pdfSuccessRate || 0;
    
    container.innerHTML = `
        <div class="filing-table-header">
            📄 Complete Filing History
            <div class="pdf-success-indicator">
                🎯 ${successRate}% PDF Success Rate
            </div>
        </div>
        
        <table class="filing-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Documents</th>
                </tr>
            </thead>
            <tbody>
                ${filings.map(filing => `
                    <tr>
                        <td class="filing-date">${filing.date}</td>
                        <td>
                            <span class="filing-type-badge ${getTypeClass(filing.type)}">
                                ${filing.type}
                            </span>
                        </td>
                        <td class="filing-description">${filing.description}</td>
                        <td>
                            ${createEnhancedPDFLinks(filing)}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    return container;
}

// Create officers card
function createOfficersCard(officers) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
        <div class="card-header">
            👥 Company Officers
            <div class="card-badge">${officers.length}</div>
        </div>
        <div class="card-content">
            ${officers.slice(0, 10).map(officer => `
                <div class="officer-item">
                    <div class="officer-name">${officer.name}</div>
                    <div class="officer-role">${officer.role}</div>
                    <div class="officer-details">
                        <strong>Appointed:</strong> ${officer.appointmentDate || 'N/A'}<br>
                        ${officer.resignationDate ? `<strong>Resigned:</strong> ${officer.resignationDate}<br>` : ''}
                        ${officer.nationality ? `<strong>Nationality:</strong> ${officer.nationality}<br>` : ''}
                        ${officer.occupation ? `<strong>Occupation:</strong> ${officer.occupation}` : ''}
                    </div>
                </div>
            `).join('')}
            ${officers.length > 10 ? `<div class="no-data">... and ${officers.length - 10} more officers</div>` : ''}
        </div>
    `;
    return card;
}

// Create charges card
function createChargesCard(charges) {
    const chargeList = charges.charges || [];
    const card = document.createElement('div');
    card.className = 'card';
    
    if (chargeList.length === 0 || (chargeList.length === 1 && chargeList[0].description?.includes('0 charges'))) {
        card.innerHTML = `
            <div class="card-header">
                ⚠️ Charges & Security
                <div class="card-badge">0</div>
            </div>
            <div class="card-content">
                <div class="no-data">✅ No charges registered against this company</div>
            </div>
        `;
    } else {
        card.innerHTML = `
            <div class="card-header">
                ⚠️ Charges & Security
                <div class="card-badge">${chargeList.length}</div>
            </div>
            <div class="card-content">
                ${chargeList.map(charge => `
                    <div class="officer-item">
                        <div class="officer-name">Charge ${charge.chargeNumber || 'N/A'}</div>
                        <div class="officer-role">${charge.status || 'Unknown'}</div>
                        <div class="officer-details">
                            ${charge.createdDate ? `<strong>Created:</strong> ${charge.createdDate}<br>` : ''}
                            ${charge.chargeholder ? `<strong>Holder:</strong> ${charge.chargeholder}<br>` : ''}
                            <strong>Description:</strong> ${charge.description || 'N/A'}
                            ${charge.securedAmount ? `<br><strong>Amount:</strong> ${charge.securedAmount}` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    return card;
}

// Helper function to create enhanced PDF links
function createEnhancedPDFLinks(filing) {
    const documentLinks = filing.documentLinks || [];
    
    if (documentLinks.length === 0) {
        return '<span class="pdf-link no-link">📄 No Documents</span>';
    }
    
    return documentLinks.map(link => {
        // Better validation for PDF links
        const isValidUrl = link.url && link.url.length > 10 && 
                         (link.url.includes('document?format=') || 
                          link.url.includes('/document/'));
        
        if (!isValidUrl) {
            return '<span class="pdf-link no-link">📄 Invalid Link</span>';
        }
        
        const linkClass = link.linkType === 'iXBRL' ? 'pdf-link ixbrl' : 'pdf-link';
        const icon = link.linkType === 'iXBRL' ? '📊' : '📄';
        const displayText = link.linkText.length > 15 ? 
            link.linkText.substring(0, 15) + '...' : link.linkText;
        
        return `<a href="${link.url}" target="_blank" rel="noopener noreferrer" 
                 class="${linkClass}" title="${link.linkText}">
            ${icon} ${displayText}
            ${link.pageCount ? `<span class="page-count">${link.pageCount}p</span>` : ''}
        </a>`;
    }).join(' ');
}

// Helper function to get CSS class for filing type
function getTypeClass(type) {
    if (type.includes('Accounts')) return 'type-accounts';
    if (type.includes('Confirmation')) return 'type-confirmation';
    if (type.includes('Officer') || type.includes('Director')) return 'type-officers';
    if (type.includes('Charge') || type.includes('Mortgage')) return 'type-charges';
    return 'type-other';
}

// Test PDF extraction capabilities
async function testPDFExtraction(companyNumber) {
    const testButton = document.querySelector('.pdf-test-btn');
    testButton.disabled = true;
    testButton.textContent = 'Testing...';
    
    try {
        const response = await fetch(`/api/test-pdf-extraction/${companyNumber}`);
        const result = await response.json();
        
        // Display test results
        const testResults = `
            <div class="test-results">
                <h4>PDF Extraction Test Results</h4>
                <table class="test-results-table">
                    <tr>
                        <th>Strategy</th>
                        <th>Filings Found</th>
                        <th>PDF Links</th>
                        <th>Sample URL</th>
                    </tr>
                    <tr>
                        <td>Direct DOM</td>
                        <td>${result.results.directDOM.filingCount}</td>
                        <td>${result.results.directDOM.pdfLinks}</td>
                        <td class="url-cell">${result.results.directDOM.sampleUrls[0] || 'None'}</td>
                    </tr>
                    <tr>
                        <td>LLM with URL type</td>
                        <td>${result.results.llm.filingCount}</td>
                        <td>${result.results.llm.pdfLinks}</td>
                        <td class="url-cell">${result.results.llm.sampleUrls[0] || 'None'}</td>
                    </tr>
                    <tr>
                        <td>Hybrid Approach</td>
                        <td>${result.results.hybrid.filingCount}</td>
                        <td>${result.results.hybrid.pdfLinks}</td>
                        <td class="url-cell">${result.results.hybrid.sampleUrls[0] || 'None'}</td>
                    </tr>
                </table>
                <p style="margin-top: 1rem;">
                    <strong>Recommended strategy:</strong> ${result.metadata?.bestStrategy?.name || 'Unknown'}
                    ${result.metadata?.bestStrategy?.reason ? `<br><em>${result.metadata.bestStrategy.reason}</em>` : ''}
                </p>
            </div>
        `;
        
        document.querySelector('.diagnostic-content').insertAdjacentHTML('beforeend', testResults);
    } catch (error) {
        console.error('PDF test failed:', error);
        document.querySelector('.diagnostic-content').insertAdjacentHTML(
            'beforeend', 
            `<div class="test-error">Test failed: ${error.message}</div>`
        );
    } finally {
        testButton.disabled = false;
        testButton.textContent = 'Test PDF Extraction';
    }
}

// Track PDF link clicks for analytics
document.addEventListener('click', function(e) {
    if (e.target.closest('.pdf-link') && !e.target.closest('.no-link')) {
        const link = e.target.closest('.pdf-link');
        console.log('PDF link accessed:', {
            url: link.href,
            type: link.classList.contains('ixbrl') ? 'iXBRL' : 'PDF',
            text: link.textContent.trim()
        });
    }
});