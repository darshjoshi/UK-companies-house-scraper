/**
 * UI Components and extra functionality
 */

// Add helper functions for building UI components
const UIComponents = {
    // Create a card element
    createCard: function(title, content, badgeText = null) {
        const card = document.createElement('div');
        card.className = 'card';
        
        let badgeHTML = '';
        if (badgeText) {
            badgeHTML = `<div class="card-badge">${badgeText}</div>`;
        }
        
        card.innerHTML = `
            <div class="card-header">
                ${title}
                ${badgeHTML}
            </div>
            <div class="card-content">
                ${content}
            </div>
        `;
        
        return card;
    },
    
    // Create a status badge
    createStatusBadge: function(status) {
        const statusClass = status.toLowerCase().includes('active') ? 'status-active' : 
                           status.toLowerCase().includes('dissolved') ? 'status-dissolved' : 
                           'status-default';
                           
        return `<span class="status-badge ${statusClass}">${status}</span>`;
    },
    
    // Format numbers with commas
    formatNumber: function(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    },
    
    // Create a progress bar
    createProgressBar: function(percentage, className = '') {
        return `
            <div class="progress-bar-container ${className}">
                <div class="progress-bar" style="width: ${percentage}%"></div>
                <div class="progress-text">${percentage}%</div>
            </div>
        `;
    },
    
    // Create a notification
    showNotification: function(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close">&times;</button>
            </div>
        `;
        
        // Add close button functionality
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });
        
        // Add to document
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.classList.add('notification-hiding');
            setTimeout(() => notification.remove(), 500);
        }, 5000);
    },

    // Create clickable link with validation
    createClickableLink: function(url, text, linkType = 'other') {
        if (!url || !text) return text;
        
        // Validate URL
        try {
            new URL(url);
        } catch {
            console.warn('Invalid URL:', url);
            return text;
        }
        
        const linkClass = `clickable-link link-type-${linkType}`;
        const icon = this.getLinkIcon(linkType);
        
        return `<a href="${url}" target="_blank" class="${linkClass}" rel="noopener noreferrer">
            ${icon} ${text}
            <span class="external-link-indicator">↗</span>
        </a>`;
    },

    // Get appropriate icon for link type
    getLinkIcon: function(linkType) {
        const icons = {
            'profile': '👤',
            'appointment': '📄',
            'other': '🔗'
        };
        return icons[linkType] || icons['other'];
    },

    // Create enhanced people/officers card with clickable links
    createEnhancedPeopleCard: function(peopleData) {
        if (!peopleData || !peopleData.officers || peopleData.officers.length === 0) {
            return this.createCard('👥 Company Officers', '<p>No officer information available</p>', 'No Data');
        }

        const { officers, totalOfficers, activeOfficers, resignedOfficers, pagesScraped } = peopleData;
        
        // Create summary statistics
        const summaryHTML = `
            <div class="people-summary">
                <div class="people-stats">
                    <div class="stat-item">
                        <span class="stat-number">${totalOfficers}</span>
                        <span class="stat-label">Total Officers</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number">${activeOfficers}</span>
                        <span class="stat-label">Active</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number">${resignedOfficers}</span>
                        <span class="stat-label">Resigned</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number">${pagesScraped}</span>
                        <span class="stat-label">Pages Scraped</span>
                    </div>
                </div>
            </div>
        `;

        // Create officers list with enhanced display
        const officersHTML = officers.map((officer, index) => {
            const isActive = !officer.resignationDate;
            const statusClass = isActive ? 'officer-active' : 'officer-resigned';
            const statusText = isActive ? 'Active' : 'Resigned';
            
            // Process links
            const linksHTML = officer.links && officer.links.length > 0 ? 
                officer.links.map(link => 
                    this.createClickableLink(link.url, link.linkText, link.linkType)
                ).join(' | ') : 
                '<span class="no-links">No profile links available</span>';
            
            return `
                <div class="officer-item ${statusClass}">
                    <div class="officer-header">
                        <div class="officer-name-role">
                            <h4 class="officer-name">${officer.name}</h4>
                            <span class="officer-role">${officer.role}</span>
                            <span class="officer-status status-${statusClass}">${statusText}</span>
                        </div>
                        <div class="officer-number">#${index + 1}</div>
                    </div>
                    
                    <div class="officer-details">
                        ${officer.appointmentDate ? `<div class="detail-item"><strong>Appointed:</strong> ${officer.appointmentDate}</div>` : ''}
                        ${officer.resignationDate ? `<div class="detail-item"><strong>Resigned:</strong> ${officer.resignationDate}</div>` : ''}
                        ${officer.nationality ? `<div class="detail-item"><strong>Nationality:</strong> ${officer.nationality}</div>` : ''}
                        ${officer.occupation ? `<div class="detail-item"><strong>Occupation:</strong> ${officer.occupation}</div>` : ''}
                        ${officer.address ? `<div class="detail-item"><strong>Address:</strong> ${officer.address}</div>` : ''}
                        ${officer.dateOfBirth ? `<div class="detail-item"><strong>Date of Birth:</strong> ${officer.dateOfBirth}</div>` : ''}
                    </div>
                    
                    <div class="officer-links">
                        <strong>Profile Links:</strong>
                        <div class="links-container">
                            ${linksHTML}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        const content = summaryHTML + `
            <div class="officers-list">
                ${officersHTML}
            </div>
        `;

        const badgeText = `${totalOfficers} Officers`;
        return this.createCard('👥 Company Officers & Directors', content, badgeText);
    },

    // Create people statistics card
    createPeopleStatsCard: function(peopleData) {
        if (!peopleData) {
            return null;
        }

        const totalLinks = peopleData.officers.reduce((sum, officer) => 
            sum + (officer.links ? officer.links.length : 0), 0
        );
        
        const linksByType = peopleData.officers.reduce((acc, officer) => {
            if (officer.links) {
                officer.links.forEach(link => {
                    acc[link.linkType] = (acc[link.linkType] || 0) + 1;
                });
            }
            return acc;
        }, {});

        const content = `
            <div class="people-stats-detailed">
                <div class="stat-row">
                    <span class="stat-label">Total Clickable Links:</span>
                    <span class="stat-value">${totalLinks}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Profile Links:</span>
                    <span class="stat-value">${linksByType.profile || 0}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Appointment Links:</span>
                    <span class="stat-value">${linksByType.appointment || 0}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Other Links:</span>
                    <span class="stat-value">${linksByType.other || 0}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Pages Processed:</span>
                    <span class="stat-value">${peopleData.pagesScraped}</span>
                </div>
            </div>
        `;

        return this.createCard('📊 People Extraction Statistics', content, 'Enhanced');
    }
};

