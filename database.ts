import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import 'dotenv/config';

// Database types matching our schema
export interface CompanyReport {
  id?: string;
  company_number: string;
  company_name?: string;
  extraction_timestamp?: string;
  user_session_id?: string;
  extraction_config: {
    maxPages?: number;
    maxPeoplePages?: number;
    enableRiskAssessment?: boolean;
  };
  raw_data: any; // Complete scraping result
  ai_summary?: string;
  quality_score?: number;
  extraction_duration_ms?: number;
  status: 'completed' | 'failed' | 'in_progress';
  created_at?: string;
  updated_at?: string;
}

export interface ExtractionSession {
  session_id?: string;
  user_identifier?: string;
  created_at?: string;
  last_accessed?: string;
  total_extractions?: number;
}

export interface SaveReportRequest {
  companyNumber: string;
  companyName?: string;
  sessionId?: string;
  extractionConfig: any;
  rawData: any;
  aiSummary?: string;
  qualityScore?: number;
  extractionDurationMs?: number;
}

export interface GetReportsRequest {
  sessionId?: string;
  companyNumber?: string;
  limit?: number;
  offset?: number;
  dateFrom?: string;
  dateTo?: string;
}

class DatabaseService {
  private supabase: SupabaseClient;
  private isEnabled: boolean;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    
    this.isEnabled = !!(supabaseUrl && supabaseKey);
    
