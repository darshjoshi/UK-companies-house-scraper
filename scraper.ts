import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import 'dotenv/config';

// Types and interfaces
interface FilingData {
  date: string;
  description: string;
  type: string;
  status: string;
  documentLinks: DocumentLink[];
}

interface DocumentLink {
  linkText: string;
  linkType: string;
  url: string;
  pageCount?: string;
}

interface PersonLink {
  linkText: string;
  url: string;
  linkType: 'profile' | 'appointment' | 'other';
}

interface OfficerData {
  name: string;
  role: string;
  appointmentDate?: string;
  resignationDate?: string;
  nationality?: string;
  occupation?: string;
  address?: string;
  dateOfBirth?: string;
  links: PersonLink[];
}

interface PeopleData {
  officers: OfficerData[];
  totalOfficers: number;
  pagesScraped: number;
  activeOfficers: number;
  resignedOfficers: number;
}

interface ScrapingResult {
  query: string;
  extractionTimestamp: string;
  qualityScore: number;
  dataIssues: string[];
  overview?: any;
  filing?: {
    filings: FilingData[];
    totalFilings: number;
    pagesScraped: number;
    statistics: FilingStatistics;
    dateRange?: {
      earliest: string;
      latest: string;
    };
  };
  people?: any;
  charges?: any;
}

interface FilingStatistics {
  totalFilings: number;
  filingsWithDocuments: number;
  totalDocumentPages: number;
  documentSuccessRate: number;
  filingTypes: Record<string, number>;
}

