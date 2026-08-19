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

  // Knowledge library (hierarchical diligence ToC built on ingest). Ships dark:
  // set LIBRARY_ENABLED=true to seed the checklist tree on project create and
  // file evidence nodes during extraction (Stage 7).
  library: {
    /**
     * Controls ingestion-time filing of evidence into the checklist ToC.
     *
     * On by default now that checklist navigation is the default retrieval
     * path — an unpopulated library means every query falls back to bounded
     * stuffing, which caps how much of a deal an answer can see. Set
     * LIBRARY_ENABLED=false to go back to the old dark behaviour.
     */
    enabled: process.env.LIBRARY_ENABLED !== 'false',
  },

  // Provision embeddings for semantic ranking within the ToC slice (Phase B).
  // With no provider configured, a deterministic mock embedder runs so the
  // ranking path works in dev. Set a provider + key for real (Voyage / OpenAI /
  // Isaacus-compatible) embeddings.
  embeddings: {
    provider: process.env.EMBEDDINGS_PROVIDER || '', // '' = mock; 'voyage' | 'openai' | 'isaacus'
    apiKey: process.env.EMBEDDINGS_API_KEY || '',
    model: process.env.EMBEDDINGS_MODEL || 'voyage-law-2',
    baseUrl: process.env.EMBEDDINGS_BASE_URL || 'https://api.voyageai.com/v1/embeddings',
    mockDim: parseInt(process.env.EMBEDDINGS_MOCK_DIM || '256', 10),
  },

  claude: {
    provider: claudeProvider,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    extractionThinkingBudget: parseInt(
      process.env.CLAUDE_EXTRACTION_THINKING_BUDGET || '0',
      10
    ),

    /**
     * Output ceiling for an extraction call. `runToolUse` streams above ~16k, so
     * this can exceed the non-streaming safe limit. Raising it is the cheapest
     * defence against a dense contract truncating its clause list mid-JSON.
     */
    extractionMaxOutputTokens: parseInt(
      process.env.CLAUDE_EXTRACTION_MAX_OUTPUT_TOKENS || '32768',
      10
    ),

    /**
     * Windowing for documents too large to extract in one call. The binding
     * constraint is output, not input: a 300-page contract fits the context
     * window comfortably but cannot emit its whole clause list in one response.
     *
     * Windowing has a floor for a reason — on a small document it costs more
     * than it saves, because each window re-pays the per-call overhead and the
     * overlap duplicates clauses that then have to be merged away.
     */
    windowing: {
      /** Documents with more pages than this are read in windows. */
      thresholdPages: parseInt(
        process.env.CLAUDE_WINDOW_THRESHOLD_PAGES || '60',
        10
      ),
      /** Pages per window. */
      windowPages: parseInt(process.env.CLAUDE_WINDOW_PAGES || '40', 10),
      /** Overlap between adjacent windows, so boundary clauses survive. */
      overlapPages: parseInt(process.env.CLAUDE_WINDOW_OVERLAP_PAGES || '3', 10),
      /** Windows of the same document in flight at once. */
      concurrency: parseInt(process.env.CLAUDE_WINDOW_CONCURRENCY || '3', 10),
      /**
       * Emit a fact sheet even when some windows failed. Off by default: a
       * diligence fact sheet that silently omits forty pages is more dangerous
       * than a failed extraction, because nothing downstream can distinguish
       * "no indemnity cap in this contract" from "those pages never got read".
       */
      allowPartial: process.env.CLAUDE_WINDOW_ALLOW_PARTIAL === 'true',
    },

    /**
     * Anchor quoting: the model emits locators (first/last few words) instead of
     * full verbatim quotes, and the span is sliced from the parsed page text.
     *
     * Two effects. Latency is output-bound, and quoted clause text is the bulk
     * of the output, so this is roughly a 4-5x speedup. And a resolved span is
     * verbatim by construction rather than by instruction, which makes a
     * fabricated quote structurally impossible instead of merely detectable.
     *
     * Ships off: it changes the extraction contract and has not been A/B'd
     * against the CUAD harness. Requires a text layer — scans keep verbatim.
     */
    anchorQuoting: process.env.CLAUDE_ANCHOR_QUOTING === 'true',

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
      //
      // Sonnet is the extraction BASELINE — the small tier resolves to it too.
      // Short documents are cheap either way (a 10-page NDA is cents), so the
      // only thing the Haiku tier ever bought was a rounding error in spend,
      // and it bought that with unmeasured accuracy: every CUAD eval number we
      // have was produced on Sonnet, so a Haiku-routed doc shipped quality no
      // harness had ever scored. Set CLAUDE_EXTRACTION_MODEL_SMALL explicitly
      // to re-introduce a cheaper tier — but eval it before you trust it.
      extractionRouter: {
        small: process.env.CLAUDE_EXTRACTION_MODEL_SMALL || 'claude-sonnet-4-6',
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
        // Sonnet baseline — see the direct-provider note above.
        small:
          process.env.CLAUDE_BEDROCK_EXTRACTION_MODEL_SMALL ||
          'us.anthropic.claude-sonnet-4-6',
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
