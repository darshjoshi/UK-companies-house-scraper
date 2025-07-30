import 'dotenv/config';
import express from 'express';
import { runEnhancedCompaniesScraper } from './scraper.js';
import { getEnhancedAnthropicSummary } from './summarizer.js';

const app = express();
app.use(express.json());
app.use(express.static('.'));

// Enhanced logging utility
class Logger {
  static log(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
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

  static info(message: string, data?: any): void {
    this.log('info', message, data);
  }

  static warn(message: string, data?: any): void {
    this.log('warn', message, data);
  }

  static error(message: string, data?: any): void {
    this.log('error', message, data);
  }
}

// Input validation
class Validator {
  static validateCompanyName(company: string): { valid: boolean; error?: string } {
    if (!company) {
      return { valid: false, error: 'Company name is required' };
    }
    
    if (typeof company !== 'string') {
      return { valid: false, error: 'Company name must be a string' };
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
  static assessDataQuality(data: any): { score: number; issues: string[]; recommendations: string[] } {
    const issues: string[] = [];
    const recommendations: string[] = [];
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
      if (!data.overview.incorporationDate) {
        issues.push("Incorporation date not extracted");
        score -= 5;
      }
    }

    // Filing history assessment (40 points)
    if (!data.filing || !data.filing.filings || data.filing.filings.length === 0) {
      issues.push("No filing history extracted");
      score -= 40;
      recommendations.push("Company may have limited filing history or extraction failed");
    } else {
      const filingData = data.filing;
      
      // Check filing count
      if (filingData.totalFilings < 3) {
        issues.push("Very limited filing history");
        score -= 10;
      } else if (filingData.totalFilings > 50) {
        score += 5; // Bonus for extensive history
      }

      // Check PDF document extraction
      const docSuccessRate = filingData.statistics?.documentSuccessRate || 0;
      if (docSuccessRate === 0) {
        issues.push("No PDF document links extracted");
        score -= 20;
        recommendations.push("PDF documents may not be available or extraction failed");
      } else if (docSuccessRate < 30) {
        issues.push(`Low PDF extraction rate: ${docSuccessRate}%`);
        score -= 10;
      } else if (docSuccessRate > 80) {
        score += 5; // Bonus for high success rate
      }

      // Check for recent filings
      if (filingData.dateRange) {
        const latestDate = new Date(filingData.dateRange.latest);
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        
        if (latestDate < oneYearAgo) {
          issues.push("No recent filings in the last year");
          score -= 5;
          recommendations.push("Check if company is still active");
        }
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

  static generateQualityReport(assessment: any): string {
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

// Statistics calculator
class StatsCalculator {
  static calculateFilingStats(data: any): any {
    if (!data.filing || !data.filing.filings) {
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

  static calculateOverallStats(data: any): any {
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
  static handleScrapingError(error: Error, company: string): { statusCode: number; errorCode: string; userMessage: string } {
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
      statusCode = 502;
      errorCode = 'EXTRACTION_ERROR';
      userMessage = 'Data extraction failed. The website may be temporarily unavailable.';
    }

    return { statusCode, errorCode, userMessage };
  }
}

// Main API endpoints

// Enhanced report endpoint
app.post('/api/enhanced-report', async (req, res) => {
  const startTime = Date.now();
  const { company } = req.body;
  
  Logger.info(`Enhanced report request received`, { company });
  
  // Validate input
  const validation = Validator.validateCompanyName(company);
  if (!validation.valid) {
    Logger.warn(`Validation failed: ${validation.error}`);
    return res.status(400).json({ 
      success: false,
      error: validation.error,
      code: 'VALIDATION_ERROR',
      timestamp: new Date().toISOString()
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

    // Enhanced response
    res.json({
      success: true,
      company: company.trim(),
      data: rawData,
      llm_summary: llmSummary,
      metadata: {
        processingTime: `${processingTime}ms`,
        extractionTimestamp: rawData.extractionTimestamp,
        qualityAssessment: {
          score: qualityAssessment.score,
          issues: qualityAssessment.issues,
          recommendations: qualityAssessment.recommendations,
          report: qualityReport
        },
        extractedSections: overallStats,
        filingStatistics: filingStats,
        performance: {
          scrapingTime: processingTime,
          aiSummaryGenerated: qualityAssessment.score >= 40,
          cacheEnabled: true
        }
      }
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorInfo = ErrorHandler.handleScrapingError(error as Error, company);
    
    Logger.error(`Enhanced report generation failed`, {
      company,
      processingTime: `${processingTime}ms`,
      error: error.message,
      stack: error.stack
    });

    res.status(errorInfo.statusCode).json({
      success: false,
      error: errorInfo.userMessage,
      code: errorInfo.errorCode,
      company: company?.trim(),
      metadata: {
        processingTime: `${processingTime}ms`,
        timestamp: new Date().toISOString(),
        errorDetails: {
          type: errorInfo.errorCode,
          originalError: error.message
        }
      }
    });
  }
});

// Legacy report endpoint (for backward compatibility)
app.post('/api/report', async (req, res) => {
  // Redirect to enhanced endpoint
  Logger.info('Legacy /api/report endpoint called, redirecting to enhanced version');
  req.url = '/api/enhanced-report';
  return app._router.handle(req, res);
});

// Filing export endpoint
app.get('/api/filings/:companyNumber', async (req, res) => {
  const { companyNumber } = req.params;
  const { format = 'json' } = req.query;
  
  Logger.info(`Filing export request`, { companyNumber, format });

  try {
    // This would typically fetch from a database or cache
    // For now, return a structured response indicating the feature
    res.json({
      success: true,
      message: "Filing export endpoint ready for implementation",
      companyNumber,
      format,
      availableFormats: ['json', 'csv', 'xlsx'],
      note: "This endpoint can be extended to export filing data in various formats",
      implementation: {
        suggestedFeatures: [
          "Export filing history as CSV/Excel",
          "Filter filings by date range",
          "Include/exclude document links",
          "Custom field selection"
        ]
      }
    });
  } catch (error) {
    Logger.error('Filing export failed', { error: error.message });
    res.status(500).json({ 
      success: false,
      error: 'Failed to export filing data',
      code: 'EXPORT_ERROR'
    });
  }
});

// Test endpoint for PDF extraction
app.get('/api/test-pdf/:companyName', async (req, res) => {
  const { companyName } = req.params;
  
  Logger.info(`PDF extraction test request`, { companyName });

  try {
    const result = await runEnhancedCompaniesScraper(companyName);
    
    // Extract key statistics for testing
    const testResults = {
      companyFound: !!result.overview,
      totalFilings: result.filing?.totalFilings || 0,
      filingsWithPDFs: result.filing?.statistics?.filingsWithDocuments || 0,
      pdfSuccessRate: result.filing?.statistics?.documentSuccessRate || 0,
      qualityScore: result.qualityScore || 0,
      dataIssues: result.dataIssues || [],
      sampleFilings: (result.filing?.filings || [])
        .filter(f => f.documentLinks && f.documentLinks.length > 0)
        .slice(0, 3)
        .map(f => ({
          date: f.date,
          type: f.type,
          description: f.description.substring(0, 80) + '...',
          documentCount: f.documentLinks.length,
          sampleDocument: f.documentLinks[0] ? {
            type: f.documentLinks[0].linkType,
            text: f.documentLinks[0].linkText,
            hasValidUrl: f.documentLinks[0].url && f.documentLinks[0].url.length > 10,
            pageCount: f.documentLinks[0].pageCount
          } : null
        }))
    };
    
    res.json({
      success: true,
      company: companyName,
      testResults,
      timestamp: new Date().toISOString(),
      message: "PDF extraction test completed successfully"
    });
    
  } catch (error) {
    Logger.error('PDF test failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
      company: companyName,
      code: 'TEST_FAILED'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '3.0.0',
    environment: process.env.NODE_ENV || 'development',
    features: [
      'enhanced_pdf_extraction',
      'multi_strategy_scraping', 
      'quality_assessment',
      'ai_powered_analysis',
      'comprehensive_error_handling',
      'performance_monitoring'
    ],
    dependencies: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      stagehand: true,
      browserbase: !!process.env.BROWSERBASE_API_KEY
    }
  };

  res.json(healthStatus);
});

// API documentation endpoint
app.get('/api/info', (req, res) => {
  res.json({
    name: 'Enhanced UK Company Intelligence API',
    version: '3.0.0',
    description: 'AI-powered comprehensive company data extraction with advanced PDF link extraction and quality assessment',
    
    features: {
      dataExtraction: [
        'Multi-strategy PDF link extraction',
        'Comprehensive filing history with document links',
        'Officer and people information',
        'Charges and security interests',
        'Company overview and status'
      ],
      intelligence: [
        'AI-powered business analysis',
        'Compliance assessment',
        'Risk evaluation',
        'Quality scoring and recommendations'
      ],
      reliability: [
        'Multiple extraction strategies with fallbacks',
        'Enhanced error handling and recovery',
        'Performance monitoring',
        'Detailed logging and debugging'
      ]
    },

    endpoints: {
      'POST /api/enhanced-report': {
        description: 'Generate comprehensive company report with enhanced PDF extraction',
        body: { company: 'string (company name)' },
        response: 'Complete company analysis with AI summary'
      },
      'POST /api/report': {
        description: 'Legacy endpoint (redirects to enhanced-report)',
        deprecated: true
      },
      'GET /api/test-pdf/:companyName': {
        description: 'Test PDF extraction capabilities for a specific company',
        response: 'PDF extraction test results and statistics'
      },
      'GET /api/filings/:companyNumber': {
        description: 'Export filing data in various formats',
        query: { format: 'json|csv|xlsx' },
        status: 'Ready for implementation'
      },
      'GET /api/health': {
        description: 'System health check and dependency status'
      },
      'GET /api/info': {
        description: 'API documentation and capabilities'
      }
    },

    qualityFeatures: {
      extractionStrategies: [
        'Direct DOM manipulation with enhanced selectors',
        'LLM-powered extraction with post-processing',
        'Fallback text pattern matching'
      ],
      qualityAssurance: [
        'Automated quality scoring (0-100)',
        'Issue detection and recommendations',
        'Performance monitoring and optimization',
        'Comprehensive error categorization'
      ]
    },

    usage: {
      basicRequest: {
        method: 'POST',
        url: '/api/enhanced-report',
        body: { company: 'COMPANY NAME LTD' }
      },
      rateLimit: 'Intelligent rate limiting to prevent blocking',
      timeout: '60 seconds maximum per request',
      caching: 'Enabled for improved performance'
    }
  });
});

// Global error handler
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  Logger.error('Unhandled application error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method
  });

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    timestamp: new Date().toISOString()
  });
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  Logger.info(`Enhanced Company Intelligence Server started`, {
    port: PORT,
    version: '3.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
  
  Logger.info('Available endpoints:', {
    health: `http://localhost:${PORT}/api/health`,
    info: `http://localhost:${PORT}/api/info`,
    webInterface: `http://localhost:${PORT}/`,
    enhancedReport: `POST http://localhost:${PORT}/api/enhanced-report`
  });
  
  Logger.info('New features in v3.0.0:', [
    'Multi-strategy PDF extraction',
    'Enhanced quality assessment',
    'Comprehensive error handling',
    'Performance monitoring',
    'Detailed logging and debugging'
  ]);
});