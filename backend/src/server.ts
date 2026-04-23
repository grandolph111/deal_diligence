import app from './app';
import { config, isClaudeConfigured } from './config';
import { prisma } from './config/database';
import { s3Service } from './services/s3.service';
import { boardsService } from './services/boards.service';

const startServer = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('✓ Connected to database');

    // Check S3 configuration
    const s3Status = await s3Service.getHealthStatus();
    if (s3Status.mode === 'mock') {
      console.log('⚠ S3 running in MOCK mode (files stored in-memory, no persistence)');
      console.log('  To use real S3, configure S3_BUCKET, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY');
    } else if (s3Status.connected) {
      console.log(`✓ Connected to S3 bucket: ${s3Status.bucket}`);
    } else {
      console.log(`✗ S3 connection failed: ${s3Status.error}`);
      console.log('  VDR document uploads will not work until S3 is properly configured');
    }

    // Backfill: ensure every project has an "All Documents" board,
    // and every task has a boardId. Idempotent — safe on every boot.
    try {
      const { created, linked } = await boardsService.ensureDefaultBoardsForAllProjects();
      if (created > 0 || linked > 0) {
        console.log(`✓ Kanban: created ${created} default board(s), linked ${linked} task(s)`);
      }
    } catch (err) {
      console.warn('⚠ Kanban default-board backfill failed (non-fatal):', err instanceof Error ? err.message : err);
    }

    // Check Claude configuration
    if (isClaudeConfigured()) {
      const provider = config.claude.provider;
      const model = provider === 'bedrock'
        ? config.claude.bedrockModels.extraction
        : config.claude.models.extraction;
      console.log(`✓ Claude configured (provider: ${provider}, extraction: ${model})`);
    } else {
      console.log('⚠ Claude not configured — extraction will run in MOCK mode.');
      console.log('  Set ANTHROPIC_API_KEY for dev, or CLAUDE_PROVIDER=bedrock for prod.');
    }

    app.listen(config.port, () => {
      console.log('');
      console.log(`Server running on port ${config.port}`);
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`Health check: http://localhost:${config.port}/health/detailed`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

startServer();