// Add event listeners for UI components
document.addEventListener('DOMContentLoaded', function() {
    // Add max pages input controls
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'extraction-controls';
    controlsContainer.innerHTML = `
        <div class="max-pages-control">
            <label for="maxPages">Max Filing Pages:</label>
            <select id="maxPages" class="max-pages-select">
                <option value="1">1 page</option>
                <option value="5">5 pages</option>
                <option value="10" selected>10 pages</option>
                <option value="20">20 pages</option>
                <option value="30">30 pages (may be slow)</option>
                <option value="50">50 pages (may be very slow)</option>
            </select>
            <span class="tooltip-icon" data-tooltip="Higher values extract more filings but take longer">ⓘ</span>
        </div>
        <div class="max-people-pages-control">
            <label for="maxPeoplePages">Max People Pages:</label>
            <select id="maxPeoplePages" class="max-pages-select">
                <option value="1">1 page</option>
                <option value="3">3 pages</option>
                <option value="5" selected>5 pages</option>
                <option value="10">10 pages</option>
                <option value="15">15 pages (may be slow)</option>
            </select>
            <span class="tooltip-icon" data-tooltip="Higher values extract more officers but take longer">ⓘ</span>
        </div>
    `;
    
    // Insert after the search input but before the button
    setTimeout(() => {
        const searchForm = document.querySelector('.search-form');
        const searchButton = document.querySelector('.search-button');
        if (searchForm && searchButton) {
            searchForm.insertBefore(controlsContainer, searchButton);
        }
    }, 100);
    
    // Add tooltip functionality
    initTooltips();
    
    // Add keyboard shortcuts
    initKeyboardShortcuts();
});