// Enhanced utility functions
class ScraperUtils {
  static async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 2000,
    operationName: string = 'operation'
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`${operationName} - Attempt ${attempt}/${maxRetries}`);
        return await operation();
      } catch (error) {
        console.log(`${operationName} attempt ${attempt} failed:`, error.message);
        if (attempt === maxRetries) {
          throw new Error(`${operationName} failed after ${maxRetries} attempts: ${error.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
    throw new Error(`Max retries exceeded for ${operationName}`);
  }

  static async smartDelay(page: any, minDelay: number = 1000): Promise<void> {
    try {
      const complexity = await page.evaluate(() => {
        const tables = document.querySelectorAll('table').length;
        const links = document.querySelectorAll('a').length;
        const forms = document.querySelectorAll('form').length;
        return Math.min(8000, 1000 + (tables * 300) + (links * 5) + (forms * 200));
      });
      
      const delayTime = Math.max(minDelay, complexity);
      console.log(`Smart delay: ${delayTime}ms (complexity-based)`);
      await new Promise(resolve => setTimeout(resolve, delayTime));
    } catch (error) {
      console.log(`Smart delay fallback: ${minDelay}ms`);
      await new Promise(resolve => setTimeout(resolve, minDelay));
    }
  }

  static async waitForPageLoad(page: any, timeout: number = 10000): Promise<void> {
    try {
      await page.evaluate(() => {
        return new Promise((resolve) => {
          if (document.readyState === 'complete') {
            resolve(true);
          } else {
            window.addEventListener('load', () => resolve(true));
            // Fallback timeout
            setTimeout(() => resolve(true), 8000);
          }
        });
      });
      await this.smartDelay(page, 1500);
    } catch (error) {
      console.log('Page load wait failed, continuing...', error.message);
    }
  }

  static categorizeFilingType(description: string): string {
    const desc = description.toLowerCase();
    if (desc.includes("confirmation statement")) return "Confirmation Statement";
    if (desc.includes("annual return")) return "Annual Return";
    if (desc.includes("accounts") && desc.includes("micro")) return "Micro Company Accounts";
    if (desc.includes("accounts") && desc.includes("small")) return "Small Company Accounts";
    if (desc.includes("accounts") && desc.includes("dormant")) return "Dormant Company Accounts";
    if (desc.includes("accounts")) return "Company Accounts";
    if (desc.includes("incorporation")) return "Incorporation";
    if (desc.includes("appointment")) return "Officer Appointment";
    if (desc.includes("termination") || desc.includes("resignation")) return "Officer Termination";
    if (desc.includes("change") && desc.includes("details")) return "Officer Details Change";
    if (desc.includes("resolution")) return "Resolution";
    if (desc.includes("charge")) return "Charge Registration";
    return "Other";
  }
}

// Enhanced PDF extraction class with fixed DOM extraction
class PDFExtractor {
  private page: any;

  constructor(page: any) {
    this.page = page;
  }

  async debugPageContent(): Promise<void> {
    console.log("=== DEBUG: PAGE CONTENT ANALYSIS ===");
    
    const analysis = await this.page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      const results: any = {
        url: window.location.href,
        title: document.title,
        tableCount: tables.length,
        tables: [] as any[]
      };

      // Add specific analysis for fhTable
      const filingTable = document.getElementById('fhTable');
      if (filingTable) {
        results['filingTableFound'] = true;
        results['pdfLinks'] = Array.from(filingTable.querySelectorAll('a.download')).map((link: any) => ({
          text: link.textContent.trim(),
          href: link.getAttribute('href')
        }));
      } else {
        results['filingTableFound'] = false;
      }

      // Analyze tables for debugging
      tables.forEach((table, tableIndex) => {
        const rows = table.querySelectorAll('tr');
        const tableInfo = {
          index: tableIndex,
          id: table.id || 'no-id',
          rowCount: rows.length,
          sampleRows: [] as any[]
        };

        // Analyze first few rows
        for (let i = 0; i < Math.min(rows.length, 3); i++) {
          const row = rows[i];
          const cells = row.querySelectorAll('td, th');
          const rowInfo = {
            index: i,
            cellCount: cells.length,
            cells: [] as any[]
          };

          cells.forEach((cell, cellIndex) => {
            const links = cell.querySelectorAll('a[href]');
            rowInfo.cells.push({
              index: cellIndex,
              text: cell.textContent?.trim().substring(0, 100),
              linkCount: links.length,
              links: Array.from(links).map((link: any) => ({
                text: link.textContent?.trim(),
                href: link.getAttribute('href'),
                classes: link.getAttribute('class')
              }))
            });
          });

          tableInfo.sampleRows.push(rowInfo);
        }

        results.tables.push(tableInfo);
      });

      return results;
    });

    console.log("Page analysis:", JSON.stringify(analysis, null, 2));
  }

  async extractWithDirectDOM(): Promise<FilingData[]> {
    console.log("Extracting PDF links using enhanced direct DOM manipulation...");
    
    await this.debugPageContent();

    return await this.page.evaluate(() => {
      const results: any[] = [];
      
      // Target the Companies House filing table specifically
      const filingTable = document.getElementById('fhTable');
      if (!filingTable) {
        console.log('Filing table (fhTable) not found');
        return [];
      }
      
      // Get all rows except the header
      const rows = Array.from(filingTable.querySelectorAll('tr')).slice(1);
      console.log(`Processing ${rows.length} rows from filing table`);
      
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) continue;
        
        const dateCell = cells[0];
        const typeCell = cells.length > 3 ? cells[1] : null; // Type column may be hidden
        const descriptionCell = cells.length > 3 ? cells[2] : cells[1];
        const linksCell = cells[cells.length - 1]; // Last cell contains PDF links
        
        const date = dateCell?.textContent?.trim() || '';
        const description = descriptionCell?.textContent?.trim() || '';
        const type = typeCell?.textContent?.trim() || '';
        
        // Validate date format (should match "DD MMM YYYY" pattern)
        if (!date || !date.match(/\d{1,2}\s+\w+\s+\d{4}/)) {
          continue;
        }
        
        // Extract all PDF links from the links cell
        // Companies House uses specific classes for their PDF links
        const linkElements = linksCell.querySelectorAll('a.download.link-updater-js');
        const documentLinks: any[] = [];
        
        Array.from(linkElements).forEach((link: Element) => {
          const href = link.getAttribute('href');
          const linkText = link.textContent?.trim() || '';
          
          if (href && linkText) {
            // Construct full URL
            let fullUrl = href;
            if (href.startsWith('/')) {
              fullUrl = `https://find-and-update.company-information.service.gov.uk${href}`;
            }
            
            // Determine document type
            let linkType = 'PDF';
            if (linkText.toLowerCase().includes('ixbrl') || href.includes('format=xhtml')) {
              linkType = 'iXBRL';
            } else if (linkText.toLowerCase().includes('xml')) {
              linkType = 'XML';
            }
            
            // Extract page count from parent element text
            // Companies House shows this as "(X pages)" after the link
            const parentText = link.parentElement?.textContent || '';
            const pageMatch = parentText.match(/\((\d+)\s+pages?\)/i);
            const pageCount = pageMatch ? pageMatch[1] : '';
            
            documentLinks.push({
              linkText: linkText,
              linkType: linkType,
              url: fullUrl,
              pageCount: pageCount
            });
          }
        });
        
        if (date && description) {
          // Categorize filing type if not explicitly provided
          const filingType = type || this.categorizeFilingType(description);
          
          results.push({
            date: date,
            description: description,
            type: filingType,
            status: 'Filed',
            documentLinks: documentLinks
          });
        }
      }
      
      console.log(`DOM extraction found ${results.length} filings with ${results.reduce((sum, filing) => sum + filing.documentLinks.length, 0)} PDF links`);
      return results;
    });
  }

  async extractWithLLM(): Promise<FilingData[]> {
    console.log("Extracting PDF links using LLM with z.string().url() type...");

    try {
      const result = await this.page.extract({
        instruction: `Extract the filing history table from this Companies House page. 
        For each filing row, extract:
        1. Date (first column) - must be in format like "01 Jan 2024"
        2. Description (the filing description, usually in bold)
        3. Document links in the last column - Extract ALL "View PDF" links
        
        IMPORTANT: 
        - Each PDF link appears in the last column of the table
        - The links have class "download" and usually say "View PDF"
        - Extract the COMPLETE URL for each document link
        - Look for page count information that appears in parentheses after the link (e.g., "(3 pages)")
        
        The table ID is "fhTable" and contains all the filing history information.`,
        schema: z.object({
          filings: z.array(z.object({
            date: z.string().describe("Filing date (e.g., '01 Dec 2022')"),
            description: z.string().describe("Filing description (e.g., 'Confirmation statement made on 1 December 2022')"),
            documentLinks: z.array(z.object({
              linkText: z.string().describe("Link text (e.g., 'View PDF')"),
              url: z.string().url().describe("Complete URL to the document"),
              pageCount: z.string().optional().describe("Number of pages if available (e.g., '3')")
            })).describe("All document links for this filing")
          }))
        })
      });

      // Post-process the extracted data
      const processedFilings = result.filings.map(filing => {
        // Categorize the filing type based on description
        const type = this.categorizeFilingType(filing.description);
        
        // Process document links
        const processedLinks = filing.documentLinks.map(link => {
          let url = link.url;
          // Ensure URL is complete
          if (url && url.startsWith('/')) {
            url = `https://find-and-update.company-information.service.gov.uk${url}`;
          }
          
          // Determine link type if not already specified
          let linkType = 'PDF';
          if (link.linkText?.toLowerCase().includes('ixbrl') || url.includes('format=xhtml')) {
            linkType = 'iXBRL';
          } else if (link.linkText?.toLowerCase().includes('xml')) {
            linkType = 'XML';
          }
          
          return {
            linkText: link.linkText || 'View Document',
            url: url,
            linkType: linkType,
            pageCount: link.pageCount || ''
          };
        }).filter(link => link.url && link.url.length > 10);
        
        return {
          date: filing.date,
          description: filing.description,
          type: type,
          status: 'Filed',
          documentLinks: processedLinks
        };
      });

      console.log(`LLM extraction found ${processedFilings.length} filings with ${processedFilings.reduce((sum, filing) => sum + filing.documentLinks.length, 0)} PDF links`);
      return processedFilings;
    } catch (error) {
      console.log("LLM extraction failed:", error.message);
      return [];
    }
  }

  // Helper method to categorize filing types
  private categorizeFilingType(description: string): string {
    const desc = description.toLowerCase();
    if (desc.includes("confirmation statement")) return "Confirmation Statement";
    if (desc.includes("annual return")) return "Annual Return";
    if (desc.includes("accounts") && desc.includes("micro")) return "Micro Company Accounts";
    if (desc.includes("accounts") && desc.includes("small")) return "Small Company Accounts";
    if (desc.includes("accounts") && desc.includes("dormant")) return "Dormant Company Accounts";
    if (desc.includes("accounts")) return "Company Accounts";
    if (desc.includes("incorporation")) return "Incorporation";
    if (desc.includes("appointment")) return "Officer Appointment";
    if (desc.includes("termination") || desc.includes("resignation")) return "Officer Termination";
    if (desc.includes("change") && desc.includes("details")) return "Officer Details Change";
    if (desc.includes("resolution")) return "Resolution";
    if (desc.includes("charge")) return "Charge Registration";
    return "Other";
  }

  // New hybrid approach that combines DOM structure knowledge with LLM extraction
  private async extractWithHybridApproach(): Promise<FilingData[]> {
    console.log("Using hybrid DOM+LLM approach for extraction...");
    
    // First, use DOM to get the table structure
    const tableStructure = await this.page.evaluate(() => {
      const filingTable = document.getElementById('fhTable');
      if (!filingTable) return null;
      
      // Get basic structure
      const rows = Array.from(filingTable.querySelectorAll('tr')).slice(1);
      return rows.map(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) return null;
        
        const date = cells[0]?.textContent?.trim() || '';
        const description = cells.length > 3 ? cells[2]?.textContent?.trim() : cells[1]?.textContent?.trim() || '';
        
        // Get link cell HTML to pass to LLM
        const linkCell = cells[cells.length - 1];
        const linkCellHTML = linkCell ? linkCell.innerHTML : '';
        
        return { date, description, linkCellHTML };
      }).filter(Boolean);
    });
    
    if (!tableStructure || tableStructure.length === 0) {
      console.log("No table structure found");
      return [];
    }
    
    // Now use LLM to extract links from the HTML of each link cell
    const filings: FilingData[] = [];
    
    for (const row of tableStructure) {
      try {
        // Use LLM to extract links from the HTML
        const linkResult = await this.page.extract({
          instruction: `Extract all PDF links from the following HTML of a table cell.
          The HTML contains links to PDF documents on Companies House.
          Look for <a> tags with class "download" and extract the complete URL and link text.
          Also look for page count info which appears in parentheses like "(3 pages)".
          
          HTML to analyze: ${row.linkCellHTML}`,
          schema: z.object({
            links: z.array(z.object({
              url: z.string().url().describe("The URL of the PDF document"),
              text: z.string().describe("The text of the link"),
              pageCount: z.string().optional().describe("Number of pages")
            }))
          })
        });
        
        // Process the links
        const documentLinks = linkResult.links.map(link => {
          let url = link.url;
          if (url && url.startsWith('/')) {
            url = `https://find-and-update.company-information.service.gov.uk${url}`;
          }
          
          let linkType = 'PDF';
          if (link.text?.toLowerCase().includes('ixbrl') || url.includes('format=xhtml')) {
            linkType = 'iXBRL';
          }
          
          return {
            linkText: link.text || 'View Document',
            url: url,
            linkType: linkType,
            pageCount: link.pageCount || ''
          };
        });
        
        // Add to filings array
        if (row.date && row.description) {
          filings.push({
            date: row.date,
            description: row.description,
            type: this.categorizeFilingType(row.description),
            status: 'Filed',
            documentLinks: documentLinks
          });
        }
      } catch (error) {
        console.log(`Error extracting links from row: ${error.message}`);
        // Continue with next row
      }
    }
    
    return filings;
  }

  async extractWithMultipleStrategies(): Promise<FilingData[]> {
    // Try more reliable strategies first, then fall back to others
    const strategies = [
      { name: 'Direct DOM', method: () => this.extractWithDirectDOM() },
      { name: 'LLM with URL type', method: () => this.extractWithLLM() },
      { name: 'Hybrid Approach', method: () => this.extractWithHybridApproach() }
    ];

    for (const strategy of strategies) {
      try {
        console.log(`Trying ${strategy.name} extraction strategy...`);
        const results = await strategy.method();
        
        if (results && results.length > 0) {
          // Validate that we have actual PDF links
          const filingsWithPDFs = results.filter(f => f.documentLinks && f.documentLinks.length > 0);
          console.log(`${strategy.name} strategy succeeded with ${results.length} filings, ${filingsWithPDFs.length} have document links`);
          
          if (filingsWithPDFs.length > 0) {
            return results;
          }
          console.log(`${strategy.name} found filings but no PDF links, trying next strategy...`);
        }
      } catch (error) {
        console.log(`${strategy.name} strategy failed:`, error.message);
      }
    }

    console.log("All PDF extraction strategies failed");
    return [];
  }
}