    if (this.isEnabled) {
      this.supabase = createClient(supabaseUrl!, supabaseKey!);
      console.log('🗄️ Database service initialized with Supabase');
    } else {
      console.log('⚠️ Database service disabled - missing Supabase credentials');
      // Create a mock client to prevent errors
      this.supabase = {} as SupabaseClient;
    }
  }

  /**
   * Check if database service is available
   */
  isAvailable(): boolean {
    return this.isEnabled;
  }

  /**
   * Create or update a user session
   */
  async createOrUpdateSession(userIdentifier: string): Promise<string> {
    if (!this.isEnabled) return uuidv4();

    try {
      // Try to find existing session
      const { data: existingSession } = await this.supabase
        .from('extraction_sessions')
        .select('session_id')
        .eq('user_identifier', userIdentifier)
        .single();

      if (existingSession) {
        // Update last accessed time
        await this.supabase
          .from('extraction_sessions')
          .update({ last_accessed: new Date().toISOString() })
          .eq('session_id', existingSession.session_id);
        
        return existingSession.session_id;
      }

      // Create new session
      const sessionId = uuidv4();
      const { error } = await this.supabase
        .from('extraction_sessions')
        .insert({
          session_id: sessionId,
          user_identifier: userIdentifier,
          total_extractions: 0
        });

      if (error) throw error;
      return sessionId;
    } catch (error) {
      console.error('Error managing session:', error);
      return uuidv4(); // Fallback to random UUID
    }
  }

  /**
   * Check if a report already exists for a company
   */
  async checkExistingReport(companyIdentifier: string, sessionId?: string): Promise<CompanyReport | null> {
    if (!this.isEnabled) return null;

    try {
      // Check if it's a company number (8 digits) or company name
      const isCompanyNumber = /^\d{8}$/.test(companyIdentifier);
      
      let query = this.supabase
        .from('company_reports')
        .select('*')
        .eq('status', 'completed')
        .order('extraction_timestamp', { ascending: false })
        .limit(1);

      if (isCompanyNumber) {
        query = query.eq('company_number', companyIdentifier);
      } else {
        // Search by company name (case insensitive)
        query = query.ilike('company_name', `%${companyIdentifier}%`);
      }

      // If session provided, check for that session specifically
      if (sessionId) {
        query = query.eq('user_session_id', sessionId);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error('Error checking existing report:', error);
      return null;
    }
  }

  /**
   * Save a company report to the database
   */
  async saveReport(request: SaveReportRequest): Promise<string | null> {
    if (!this.isEnabled) {
      console.log('📝 Database disabled - report not saved');
      return null;
    }

    try {
      const reportId = uuidv4();
      const report: CompanyReport = {
        id: reportId,
        company_number: request.companyNumber,
        company_name: request.companyName,
        user_session_id: request.sessionId,
        extraction_config: request.extractionConfig,
        raw_data: request.rawData,
        ai_summary: request.aiSummary,
        quality_score: request.qualityScore,
        extraction_duration_ms: request.extractionDurationMs,
        status: 'completed'
      };

      const { error } = await this.supabase
        .from('company_reports')
        .insert(report);

      if (error) throw error;

      // Update session extraction count
      if (request.sessionId) {
        await this.supabase.rpc('increment_extraction_count', {
          session_id: request.sessionId
        });
      }

      console.log(`💾 Report saved for company ${request.companyNumber} (ID: ${reportId})`);
      return reportId;
    } catch (error) {
      console.error('Error saving report:', error);
      return null;
    }
  }

  /**
   * Get reports based on filters
   */
  async getReports(request: GetReportsRequest): Promise<CompanyReport[]> {
    if (!this.isEnabled) return [];

    try {
      let query = this.supabase
        .from('company_reports')
        .select('*')
        .eq('status', 'completed')
        .order('extraction_timestamp', { ascending: false });

      // Apply filters
      if (request.sessionId) {
        query = query.eq('user_session_id', request.sessionId);
      }
      
      if (request.companyNumber) {
        query = query.eq('company_number', request.companyNumber);
      }

      if (request.dateFrom) {
        query = query.gte('extraction_timestamp', request.dateFrom);
      }

      if (request.dateTo) {
        query = query.lte('extraction_timestamp', request.dateTo);
      }

      // Apply pagination
      const limit = request.limit || 20;
      const offset = request.offset || 0;
      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching reports:', error);
      return [];
    }
  }

  /**
   * Get a specific report by ID
   */
  async getReportById(reportId: string): Promise<CompanyReport | null> {
    if (!this.isEnabled) return null;

    try {
      const { data, error } = await this.supabase
        .from('company_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching report by ID:', error);
      return null;
    }
  }

  /**
   * Delete a report
   */
  async deleteReport(reportId: string, sessionId?: string): Promise<boolean> {
    if (!this.isEnabled) return false;

    try {
      let query = this.supabase
        .from('company_reports')
        .delete()
        .eq('id', reportId);

      // Only allow deletion if session matches (security)
      if (sessionId) {
        query = query.eq('user_session_id', sessionId);
      }

      const { error } = await query;
      
      if (error) throw error;
      console.log(`🗑️ Report deleted: ${reportId}`);
      return true;
    } catch (error) {
      console.error('Error deleting report:', error);
      return false;
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(sessionId: string): Promise<{
    totalReports: number;
    recentReports: number;
    averageQualityScore: number;
  }> {
    if (!this.isEnabled) return { totalReports: 0, recentReports: 0, averageQualityScore: 0 };

    try {
      // Get total reports
      const { count: totalReports } = await this.supabase
        .from('company_reports')
        .select('*', { count: 'exact', head: true })
        .eq('user_session_id', sessionId)
        .eq('status', 'completed');

      // Get recent reports (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const { count: recentReports } = await this.supabase
        .from('company_reports')
        .select('*', { count: 'exact', head: true })
        .eq('user_session_id', sessionId)
        .eq('status', 'completed')
        .gte('extraction_timestamp', sevenDaysAgo.toISOString());

      // Get average quality score
      const { data: qualityData } = await this.supabase
        .from('company_reports')
        .select('quality_score')
        .eq('user_session_id', sessionId)
        .eq('status', 'completed')
        .not('quality_score', 'is', null);

      const averageQualityScore = qualityData && qualityData.length > 0
        ? qualityData.reduce((sum, report) => sum + (report.quality_score || 0), 0) / qualityData.length
        : 0;

      return {
        totalReports: totalReports || 0,
        recentReports: recentReports || 0,
        averageQualityScore: Math.round(averageQualityScore)
      };
    } catch (error) {
      console.error('Error fetching session stats:', error);
      return { totalReports: 0, recentReports: 0, averageQualityScore: 0 };
    }
  }

  /**
   * Search reports by company name or number
   */
  async searchReports(searchTerm: string, sessionId?: string, limit: number = 10): Promise<CompanyReport[]> {
    if (!this.isEnabled) return [];

    try {
      let query = this.supabase
        .from('company_reports')
        .select('*')
        .eq('status', 'completed')
        .or(`company_number.ilike.%${searchTerm}%,company_name.ilike.%${searchTerm}%`)
        .order('extraction_timestamp', { ascending: false })
        .limit(limit);

      if (sessionId) {
        query = query.eq('user_session_id', sessionId);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error searching reports:', error);
      return [];
    }
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();
