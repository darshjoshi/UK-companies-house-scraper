// Bridge file to connect the fixed PDF extractor with the server
// This bypasses the TypeScript errors in scraper.ts
import { extractWithDirectDOM } from './fixed-pdf-extractor.js';
import { Stagehand } from '@browserbasehq/stagehand';

/**
 * Enhanced PDF extraction function that can be used by the server
 * This is the only part that uses hybrid mode (direct DOM + LLM)
 */
export async function extractPDFLinks(companyName, page) {
  console.log(`Extracting PDF links for company: ${companyName}`);
  
  // Navigate to filing history if needed
  const currentUrl = await page.evaluate(() => window.location.href);
  if (!currentUrl.includes('filing-history')) {
    console.log("Not on filing history page, navigating there first...");
    
    // Find the filing history link
    const filingHistoryHref = await page.evaluate(() => {
      // Try to find the filing history link
      const links = Array.from(document.querySelectorAll('a'));
      const filingHistoryLink = links.find(link => 
        link.textContent?.toLowerCase().includes('filing history')
      );
      return filingHistoryLink?.href;
    });
    
    if (filingHistoryHref) {
      console.log(`Navigating to filing history: ${filingHistoryHref}`);
      await page.goto(filingHistoryHref, { waitUntil: 'networkidle0' });
    } else {
      console.warn("Could not find filing history link!");
    }
  }
  
  console.log("Using hybrid mode for filing history PDF extraction");
  
  // Override mode just for this extraction to use direct DOM manipulation
  // This is the only part that should use hybrid mode
  page._setMode && page._setMode('hybrid');
  
  // Extract the PDF links using our fixed implementation
  const filings = await extractWithDirectDOM(page);
  
  // Switch back to LLM mode for the rest of the extraction
  page._setMode && page._setMode('llm');
  
  // Process results for server format
  return {
    filings,
    totalFilings: filings.length,
    dateRange: getDateRange(filings),
    statistics: calculateStatistics(filings)
  };
}

/**
 * Helper function to get date range from filings
 */
function getDateRange(filings) {
  if (!filings || filings.length === 0) return null;
  
  // Sort filings by date
  const sortedFilings = [...filings].sort((a, b) => {
    const dateA = new Date(convertUKDate(a.date));
    const dateB = new Date(convertUKDate(b.date));
    return dateB - dateA;  // Descending order, newest first
  });
  
  return {
    earliest: sortedFilings[sortedFilings.length - 1].date,
    latest: sortedFilings[0].date
  };
}

/**
 * Convert UK date format (DD MMM YYYY) to ISO format (YYYY-MM-DD)
 */
function convertUKDate(ukDate) {
  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  
  const parts = ukDate.split(' ');
  if (parts.length !== 3) return ukDate;
  
  const day = parts[0].padStart(2, '0');
  const month = months[parts[1].toLowerCase().substring(0, 3)];
  const year = parts[2];
  
  return `${year}-${month}-${day}`;
}

/**
 * Calculate statistics for the filings
 */
function calculateStatistics(filings) {
  if (!filings || filings.length === 0) {
    return {
      filingsWithDocuments: 0,
      documentSuccessRate: 0,
      totalDocuments: 0,
      totalDocumentPages: 0,
      filingTypes: {}
    };
  }
  
  // Count filings with documents
  const filingsWithDocs = filings.filter(f => f.documentLinks && f.documentLinks.length > 0);
  
  // Count total documents and pages
  let totalDocs = 0;
  let totalPages = 0;
  
  // Count filing types
  const filingTypes = {};
  
  filings.forEach(filing => {
    // Count documents
    if (filing.documentLinks) {
      totalDocs += filing.documentLinks.length;
      
      // Count pages
      filing.documentLinks.forEach(doc => {
        if (doc.pageCount && !isNaN(parseInt(doc.pageCount))) {
          totalPages += parseInt(doc.pageCount);
        }
      });
    }
    
    // Count filing types
    const type = filing.type || 'Other';
    filingTypes[type] = (filingTypes[type] || 0) + 1;
  });
  
  return {
    filingsWithDocuments: filingsWithDocs.length,
    documentSuccessRate: filings.length > 0 ? Math.round((filingsWithDocs.length / filings.length) * 100) : 0,
    totalDocuments: totalDocs,
    totalDocumentPages: totalPages,
    filingTypes
  };
}