// Enhanced People extraction class with multi-page support and URL extraction
class PeopleExtractor {
  private page: any;

  constructor(page: any) {
    this.page = page;
  }

  async debugPeoplePageContent(): Promise<void> {
    console.log("=== DEBUG: PEOPLE PAGE CONTENT ANALYSIS ===");
    
    const analysis = await this.page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      const results: any = {
        url: window.location.href,
        title: document.title,
        tableCount: tables.length,
        peopleElements: []
      };

      // Look for officer/people tables
      tables.forEach((table: any, index: number) => {
        const tableInfo: any = {
          index,
          id: table.id,
          classes: table.className,
          rowCount: table.querySelectorAll('tr').length,
          sampleRows: []
        };

        // Analyze first few rows for structure
        const rows = Array.from(table.querySelectorAll('tr')).slice(0, 3);
        rows.forEach((row: any, rowIndex: number) => {
          const cells = row.querySelectorAll('td, th');
          const rowInfo: any = {
            index: rowIndex,
            cellCount: cells.length,
            cells: []
          };

          cells.forEach((cell: any, cellIndex: number) => {
            const links = cell.querySelectorAll('a');
            rowInfo.cells.push({
              index: cellIndex,
              text: cell.textContent?.trim().substring(0, 100),
              linkCount: links.length,
              links: Array.from(links).map((link: any) => ({
                text: link.textContent?.trim(),
                href: link.getAttribute('href'),
                classes: link.getAttribute('class')
              }))
            });
          });

          tableInfo.sampleRows.push(rowInfo);
        });

        results.peopleElements.push(tableInfo);
      });

      return results;
    });

    console.log("People page analysis:", JSON.stringify(analysis, null, 2));
  }

  async extractWithDirectDOM(): Promise<OfficerData[]> {
    console.log("Extracting people data using direct DOM manipulation...");
    
    await this.debugPeoplePageContent();

    return await this.page.evaluate(() => {
      const results: any[] = [];
      
      // Look for officer tables - Companies House uses various table structures
      const possibleTables = [
        document.getElementById('officers-table'),
        document.querySelector('table[data-test="officers-table"]'),
        document.querySelector('.officers-table'),
        ...Array.from(document.querySelectorAll('table')).filter(table => 
          table.textContent?.toLowerCase().includes('officer') ||
          table.textContent?.toLowerCase().includes('director') ||
          table.textContent?.toLowerCase().includes('secretary')
        )
      ].filter(Boolean);

      for (const table of possibleTables) {
        if (!table) continue;
        
        const rows = Array.from(table.querySelectorAll('tr')).slice(1); // Skip header
        
        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          if (cells.length < 2) continue;
          
          let name = '';
          let role = '';
          let appointmentDate = '';
          let resignationDate = '';
          let address = '';
          const links: any[] = [];
          
          // Extract text content from cells
          cells.forEach((cell: any, index: number) => {
            const text = cell.textContent?.trim() || '';
            
            // Extract links from this cell
            const cellLinks = cell.querySelectorAll('a');
            cellLinks.forEach((link: any) => {
              const href = link.getAttribute('href');
              const linkText = link.textContent?.trim();
              
              if (href && linkText) {
                let linkType: 'profile' | 'appointment' | 'other' = 'other';
                
                if (href.includes('/officers/') || href.includes('/people/')) {
                  linkType = 'profile';
                } else if (href.includes('appointment') || href.includes('filing')) {
                  linkType = 'appointment';
                }
                
                // Convert relative URLs to absolute
                const fullUrl = href.startsWith('http') ? href : 
                  href.startsWith('/') ? `https://find-and-update.company-information.service.gov.uk${href}` :
                  `https://find-and-update.company-information.service.gov.uk/${href}`;
                
                links.push({
                  linkText: linkText,
                  url: fullUrl,
                  linkType: linkType
                });
              }
            });
            
            // Determine what this cell contains based on content and position
            if (index === 0 || text.match(/^[A-Z][a-z]+ [A-Z]/)) {
              name = text;
            } else if (text.toLowerCase().includes('director') || 
                      text.toLowerCase().includes('secretary') ||
                      text.toLowerCase().includes('officer')) {
              role = text;
            } else if (text.match(/\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/)) {
              if (!appointmentDate) {
                appointmentDate = text;
              } else {
                resignationDate = text;
              }
            } else if (text.length > 20 && text.includes(',')) {
              address = text;
            }
          });
          
          if (name && role) {
            results.push({
              name: name,
              role: role,
              appointmentDate: appointmentDate || undefined,
              resignationDate: resignationDate || undefined,
              address: address || undefined,
              links: links
            });
          }
        }
      }
      
      console.log(`DOM extraction found ${results.length} officers with ${results.reduce((sum, officer) => sum + officer.links.length, 0)} links`);
      return results;
    });
  }

  async extractWithLLM(): Promise<OfficerData[]> {
    console.log("Extracting people data using LLM...");

    try {
      const result = await this.page.extract({
        instruction: `Extract all company officers, directors, and secretaries from this Companies House page.
        For each person, extract:
        1. Name (full name)
        2. Role/Position (director, secretary, etc.)
        3. Appointment date (if available)
        4. Resignation date (if available)
        5. Address (if available)
        6. All clickable links associated with this person
        
        IMPORTANT: 
        - Extract ALL clickable links for each person (profile links, appointment links, etc.)
        - Convert relative URLs to absolute URLs
        - Identify link types: 'profile' for person profile pages, 'appointment' for filing/appointment documents, 'other' for everything else
        - Include link text and full URL`,
        schema: z.object({
          officers: z.array(z.object({
            name: z.string(),
            role: z.string(),
            appointmentDate: z.string().optional(),
            resignationDate: z.string().optional(),
            nationality: z.string().optional(),
            occupation: z.string().optional(),
            address: z.string().optional(),
            dateOfBirth: z.string().optional(),
            links: z.array(z.object({
              linkText: z.string(),
              url: z.string().url(),
              linkType: z.enum(['profile', 'appointment', 'other'])
            }))
          }))
        })
      });

      const processedOfficers = result.officers.map((officer: any) => {
        // Ensure all URLs are absolute
        const processedLinks = officer.links.map((link: any) => {
          let fullUrl = link.url;
          if (!fullUrl.startsWith('http')) {
            fullUrl = fullUrl.startsWith('/') ? 
              `https://find-and-update.company-information.service.gov.uk${fullUrl}` :
              `https://find-and-update.company-information.service.gov.uk/${fullUrl}`;
          }
          
          return {
            linkText: link.linkText,
            url: fullUrl,
            linkType: link.linkType
          };
        }).filter((link: any) => link.url && link.url.length > 10);
        
        return {
          name: officer.name,
          role: officer.role,
          appointmentDate: officer.appointmentDate,
          resignationDate: officer.resignationDate,
          nationality: officer.nationality,
          occupation: officer.occupation,
          address: officer.address,
          dateOfBirth: officer.dateOfBirth,
          links: processedLinks
        };
      });

      console.log(`LLM extraction found ${processedOfficers.length} officers with ${processedOfficers.reduce((sum: number, officer: any) => sum + officer.links.length, 0)} links`);
      return processedOfficers;
    } catch (error) {
      console.log("LLM people extraction failed:", error.message);
      return [];
    }
  }

  async extractWithMultipleStrategies(): Promise<OfficerData[]> {
    const strategies = [
      { name: 'LLM with URL extraction', method: () => this.extractWithLLM() },
      { name: 'Direct DOM', method: () => this.extractWithDirectDOM() }
    ];

    for (const strategy of strategies) {
      try {
        console.log(`Trying ${strategy.name} people extraction strategy...`);
        const results = await strategy.method();
        
        if (results && results.length > 0) {
          const officersWithLinks = results.filter(officer => officer.links && officer.links.length > 0);
          console.log(`${strategy.name} strategy succeeded with ${results.length} officers, ${officersWithLinks.length} have clickable links`);
          
          // Return results even if some don't have links, as basic officer info is still valuable
          return results;
        }
      } catch (error) {
        console.log(`${strategy.name} strategy failed:`, error.message);
      }
    }

    console.log("All people extraction strategies failed");
    return [];
  }
}

