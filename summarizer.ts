import 'dotenv/config';

interface EnhancedCompanyData {
  query: string;
  overview?: any;
  filing?: {
    filings: Array<{
      date: string;
      description: string;
      type: string;
      status?: string;
      documentLinks: Array<{
        linkText: string;
        linkType: string;
        url: string;
        pageCount?: string;
      }>;
    }>;
    totalFilings: number;
    pagesScraped: number;
    dateRange?: {
      earliest: string;
      latest: string;
    };
  };
  people?: any;
  charges?: any;
  psc?: any;
  additional?: any;
}

// Enhanced filing analysis
function analyzeFilingCompliance(filings: any[]): {
  complianceStatus: string;
  issues: string[];
  recommendations: string[];
  filingStats: any;
} {
  const issues: string[] = [];
  const recommendations: string[] = [];
  const currentYear = new Date().getFullYear();
  const currentDate = new Date();
  
  // Group filings by type and year
  const filingsByType = {};
  const filingsByYear = {};
  
  filings.forEach(filing => {
    const filingDate = new Date(filing.date);
    const year = filingDate.getFullYear();
    
    // Group by type
    if (!filingsByType[filing.type]) {
      filingsByType[filing.type] = [];
    }
    filingsByType[filing.type].push(filing);
    
    // Group by year
    if (!filingsByYear[year]) {
      filingsByYear[year] = [];
    }
    filingsByYear[year].push(filing);
  });

  // Check for required annual filings
  const recentYears = [currentYear - 1, currentYear - 2, currentYear - 3];
  
  recentYears.forEach(year => {
    const yearFilings = filingsByYear[year] || [];
    const hasAccounts = yearFilings.some(f => f.type === 'Accounts');
    const hasConfirmationStatement = yearFilings.some(f => f.type === 'Confirmation Statement' || f.type === 'Annual Return');
    
    if (!hasAccounts && year < currentYear) {
      issues.push(`Missing annual accounts for ${year}`);
    }
    
    if (!hasConfirmationStatement && year < currentYear) {
      issues.push(`Missing confirmation statement/annual return for ${year}`);
    }
  });

  // Check for recent filings
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  const recentFilings = filings.filter(f => new Date(f.date) > sixMonthsAgo);
  if (recentFilings.length === 0) {
    issues.push("No filings in the last 6 months");
    recommendations.push("Check if company is still trading and up to date with filing requirements");
  }

  // Check for overdue filings
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  
  const lastAccounts = filings
    .filter(f => f.type === 'Accounts')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  
  if (lastAccounts && new Date(lastAccounts.date) < oneYearAgo) {
    issues.push("Annual accounts may be overdue");
    recommendations.push("Verify current filing status and deadlines");
  }

  // Determine compliance status
  let complianceStatus = "Good";
  if (issues.length > 0) {
    complianceStatus = issues.length > 2 ? "Poor" : "Warning";
  }

  const filingStats = {
    totalFilings: filings.length,
    filingsByType: Object.keys(filingsByType).map(type => ({
      type,
      count: filingsByType[type].length,
      mostRecent: filingsByType[type].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.date
    })),
    filingsByYear: Object.keys(filingsByYear).map(year => ({
      year: parseInt(year),
      count: filingsByYear[year].length
    })).sort((a, b) => b.year - a.year),
    documentTypes: filings.flatMap(f => f.documentLinks.map(l => l.linkType))
      .reduce((acc, type) => {
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {}),
    pdfDocumentCount: filings.flatMap(f => f.documentLinks.filter(l => l.linkType === 'PDF')).length
  };

  return {
    complianceStatus,
    issues,
    recommendations,
    filingStats
  };
}

// Enhanced data processing for comprehensive analysis
function processEnhancedCompanyData(data: EnhancedCompanyData): string {
  let processedText = `COMPREHENSIVE COMPANY ANALYSIS FOR: ${data.query}\n\n`;

  // Process Overview
  if (data.overview) {
    processedText += "=== COMPANY OVERVIEW ===\n";
    processedText += `Company Name: ${data.overview.companyName || 'Not specified'}\n`;
    processedText += `Company Number: ${data.overview.companyNumber || 'Not specified'}\n`;
    processedText += `Status: ${data.overview.status || 'Not specified'}\n`;
    processedText += `Incorporation Date: ${data.overview.incorporationDate || 'Not specified'}\n`;
    processedText += `Company Type: ${data.overview.companyType || 'Not specified'}\n`;
    
    if (data.overview.registeredAddress) {
      const addr = data.overview.registeredAddress;
      processedText += `Registered Address: ${[addr.addressLine1, addr.addressLine2, addr.city, addr.postcode, addr.country].filter(Boolean).join(', ')}\n`;
    }
    
    if (data.overview.sicCodes && data.overview.sicCodes.length > 0) {
      processedText += "SIC Codes:\n";
      data.overview.sicCodes.forEach(sic => {
        processedText += `  - ${sic.code}: ${sic.description}\n`;
      });
    }
    processedText += "\n";
  }

  // Process Enhanced Filing History
  if (data.filing && data.filing.filings && data.filing.filings.length > 0) {
    processedText += "=== COMPREHENSIVE FILING HISTORY ===\n";
    processedText += `Total Filings Extracted: ${data.filing.totalFilings}\n`;
    processedText += `Pages Processed: ${data.filing.pagesScraped}\n`;
    
    if (data.filing.dateRange) {
      processedText += `Filing Period: ${data.filing.dateRange.earliest} to ${data.filing.dateRange.latest}\n`;
    }
    
    // Analyze compliance
    const compliance = analyzeFilingCompliance(data.filing.filings);
    processedText += `Compliance Status: ${compliance.complianceStatus}\n\n`;
    
    if (compliance.issues.length > 0) {
      processedText += "COMPLIANCE ISSUES IDENTIFIED:\n";
      compliance.issues.forEach(issue => {
        processedText += `  - ${issue}\n`;
      });
      processedText += "\n";
    }
    
    if (compliance.recommendations.length > 0) {
      processedText += "RECOMMENDATIONS:\n";
      compliance.recommendations.forEach(rec => {
        processedText += `  - ${rec}\n`;
      });
      processedText += "\n";
    }
    
    // Filing statistics
    processedText += "FILING STATISTICS:\n";
    processedText += `Total PDF Documents Available: ${compliance.filingStats.pdfDocumentCount}\n`;
    
    processedText += "\nFilings by Type:\n";
    compliance.filingStats.filingsByType.forEach(typeData => {
      processedText += `  - ${typeData.type}: ${typeData.count} filings (most recent: ${typeData.mostRecent})\n`;
    });
    
    processedText += "\nFilings by Year:\n";
    compliance.filingStats.filingsByYear.slice(0, 10).forEach(yearData => {
      processedText += `  - ${yearData.year}: ${yearData.count} filings\n`;
    });
    
    // Recent significant filings (last 20)
    const recentFilings = data.filing.filings
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20);
    
    processedText += "\nRECENT FILINGS (Last 20):\n";
    recentFilings.forEach(filing => {
      processedText += `${filing.date} - ${filing.type}: ${filing.description}\n`;
      if (filing.documentLinks.length > 0) {
        processedText += `  Documents: ${filing.documentLinks.map(link => `${link.linkType}${link.pageCount ? ` (${link.pageCount} pages)` : ''}`).join(', ')}\n`;
      }
    });
    processedText += "\n";
  }

  // Process other sections (keeping existing logic)
  if (data.people && data.people.officers && data.people.officers.length > 0) {
    processedText += "=== COMPANY OFFICERS ===\n";
    processedText += `Total Officers: ${data.people.officers.length}\n`;
    
    data.people.officers.forEach(officer => {
      processedText += `Name: ${officer.name}\n`;
      processedText += `  Role: ${officer.role}\n`;
      processedText += `  Appointed: ${officer.appointmentDate}\n`;
      if (officer.resignationDate) processedText += `  Resigned: ${officer.resignationDate}\n`;
      if (officer.nationality) processedText += `  Nationality: ${officer.nationality}\n`;
      processedText += "\n";
    });
  }

  // Continue with charges, PSC, etc. (same as before)
  // ... (other sections remain the same)

  return processedText;
}

