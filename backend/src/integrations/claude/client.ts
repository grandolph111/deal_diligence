import Anthropic from '@anthropic-ai/sdk';
import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import { config, isClaudeConfigured } from '../../config';

export type ClaudeTier = 'extraction' | 'report' | 'chat' | 'reconciliation';

type ClaudeClient = Anthropic | AnthropicBedrock;

let cachedClient: ClaudeClient | null = null;

export const getClaudeClient = (): ClaudeClient => {
  if (cachedClient) return cachedClient;

  if (!isClaudeConfigured()) {
    throw new Error(
      'Claude is not configured. Set ANTHROPIC_API_KEY for dev, or CLAUDE_PROVIDER=bedrock with IAM credentials for prod.'
    );
  }

  if (config.claude.provider === 'bedrock') {
    cachedClient = new AnthropicBedrock({
      awsRegion: config.claude.awsRegion,
    });
  } else {
    cachedClient = new Anthropic({
      apiKey: config.claude.anthropicApiKey,
    });
  }

  return cachedClient;
};

export const getModelId = (tier: ClaudeTier): string => {
  if (config.claude.provider === 'bedrock') {
    return config.claude.bedrockModels[tier];
  }
  return config.claude.models[tier];
};

export const isMock = (): boolean => !isClaudeConfigured();