// Enhanced navigation class
class Navigator {
  private page: any;

  constructor(page: any) {
    this.page = page;
  }

  async navigateToSection(sectionName: string): Promise<boolean> {
    console.log(`Navigating to ${sectionName} section...`);

    const strategies = [
      () => this.clickTabLink(sectionName),
      () => this.directURLNavigation(sectionName),
      () => this.searchAndClick(sectionName)
    ];

    for (let i = 0; i < strategies.length; i++) {
      try {
        console.log(`Trying navigation approach ${i + 1} for ${sectionName}...`);
        await strategies[i]();
        await ScraperUtils.waitForPageLoad(this.page);
        
        // Verify navigation worked
        const currentUrl = this.page.url();
        const pageTitle = await this.page.evaluate(() => document.title);
        
        console.log(`Navigation result - URL: ${currentUrl}, Title: ${pageTitle}`);
        
        if (currentUrl.toLowerCase().includes(sectionName.toLowerCase().replace(' ', '-')) ||
            pageTitle.toLowerCase().includes(sectionName.toLowerCase())) {
          console.log(`Successfully navigated to ${sectionName} using approach ${i + 1}`);
          return true;
        }
      } catch (error) {
        console.log(`Navigation approach ${i + 1} failed:`, error.message);
      }
    }

    throw new Error(`Failed to navigate to ${sectionName} section`);
  }