export async function getEnhancedAnthropicSummary(company: string, rawData: EnhancedCompanyData) {
  try {
    const processedData = processEnhancedCompanyData(rawData);
    
    const prompt = `You are a UK business analyst specializing in comprehensive company intelligence. Analyze the following detailed company data for "${company}" and create an executive-level business intelligence report.

${processedData}

Create a comprehensive analysis with the following sections:

1. **EXECUTIVE SUMMARY** - Key findings and overall company assessment

2. **BUSINESS PROFILE** - Incorporation details, business nature, and operational status

3. **FILING COMPLIANCE ANALYSIS** - Detailed assessment of regulatory compliance based on complete filing history
   - Include analysis of filing patterns, compliance status, and any red flags
   - Comment on the comprehensiveness of the filing record (${rawData.filing?.totalFilings || 0} filings from ${rawData.filing?.pagesScraped || 0} pages)

4. **GOVERNANCE & CONTROL STRUCTURE** - Officers, directors, and persons with significant control

5. **FINANCIAL OBLIGATIONS & SECURITY** - Charges, mortgages, and secured interests

6. **DOCUMENT AVAILABILITY** - Analysis of available documents and their accessibility
   - Note the ${rawData.filing?.filings?.flatMap(f => f.documentLinks.filter(l => l.linkType === 'PDF')).length || 0} PDF documents available for review

7. **RISK ASSESSMENT** - Comprehensive risk analysis including:
   - Compliance risks based on filing pattern analysis
   - Financial risks from charges/security interests
   - Governance risks from officer changes
   - Operational risks from business status

8. **DUE DILIGENCE RECOMMENDATIONS** - Specific actions for thorough company assessment
   - Key documents to review from the available filing history
   - Areas requiring further investigation
   - Red flags requiring immediate attention

Focus on providing actionable business intelligence suitable for investment decisions, partnership assessments, or regulatory compliance. Highlight any patterns in the filing history that indicate business health or potential concerns.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4000, // Increased for comprehensive analysis
        temperature: 0.2 // Lower temperature for more factual analysis
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const json = await response.json();
    return json.content?.[0]?.text || "No summary could be generated.";
    
  } catch (error) {
    console.error("Error generating enhanced summary:", error);
    return `Error generating comprehensive summary: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}