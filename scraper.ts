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
        const results = {
          url: window.location.href,
          title: document.title,
          tableCount: tables.length,
          tables: [] as any[]
        };
  
        tables.forEach((table, tableIndex) => {
          const rows = table.querySelectorAll('tr');
          const tableInfo = {
            index: tableIndex,
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
                links: Array.from(links).map(link => ({
                  text: link.textContent?.trim(),
                  href: link.getAttribute('href')
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
      console.log("Extracting PDF links using direct DOM manipulation...");
      
      await this.debugPageContent();
  
      return await this.page.evaluate(() => {
        const results: any[] = [];
        
        // More comprehensive table selectors
        const tableSelectors = [
          'table[class*="filing"]',
          'table[class*="history"]',
          'table[class*="results"]',
          'table[summary*="filing"]',
          'table[summary*="history"]',
          'table',
          'tbody'
        ];
  
        let targetTable: Element | null = null;
        
        // Find the table with filing data
        for (const selector of tableSelectors) {
          const tables = document.querySelectorAll(selector);
          for (const table of Array.from(tables)) {
            const rows = table.querySelectorAll('tr');
            if (rows.length > 1) {
              // Check if this looks like a filing table
              const headerRow = rows[0];
              const headerText = headerRow.textContent?.toLowerCase() || '';
              if (headerText.includes('date') && (headerText.includes('description') || headerText.includes('view'))) {
                targetTable = table;
                console.log(`Found filing table with selector: ${selector}`);
                break;
              }
            }
          }
          if (targetTable) break;
        }
  
        if (!targetTable) {
          console.log('No filing table found with standard selectors');
          return [];
        }
  
        const rows = targetTable.querySelectorAll('tr');
        console.log(`Processing ${rows.length} rows from filing table`);
  
        for (let i = 1; i < rows.length; i++) { // Skip header row
          const row = rows[i];
          const cells = row.querySelectorAll('td, th');
  
          if (cells.length >= 3) {
            const dateCell = cells[0];
            const descriptionCell = cells[1];
            // The links are typically in the last cell
            const linksCell = cells[cells.length - 1];
  
            const date = dateCell?.textContent?.trim() || '';
            const description = descriptionCell?.textContent?.trim() || '';
  
            // Validate date format (should match "DD MMM YYYY" pattern)
            if (!date || !date.match(/\d{1,2}\s+\w+\s+\d{4}/)) {
              continue;
            }
  
            // Extract all links from the links cell
            const linkElements = linksCell.querySelectorAll('a[href]');
            const documentLinks: any[] = [];
  
            Array.from(linkElements).forEach((link: Element) => {
              const href = link.getAttribute('href');
              const linkText = link.textContent?.trim() || '';
  
              if (href && linkText) {
                // Construct full URL
                let fullUrl = href;
                if (href.startsWith('/')) {
                  fullUrl = `https://find-and-update.company-information.service.gov.uk${href}`;
                } else if (!href.startsWith('http')) {
                  fullUrl = `https://find-and-update.company-information.service.gov.uk/${href}`;
                }
  
                // Determine document type
                let linkType = 'PDF';
                if (linkText.toLowerCase().includes('ixbrl') || href.includes('format=xhtml')) {
                  linkType = 'iXBRL';
                } else if (linkText.toLowerCase().includes('xml')) {
                  linkType = 'XML';
                }
  
                // Extract page count from link text
                const pageMatch = linkText.match(/(\d+)\s+pages?/i);
                const pageCount = pageMatch ? pageMatch[1] : '';
  
                // Only include valid document links
                if (fullUrl.includes('company-information.service.gov.uk') && 
                    (linkText.toLowerCase().includes('pdf') || 
                     linkText.toLowerCase().includes('view') || 
                     linkText.toLowerCase().includes('download') ||
                     linkText.toLowerCase().includes('ixbrl') ||
                     href.includes('document?format='))) {
                  
                  documentLinks.push({
                    linkText: linkText,
                    linkType: linkType,
                    url: fullUrl,
                    pageCount: pageCount
                  });
                }
              }
            });
  
            if (date && description) {
              // Categorize filing type
              const type = this.categorizeFilingType(description);
              
              results.push({
                date: date,
                description: description,
                type: type,
                status: 'Filed',
                documentLinks: documentLinks
              });
            }
          }
        }
  
        console.log(`DOM extraction found ${results.length} filings`);
        return results;
      });
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
  
    async extractWithLLM(): Promise<FilingData[]> {
      console.log("Extracting PDF links using LLM...");
  
      try {
        const result = await this.page.extract({
          instruction: `Extract filing history from the table on this page. For each filing row, extract:
          1. Date (first column) - must be a valid date format
          2. Description (second column) - the filing description
          3. Document links (last column) - ALL links including "View PDF", "Download iXBRL", etc.
          
          IMPORTANT: Include the complete URL for each document link. Look for links that contain:
          - "View PDF"
          - "Download iXBRL" 
          - "View" or "Download"
          - Any document-related links
          
          Pay special attention to href attributes that contain "document?format=" as these are the actual document links.
          
          Return ALL filings found in the table.`,
          schema: z.object({
            filings: z.array(z.object({
              date: z.string().describe("Filing date"),
              description: z.string().describe("Filing description"),
              documentLinks: z.array(z.object({
                linkText: z.string().describe("Link text (e.g., 'View PDF')"),
                url: z.string().describe("Complete URL to the document"),
                linkType: z.string().describe("Type of document (PDF, iXBRL, etc.)"),
                pageCount: z.string().optional().describe("Number of pages if available")
              })).describe("All document links for this filing")
            }))
          })
        });
  
        // Post-process URLs to ensure they're complete
        const processedFilings = result.filings.map(filing => ({
          ...filing,
          type: this.categorizeFilingType(filing.description),
          status: 'Filed',
          documentLinks: filing.documentLinks.map(link => {
            let url = link.url;
            if (url && url.startsWith('/')) {
              url = `https://find-and-update.company-information.service.gov.uk${url}`;
            }
            
            // Determine link type if not provided
            let linkType = link.linkType;
            if (!linkType) {
              if (link.linkText.toLowerCase().includes('ixbrl') || url.includes('format=xhtml')) {
                linkType = 'iXBRL';
              } else if (link.linkText.toLowerCase().includes('xml')) {
                linkType = 'XML';
              } else {
                linkType = 'PDF';
              }
            }
  
            return {
              ...link,
              url: url,
              linkType: linkType
            };
          }).filter(link => link.url && link.url.length > 10)
        }));
  
        console.log(`LLM extraction found ${processedFilings.length} filings`);
        return processedFilings;
  
      } catch (error) {
        console.log("LLM extraction failed:", error.message);
        return [];
      }
    }
  
    async extractWithMultipleStrategies(): Promise<FilingData[]> {
      const strategies = [
        { name: 'Direct DOM', method: () => this.extractWithDirectDOM() },
        { name: 'LLM', method: () => this.extractWithLLM() }
      ];
  
      for (const strategy of strategies) {
        try {
          console.log(`Trying ${strategy.name} extraction strategy...`);
          const results = await strategy.method();
          
          if (results && results.length > 0) {
            console.log(`${strategy.name} strategy succeeded with ${results.length} filings`);
            
            // Validate that we have actual PDF links
            const filingsWithPDFs = results.filter(f => f.documentLinks && f.documentLinks.length > 0);
            console.log(`${filingsWithPDFs.length} filings have document links`);
            
            return results;
          }
        } catch (error) {
          console.log(`${strategy.name} strategy failed:`, error.message);
        }
      }
  
      console.log("All PDF extraction strategies failed");
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

  async extractFilingHistory(): Promise<any> {
    console.log("Extracting filing history...");

    try {
      await this.navigator.navigateToSection("Filing history");
      
      const filings = await this.pdfExtractor.extractWithMultipleStrategies();
      
      if (filings.length === 0) {
        return null;
      }

      // Calculate statistics
      const statistics = this.calculateFilingStatistics(filings);
      
      // Calculate date range
      const dateRange = this.calculateDateRange(filings);

      return {
        filings: filings,
        totalFilings: filings.length,
        pagesScraped: 1, // Single page for now
        statistics: statistics,
        dateRange: dateRange
      };

    } catch (error) {
      console.error("Filing history extraction failed:", error.message);
      return null;
    }
  }

  async extractPeople(): Promise<any> {
    console.log("Extracting people/officers...");

    try {
      await this.navigator.navigateToSection("People");
      
      const people = await this.page.extract({
        instruction: "Extract all company officers, directors, and secretaries with their roles, appointment dates, and personal details",
        schema: z.object({
          officers: z.array(z.object({
            name: z.string(),
            role: z.string(),
            appointmentDate: z.string().optional(),
            resignationDate: z.string().optional(),
            nationality: z.string().optional(),
            occupation: z.string().optional()
          }))
        })
      });

      console.log("People extracted successfully");
      return people;
    } catch (error) {
      console.error("People extraction failed:", error.message);
      return null;
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

  async scrapeCompany(companyName: string): Promise<ScrapingResult> {
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
      result.filing = await this.extractFilingHistory();
      result.people = await this.extractPeople();
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

// Export function for use in server
export async function runEnhancedCompaniesScraper(companyName: string): Promise<ScrapingResult> {
  const scraper = new CompaniesHouseScraper();
  
  try {
    await scraper.initialize();
    return await scraper.scrapeCompany(companyName);
  } finally {
    await scraper.close();
  }
}