  private async clickTabLink(sectionName: string): Promise<void> {
    await this.page.act(`Click on the link or tab that contains "${sectionName}"`);
  }

  private async directURLNavigation(sectionName: string): Promise<void> {
    const currentUrl = this.page.url();
    const baseUrl = currentUrl.split(/[?#]/)[0].replace(/\/(filing-history|officers|people|charges|more)$/, '');
    
    const sectionPaths: Record<string, string> = {
      'filing history': '/filing-history',
      'people': '/officers',
      'officers': '/officers',
      'charges': '/charges',
      'more': '/more'
    };

    const targetPath = sectionPaths[sectionName.toLowerCase()];
    if (!targetPath) {
      throw new Error(`Unknown section: ${sectionName}`);
    }

    const targetUrl = baseUrl + targetPath;
    console.log(`Direct navigation to: ${targetUrl}`);
    await this.page.goto(targetUrl);
  }

  private async searchAndClick(sectionName: string): Promise<void> {
    await this.page.evaluate((section: string) => {
      const elements = Array.from(document.querySelectorAll('a, button, [role="button"]'));
      const target = elements.find((el: Element) => 
        el.textContent?.toLowerCase().includes(section.toLowerCase())
      );
      if (target) {
        (target as HTMLElement).click();
      } else {
        throw new Error(`Could not find clickable element for ${section}`);
      }
    }, sectionName);
  }
}

// Main scraper class
class CompaniesHouseScraper {
  private stagehand: any;
  private page: any;
  private navigator: Navigator;
  private pdfExtractor: PDFExtractor;
  private peopleExtractor: PeopleExtractor;

  constructor() {
    this.stagehand = new Stagehand({
      env: "LOCAL",
      modelName: "claude-3-5-sonnet-20241022",
      modelClientOptions: {
        apiKey: process.env.ANTHROPIC_API_KEY
      },
      enableCaching: true,
      verbose: 1,
      domSettleTimeoutMs: 8000
    });
  }

  async initialize(): Promise<void> {
    await this.stagehand.init();
    this.page = this.stagehand.page;
    this.navigator = new Navigator(this.page);
    this.pdfExtractor = new PDFExtractor(this.page);
    this.peopleExtractor = new PeopleExtractor(this.page);
  }

  async searchCompany(companyName: string): Promise<void> {
    console.log(`Searching for company: ${companyName}`);

    await ScraperUtils.retryOperation(async () => {
      await this.page.goto("https://find-and-update.company-information.service.gov.uk");
      await ScraperUtils.waitForPageLoad(this.page);
    }, 3, 2000, 'Initial navigation');

    // Handle cookies
    try {
      await this.page.act("Accept cookies if there is a cookie banner");
      await ScraperUtils.smartDelay(this.page, 1000);
    } catch (e) {
      console.log("No cookie banner found or already handled");
    }

    // Perform search
    await ScraperUtils.retryOperation(async () => {
      await this.page.act(`Type "${companyName}" into the company search input field`);
      await this.page.act("Click the search button");
      await ScraperUtils.waitForPageLoad(this.page);
      
      // Verify search results
      const hasResults = await this.page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        return bodyText.includes('result') || bodyText.includes('company') || bodyText.includes('search');
      });
      
      if (!hasResults) {
        throw new Error("Search did not return results");
      }
    }, 3, 2000, 'Company search');

    // Select first result
    await this.page.act("Click on the first company result");
    await ScraperUtils.waitForPageLoad(this.page);
  }

  async extractOverview(): Promise<any> {
    console.log("Extracting company overview...");

    try {
      const overview = await this.page.extract({
        instruction: "Extract complete company details including name, number, status, incorporation date, type, and registered address",
        schema: z.object({
          companyName: z.string(),
          companyNumber: z.string(),
          status: z.string(),
          incorporationDate: z.string().optional(),
          companyType: z.string().optional(),
          registeredAddress: z.string().optional()
        })
      });

      console.log("Overview extracted successfully");
      return overview;
    } catch (error) {
      console.error("Overview extraction failed:", error.message);
      return null;
    }
  }

  // New pagination methods
  private async hasNextFilingPage(): Promise<boolean> {
    try {
      // Check if there's a "Next" link or an enabled "Next" button
      const hasNextPage = await this.page.evaluate(() => {
        const nextLink = document.querySelector('a#next-page:not([aria-disabled="true"])');
        return !!nextLink;
      });
      
      return hasNextPage;
    } catch (error) {
      console.warn("Error checking for next page:", error.message);
      return false;
    }
  }

  private async navigateToNextFilingPage(): Promise<void> {
    try {
      // Click the "Next" link/button using act
      await this.page.act("Click on the 'Next' link or button");
      
      // Double-check if click worked
      const clickResult = await this.page.evaluate(() => {
        const nextLink = document.querySelector('a#next-page:not([aria-disabled="true"])');
        if (nextLink) {
          (nextLink as HTMLElement).click();
          return true;
        }
        return false;
      });
      
      if (!clickResult) {
        console.log("Next button click with act() and direct DOM didn't work, trying URL-based navigation");
        
        // Fallback to URL-based navigation
        const currentUrl = this.page.url();
        let nextPageNum = 1;
        
        // Extract current page number if present
        const pageMatch = currentUrl.match(/[?&]page=(\d+)/);
        if (pageMatch) {
          nextPageNum = parseInt(pageMatch[1]) + 1;
        } else {
          nextPageNum = 2; // We're on page 1, so next is page 2
        }
        
        // Construct URL for next page
        const nextUrl = currentUrl.includes('?') 
          ? currentUrl.replace(/([?&]page=\d+)|$/, `&page=${nextPageNum}`)
          : `${currentUrl}?page=${nextPageNum}`;
        
        console.log(`Navigating to next page URL: ${nextUrl}`);
        await this.page.goto(nextUrl);
      }
      
      console.log("Navigated to next filing page");
      return;
    } catch (error) {
      throw new Error(`Failed to navigate to next filing page: ${error.message}`);
    }
  }

