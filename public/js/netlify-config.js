// Netlify-specific configuration
// This file configures the frontend to work with different deployment environments

const CONFIG = {
  // For Netlify deployment, you would need to deploy the backend separately
  // and update this URL to point to your backend service
  API_BASE_URL: window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : 'https://your-backend-service.railway.app/api', // Update this URL
  
  // Environment detection
  IS_NETLIFY: window.location.hostname.includes('netlify.app'),
  IS_LOCAL: window.location.hostname === 'localhost',
  
  // Feature flags for different environments
  FEATURES: {
    ENHANCED_REPORTING: true,
    MULTI_PAGE_EXTRACTION: true,
    AI_ANALYSIS: true
  }
};

// Update the main.js to use this configuration
if (typeof window !== 'undefined') {
  window.APP_CONFIG = CONFIG;
}

console.log('App Configuration:', CONFIG);
