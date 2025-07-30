import 'dotenv/config';
import express from 'express';
import { runEnhancedCompaniesScraper } from './scraper.js';
import { getEnhancedAnthropicSummary } from './summarizer.js';

const app = express();
app.use(express.json());
app.use(express.static('.'));

// Enhanced logging utility
class Logger {
  static log(level, message, data) {
    const timestamp = new Date().toISOString();
    const levelUpper = level.toUpperCase();
    
    console.log(`[${timestamp}] ${levelUpper}: ${message}`);
    
    if (data) {
      if (typeof data === 'object') {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(data);
      }
    }
  }

  static info(message, data) {
    this.log('info', message, data);
  }
  
  static warn(message, data) {
    this.log('warn', message, data);
  }
  
  static error(message, data) {
    this.log('error', message, data);
  }
}

// Input validator
class InputValidator {
  static validateCompanyName(company) {
    if (!company) {
      return { valid: false, error: 'Company name is required' };
    }
    
    const trimmed = company.trim();
    if (trimmed.length < 2) {
      return { valid: false, error: 'Company name must be at least 2 characters long' };
    }
    
    if (trimmed.length > 200) {
      return { valid: false, error: 'Company name is too long (max 200 characters)' };
    }
    
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+=/i,
      /<iframe/i,
      /data:/i
    ];
    
    if (suspiciousPatterns.some(pattern => pattern.test(trimmed))) {
      return { valid: false, error: 'Invalid characters in company name' };
    }
    
    return { valid: true };
  }
}

// Data quality assessment
class QualityAssessor {
  static assessDataQuality(data) {
    const issues = [];
    const recommendations = [];
    let score = 100;

    // Overview assessment (30 points)
    if (!data.overview) {
      issues.push("No company overview data extracted");
      score -= 30;
      recommendations.push("Verify company name spelling and try again");
    } else {
      if (!data.overview.companyName) {
        issues.push("Company name not extracted");
        score -= 10;
      }
      if (!data.overview.companyNumber) {
        issues.push("Company number not extracted");
        score -= 10;
      }
      if (!data.overview.status) {
        issues.push("Company status not extracted");
        score -= 5;
      }
    }

    // Filing assessment (40 points)
    if (!data.filing || !data.filing.filings || data.filing.filings.length === 0) {
      issues.push("No filing history extracted");
      score -= 40;
      recommendations.push("Check if company has filing history or try a different extraction approach");
    } else {
      // Check filing document links
      const totalFilings = data.filing.filings.length;
      const filingsWithLinks = data.filing.filings.filter(f => f.documentLinks && f.documentLinks.length > 0).length;
      const linkSuccessRate = totalFilings > 0 ? (filingsWithLinks / totalFilings) * 100 : 0;
      
      if (linkSuccessRate < 30) {
        issues.push(`Low document link extraction rate (${Math.round(linkSuccessRate)}%)`);
        score -= 25;
        recommendations.push("PDF link extraction needs improvement");
      } else if (linkSuccessRate < 60) {
        issues.push(`Moderate document link extraction rate (${Math.round(linkSuccessRate)}%)`);
        score -= 15;
        recommendations.push("PDF link extraction has some issues");
      } else if (linkSuccessRate > 80) {
        // Bonus for great extraction
        score += 5;
      }
    }

    // People/Officers assessment (20 points)
    if (!data.people || !data.people.officers || data.people.officers.length === 0) {
      issues.push("No officer information extracted");
      score -= 20;
      recommendations.push("Officer information may be restricted or extraction failed");
    } else {
      if (data.people.officers.length > 5) {
        score += 2; // Bonus for detailed officer info
      }
    }

    // Charges assessment (10 points)
    if (!data.charges) {
      issues.push("Charges section not accessible");
      score -= 10;
    } else if (data.charges.charges && data.charges.charges.length > 0) {
      // Company has charges - note but don't penalize
      recommendations.push("Company has registered charges - review for risk assessment");
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      issues,
      recommendations
    };
  }

