import 'dotenv/config';
import express from 'express';
import { runEnhancedCompaniesScraper, testPDFExtraction } from './scraper.js';
import { getEnhancedAnthropicSummary } from './summarizer.js';
import { databaseService, SaveReportRequest, GetReportsRequest } from './database.js';

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

  static validateMaxPages(maxPages: any): { valid: boolean; value: number; error?: string } {
    if (maxPages === undefined || maxPages === null) {
      return { valid: true, value: 10 }; // Default value
    }
    
    const parsedValue = parseInt(maxPages);
    
    if (isNaN(parsedValue)) {
      return { valid: false, value: 10, error: 'Max pages must be a number' };
    }
    
    if (parsedValue < 1) {
      return { valid: false, value: 1, error: 'Max pages must be at least 1' };
    }
    
    if (parsedValue > 50) {
      return { valid: false, value: 50, error: 'Max pages cannot exceed 50 for performance reasons' };
    }
    
    return { valid: true, value: parsedValue };
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

    // Filing history assessment (40 points) - enhanced for PDF extraction
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

      // Enhanced PDF document extraction assessment
      const docSuccessRate = filingData.statistics?.documentSuccessRate ?? 0;
      if (docSuccessRate === 0) {
        issues.push("No PDF document links extracted");
        score -= 20;
        recommendations.push("PDF extraction may have failed - check network connectivity to Companies House");
      } else if (docSuccessRate < 30) {
        issues.push(`Low PDF extraction rate: ${docSuccessRate}%`);
        score -= 10;
        recommendations.push("Try using enhanced extraction strategies or verify document availability");
      } else if (docSuccessRate > 80) {
        score += 5; // Bonus for high success rate
      }

      // Check PDF links validity
      const invalidPDFLinks = filingData.filings.filter(f => 
        f.documentLinks && f.documentLinks.length > 0 && 
        f.documentLinks.some(link => !link.url || !link.url.includes('document?format='))
      ).length;
      
      if (invalidPDFLinks > 0) {
        issues.push(`${invalidPDFLinks} filings have potentially invalid PDF links`);
        score -= 5;
        recommendations.push("PDF link format may be incorrect, verify URL structure");
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
      
      // Add bonus for multiple pages scraped
      if (filingData.pagesScraped > 1) {
        const multiPageBonus = Math.min(5, filingData.pagesScraped);
        score += multiPageBonus;
        // Make sure score doesn't exceed 100
        score = Math.min(100, score);
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
      pagesScraped: data.filing.pagesScraped || 1,
      dateRange: data.filing.dateRange,
      filingTypes: stats.filingTypes || {},
      recentFilings: filings.slice(0, 5).map(f => ({
        date: f.date,
        type: f.type,
        description: f.description.substring(0, 100) + (f.description.length > 100 ? '...' : ''),
        hasDocuments: (f.documentLinks?.length ?? 0) > 0
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
      pagesScraped: data.filing?.pagesScraped || 1,
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
    } else if (errorMessage.includes('pdf') || errorMessage.includes('document links')) {
      statusCode = 500;
      errorCode = 'PDF_EXTRACTION_ERROR';
      userMessage = 'Failed to extract PDF links. Try using a different extraction strategy.';
    } else if (errorMessage.includes('pagination') || errorMessage.includes('next page')) {
      statusCode = 500;
      errorCode = 'PAGINATION_ERROR';
      userMessage = 'Failed to navigate through filing pages. Try with fewer pages.';
    }

    return { statusCode, errorCode, userMessage };
  }
}

// Main API endpoints

// Enhanced report endpoint - Updated to support maxPages parameter
app.post('/api/enhanced-report', async (req, res) => {
  const startTime = Date.now();
  const { company, maxPages, maxPeoplePages } = req.body;
  
  // Validate maxPages parameter
  const maxPagesValidation = Validator.validateMaxPages(maxPages);
  const validatedMaxPages = maxPagesValidation.value;
  
  if (!maxPagesValidation.valid) {
    Logger.warn(`Max pages validation failed: ${maxPagesValidation.error}`);
    // Continue with validated value, but log the warning
  }
  
  // Validate maxPeoplePages parameter
  const maxPeoplePagesValidation = Validator.validateMaxPages(maxPeoplePages || 5);
  const validatedMaxPeoplePages = maxPeoplePagesValidation.value;
  
  if (!maxPeoplePagesValidation.valid) {
    Logger.warn(`Max people pages validation failed: ${maxPeoplePagesValidation.error}`);
  }
  
  Logger.info(`Enhanced report request received`, { 
    company, 
    maxPages: validatedMaxPages, 
    maxPeoplePages: validatedMaxPeoplePages 
  });
  
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
    Logger.info(`Starting enhanced company scraping for: ${company} (max pages: ${validatedMaxPages}, max people pages: ${validatedMaxPeoplePages})`);
    
    // Run the enhanced scraper with better PDF extraction and multi-page support
    const rawData = await runEnhancedCompaniesScraper(company.trim(), validatedMaxPages, validatedMaxPeoplePages);
    
    // Assess data quality
    const qualityAssessment = QualityAssessor.assessDataQuality(rawData);
    const qualityReport = QualityAssessor.generateQualityReport(qualityAssessment);
    
    Logger.info(`Data extraction completed`, {
      qualityScore: qualityAssessment.score,
      issueCount: qualityAssessment.issues.length,
      pagesScraped: rawData.filing?.pagesScraped || 1
    });

    // Calculate statistics
    const filingStats = StatsCalculator.calculateFilingStats(rawData);
    const overallStats = StatsCalculator.calculateOverallStats(rawData);

    // Log detailed statistics for PDF extraction
    if (filingStats) {
      Logger.info(`PDF extraction statistics`, {
        totalFilings: filingStats.totalFilings,
        filingsWithPDFs: filingStats.filingsWithPDFs,
        pdfSuccessRate: `${filingStats.pdfSuccessRate}%`,
        totalPDFPages: filingStats.totalPDFPages,
        pagesScraped: filingStats.pagesScraped
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
      qualityScore: qualityAssessment.score,
      pagesScraped: rawData.filing?.pagesScraped || 1
    });

    // Save to database if available
    let reportId: string | null = null;
    if (databaseService.isAvailable()) {
      try {
        const sessionId = await databaseService.createOrUpdateSession(
          req.ip || req.connection.remoteAddress || 'anonymous'
        );
        
        const saveRequest: SaveReportRequest = {
          companyNumber: rawData.overview?.companyNumber || company.trim(),
          companyName: rawData.overview?.companyName || company.trim(),
          sessionId,
          extractionConfig: {
            maxPages: validatedMaxPages,
            maxPeoplePages: validatedMaxPeoplePages,
            enableRiskAssessment: true
          },
          rawData,
          aiSummary: llmSummary,
          qualityScore: qualityAssessment.score,
          extractionDurationMs: processingTime
        };
        
        reportId = await databaseService.saveReport(saveRequest);
        Logger.info(`Report saved to database`, { reportId, sessionId });
      } catch (dbError) {
        Logger.warn('Failed to save report to database', { error: dbError.message });
      }
    }

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
          cacheEnabled: true,
          pdfExtractionSuccess: (filingStats?.pdfSuccessRate ?? 0) > 0,
          pagesRequested: validatedMaxPages,
          pagesScraped: rawData.filing?.pagesScraped || 1
        },
        database: {
          saved: reportId !== null,
          reportId: reportId,
          storageEnabled: databaseService.isAvailable()
        }
      }
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorInfo = ErrorHandler.handleScrapingError(error as Error, company);
    
    Logger.error(`Enhanced report generation failed`, {
      company,
      maxPages: validatedMaxPages,
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
        maxPagesRequested: validatedMaxPages,
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

// PDF Extraction test endpoint
app.get('/api/test-pdf-extraction/:companyNumber', async (req, res) => {
  const { companyNumber } = req.params;
  
  Logger.info(`PDF extraction test requested for company: ${companyNumber}`);
  
  try {
    const results = await testPDFExtraction(companyNumber);
    
    Logger.info(`PDF extraction test completed`, {
      directDOMCount: results.results.directDOM.pdfLinks,
      llmCount: results.results.llm.pdfLinks,
      hybridCount: results.results.hybrid.pdfLinks
    });
    
    res.json({
      success: true,
      companyNumber,
      results: results.results,
      metadata: {
        timestamp: new Date().toISOString(),
        bestStrategy: determineBestStrategy(results.results)
      }
    });
  } catch (error) {
    Logger.error(`PDF extraction test failed`, {
      companyNumber,
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: `PDF extraction test failed: ${error.message}`,
      companyNumber,
      code: 'PDF_TEST_FAILED'
    });
  }
});

// Helper function to determine the best PDF extraction strategy
function determineBestStrategy(results: any): { name: string; reason: string } {
  const strategies = [
    {
      name: 'directDOM',
      count: results.directDOM.pdfLinks,
      filingCount: results.directDOM.filingCount
    },
    {
      name: 'llm',
      count: results.llm.pdfLinks,
      filingCount: results.llm.filingCount
    },
    {
      name: 'hybrid',
      count: results.hybrid.pdfLinks,
      filingCount: results.hybrid.filingCount
    }
  ];
  
  // Sort by PDF link count, then by filing count
  strategies.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.filingCount - a.filingCount;
  });
  
  const best = strategies[0];
  
  if (best.count === 0) {
    return {
      name: 'none',
      reason: 'No PDF links were found with any strategy'
    };
  }
  
  let reason = `Found the most PDF links (${best.count})`;
  if (best.count === strategies[1].count) {
    reason = `Found the same number of PDF links (${best.count}) as ${strategies[1].name} but with ${best.filingCount > strategies[1].filingCount ? 'more filings' : 'equal filings'}`;
  }
  
  return { name: best.name, reason };
}

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

// New endpoint to get page count estimate for a company
app.get('/api/page-count-estimate/:companyNumber', async (req, res) => {
  const { companyNumber } = req.params;
  
  Logger.info(`Page count estimate requested for company: ${companyNumber}`);
  
  try {
    // This is a placeholder implementation
    // In a real implementation, you would make a quick request to
    // the first page of filing history and check pagination
    
    // For now, return a dummy response
    res.json({
      success: true,
      companyNumber,
      estimatedPageCount: 5,
      note: "This is an estimated page count. The actual number may vary.",
      metadata: {
        timestamp: new Date().toISOString(),
        estimationMethod: "placeholder"
      }
    });
  } catch (error) {
    Logger.error(`Page count estimation failed`, {
      companyNumber,
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: `Failed to estimate page count: ${error.message}`,
      companyNumber,
      code: 'ESTIMATION_ERROR'
    });
  }
});

// ===== DATABASE API ENDPOINTS =====

// Check if a report already exists for a company
app.get('/api/reports/check/:companyIdentifier', async (req, res) => {
  if (!databaseService.isAvailable()) {
    return res.status(503).json({
      success: false,
      error: 'Database service not available',
      code: 'DATABASE_UNAVAILABLE'
    });
  }

  try {
    const { companyIdentifier } = req.params;
    const { sessionId } = req.query;
    
    const existingReport = await databaseService.checkExistingReport(companyIdentifier, sessionId as string);
    
    res.json({
      success: true,
      exists: !!existingReport,
      report: existingReport ? {
        id: existingReport.id,
        company_name: existingReport.company_name,
        extraction_timestamp: existingReport.extraction_timestamp,
        quality_score: existingReport.quality_score
      } : null
    });
    
  } catch (error) {
    Logger.error('Error checking existing report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check existing report',
      code: 'CHECK_ERROR'
    });
  }
});

// Get saved reports for a session
app.get('/api/reports', async (req, res) => {
  if (!databaseService.isAvailable()) {
    return res.status(503).json({
      success: false,
      error: 'Database service not available',
      code: 'DATABASE_UNAVAILABLE'
    });
  }

  try {
    const { sessionId, companyNumber, limit, offset, dateFrom, dateTo } = req.query;
    
    const request: GetReportsRequest = {
      sessionId: sessionId as string,
      companyNumber: companyNumber as string,
      limit: limit ? parseInt(limit as string) : 20,
      offset: offset ? parseInt(offset as string) : 0,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string
    };
    
    const reports = await databaseService.getReports(request);
    
    Logger.info(`Retrieved ${reports.length} reports`, { sessionId, companyNumber });
    
    res.json({
      success: true,
      reports,
      count: reports.length,
      pagination: {
        limit: request.limit,
        offset: request.offset
      }
    });
  } catch (error) {
    Logger.error('Error retrieving reports', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve reports',
      code: 'DATABASE_ERROR'
    });
  }
});

// Get a specific report by ID
app.get('/api/reports/:reportId', async (req, res) => {
  if (!databaseService.isAvailable()) {
    return res.status(503).json({
      success: false,
      error: 'Database service not available',
      code: 'DATABASE_UNAVAILABLE'
    });
  }

  try {
    const { reportId } = req.params;
    const report = await databaseService.getReportById(reportId);
    
    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found',
        code: 'REPORT_NOT_FOUND'
      });
    }
    
    Logger.info(`Retrieved report`, { reportId, companyNumber: report.company_number });
    
    res.json({
      success: true,
      report
    });
  } catch (error) {
    Logger.error('Error retrieving report by ID', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve report',
      code: 'DATABASE_ERROR'
    });
  }
});