  private async getTotalPageCount(): Promise<number> {
    try {
      // Try to determine total number of pages
      const pageCount = await this.page.evaluate(() => {
        // Look for pagination links and get the highest number
        const pageLinks = Array.from(document.querySelectorAll('.govuk-pagination__item a[data-page]'));
        if (pageLinks.length === 0) return 1;
        
        let maxPage = 1;
        pageLinks.forEach(link => {
          const pageNum = parseInt((link as HTMLElement).getAttribute('data-page') || '1');
          if (pageNum > maxPage) maxPage = pageNum;
        });
        
        return maxPage;
      });
      
      return pageCount || 1;
    } catch (error) {
      console.warn("Error determining page count:", error.message);
      return 1; // Assume at least 1 page
    }
  }

  private async navigateToFilingPage(pageNumber: number): Promise<void> {
    try {
      // First, check if we're already on that page
      const currentPage = await this.getCurrentFilingPage();
      if (currentPage === pageNumber) {
        console.log(`Already on filing page ${pageNumber}`);
        return;
      }
      
      // Try to click the page number directly
      const clickedPage = await this.page.evaluate((pageNum) => {
        const pageLink = document.querySelector(`a#pageNo${pageNum}[data-page="${pageNum}"]`);
        if (pageLink) {
          (pageLink as HTMLElement).click();
          return true;
        }
        return false;
      }, pageNumber);
      
      if (clickedPage) {
        console.log(`Clicked on page ${pageNumber} link`);
        await ScraperUtils.waitForPageLoad(this.page);
        return;
      }
      
      // Fallback to URL-based navigation
      const currentUrl = this.page.url();
      const baseUrl = currentUrl.split('?')[0];
      await this.page.goto(`${baseUrl}?page=${pageNumber}`);
      console.log(`Navigated to page ${pageNumber} via URL`);
      await ScraperUtils.waitForPageLoad(this.page);
    } catch (error) {
      throw new Error(`Failed to navigate to filing page ${pageNumber}: ${error.message}`);
    }
  }

  private async getCurrentFilingPage(): Promise<number> {
    try {
      // Try to determine current page number
      const currentPage = await this.page.evaluate(() => {
        // Look for current page in URL
        const pageMatch = window.location.href.match(/[?&]page=(\d+)/);
        if (pageMatch) return parseInt(pageMatch[1]);
        
        // Look for active pagination item
        const activePage = document.querySelector('.govuk-pagination__item--current a[data-page]');
        if (activePage) return parseInt(activePage.getAttribute('data-page') || '1');
        
        return 1; // Default to page 1
      });
      
      return currentPage || 1;
    } catch (error) {
      console.warn("Error determining current page:", error.message);
      return 1; // Assume page 1
    }
  }

  // Enhanced filing history extraction with pagination support
  async extractFilingHistory(maxPages: number = 10): Promise<any> {
    console.log("Extracting filing history...");

    try {
      // First navigate to Filing history section
      await this.navigator.navigateToSection("Filing history");
      
      // Wait for page to fully load
      await ScraperUtils.waitForPageLoad(this.page);
      
      // Get an estimate of total pages (this helps us decide on the extraction strategy)
      const estimatedTotalPages = await this.getTotalPageCount();
      console.log(`Estimated total filing pages: ${estimatedTotalPages}`);
      
      // Initialize an array to store filings from all pages
      let allFilings: FilingData[] = [];
      let pagesScraped = 0;
      
      // Limit the number of pages to scan to avoid excessive processing
      const pagesToScan = Math.min(estimatedTotalPages, maxPages);
      
      // Process all pages
      for (let pageNum = 1; pageNum <= pagesToScan; pageNum++) {
        console.log(`Processing filing history page ${pageNum}/${pagesToScan}...`);
        
        // Navigate to the specific page (this handles page 1 correctly too)
        if (pageNum > 1) {
          await this.navigateToFilingPage(pageNum);
        }
        
        // Add a small delay to ensure the page loads
        await new Promise(resolve => setTimeout(resolve, 1500));
        await ScraperUtils.waitForPageLoad(this.page);
        
        // Extract filings from current page
        const pageFilings = await this.pdfExtractor.extractWithMultipleStrategies();
        pagesScraped++;
        
        if (pageFilings && pageFilings.length > 0) {
          // Add filings from this page to our collection
          allFilings = [...allFilings, ...pageFilings];
          console.log(`Extracted ${pageFilings.length} filings from page ${pageNum}, total: ${allFilings.length}`);
        } else {
          console.log(`No filings found on page ${pageNum}`);
          
          // If we couldn't extract any filings from this page, it might mean we've reached the end
          // Let's verify by checking if the page actually exists
          const currentPage = await this.getCurrentFilingPage();
          if (currentPage !== pageNum) {
            console.log(`Expected page ${pageNum}, but on page ${currentPage}. Stopping pagination.`);
            break;
          }
        }
      }
      
      if (allFilings.length === 0) {
        console.log("No filings found across any pages");
        return null;
      }

      // Calculate statistics across all pages
      const statistics = this.calculateFilingStatistics(allFilings);
      
      // Calculate date range
      const dateRange = this.calculateDateRange(allFilings);

      console.log(`Successfully extracted ${allFilings.length} filings with ${statistics.filingsWithDocuments} PDF documents across ${pagesScraped} pages`);

      return {
        filings: allFilings,
        totalFilings: allFilings.length,
        pagesScraped: pagesScraped,
        statistics: statistics,
        dateRange: dateRange
      };

    } catch (error) {
      console.error("Filing history extraction failed:", error.message);
      return null;
    }
  }

