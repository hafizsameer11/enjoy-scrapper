# Deployment Guide for Dokploy

## Prerequisites

1. **Dokploy instance** - Your Dokploy server should be running
2. **Browserless.io API Key** - Get your API key from https://www.browserless.io/

## Deployment Steps

### 1. Prepare Your Repository

Make sure your code is in a Git repository (GitHub, GitLab, etc.)

### 2. Configure Environment Variables in Dokploy

In your Dokploy project settings, add these environment variables:

```
BROWSERLESS_API_KEY=your-browserless-api-key-here
PORT=3000
NODE_ENV=production
```

### 3. Deploy to Dokploy

1. **Create New Application** in Dokploy
2. **Select "Dockerfile"** as the build method
3. **Set Build Context** to your repository root
4. **Set Dockerfile Path** to `Dockerfile`
5. **Set Port** to `3000`
6. **Add Environment Variables** (from step 2)
7. **Deploy**

### 4. Access Your Application

Once deployed, Dokploy will provide you with a URL to access your application.

## Dockerfile Details

The Dockerfile:
- Uses Node.js 20 Alpine (lightweight)
- Installs production dependencies only
- Exposes port 3000
- Includes health check
- Runs the Express server

## Environment Variables

Required:
- `BROWSERLESS_API_KEY` - Your Browserless.io API key

Optional:
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Set to `production`

## Troubleshooting

### Container won't start
- Check environment variables are set correctly
- Verify `BROWSERLESS_API_KEY` is valid
- Check Dokploy logs for errors

### Health check failing
- Ensure port 3000 is exposed
- Check if the server is starting correctly
- Review application logs

### CSV downloads not working
- CSV files are stored in memory
- For production, consider using persistent storage
- Check server logs for CSV storage issues

## Production Recommendations

1. **Persistent Storage**: Consider mounting a volume for CSV files
2. **Rate Limiting**: Add rate limiting for API endpoints
3. **Logging**: Set up proper logging (Winston, Pino, etc.)
4. **Monitoring**: Add monitoring and alerting
5. **Backup**: Regular backups of configuration


