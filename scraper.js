import { Stagehand } from '@browserbasehq/stagehand';
import { extractPDFLinks } from './pdf-bridge.js';
import dotenv from 'dotenv';
dotenv.config();

// Initialize stagehand with default options and configure for LLM-first extraction
const stagehandOptions = {
  env: "LOCAL",
  modelClient: {
    provider: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  // Always use LLM mode for extraction except where hybrid mode is specifically needed
  defaultMode: "llm"
};

/**
 * Runs the Companies House scraper to extract company data
 * including filing history with PDF links
 */
export async function runEnhancedCompaniesScraper(companyName) {
  console.log(`Starting enhanced scraper for company: ${companyName}`);
  
  // Initialize browser session
  console.log("Initializing browser session...");
  const stagehand = new Stagehand(stagehandOptions);
  await stagehand.init();
  const page = stagehand.page;
  
  // Tracking object to store company data
  const companyData = {
    overview: {},
    filing: {},
    people: {
      officers: []
    },
    charges: {
      charges: []
    },
    extractionTimestamp: new Date().toISOString(),
  };
  
  try {
    // Navigate to Companies House
    console.log("Navigating to Companies House...");
    await page.goto("https://find-and-update.company-information.service.gov.uk/", {
      waitUntil: "networkidle0",
    });
    
    // Search for company
    console.log(`Searching for company: ${companyName}`);
    await page.waitForSelector("#site-search-text");
    await page.type("#site-search-text", companyName);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      page.click(".search-submit"),
    ]);
    
    // Find and click on the company link
    const companyLink = await page.evaluate((targetName) => {
      const companyLinks = Array.from(document.querySelectorAll("a"));
      const foundLink = companyLinks.find(link => 
        link.textContent?.trim().toLowerCase().includes(targetName.toLowerCase())
      );
      return foundLink ? foundLink.href : null;
    }, companyName);
    
    if (!companyLink) {
      throw new Error(`No company found matching "${companyName}"`);
    }
    
    // Navigate to company page
    console.log(`Found company link: ${companyLink}`);
    await page.goto(companyLink, { waitUntil: "networkidle0" });
    
    // Extract company overview data
    console.log("Extracting company overview...");
    companyData.overview = await extractCompanyOverview(page);
    
    // Extract filing history data
    console.log("Extracting filing history...");
    companyData.filing = await extractPDFLinks(companyName, page);
    
    // Extract officers data
    console.log("Extracting officers data...");
    companyData.people = await extractOfficers(page);
    
    // Extract charges data if available
    console.log("Extracting charges data...");
    companyData.charges = await extractCharges(page);
    
    console.log("Company data extraction complete!");
    return companyData;
    
  } catch (error) {
    console.error("Error during company data extraction:", error);
    throw error;
  } finally {
    // Close browser
    console.log("Closing browser session...");
    await stagehand.close();
  }
}

/**
 * Extract company overview information
 */
async function extractCompanyOverview(page) {
  const currentUrl = await page.url();
  
  // Check if we're on the company page
  if (!currentUrl.includes('/company/')) {
    console.warn("Not on a company page for overview extraction");
    return {};
  }
  
  return await page.evaluate(() => {
    const overview = {};
    
    // Company name
    const companyNameElement = document.querySelector('h1.heading-xlarge');
    if (companyNameElement) {
      overview.companyName = companyNameElement.textContent.trim();
    }
    
    // Company number
    const companyNumberElement = document.querySelector('p.heading-medium:not(.heading-with-border)');
    if (companyNumberElement) {
      overview.companyNumber = companyNumberElement.textContent.trim();
    }
    
    // Extract various data points
    const dataRows = document.querySelectorAll('dd');
    const labels = document.querySelectorAll('dt');
    
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i].textContent.trim().toLowerCase();
      const value = dataRows[i]?.textContent.trim();
      
      if (!value) continue;
      
      if (label.includes('status')) {
        overview.status = value;
      } else if (label.includes('incorporated') || label.includes('formation')) {
        overview.incorporationDate = value;
      } else if (label.includes('address')) {
        overview.registeredAddress = value.replace(/\n/g, ', ');
      } else if (label.includes('type')) {
        overview.companyType = value;
      } else if (label.includes('nature of business')) {
        overview.natureOfBusiness = value;
      }
    }
    
    return overview;
  });
}

