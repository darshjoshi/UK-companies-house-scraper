-- Additional SQL functions for Supabase database

-- Function to increment extraction count for a session
CREATE OR REPLACE FUNCTION increment_extraction_count(session_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE extraction_sessions 
    SET 
        total_extractions = total_extractions + 1,
        last_accessed = NOW()
    WHERE extraction_sessions.session_id = increment_extraction_count.session_id;
    
    -- If no session found, this will silently do nothing
    -- which is fine since the session should already exist
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old reports (optional - for maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_reports(days_old INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM company_reports 
    WHERE created_at < NOW() - INTERVAL '1 day' * days_old;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create a view for report statistics (optional - for analytics)
CREATE OR REPLACE VIEW report_statistics AS
SELECT 
    DATE(created_at) as report_date,
    COUNT(*) as total_reports,
    AVG(quality_score) as avg_quality_score,
    AVG(extraction_duration_ms) as avg_duration_ms,
    COUNT(DISTINCT user_session_id) as unique_sessions
FROM company_reports 
WHERE status = 'completed'
GROUP BY DATE(created_at)
ORDER BY report_date DESC;
