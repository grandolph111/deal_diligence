import app from './app';
import { config } from './config';
import { prisma } from './config/database';
import { s3Service } from './services/s3.service';

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

    // Check Python microservice (non-blocking)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const pythonRes = await fetch(`${config.pythonService.url}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (pythonRes.ok) {
        const pythonHealth = (await pythonRes.json()) as { berrydb_configured?: boolean };
        console.log(`✓ Python microservice connected at ${config.pythonService.url}`);
        if (pythonHealth.berrydb_configured) {
          console.log('  ✓ BerryDB is configured');
        } else {
          console.log('  ⚠ BerryDB not configured - AI search will use fallback');
        }
      } else {
        console.log(`⚠ Python microservice returned status ${pythonRes.status}`);
      }
    } catch {
      console.log(`⚠ Python microservice not available at ${config.pythonService.url}`);
      console.log('  AI-powered search will use PostgreSQL fallback');
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
