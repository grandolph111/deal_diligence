import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

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

  pythonService: {
    url: process.env.PYTHON_SERVICE_URL || 'http://localhost:8000',
  },

  berrydb: {
    apiKey: process.env.BERRYDB_API_KEY || '',
    projectId: process.env.BERRYDB_PROJECT_ID || '',
  },
};
