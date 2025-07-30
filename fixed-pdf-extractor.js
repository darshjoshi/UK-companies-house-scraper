/**
 * Fixed PDF extractor implementation that correctly extracts document links
 * This should be integrated into the PDFExtractor class in scraper.ts
 */
export async function extractWithDirectDOM(page) {
  console.log("Extracting PDF links using direct DOM manipulation...");
  
  // Debug: Check if we're on the right page
  const currentUrl = await page.evaluate(() => window.location.href);
  console.log(`Current page URL for extraction: ${currentUrl}`);
  if (!currentUrl.includes('filing-history')) {
    console.warn('WARNING: Current URL does not appear to be a filing history page!');
  }
  
  // Debug: Save a screenshot for visual verification
  try {
    await page.screenshot({ path: 'filing-history-screenshot.png' });
    console.log('Screenshot saved to: filing-history-screenshot.png');
  } catch (error) {
    console.error('Failed to take screenshot:', error);
  }
  
  // Extract filings using direct DOM manipulation
  const filings = await page.evaluate(() => {
    console.log('Starting filing extraction via direct DOM...');
    
    // Find the filing history table using specific selectors
    const tableSelectors = [
      'table#fhTable',
      'table.full-width-table',
      'table[class*="filing"]',
      'table[class*="history"]',
      'table',
    ];
    
    let filingTable = null;
    for (const selector of tableSelectors) {
      const table = document.querySelector(selector);
      if (table) {
        filingTable = table;
        console.log(`Found filing table with selector: ${selector}`);
        break;
      }
    }
    
    if (!filingTable) {
      console.warn('No filing table found on the page');
      return [];
    }
    
    // Process the table rows
    const rows = filingTable.querySelectorAll('tr');
    if (rows.length < 2) {
      console.warn(`Found table but it has insufficient rows: ${rows.length}`);
      return [];
    }
    
    // Get header row to determine column indices
    const headerRow = rows[0];
    const headerCells = headerRow.querySelectorAll('th');
    
    // Find column indices
    let typeColumnIndex = -1;
    let dateColumnIndex = 0;
    let descColumnIndex = 1;
    let linksColumnIndex = headerCells.length - 1;
    
    for (let i = 0; i < headerCells.length; i++) {
      const headerText = headerCells[i].textContent?.toLowerCase() || '';
      if (headerText.includes('type')) {
        typeColumnIndex = i;
      } else if (headerText.includes('date')) {
        dateColumnIndex = i;
      } else if (headerText.includes('description')) {
        descColumnIndex = i;
      } else if (headerText.includes('view') || headerText.includes('download')) {
        linksColumnIndex = i;
      }
    }
    
    console.log(`Column indices - Date: ${dateColumnIndex}, Description: ${descColumnIndex}, Links: ${linksColumnIndex}`);
    
    // Extract filings from each row (skip header row)
    const extractedFilings = [];
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cells = row.querySelectorAll('td');
      
      if (cells.length <= Math.max(dateColumnIndex, descColumnIndex, linksColumnIndex)) {
        console.log(`Skipping row ${i} - insufficient cells: ${cells.length}`);
        continue;
      }
      
      const dateCell = cells[dateColumnIndex];
      const descriptionCell = cells[descColumnIndex];
      const linksCell = cells[linksColumnIndex];
      
      // Extract basic filing data
      const date = dateCell?.textContent?.trim() || '';
      const description = descriptionCell?.textContent?.trim() || '';
      
      // Extract filing type code from description if available
      let filingTypeCode = '';
      if (typeColumnIndex >= 0 && typeColumnIndex < cells.length) {
        filingTypeCode = cells[typeColumnIndex]?.textContent?.trim() || '';
      } else {
        const filingTypeMatch = description.match(/\(([A-Z0-9]{2,3})\)/);
        if (filingTypeMatch && filingTypeMatch[1]) {
          filingTypeCode = filingTypeMatch[1];
        }
      }
      
      // Extract document links
      const documentLinks = [];
      const linkElements = linksCell?.querySelectorAll('a[href]') || [];
      
      for (const linkElement of linkElements) {
        const href = linkElement.getAttribute('href');
        const linkText = linkElement.textContent?.trim() || '';
        
        if (!href) continue;
        
        // Skip non-document links
        if (!href.includes('document') && !href.includes('pdf') && !href.includes('xhtml')) {
          continue;
        }
        
        // Determine document type
        let linkType = 'PDF';
        if (href.includes('.pdf') || linkText.toLowerCase().includes('pdf')) {
          linkType = 'PDF';
        } else if (href.includes('.xhtml') || linkText.toLowerCase().includes('xhtml') || 
                  href.includes('format=xhtml')) {
          linkType = 'iXBRL';
        } else if (href.includes('.xml') || linkText.toLowerCase().includes('xml') || 
                  href.includes('format=xml')) {
          linkType = 'XML';
        }
        
        // Extract page count if available
        let pageCount = undefined;
        const pageCountMatch = linkText.match(/(\d+)\s*pages?/i);
        if (pageCountMatch && pageCountMatch[1]) {
          pageCount = parseInt(pageCountMatch[1], 10);
        }
        
        // Create full URL
        let fullUrl = href;
        if (href.startsWith('/')) {
          fullUrl = 'https://find-and-update.company-information.service.gov.uk' + href;
        } else if (!href.startsWith('http')) {
          fullUrl = 'https://find-and-update.company-information.service.gov.uk/' + href;
        }
        
        // Add document to the list
        documentLinks.push({
          linkText: linkText,
          linkType: linkType,
          url: fullUrl,
          pageCount: pageCount || '',
          filingTypeCode: filingTypeCode
        });
      }
      
      // Determine filing type for categorization
      let type = 'Other';
      const descLower = description.toLowerCase();
      
      if (descLower.includes('accounts')) {
        type = 'Accounts';
      } else if (descLower.includes('confirmation statement')) {
        type = 'Confirmation Statement';
      } else if (descLower.includes('annual return')) {
        type = 'Annual Return';
      } else if (descLower.includes('appointment') || descLower.includes('director') || 
                descLower.includes('change') || descLower.includes('termination')) {
        type = 'Officers';
      } else if (descLower.includes('charge') || descLower.includes('mortgage')) {
        type = 'Charges';
      } else if (descLower.includes('resolution')) {
        type = 'Resolution';
      }
      
      // Create filing object only if we have the minimum required data
      if (date && description) {
        extractedFilings.push({
          date,
          description,
          type,
          filingCode: filingTypeCode || '',
          status: 'Filed',
          documentLinks
        });
      }
    }
    
    console.log(`Extracted ${extractedFilings.length} filings with ${extractedFilings.reduce((count, filing) => count + (filing.documentLinks?.length || 0), 0)} documents`);
    return extractedFilings;
  });
  
  // Log extraction results
  console.log(`Total filings extracted: ${filings.length}`);
  console.log(`Filings with documents: ${filings.filter(f => f.documentLinks && f.documentLinks.length > 0).length}`);
  
  return filings;
}

/**
 * Helper function to get a type definition
 */
export function getFilingType(filing) {
  if (!filing || !filing.description) return 'Other';
  
  const desc = filing.description.toLowerCase();
  if (desc.includes('accounts')) return 'Accounts';
  if (desc.includes('confirmation statement')) return 'Confirmation Statement';
  if (desc.includes('annual return')) return 'Annual Return';
  if (desc.includes('appointment') || desc.includes('director')) return 'Officers';
  if (desc.includes('termination') || desc.includes('resignation')) return 'Officers';
  if (desc.includes('charge') || desc.includes('mortgage')) return 'Charges';
  if (desc.includes('resolution')) return 'Resolution';
  return 'Other';
}