// Initialize tooltips
function initTooltips() {
    // Add tooltip functionality to elements with data-tooltip attribute
    document.querySelectorAll('[data-tooltip]').forEach(el => {
        el.addEventListener('mouseenter', showTooltip);
        el.addEventListener('mouseleave', hideTooltip);
    });
    
    // Also add for dynamically added elements
    document.addEventListener('mouseover', function(e) {
        if (e.target.hasAttribute('data-tooltip')) {
            showTooltip(e);
        }
    });
    
    document.addEventListener('mouseout', function(e) {
        if (e.target.hasAttribute('data-tooltip')) {
            hideTooltip(e);
        }
    });
}

function showTooltip(event) {
    const tooltipText = event.target.getAttribute('data-tooltip');
    
    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.textContent = tooltipText;
    document.body.appendChild(tooltip);
    
    // Position tooltip
    const rect = event.target.getBoundingClientRect();
    tooltip.style.top = rect.bottom + 10 + 'px';
    tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
    
    // Show tooltip
    setTimeout(() => tooltip.classList.add('tooltip-visible'), 10);
    
    // Store tooltip reference
    event.target._tooltip = tooltip;
}

function hideTooltip(event) {
    if (event.target._tooltip) {
        event.target._tooltip.remove();
        event.target._tooltip = null;
    }
}

// Initialize keyboard shortcuts
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+Enter to submit search
        if (e.ctrlKey && e.key === 'Enter') {
            const searchForm = document.getElementById('searchForm');
            if (searchForm) {
                searchForm.dispatchEvent(new Event('submit'));
            }
        }
        
        // Escape to close any dialogs or tooltips
        if (e.key === 'Escape') {
            document.querySelectorAll('.tooltip').forEach(el => el.remove());
            // Add other dialog close actions here
        }
    });
}

// Simulate progress during long extractions
function simulateProgressForLongExtraction(maxPages) {
    const progressBar = document.getElementById('loadingProgressBar');
    const currentPageText = document.getElementById('currentPage');
    const loadingSubtext = document.getElementById('loadingSubtext');
    
    if (!progressBar || !currentPageText || !loadingSubtext) return;
    
    // Reset progress
    progressBar.style.width = '0%';
    let currentPage = 1;
    
    // Estimate about 10 seconds per page
    const totalEstimatedTime = maxPages * 10000;
    const interval = 2000; // Update every 2 seconds
    
    // Array of loading messages to cycle through
    const loadingMessages = [
        "Analyzing company structure...",
        "Extracting filing history...",
        "Processing PDF links...",
        "Performing document analysis...",
        "Retrieving officer information...",
        "Examining charge details...",
        "Generating AI-powered insights..."
    ];
    
    let messageIndex = 0;
    
    // Start progress simulation
    const progressInterval = setInterval(() => {
        // Calculate progress as a percentage of estimated time
        const elapsedTime = currentPage * interval;
        const progress = Math.min(95, (elapsedTime / totalEstimatedTime) * 100);
        
        progressBar.style.width = `${progress}%`;
        
        // Update page number (rough estimate)
        if (currentPage < maxPages) {
            currentPage = Math.min(maxPages, Math.floor((progress / 95) * maxPages));
            currentPageText.textContent = `page ${currentPage} of ${maxPages}`;
        }
        
        // Cycle through messages
        loadingSubtext.textContent = loadingMessages[messageIndex];
        messageIndex = (messageIndex + 1) % loadingMessages.length;
        
        // When progress is complete (or close), clear the interval
        if (progress >= 95) {
            clearInterval(progressInterval);
        }
    }, interval);
    
    // Store the interval ID so we can clear it when the actual request completes
    window.currentProgressInterval = progressInterval;
}