/**
 * Extract officers information
 */
async function extractOfficers(page) {
  // Get current URL
  const currentUrl = await page.url();
  
  // Navigate to officers page if needed
  if (!currentUrl.includes('/officers')) {
    // Find officers link
    const officersLink = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const officersLink = links.find(link => 
        link.textContent?.toLowerCase().includes('officers')
      );
      return officersLink?.href;
    });
    
    if (officersLink) {
      await page.goto(officersLink, { waitUntil: 'networkidle0' });
    } else {
      console.warn("Officers page not found");
      return { officers: [] };
    }
  }
  
  // Extract officers data
  return await page.evaluate(() => {
    const officers = [];
    const officerCards = document.querySelectorAll('.appointment-1');
    
    officerCards.forEach(card => {
      const nameElement = card.querySelector('h2');
      
      if (!nameElement) return;
      
      const officer = {
        name: nameElement.textContent.trim(),
        role: '',
        appointmentDate: '',
        resignationDate: '',
        nationality: '',
        occupation: ''
      };
      
      // Extract role
      const roleElement = card.querySelector('.appointment-type');
      if (roleElement) {
        officer.role = roleElement.textContent.trim();
      }
      
      // Extract other details
      const dataRows = card.querySelectorAll('dl dd');
      const labels = card.querySelectorAll('dl dt');
      
      for (let i = 0; i < labels.length; i++) {
        const label = labels[i].textContent.trim().toLowerCase();
        const value = dataRows[i]?.textContent.trim();
        
        if (!value) continue;
        
        if (label.includes('appointed')) {
          officer.appointmentDate = value;
        } else if (label.includes('resigned') || label.includes('ceased')) {
          officer.resignationDate = value;
        } else if (label.includes('nationality')) {
          officer.nationality = value;
        } else if (label.includes('occupation')) {
          officer.occupation = value;
        }
      }
      
      officers.push(officer);
    });
    
    return { officers };
  });
}

/**
 * Extract charges information
 */
async function extractCharges(page) {
  // Get current URL
  const currentUrl = await page.url();
  
  // Navigate to charges page if needed
  if (!currentUrl.includes('/charges')) {
    // Find charges link
    const chargesLink = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const chargesLink = links.find(link => 
        link.textContent?.toLowerCase().includes('charges')
      );
      return chargesLink?.href;
    });
    
    if (chargesLink) {
      try {
        await page.goto(chargesLink, { waitUntil: 'networkidle0' });
      } catch (error) {
        console.warn("Error navigating to charges page:", error);
        return { charges: [] };
      }
    } else {
      console.warn("Charges page not found");
      return { charges: [] };
    }
  }
  
  // Extract charges data
  return await page.evaluate(() => {
    const charges = [];
    
    // Check if no charges message is present
    const noChargesElement = document.querySelector('.govuk-body');
    if (noChargesElement && noChargesElement.textContent.includes('no charges')) {
      return { charges };
    }
    
    // Extract charges
    const chargeItems = document.querySelectorAll('.charge-item');
    
    chargeItems.forEach(item => {
      const charge = {
        chargeNumber: '',
        createdDate: '',
        status: '',
        description: '',
        chargeholder: '',
        securedAmount: ''
      };
      
      // Charge code
      const codeElement = item.querySelector('h2');
      if (codeElement) {
        const codeMatch = codeElement.textContent.match(/(\d+) of \d+/);
        charge.chargeNumber = codeMatch ? codeMatch[1] : codeElement.textContent.trim();
      }
      
      // Extract other details
      const dataRows = item.querySelectorAll('dd');
      const labels = item.querySelectorAll('dt');
      
      for (let i = 0; i < labels.length; i++) {
        const label = labels[i].textContent.trim().toLowerCase();
        const value = dataRows[i]?.textContent.trim();
        
        if (!value) continue;
        
        if (label.includes('created')) {
          charge.createdDate = value;
        } else if (label.includes('status')) {
          charge.status = value;
        } else if (label.includes('description')) {
          charge.description = value;
        } else if (label.includes('person') || label.includes('entitled')) {
          charge.chargeholder = value;
        } else if (label.includes('amount')) {
          charge.securedAmount = value;
        }
      }
      
      charges.push(charge);
    });
    
    return { charges };
  });
}