// Delete a report
app.delete('/api/reports/:reportId', async (req, res) => {
  if (!databaseService.isAvailable()) {
    return res.status(503).json({
      success: false,
      error: 'Database service not available',
      code: 'DATABASE_UNAVAILABLE'
    });
  }

  try {
    const { reportId } = req.params;
    const { sessionId } = req.query;
    
    const deleted = await databaseService.deleteReport(reportId, sessionId as string);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Report not found or access denied',
        code: 'REPORT_NOT_FOUND'
      });
    }
    
    Logger.info(`Deleted report`, { reportId, sessionId });
    
    res.json({
      success: true,
      message: 'Report deleted successfully'
    });
  } catch (error) {
    Logger.error('Error deleting report', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to delete report',
      code: 'DATABASE_ERROR'
    });
  }
});

// Search reports
app.get('/api/reports/search/:searchTerm', async (req, res) => {
  if (!databaseService.isAvailable()) {
    return res.status(503).json({
      success: false,
      error: 'Database service not available',
      code: 'DATABASE_UNAVAILABLE'
    });
  }

  try {
    const { searchTerm } = req.params;
    const { sessionId, limit } = req.query;
    
    const reports = await databaseService.searchReports(
      searchTerm,
      sessionId as string,
      limit ? parseInt(limit as string) : 10
    );
    
    Logger.info(`Search completed`, { searchTerm, resultsCount: reports.length });
    
    res.json({
      success: true,
      searchTerm,
      reports,
      count: reports.length
    });
  } catch (error) {
    Logger.error('Error searching reports', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to search reports',
      code: 'DATABASE_ERROR'
    });
  }
});

