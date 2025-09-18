# Klaviyo Bill Reducer - Simple Version

The simplest way to reduce your Klaviyo monthly bill by identifying and removing non-customer profiles who are either inactive OR repeatedly bouncing (never purchased + not engaging or bouncing 2+ times).

## Features

✅ **One HTML file** - Complete UI in a single file
✅ **One Lambda function** - All backend logic in one place
✅ **Instant savings** - See exactly how much you'll save
✅ **Creates analysis segment** - Tool creates a segment in Klaviyo for review
✅ **Export functionality** - Download CSV of inactive profiles
✅ **No auto-suppression** - You manually suppress profiles in Klaviyo (safer approach)
✅ **No dependencies** - Pure vanilla JavaScript

## Quick Start (Local Testing)

```bash
# Install dependencies
npm install
cd amplify/functions/api && npm install && cd ../../..

# Start local test server
npm start

# Open browser to http://localhost:3001
```

## Deploy to AWS Amplify

### Option 1: Amplify CLI

```bash
# Install Amplify CLI
npm install -g @aws-amplify/cli

# Initialize Amplify
amplify init

# Add the Lambda function
amplify add function
# Choose: Lambda function
# Name: api
# Runtime: NodeJS
# Template: Hello World
# Edit: Yes (paste the index.js code)

# Add hosting
amplify add hosting
# Choose: Hosting with Amplify Console
# Type: Manual deployment

# Deploy everything
amplify push

# Publish the frontend
amplify publish
```

### Option 2: Amplify Console (Easier)

1. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify)
2. Click "New app" → "Host web app"
3. Choose "Deploy without Git"
4. Drag and drop this folder
5. App will be live in ~2 minutes!

For the Lambda function:
1. Go to AWS Lambda Console
2. Create function → Author from scratch
3. Name: `klaviyo-api`
4. Runtime: Node.js 18.x
5. Copy/paste `amplify/functions/api/index.js`
6. Add environment variable (if needed)
7. Note the function URL

Update `index.html` line 290:
```javascript
const API_URL = 'YOUR_LAMBDA_FUNCTION_URL';
```

## How It Works

1. **Enter API Key**: Your Klaviyo private API key (never stored)
2. **Analyze**: Creates a segment to identify non-customers who are inactive OR bouncing (2+ bounces)
3. **Review Savings**: See monthly/annual savings based on identified profile count
4. **Export**: Download CSV of profiles from the created segment
5. **Manual Suppression**: Go to Klaviyo to suppress the identified profiles (tool does NOT auto-suppress)

## Klaviyo API Key Setup

1. Log into Klaviyo
2. Account → Settings → API Keys
3. Create Private Key with scopes:
   - `accounts:read` - To get total profile count
   - `metrics:read` - To find email activity metrics
   - `segments:full` - To create and read analysis segments
   - `profiles:read` - To export member lists

## Configuration

Edit these values in `index.html`:
- `daysInactive`: Default 90 days - profiles with no events in this timeframe

Edit these in `amplify/functions/api/index.js`:
- `maxProfiles`: Default 1000 for demo (line 96)
- `PRICING_TIERS`: Add more tiers if needed (line 4)

## Cost

**AWS Costs (monthly):**
- Lambda: ~$1 (or free tier)
- Amplify Hosting: ~$1
- **Total: ~$2/month**

**Savings:**
- Usually $50-500+/month from Klaviyo

## Security Notes

- API key sent as header (not in URL)
- Never stored or logged
- All processing server-side
- HTTPS only in production

## Troubleshooting

**"API key required" error**
- Check you're using Private API key (starts with `pk_`)
- Ensure key has required scopes

**Analysis takes forever**
- Large accounts may timeout
- Reduce `maxProfiles` limit for testing
- Consider pagination in production

**"Cannot export profiles"**
- Check that the segment was created successfully in Klaviyo
- Verify API key has segments:read and profiles:read permissions
- The export retrieves members from the created segment

## Files

- `index.html` - Complete frontend UI
- `amplify/functions/api/index.js` - Lambda function
- `test-server.js` - Local development server
- `amplify.yml` - Amplify build configuration

## Support

This is a simple demo tool. For production use:
- Add error recovery
- Implement pagination for large accounts
- Add progress indicators
- Store audit logs
- Implement undo functionality

## License

MIT - Use at your own risk. Always backup before suppressing profiles!