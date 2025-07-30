import 'dotenv/config';

export interface ScrapingConfig {
  // Stagehand Configuration
  stagehand: {
    env: 'LOCAL' | 'BROWSERBASE';
    modelName: string;
    enableCaching: boolean;
    verbose: number;
    domSettleTimeoutMs: number;
    selfHealing: boolean;
    apiKey?: string;
    projectId?: string;
  };
  
  // Extraction Configuration
  extraction: {
    maxRetries: number;
    retryDelay: number;
    timeoutMs: number;
    maxFilingsToExtract: number;
    enableRiskAssessment: boolean;
    strictValidation: boolean;
  };
  
  // LLM Configuration
  llm: {
    provider: 'anthropic' | 'openai';
    model: string;
    apiKey: string;
    maxTokens: number;
    temperature: number;
    timeout: number;
  };
  
  // Quality Thresholds
  quality: {
    minimumScoreForSummary: number;
    warningThreshold: number;
    criticalThreshold: number;
  };
}

// Default configuration
export const defaultConfig: ScrapingConfig = {
  stagehand: {
    env: process.env.BROWSERBASE_API_KEY ? 'BROWSERBASE' : 'LOCAL',
    modelName: 'claude-3-5-sonnet-20241022',
    enableCaching: true,
    verbose: 1,
    domSettleTimeoutMs: 5000,
    selfHealing: true,
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID
  },
  
  extraction: {
    maxRetries: 3,
    retryDelay: 2000,
    timeoutMs: 60000,
    maxFilingsToExtract: 20,
    enableRiskAssessment: true,
    strictValidation: true
  },
  
  llm: {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    apiKey: process.env.ANTHROPIC_API_KEY!,
    maxTokens: 3000,
    temperature: 0.3,
    timeout: 30000
  },
  
  quality: {
    minimumScoreForSummary: 40,
    warningThreshold: 60,
    criticalThreshold: 30
  }
};

// Environment validation
export function validateEnvironment(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check required environment variables
  if (!process.env.ANTHROPIC_API_KEY) {
    errors.push('ANTHROPIC_API_KEY is required');
  }
  
  // Check Browserbase configuration if using remote
  if (defaultConfig.stagehand.env === 'BROWSERBASE') {
    if (!process.env.BROWSERBASE_API_KEY) {
      errors.push('BROWSERBASE_API_KEY is required when using BROWSERBASE environment');
    }
    if (!process.env.BROWSERBASE_PROJECT_ID) {
      errors.push('BROWSERBASE_PROJECT_ID is required when using BROWSERBASE environment');
    }
  }
  
  // Validate API key format
  if (process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-')) {
    errors.push('ANTHROPIC_API_KEY appears to be invalid (should start with sk-ant-)');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Get environment-specific configuration
export function getConfig(): ScrapingConfig {
  const env = validateEnvironment();
  
  if (!env.valid) {
    console.error('Environment validation failed:');
    env.errors.forEach(error => console.error(`  - ${error}`));
    process.exit(1);
  }
  
  // Override defaults with environment variables where appropriate
  const config = { ...defaultConfig };
  
  // Performance tuning based on environment
  if (config.stagehand.env === 'LOCAL') {
    // Local settings - more conservative
    config.stagehand.domSettleTimeoutMs = 3000;
    config.extraction.timeoutMs = 45000;
  } else {
    // Browserbase settings - can be more aggressive
    config.stagehand.domSettleTimeoutMs = 5000;
    config.extraction.timeoutMs = 60000;
  }
  
  // Development vs Production settings
  if (process.env.NODE_ENV === 'development') {
    config.stagehand.verbose = 2;
    config.extraction.strictValidation = false;
  } else if (process.env.NODE_ENV === 'production') {
    config.stagehand.verbose = 1;
    config.extraction.strictValidation = true;
  }
  
  return config;
}

// Logging configuration
export const logConfig = {
  level: process.env.LOG_LEVEL || 'info',
  enableFileLogging: process.env.ENABLE_FILE_LOGGING === 'true',
  logFile: process.env.LOG_FILE || 'company-scraper.log',
  enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING !== 'false'
};

export default getConfig();