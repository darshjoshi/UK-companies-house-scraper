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
    }
};

// Add event listeners for UI components
document.addEventListener('DOMContentLoaded', function() {
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