// Get session statistics
app.get('/api/sessions/:sessionId/stats', async (req, res) => {
  if (!databaseService.isAvailable()) {
    return res.status(503).json({
      success: false,
      error: 'Database service not available',
      code: 'DATABASE_UNAVAILABLE'
    });
  }

  try {
    const { sessionId } = req.params;
    const stats = await databaseService.getSessionStats(sessionId);
    
    Logger.info(`Retrieved session stats`, { sessionId, ...stats });
    
    res.json({
      success: true,
      sessionId,
      stats
    });
  } catch (error) {
    Logger.error('Error retrieving session stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve session statistics',
      code: 'DATABASE_ERROR'
    });
  }
});

// ===== FRONTEND ROUTES =====

// Serve reports page
app.get('/reports', (req, res) => {
  res.sendFile('reports.html', { root: '.' });
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
      'multi_page_extraction',
      'quality_assessment',
      'ai_powered_analysis',
      'comprehensive_error_handling',
      'performance_monitoring'
    ],
    dependencies: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      stagehand: true,
      browserbase: !!process.env.BROWSERBASE_API_KEY,
      supabase: databaseService.isAvailable()
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
        'Multi-page filing history extraction',
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
        body: { 
          company: 'string (company name)',
          maxPages: 'number (optional, default: 10, max: 50)'
        },
        response: 'Complete company analysis with AI summary'
      },
      'POST /api/report': {
        description: 'Legacy endpoint (redirects to enhanced-report)',
        deprecated: true
      },
      'GET /api/test-pdf-extraction/:companyNumber': {
        description: 'Test PDF extraction capabilities for a specific company',
        response: 'PDF extraction test results and statistics'
      },
      'GET /api/page-count-estimate/:companyNumber': {
        description: 'Get an estimate of the number of filing history pages for a company',
        response: 'Estimated page count'
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
        'LLM-powered extraction with URL type',
        'Hybrid approach combining DOM and LLM',
        'Multi-page navigation and extraction'
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
        body: { 
          company: 'COMPANY NAME LTD',
          maxPages: 10
        }
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
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0'; // Railway-friendly host binding
const isProduction = process.env.NODE_ENV === 'production';
const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
  : `http://localhost:${PORT}`;

app.listen(PORT, HOST, () => {
  Logger.info(`🚀 Enhanced Company Intelligence Server started`, {
    port: PORT,
    host: HOST,
    version: '3.0.0',
    environment: process.env.NODE_ENV || 'development',
    browserMode: process.env.BROWSERBASE_API_KEY ? 'BrowserBase (Remote)' : 'Local',
    deployment: process.env.RAILWAY_ENVIRONMENT || 'local'
  });
  
  Logger.info('📡 Available endpoints:', {
    health: `${baseUrl}/api/health`,
    info: `${baseUrl}/api/info`,
    webInterface: `${baseUrl}/`,
    enhancedReport: `POST ${baseUrl}/api/enhanced-report`
  });
  
  Logger.info('New features in v3.0.0:', [
    'Multi-strategy PDF extraction',
    'Multi-page filing history extraction',
    'Enhanced quality assessment',
    'Comprehensive error handling',
    'Performance monitoring',
    'Detailed logging and debugging'
  ]);
});