  static generateQualityReport(assessment) {
    let report = `Data Quality Score: ${assessment.score}/100\n\n`;
    
    if (assessment.score >= 80) {
      report += "✅ Excellent data quality - comprehensive extraction successful\n\n";
    } else if (assessment.score >= 60) {
      report += "⚠️ Good data quality - minor issues detected\n\n";
    } else if (assessment.score >= 40) {
      report += "🔶 Fair data quality - some significant issues\n\n";
    } else {
      report += "❌ Poor data quality - major extraction issues\n\n";
    }

    if (assessment.issues.length > 0) {
      report += "Issues Detected:\n";
      assessment.issues.forEach(issue => {
        report += `• ${issue}\n`;
      });
      report += "\n";
    }

    if (assessment.recommendations.length > 0) {
      report += "Recommendations:\n";
      assessment.recommendations.forEach(rec => {
        report += `• ${rec}\n`;
      });
    }

    return report;
  }
}

// Statistics calculation
class StatsCalculator {
  static calculateFilingStats(data) {
    if (!data.filing || !data.filing.filings || data.filing.filings.length === 0) {
      return null;
    }

    const filings = data.filing.filings;
    const stats = data.filing.statistics || {};
    
    return {
      totalFilings: filings.length,
      filingsWithPDFs: stats.filingsWithDocuments || 0,
      totalPDFPages: stats.totalDocumentPages || 0,
      pdfSuccessRate: stats.documentSuccessRate || 0,
      dateRange: data.filing.dateRange,
      filingTypes: stats.filingTypes || {},
      recentFilings: filings.slice(0, 5).map(f => ({
        date: f.date,
        type: f.type,
        description: f.description.substring(0, 100) + (f.description.length > 100 ? '...' : ''),
        hasDocuments: (f.documentLinks || []).length > 0
      }))
    };
  }

  static calculateOverallStats(data) {
    return {
      hasOverview: !!data.overview,
      hasFilings: !!(data.filing && data.filing.filings && data.filing.filings.length > 0),
      hasOfficers: !!(data.people && data.people.officers && data.people.officers.length > 0),
      hasCharges: !!(data.charges && data.charges.charges && data.charges.charges.length > 0),
      officerCount: data.people?.officers?.length || 0,
      chargeCount: data.charges?.charges?.length || 0,
      extractionTimestamp: data.extractionTimestamp || new Date().toISOString()
    };
  }
}

// Error handler
class ErrorHandler {
  static handleScrapingError(error, company) {
    let statusCode = 500;
    let errorCode = 'INTERNAL_ERROR';
    let userMessage = 'An internal error occurred while processing your request';

    const errorMessage = error.message.toLowerCase();

    if (errorMessage.includes('no companies found') || errorMessage.includes('not found')) {
      statusCode = 404;
      errorCode = 'COMPANY_NOT_FOUND';
      userMessage = `No company found with the name "${company}". Please check the spelling and try again.`;
    } else if (errorMessage.includes('timeout') || errorMessage.includes('network')) {
      statusCode = 502;
      errorCode = 'NETWORK_ERROR';
      userMessage = 'Unable to connect to Companies House. Please try again later.';
    } else if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
      statusCode = 429;
      errorCode = 'RATE_LIMIT';
      userMessage = 'Too many requests. Please wait a moment and try again.';
    } else if (errorMessage.includes('scraping failed')) {
      statusCode = 500;
      errorCode = 'SCRAPING_ERROR';
      userMessage = 'Failed to extract company data. The website structure may have changed.';
    }

    return { statusCode, errorCode, userMessage };
  }
}