  // Enhanced people extraction with multi-page support and URL extraction
  async extractPeople(maxPages: number = 5): Promise<PeopleData | null> {
    console.log("Extracting people/officers with multi-page support...");

    try {
      // Navigate to People/Officers section
      await this.navigator.navigateToSection("People");
      
      // Wait for page to fully load
      await ScraperUtils.waitForPageLoad(this.page);
      
      // Check if there are multiple pages of officers
      const estimatedTotalPages = await this.getPeopleTotalPageCount();
      console.log(`Estimated total people pages: ${estimatedTotalPages}`);
      
      // Initialize array to store officers from all pages
      let allOfficers: OfficerData[] = [];
      let pagesScraped = 0;
      
      // Limit the number of pages to scan
      const pagesToScan = Math.min(estimatedTotalPages, maxPages);
      
      // Process all pages
      for (let pageNum = 1; pageNum <= pagesToScan; pageNum++) {
        console.log(`Processing people page ${pageNum}/${pagesToScan}...`);
        
        // Navigate to the specific page (this handles page 1 correctly too)
        if (pageNum > 1) {
          await this.navigateToPeoplePage(pageNum);
        }
        
        // Add a small delay to ensure the page loads
        await new Promise(resolve => setTimeout(resolve, 1500));
        await ScraperUtils.waitForPageLoad(this.page);
        
        // Extract officers from current page
        const pageOfficers = await this.peopleExtractor.extractWithMultipleStrategies();
        pagesScraped++;
        
        if (pageOfficers && pageOfficers.length > 0) {
          // Add officers from this page to our collection
          allOfficers = [...allOfficers, ...pageOfficers];
          console.log(`Extracted ${pageOfficers.length} officers from page ${pageNum}, total: ${allOfficers.length}`);
        } else {
          console.log(`No officers found on page ${pageNum}`);
          
          // If we couldn't extract any officers from this page, it might mean we've reached the end
          const currentPage = await this.getCurrentPeoplePage();
          if (currentPage !== pageNum) {
            console.log(`Expected page ${pageNum}, but on page ${currentPage}. Stopping pagination.`);
            break;
          }
        }
      }
      
      if (allOfficers.length === 0) {
        console.log("No officers found across any pages");
        return null;
      }

      // Calculate statistics
      const activeOfficers = allOfficers.filter(officer => !officer.resignationDate).length;
      const resignedOfficers = allOfficers.filter(officer => officer.resignationDate).length;
      
      const peopleData: PeopleData = {
        officers: allOfficers,
        totalOfficers: allOfficers.length,
        pagesScraped: pagesScraped,
        activeOfficers: activeOfficers,
        resignedOfficers: resignedOfficers
      };

      console.log(`Successfully extracted ${allOfficers.length} officers with ${allOfficers.reduce((sum, officer) => sum + officer.links.length, 0)} clickable links across ${pagesScraped} pages`);
      console.log(`Active officers: ${activeOfficers}, Resigned officers: ${resignedOfficers}`);

      return peopleData;
    } catch (error) {
      console.error("People extraction failed:", error.message);
      return null;
    }
  }

  // Helper methods for people pagination
  private async getPeopleTotalPageCount(): Promise<number> {
    try {
      const pageCount = await this.page.evaluate(() => {
        // Look for pagination links specific to people section
        const pageLinks = Array.from(document.querySelectorAll('.govuk-pagination__item a[data-page]'));
        if (pageLinks.length === 0) return 1;
        
        let maxPage = 1;
        pageLinks.forEach(link => {
          const pageNum = parseInt((link as HTMLElement).getAttribute('data-page') || '1');
          if (pageNum > maxPage) maxPage = pageNum;
        });
        
        return maxPage;
      });
      
      return pageCount || 1;
    } catch (error) {
      console.warn("Error determining people page count:", error.message);
      return 1;
    }
  }

  private async getCurrentPeoplePage(): Promise<number> {
    try {
      const currentPage = await this.page.evaluate(() => {
        // Look for current page in URL
        const pageMatch = window.location.href.match(/[?&]page=(\d+)/);
        if (pageMatch) return parseInt(pageMatch[1]);
        
        // Look for active pagination item
        const activePage = document.querySelector('.govuk-pagination__item--current a[data-page]');
        if (activePage) return parseInt(activePage.getAttribute('data-page') || '1');
        
        return 1;
      });
      
      return currentPage || 1;
    } catch (error) {
      console.warn("Error determining current people page:", error.message);
      return 1;
    }
  }

  private async navigateToPeoplePage(pageNumber: number): Promise<void> {
    try {
      // First, check if we're already on that page
      const currentPage = await this.getCurrentPeoplePage();
      if (currentPage === pageNumber) {
        console.log(`Already on people page ${pageNumber}`);
        return;
      }
      
      // Try to click the page number directly
      const clickedPage = await this.page.evaluate((pageNum) => {
        const pageLink = document.querySelector(`a#pageNo${pageNum}[data-page="${pageNum}"]`);
        if (pageLink) {
          (pageLink as HTMLElement).click();
          return true;
        }
        return false;
      }, pageNumber);
      
      if (clickedPage) {
        console.log(`Clicked on people page ${pageNumber} link`);
        await ScraperUtils.waitForPageLoad(this.page);
        return;
      }
      
      // Fallback to URL-based navigation
      const currentUrl = this.page.url();
      const baseUrl = currentUrl.split('?')[0];
      await this.page.goto(`${baseUrl}?page=${pageNumber}`);
      console.log(`Navigated to people page ${pageNumber} via URL`);
      await ScraperUtils.waitForPageLoad(this.page);
    } catch (error) {
      throw new Error(`Failed to navigate to people page ${pageNumber}: ${error.message}`);
    }
  }

  async extractCharges(): Promise<any> {
    console.log("Extracting charges...");

    try {
      await this.navigator.navigateToSection("Charges");
      
      const charges = await this.page.extract({
        instruction: "Extract any charges, mortgages, or security interests against the company",
        schema: z.object({
          charges: z.array(z.object({
            description: z.string(),
            status: z.string(),
            createdDate: z.string().optional(),
            chargeholder: z.string().optional()
          }))
        })
      });

      console.log("Charges extracted successfully");
      return charges;
    } catch (error) {
      console.error("Charges extraction failed:", error.message);
      return null;
    }
  }

