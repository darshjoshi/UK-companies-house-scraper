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
  let processedText = `COMPREHENSIVE COMPANY INTELLIGENCE ANALYSIS FOR: ${data.query}\n\n`;

  // Process Company Overview with enhanced business context
  if (data.overview) {
    processedText += "=== COMPANY PROFILE & BUSINESS CONTEXT ===\n";
    processedText += `Company Name: ${data.overview.companyName || 'Not specified'}\n`;
    processedText += `Company Number: ${data.overview.companyNumber || 'Not specified'}\n`;
    processedText += `Legal Status: ${data.overview.status || 'Not specified'}\n`;
    processedText += `Incorporation Date: ${data.overview.incorporationDate || 'Not specified'}\n`;
    processedText += `Company Type: ${data.overview.companyType || 'Not specified'}\n`;
    
    // Calculate company age for business maturity assessment
    if (data.overview.incorporationDate) {
      const incDate = new Date(data.overview.incorporationDate);
      const ageYears = Math.floor((Date.now() - incDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      processedText += `Company Age: ${ageYears} years (${ageYears < 2 ? 'Start-up' : ageYears < 7 ? 'Established' : 'Mature'} business)\n`;
    }
    
    if (data.overview.registeredAddress) {
      const addr = data.overview.registeredAddress;
      processedText += `Registered Address: ${[addr.addressLine1, addr.addressLine2, addr.city, addr.postcode, addr.country].filter(Boolean).join(', ')}\n`;
    }
    
    if (data.overview.sicCodes && data.overview.sicCodes.length > 0) {
      processedText += "\nBUSINESS ACTIVITIES (SIC Codes):\n";
      data.overview.sicCodes.forEach((sic, index) => {
        processedText += `  ${index + 1}. ${sic.code}: ${sic.description}\n`;
      });
      processedText += `Primary Industry: ${data.overview.sicCodes[0]?.description || 'Not specified'}\n`;
    }
    processedText += "\n";
  }

  // Process Enhanced Filing History with business intelligence context
  if (data.filing && data.filing.filings && data.filing.filings.length > 0) {
    processedText += "=== REGULATORY COMPLIANCE & FILING INTELLIGENCE ===\n";
    processedText += `Total Filings Extracted: ${data.filing.totalFilings}\n`;
    processedText += `Pages Analyzed: ${data.filing.pagesScraped}\n`;
    processedText += `Data Completeness: ${data.filing.pagesScraped >= 10 ? 'Comprehensive' : data.filing.pagesScraped >= 5 ? 'Good' : 'Limited'} filing history coverage\n`;
    
    if (data.filing.dateRange) {
      processedText += `Filing Period Analyzed: ${data.filing.dateRange.earliest} to ${data.filing.dateRange.latest}\n`;
      const periodYears = Math.floor((new Date(data.filing.dateRange.latest).getTime() - new Date(data.filing.dateRange.earliest).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      processedText += `Historical Coverage: ${periodYears} years of filing data\n`;
    }
    
    // Enhanced compliance analysis
    const compliance = analyzeFilingCompliance(data.filing.filings);
    processedText += `\nCOMPLIANCE ASSESSMENT: ${compliance.complianceStatus}\n`;
    
    if (compliance.issues.length > 0) {
      processedText += "\nCOMPLIANCE CONCERNS IDENTIFIED:\n";
      compliance.issues.forEach((issue, index) => {
        processedText += `  ${index + 1}. ${issue}\n`;
      });
    }
    
    if (compliance.recommendations.length > 0) {
      processedText += "\nREGULATORY RECOMMENDATIONS:\n";
      compliance.recommendations.forEach((rec, index) => {
        processedText += `  ${index + 1}. ${rec}\n`;
      });
    }
    
    // Enhanced filing statistics with business context
    processedText += "\nFILING PATTERN ANALYSIS:\n";
    processedText += `Total Documents Available: ${compliance.filingStats.pdfDocumentCount} PDF documents\n`;
    
    // Safe calculation of filing frequency
    const filingFrequency = data.filing && data.filing.dateRange?.earliest ? 
      (data.filing.totalFilings / Math.max(1, Math.floor((Date.now() - new Date(data.filing.dateRange.earliest).getTime()) / (365.25 * 24 * 60 * 60 * 1000)))).toFixed(1) : 
      'N/A';
    processedText += `Filing Frequency: ${filingFrequency} filings per year average\n`;
    
    processedText += "\nFiling Types Distribution:\n";
    compliance.filingStats.filingsByType
      .sort((a, b) => b.count - a.count)
      .forEach((typeData, index) => {
        // Safe calculation of percentage with null check
        const totalFilings = data.filing?.totalFilings || 1; // Use 1 as fallback to avoid division by zero
        const percentage = ((typeData.count / totalFilings) * 100).toFixed(1);
        processedText += `  ${index + 1}. ${typeData.type}: ${typeData.count} filings (${percentage}%) - Most recent: ${typeData.mostRecent}\n`;
      });
    
    processedText += "\nFiling Activity by Year:\n";
    compliance.filingStats.filingsByYear.slice(0, 10).forEach((yearData, index) => {
      const trend = index > 0 ? 
        (yearData.count > compliance.filingStats.filingsByYear[index - 1]?.count ? '↗ Increasing' : 
         yearData.count < compliance.filingStats.filingsByYear[index - 1]?.count ? '↘ Decreasing' : '→ Stable') : '';
      processedText += `  ${yearData.year}: ${yearData.count} filings ${trend}\n`;
    });
    
    // Critical recent filings analysis
    const recentFilings = data.filing.filings
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 15);
    
    processedText += "\nRECENT CRITICAL FILINGS (Last 15):\n";
    recentFilings.forEach((filing, index) => {
      const daysAgo = Math.floor((Date.now() - new Date(filing.date).getTime()) / (24 * 60 * 60 * 1000));
      processedText += `  ${index + 1}. ${filing.date} (${daysAgo} days ago) - ${filing.type}\n`;
      processedText += `     Description: ${filing.description}\n`;
      if (filing.documentLinks.length > 0) {
        processedText += `     Available Documents: ${filing.documentLinks.map(link => `${link.linkType}${link.pageCount ? ` (${link.pageCount} pages)` : ''}`).join(', ')}\n`;
      }
    });
    processedText += "\n";
  }

  // Enhanced People/Officers Analysis with governance insights
  if (data.people && data.people.officers && data.people.officers.length > 0) {
    processedText += "=== GOVERNANCE STRUCTURE & LEADERSHIP ANALYSIS ===\n";
    processedText += `Total Officers Identified: ${data.people.totalOfficers || data.people.officers.length}\n`;
    processedText += `Active Officers: ${data.people.activeOfficers || data.people.officers.filter(o => !o.resignationDate).length}\n`;
    processedText += `Resigned Officers: ${data.people.resignedOfficers || data.people.officers.filter(o => o.resignationDate).length}\n`;
    
    if (data.people.pagesScraped) {
      processedText += `Officer Data Coverage: ${data.people.pagesScraped} pages analyzed\n`;
    }
    
    // Officer role analysis
    const roleDistribution = data.people.officers.reduce((acc: Record<string, number>, officer) => {
      acc[officer.role] = (acc[officer.role] || 0) + 1;
      return acc;
    }, {});
    
    processedText += "\nLEADERSHIP STRUCTURE:\n";
    Object.entries(roleDistribution)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .forEach(([role, count], index) => {
        processedText += `  ${index + 1}. ${role}: ${count} ${count === 1 ? 'person' : 'people'}\n`;
      });
    
    // Recent officer changes (governance stability)
    const recentChanges = data.people.officers
      .filter(officer => {
        const appointDate = officer.appointmentDate ? new Date(officer.appointmentDate) : null;
        const resignDate = officer.resignationDate ? new Date(officer.resignationDate) : null;
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        
        return (appointDate && appointDate > oneYearAgo) || (resignDate && resignDate > oneYearAgo);
      })
      .sort((a, b) => {
        const dateA = new Date(a.resignationDate || a.appointmentDate || 0);
        const dateB = new Date(b.resignationDate || b.appointmentDate || 0);
        return dateB.getTime() - dateA.getTime();
      });
    
    if (recentChanges.length > 0) {
      processedText += "\nRECENT GOVERNANCE CHANGES (Last 12 months):\n";
      recentChanges.slice(0, 10).forEach((officer, index) => {
        const changeType = officer.resignationDate ? 'RESIGNED' : 'APPOINTED';
        const changeDate = officer.resignationDate || officer.appointmentDate;
        processedText += `  ${index + 1}. ${changeType}: ${officer.name} (${officer.role}) - ${changeDate}\n`;
      });
    }
    
    // Detailed officer profiles
    processedText += "\nKEY PERSONNEL PROFILES:\n";
    data.people.officers
      .filter(officer => !officer.resignationDate) // Active officers only
      .slice(0, 10) // Top 10 officers
      .forEach((officer, index) => {
        processedText += `\n  ${index + 1}. ${officer.name}\n`;
        processedText += `     Role: ${officer.role}\n`;
        processedText += `     Appointed: ${officer.appointmentDate || 'Date not specified'}\n`;
        
        if (officer.nationality) processedText += `     Nationality: ${officer.nationality}\n`;
        if (officer.occupation) processedText += `     Occupation: ${officer.occupation}\n`;
        if (officer.address) processedText += `     Address: ${officer.address}\n`;
        if (officer.dateOfBirth) processedText += `     Date of Birth: ${officer.dateOfBirth}\n`;
        
        // Enhanced: Include profile links if available
        if (officer.links && officer.links.length > 0) {
          processedText += `     Profile Links Available: ${officer.links.length} link(s)\n`;
          officer.links.forEach((link, linkIndex) => {
            processedText += `       ${linkIndex + 1}. ${link.linkType}: ${link.linkText} (${link.url})\n`;
          });
        }
      });
    processedText += "\n";
  }

  // Enhanced Charges Analysis
  if (data.charges && Array.isArray(data.charges) && data.charges.length > 0) {
    processedText += "=== FINANCIAL SECURITY & CHARGES ANALYSIS ===\n";
    processedText += `Total Charges Registered: ${data.charges.length}\n`;
    
    const activeCharges = data.charges.filter(charge => !charge.status || charge.status.toLowerCase() !== 'satisfied');
    const satisfiedCharges = data.charges.filter(charge => charge.status && charge.status.toLowerCase() === 'satisfied');
    
    processedText += `Active Charges: ${activeCharges.length}\n`;
    processedText += `Satisfied Charges: ${satisfiedCharges.length}\n`;
    
    if (activeCharges.length > 0) {
      processedText += "\nACTIVE FINANCIAL OBLIGATIONS:\n";
      activeCharges.slice(0, 10).forEach((charge, index) => {
        processedText += `  ${index + 1}. ${charge.description || 'Charge description not available'}\n`;
        if (charge.amount) processedText += `     Amount: ${charge.amount}\n`;
        if (charge.date) processedText += `     Date Created: ${charge.date}\n`;
        if (charge.chargee) processedText += `     Secured Party: ${charge.chargee}\n`;
      });
    }
    
    if (satisfiedCharges.length > 0) {
      processedText += "\nRECENTLY SATISFIED CHARGES:\n";
      satisfiedCharges.slice(0, 5).forEach((charge, index) => {
        processedText += `  ${index + 1}. ${charge.description || 'Charge description not available'} - SATISFIED\n`;
        if (charge.dateSatisfied) processedText += `     Satisfied: ${charge.dateSatisfied}\n`;
      });
    }
    processedText += "\n";
  }

  // Enhanced PSC (Persons with Significant Control) Analysis
  if (data.psc && Array.isArray(data.psc) && data.psc.length > 0) {
    processedText += "=== OWNERSHIP & CONTROL STRUCTURE ===\n";
    processedText += `Persons with Significant Control: ${data.psc.length}\n`;
    
    data.psc.forEach((person, index) => {
      processedText += `\n  ${index + 1}. ${person.name || 'Name not specified'}\n`;
      if (person.nationality) processedText += `     Nationality: ${person.nationality}\n`;
      if (person.dateOfBirth) processedText += `     Date of Birth: ${person.dateOfBirth}\n`;
      if (person.address) processedText += `     Address: ${person.address}\n`;
      if (person.naturesOfControl && person.naturesOfControl.length > 0) {
        processedText += `     Nature of Control:\n`;
        person.naturesOfControl.forEach(control => {
          processedText += `       - ${control}\n`;
        });
      }
    });
    processedText += "\n";
  }

  // Additional data sections
  if (data.additional) {
    processedText += "=== ADDITIONAL COMPANY INFORMATION ===\n";
    processedText += JSON.stringify(data.additional, null, 2);
    processedText += "\n";
  }

  return processedText;
}

export async function getEnhancedAnthropicSummary(company: string, rawData: EnhancedCompanyData) {
  try {
    const processedData = processEnhancedCompanyData(rawData);
    
    // Calculate key metrics for the prompt
    const totalFilings = rawData.filing?.totalFilings || 0;
    const pagesScraped = rawData.filing?.pagesScraped || 0;
    const pdfCount = rawData.filing?.filings?.flatMap(f => f.documentLinks?.filter(l => l.linkType === 'PDF') || []).length || 0;
    const totalOfficers = rawData.people?.totalOfficers || rawData.people?.officers?.length || 0;
    const activeOfficers = rawData.people?.activeOfficers || rawData.people?.officers?.filter(o => !o.resignationDate).length || 0;
    const totalCharges = Array.isArray(rawData.charges) ? rawData.charges.length : 0;
    
    const prompt = `You are a senior UK business intelligence analyst with 15+ years of experience in corporate due diligence, risk assessment, and regulatory compliance analysis. You specialize in Companies House data interpretation, financial risk evaluation, and corporate governance assessment.

Your task is to analyze the comprehensive company intelligence data for "${company}" and produce a professional-grade business intelligence report suitable for:
- Investment committee decisions
- M&A due diligence processes
- Credit risk assessments
- Regulatory compliance reviews
- Partnership evaluations
- Board-level strategic assessments

=== COMPANY DATA ANALYSIS ===
${processedData}

=== ANALYTICAL FRAMEWORK ===
Apply your expertise in:
- UK Companies House regulations and filing requirements
- Corporate governance best practices
- Financial risk indicators and red flags
- Business lifecycle and maturity assessment
- Regulatory compliance patterns
- Market and industry context analysis

=== REQUIRED REPORT STRUCTURE ===

## 🎯 EXECUTIVE SUMMARY
**Provide a 3-4 sentence executive overview covering:**
- Overall company health and viability assessment
- Key risk factors and opportunities identified
- Primary recommendations for stakeholders
- Investment/partnership readiness score (1-10)

## 🏢 BUSINESS INTELLIGENCE PROFILE
**Comprehensive business context analysis:**
- Company maturity and lifecycle stage assessment
- Industry positioning and SIC code analysis
- Operational status and business continuity indicators
- Geographic and market presence evaluation
- Competitive positioning insights (where determinable)

## 📋 REGULATORY COMPLIANCE & FILING INTELLIGENCE
**Deep-dive compliance assessment (${totalFilings} filings analyzed from ${pagesScraped} pages):**
- Filing pattern analysis and compliance trajectory
- Regulatory adherence score and trend analysis
- Identification of compliance gaps or irregularities
- Filing frequency analysis vs. industry benchmarks
- Document completeness assessment (${pdfCount} PDFs available)
- Historical compliance performance and reliability

## 👥 GOVERNANCE & LEADERSHIP ANALYSIS
**Corporate governance and control structure (${totalOfficers} officers, ${activeOfficers} active):**
- Leadership stability and governance quality assessment
- Officer tenure analysis and management continuity
- Board composition and expertise evaluation
- Recent governance changes and their implications
- Control structure analysis and ownership transparency
- Key person risk assessment

## 💰 FINANCIAL SECURITY & OBLIGATIONS
**Financial risk and security analysis (${totalCharges} charges identified):**
- Active financial obligations and security interests
- Debt structure and secured lending analysis
- Financial leverage and liquidity indicators
- Credit risk assessment based on charges data
- Historical financial obligation patterns
- Secured vs. unsecured debt analysis

## 📄 DOCUMENT INTELLIGENCE & ACCESSIBILITY
**Information availability and transparency assessment:**
- Document availability score and accessibility analysis
- Critical missing documents identification
- Information transparency and disclosure quality
- Audit trail completeness and reliability
- Public record integrity assessment

## ⚠️ COMPREHENSIVE RISK ASSESSMENT
**Multi-dimensional risk analysis with specific focus on:**

### Compliance Risk (High/Medium/Low)
- Regulatory filing compliance history and trends
- Potential regulatory penalties or sanctions risk
- Future compliance obligations and deadlines

### Financial Risk (High/Medium/Low)
- Credit risk based on charges and financial obligations
- Liquidity and solvency indicators from available data
- Financial distress signals or warning indicators

### Governance Risk (High/Medium/Low)
- Management stability and succession planning
- Corporate governance quality and transparency
- Key person dependencies and concentration risk

### Operational Risk (High/Medium/Low)
- Business continuity and operational stability
- Market positioning and competitive threats
- Industry-specific risks and challenges

### Reputational Risk (High/Medium/Low)
- Public record issues or regulatory concerns
- Governance failures or compliance breaches
- Stakeholder confidence and market perception

## 🔍 STRATEGIC DUE DILIGENCE ROADMAP
**Actionable recommendations for thorough assessment:**

### Immediate Actions Required
- Priority documents for detailed review
- Critical data gaps requiring investigation
- Urgent red flags needing immediate attention

### Enhanced Due Diligence Steps
- Additional data sources to consult
- Third-party verification requirements
- Industry-specific compliance checks

### Ongoing Monitoring Recommendations
- Key metrics and indicators to track
- Filing deadlines and compliance calendar
- Early warning signals to monitor

### Investment/Partnership Decision Framework
- Go/No-Go decision criteria based on findings
- Risk mitigation strategies and safeguards
- Deal structure considerations and protections

=== ANALYTICAL STANDARDS ===
- Provide specific, actionable insights rather than generic observations
- Quantify risks and opportunities where possible
- Reference specific data points and patterns from the analysis
- Maintain professional objectivity while highlighting concerns
- Consider industry context and regulatory environment
- Focus on material information affecting business decisions

=== OUTPUT REQUIREMENTS ===
- Use professional business language appropriate for C-suite executives
- Include specific data references and quantitative analysis
- Highlight critical issues with clear risk ratings
- Provide actionable recommendations with clear next steps
- Maintain analytical rigor while ensuring accessibility
- Structure findings for easy executive consumption

Generate a comprehensive, professional business intelligence report that demonstrates deep understanding of UK corporate regulations, business risk assessment, and strategic decision-making frameworks.`;

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
        max_tokens: 8000, // Significantly increased for comprehensive business intelligence reports
        temperature: 0.1 // Very low temperature for maximum factual accuracy and consistency
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const json = await response.json();
    return json.content?.[0]?.text || "No summary could be generated.";
    
  } catch (error) {
    console.error("Error generating enhanced business intelligence summary:", error);
    
    // Provide more detailed error information for debugging
    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
    
    return `## ⚠️ BUSINESS INTELLIGENCE ANALYSIS ERROR\n\n**Error Type:** ${error instanceof Error ? error.name : 'Unknown Error'}\n\n**Error Message:** ${error instanceof Error ? error.message : 'An unknown error occurred while generating the comprehensive business intelligence report.'}\n\n**Recommendation:** Please verify your API configuration and try again. If the error persists, contact your system administrator.\n\n**Fallback Analysis:** Based on the available data structure, the company appears to have ${rawData.filing?.totalFilings || 0} filings and ${rawData.people?.officers?.length || 0} officers on record. Manual review of the extracted data is recommended.`;
  }
}