// Main API endpoint for enhanced company reports
app.post('/api/company', async (req, res) => {
  const startTime = Date.now();
  const { company } = req.body;
  
  // Validate input
  const validation = InputValidator.validateCompanyName(company);
  if (!validation.valid) {
    Logger.warn(`Invalid company name provided: ${company}`, { error: validation.error });
    return res.status(400).json({
      error: 'INVALID_INPUT',
      message: validation.error
    });
  }

  try {
    Logger.info(`Starting enhanced company scraping for: ${company}`);
    
    // Run the enhanced scraper
    const rawData = await runEnhancedCompaniesScraper(company.trim());
    
    // Assess data quality
    const qualityAssessment = QualityAssessor.assessDataQuality(rawData);
    const qualityReport = QualityAssessor.generateQualityReport(qualityAssessment);
    
    Logger.info(`Data extraction completed`, {
      qualityScore: qualityAssessment.score,
      issueCount: qualityAssessment.issues.length
    });

    // Calculate statistics
    const filingStats = StatsCalculator.calculateFilingStats(rawData);
    const overallStats = StatsCalculator.calculateOverallStats(rawData);

    // Log detailed statistics
    if (filingStats) {
      Logger.info(`Filing extraction statistics`, {
        totalFilings: filingStats.totalFilings,
        filingsWithPDFs: filingStats.filingsWithPDFs,
        pdfSuccessRate: `${filingStats.pdfSuccessRate}%`,
        totalPDFPages: filingStats.totalPDFPages
      });
    }

    // Generate AI summary if quality is sufficient
    let llmSummary = '';
    if (qualityAssessment.score >= 40) {
      Logger.info('Generating enhanced AI summary...');
      try {
        llmSummary = await getEnhancedAnthropicSummary(company, rawData);
        Logger.info('AI summary generated successfully');
      } catch (summaryError) {
        Logger.warn('AI summary generation failed', { error: summaryError.message });
        llmSummary = `AI summary generation failed: ${summaryError.message}\n\n${qualityReport}`;
      }
    } else {
      llmSummary = `Data quality insufficient for AI analysis (score: ${qualityAssessment.score}/100).\n\n${qualityReport}`;
      Logger.warn('Skipping AI summary due to low data quality', { score: qualityAssessment.score });
    }

    const processingTime = Date.now() - startTime;
    Logger.info(`Enhanced report completed`, { 
      processingTime: `${processingTime}ms`,
      qualityScore: qualityAssessment.score
    });

    // Ensure all necessary nested structures exist to prevent frontend errors
    const safeResponse = {
      success: true,
      data: {
        overview: rawData.overview || {},
        filing: {
          filings: (rawData.filing && rawData.filing.filings) ? rawData.filing.filings : [],
          totalFilings: (rawData.filing && rawData.filing.totalFilings) ? rawData.filing.totalFilings : 0,
          dateRange: (rawData.filing && rawData.filing.dateRange) ? rawData.filing.dateRange : {},
          statistics: (rawData.filing && rawData.filing.statistics) ? rawData.filing.statistics : {}
        },
        people: {
          officers: (rawData.people && rawData.people.officers) ? rawData.people.officers : []
        },
        charges: rawData.charges || {}
      },
      metadata: {
        qualityAssessment: {
          score: qualityAssessment.score,
          issues: qualityAssessment.issues || [],
          recommendations: qualityAssessment.recommendations || [] // Add this to fix frontend error
        },
        filingStatistics: filingStats || {},
        overallStatistics: overallStats || {},
        processingTimeMs: processingTime,
        aiSummary: llmSummary
      },
      llm_summary: llmSummary // Also add as top-level property for backward compatibility
    };
    
    console.log('Sending safe response structure to frontend');
    res.json(safeResponse);
    
  } catch (error) {
    Logger.error(`Error processing company data for "${company}"`, { 
      error: error.message,
      stack: error.stack
    });
    
    const { statusCode, errorCode, userMessage } = ErrorHandler.handleScrapingError(error, company);
    
    res.status(statusCode).json({
      error: errorCode,
      message: userMessage
    });
  }
});

// Status check endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    version: '3.0',
    timestamp: new Date().toISOString(),
    apiKey: process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing'
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  Companies House Enhanced Scraper - Server running on ${PORT}  ║
╚══════════════════════════════════════════════════════════════╝
  
  • Web UI: http://localhost:${PORT}
  • API: http://localhost:${PORT}/api/company (POST)
  • Status: http://localhost:${PORT}/api/status
  
`);
});