  private calculateFilingStatistics(filings: FilingData[]): FilingStatistics {
    const filingsWithDocs = filings.filter(f => f.documentLinks && f.documentLinks.length > 0);
    const totalPages = filings
      .flatMap(f => f.documentLinks || [])
      .reduce((sum, link) => sum + parseInt(link.pageCount || "0"), 0);

    const filingTypes: Record<string, number> = {};
    filings.forEach(filing => {
      filingTypes[filing.type] = (filingTypes[filing.type] || 0) + 1;
    });

    const stats = {
      totalFilings: filings.length,
      filingsWithDocuments: filingsWithDocs.length,
      totalDocumentPages: totalPages,
      documentSuccessRate: filings.length > 0 ? Math.round((filingsWithDocs.length / filings.length) * 100) : 0,
      filingTypes: filingTypes
    };

    console.log("Filing statistics:", stats);
    return stats;
  }

  private calculateDateRange(filings: FilingData[]): { earliest: string; latest: string } | undefined {
    try {
      const validDates = filings
        .map(f => f.date)
        .filter(d => d && d.length > 0)
        .map(d => new Date(d))
        .filter(d => !isNaN(d.getTime()));

      if (validDates.length === 0) {
        return undefined;
      }

      validDates.sort((a, b) => a.getTime() - b.getTime());

      return {
        earliest: validDates[0].toISOString().split('T')[0],
        latest: validDates[validDates.length - 1].toISOString().split('T')[0]
      };
    } catch (error) {
      console.warn("Error calculating date range:", error.message);
      return undefined;
    }
  }

  private calculateQualityScore(result: ScrapingResult): number {
    let score = 0;
    const issues: string[] = [];

    // Overview scoring (25 points)
    if (result.overview) {
      score += 25;
      if (!result.overview.companyName) issues.push("Missing company name");
      if (!result.overview.companyNumber) issues.push("Missing company number");
    } else {
      issues.push("No company overview extracted");
    }

    // Filing history scoring (40 points)
    if (result.filing && result.filing.filings && result.filing.filings.length > 0) {
      score += 25; // Base points for having filings
      
      const docSuccessRate = result.filing.statistics.documentSuccessRate;
      if (docSuccessRate > 80) score += 15;
      else if (docSuccessRate > 50) score += 10;
      else if (docSuccessRate > 20) score += 5;
      else issues.push("Low PDF document extraction rate");
      
      if (result.filing.filings.length < 3) {
        issues.push("Very limited filing history");
      }
    } else {
      issues.push("No filing history extracted");
    }

    // People scoring (20 points)
    if (result.people && result.people.officers && result.people.officers.length > 0) {
      score += 20;
    } else {
      issues.push("No officer information extracted");
    }

    // Charges scoring (15 points)
    if (result.charges) {
      score += 15;
    } else {
      issues.push("No charges information extracted");
    }

    result.dataIssues = issues;
    return Math.max(0, Math.min(100, score));
  }

  // Updated to accept maxFilingPages and maxPeoplePages parameters
  async scrapeCompany(companyName: string, maxFilingPages: number = 10, maxPeoplePages: number = 5): Promise<ScrapingResult> {
    const startTime = Date.now();
    
    const result: ScrapingResult = {
      query: companyName,
      extractionTimestamp: new Date().toISOString(),
      qualityScore: 0,
      dataIssues: []
    };

    try {
      // Search for company
      await this.searchCompany(companyName);

      // Extract all sections
      result.overview = await this.extractOverview();
      result.filing = await this.extractFilingHistory(maxFilingPages);
      result.people = await this.extractPeople(maxPeoplePages);
      result.charges = await this.extractCharges();

      // Calculate quality score
      result.qualityScore = this.calculateQualityScore(result);

      const duration = Date.now() - startTime;
      console.log(`Scraping completed in ${duration}ms with quality score: ${result.qualityScore}/100`);

      return result;

    } catch (error) {
      console.error("Scraping failed:", error.message);
      result.qualityScore = 0;
      result.dataIssues.push(`Scraping failed: ${error.message}`);
      return result;
    }
  }

  async close(): Promise<void> {
    try {
      await this.stagehand.close();
    } catch (error) {
      console.warn("Error closing scraper:", error.message);
    }
  }
}

// Updated export function to accept maxFilingPages and maxPeoplePages parameters
export async function runEnhancedCompaniesScraper(
  companyName: string,
  maxFilingPages: number = 10,
  maxPeoplePages: number = 5
): Promise<ScrapingResult> {
  const scraper = new CompaniesHouseScraper();
  
  try {
    await scraper.initialize();
    return await scraper.scrapeCompany(companyName, maxFilingPages, maxPeoplePages);
  } finally {
    await scraper.close();
  }
}

// Export functions for testing
export async function testPDFExtraction(companyNumber: string): Promise<any> {
  const scraper = new CompaniesHouseScraper();
  
  try {
    await scraper.initialize();
    
    // Go directly to the company filing history page
    await scraper.page.goto(`https://find-and-update.company-information.service.gov.uk/company/${companyNumber}/filing-history`);
    await ScraperUtils.waitForPageLoad(scraper.page);
    
    // Extract using all strategies for comparison
    const directDOMResults = await scraper.pdfExtractor.extractWithDirectDOM();
    const llmResults = await scraper.pdfExtractor.extractWithLLM();
    const hybridResults = await scraper.pdfExtractor.extractWithHybridApproach();
    
    return {
      companyNumber,
      results: {
        directDOM: {
          filingCount: directDOMResults.length,
          pdfLinks: directDOMResults.reduce((sum, f) => sum + (f?.documentLinks?.length ?? 0), 0),
          sampleUrls: directDOMResults.slice(0, 3).flatMap(f => f?.documentLinks?.map(l => l?.url) ?? [])
        },
        llm: {
          filingCount: llmResults.length,
          pdfLinks: llmResults.reduce((sum, f) => sum + (f?.documentLinks?.length ?? 0), 0),
          sampleUrls: llmResults.slice(0, 3).flatMap(f => f?.documentLinks?.map(l => l?.url) ?? [])
        },
        hybrid: {
          filingCount: hybridResults.length,
          pdfLinks: hybridResults.reduce((sum, f) => sum + (f?.documentLinks?.length ?? 0), 0),
          sampleUrls: hybridResults.slice(0, 3).flatMap(f => f?.documentLinks?.map(l => l?.url) ?? [])
        }
      }
    };
  } finally {
    await scraper.close();
  }
}