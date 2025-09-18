const express = require('express');
const cors = require('cors');
const path = require('path');

// Import the Lambda function
const lambda = require('./amplify/functions/api/index');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Serve the HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Lambda function routes
app.post('/analyze', async (req, res) => {
    const event = {
        path: '/analyze',
        httpMethod: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body)
    };

    try {
        const result = await lambda.handler(event);
        res.status(result.statusCode).set(result.headers).send(result.body);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/export', async (req, res) => {
    const event = {
        path: '/export',
        httpMethod: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body)
    };

    try {
        const result = await lambda.handler(event);
        res.status(result.statusCode).set(result.headers).send(result.body);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/suppress', async (req, res) => {
    const event = {
        path: '/suppress',
        httpMethod: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body)
    };

    try {
        const result = await lambda.handler(event);
        res.status(result.statusCode).set(result.headers).send(result.body);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Handle OPTIONS for CORS
app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');
    res.send();
});

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║     Klaviyo Bill Reducer - Test Server      ║
╚══════════════════════════════════════════════╝

  🚀 Server running at: http://localhost:${PORT}
  📝 Open your browser to test the app

  Testing instructions:
  1. Open http://localhost:${PORT} in your browser
  2. Enter your Klaviyo API key
  3. Click "Analyze Profiles"
  4. Review results and savings
  5. Export or suppress profiles

  Note: This is for local testing only.
  Deploy with Amplify for production use.
    `);
});