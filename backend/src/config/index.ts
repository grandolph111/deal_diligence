import dotenv from 'dotenv';

dotenv.config();

type ClaudeProvider = 'anthropic' | 'bedrock';

const claudeProvider = (process.env.CLAUDE_PROVIDER || 'anthropic') as ClaudeProvider;

const port = parseInt(process.env.PORT || '3001', 10);

export const config = {
  port,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',
  backendUrl: process.env.BACKEND_URL || `http://localhost:${port}`,

  auth0: {
    audience: process.env.AUTH0_AUDIENCE || '',
    issuerBaseUrl: process.env.AUTH0_ISSUER_BASE_URL || '',
  },

  cors: {
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  },

  s3: {
    bucket: process.env.S3_BUCKET || '',
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    presignedUrlExpiry: parseInt(process.env.S3_PRESIGNED_URL_EXPIRY || '3600', 10),
  },

  invitations: {
    expiryDays: parseInt(process.env.INVITATION_EXPIRY_DAYS || '7', 10),
  },

  claude: {
    provider: claudeProvider,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    extractionThinkingBudget: parseInt(
      process.env.CLAUDE_EXTRACTION_THINKING_BUDGET || '0',
      10
    ),

    // Page-count thresholds for the extraction router.
    //   pages ≤ small            → small tier (Haiku)
    //   small < pages ≤ medium   → medium tier (Sonnet)
    //   pages > medium           → large tier (Opus)
    extractionThresholds: {
      small: parseInt(process.env.CLAUDE_EXTRACTION_PAGES_SMALL || '15', 10),
      medium: parseInt(process.env.CLAUDE_EXTRACTION_PAGES_MEDIUM || '60', 10),
    },

    models: {
      // Used by non-extraction tiers.
      report: process.env.CLAUDE_MODEL_REPORT || 'claude-opus-4-7',
      chat: process.env.CLAUDE_MODEL_CHAT || 'claude-haiku-4-5',
      reconciliation: process.env.CLAUDE_MODEL_RECONCILIATION || 'claude-sonnet-4-6',

      // Legacy single-model extraction override. If set (non-empty), bypasses the
      // page-count router and forces every extraction to this model. Leave blank
      // to use the tiered router.
      extractionOverride: process.env.CLAUDE_MODEL_EXTRACTION || '',

      // Retained for code paths that still call getModelId('extraction') without
      // a router decision (e.g. idempotency-hash computation). Reads the override
      // if set, else falls back to the medium tier.
      extraction:
        process.env.CLAUDE_MODEL_EXTRACTION ||
        process.env.CLAUDE_EXTRACTION_MODEL_MEDIUM ||
        'claude-sonnet-4-6',

      // Tiered extraction models.
      extractionRouter: {
        small: process.env.CLAUDE_EXTRACTION_MODEL_SMALL || 'claude-haiku-4-5',
        medium: process.env.CLAUDE_EXTRACTION_MODEL_MEDIUM || 'claude-sonnet-4-6',
        large: process.env.CLAUDE_EXTRACTION_MODEL_LARGE || 'claude-opus-4-7',
      },
    },

    bedrockModels: {
      report:
        process.env.CLAUDE_BEDROCK_MODEL_REPORT ||
        'us.anthropic.claude-opus-4-7',
      chat:
        process.env.CLAUDE_BEDROCK_MODEL_CHAT ||
        'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      reconciliation:
        process.env.CLAUDE_BEDROCK_MODEL_RECONCILIATION ||
        'us.anthropic.claude-sonnet-4-6',

      extractionOverride: process.env.CLAUDE_BEDROCK_MODEL_EXTRACTION || '',

      extraction:
        process.env.CLAUDE_BEDROCK_MODEL_EXTRACTION ||
        process.env.CLAUDE_BEDROCK_EXTRACTION_MODEL_MEDIUM ||
        'us.anthropic.claude-sonnet-4-6',

      extractionRouter: {
        small:
          process.env.CLAUDE_BEDROCK_EXTRACTION_MODEL_SMALL ||
          'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        medium:
          process.env.CLAUDE_BEDROCK_EXTRACTION_MODEL_MEDIUM ||
          'us.anthropic.claude-sonnet-4-6',
        large:
          process.env.CLAUDE_BEDROCK_EXTRACTION_MODEL_LARGE ||
          'us.anthropic.claude-opus-4-7',
      },
    },
  },
};

export const isClaudeConfigured = (): boolean => {
  if (config.claude.provider === 'bedrock') return true;
  return Boolean(config.claude.anthropicApiKey);
};
