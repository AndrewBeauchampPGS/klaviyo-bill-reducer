const axios = require('axios');
require('dotenv').config();

// Slack webhook URL - should be stored in environment variable
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || process.env.NEXT_PUBLIC_SLACK_WEBHOOK_URL || 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL';

// Function to send Slack notification
async function sendSlackNotification(email, daysInactive, totalProfiles, inactiveProfiles, savings) {
    if (!SLACK_WEBHOOK_URL || SLACK_WEBHOOK_URL.includes('YOUR/WEBHOOK/URL')) {
        console.log('Slack webhook not configured, skipping notification');
        return;
    }

    try {
        const message = {
            text: '🎯 Klaviyo Bill Reducer Used',
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: '🎯 Klaviyo Bill Reducer Used',
                        emoji: true
                    }
                },
                {
                    type: 'section',
                    fields: [
                        {
                            type: 'mrkdwn',
                            text: `*Email:*\n${email}`
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Days Inactive:*\n${daysInactive}`
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Total Profiles:*\n${totalProfiles.toLocaleString()}`
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Inactive Found:*\n${inactiveProfiles.toLocaleString()}`
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Monthly Savings:*\n$${savings.monthlySavings}`
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Annual Savings:*\n$${savings.annualSavings}`
                        }
                    ]
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: `Used at ${new Date().toISOString()}`
                        }
                    ]
                }
            ]
        };

        await axios.post(SLACK_WEBHOOK_URL, message);
        console.log('Slack notification sent successfully');
    } catch (error) {
        console.error('Error sending Slack notification:', error.message);
        // Don't fail the main request if Slack notification fails
    }
}

// Klaviyo pricing tiers - Updated 2025
// Note: These prices should be periodically verified at https://www.klaviyo.com/pricing
const PRICING_TIERS = [
    { min: 0, max: 250, price: 0 },          // Free tier
    { min: 251, max: 500, price: 20 },       // Confirmed
    { min: 501, max: 1000, price: 30 },      // Confirmed
    { min: 1001, max: 2500, price: 50 },
    { min: 2501, max: 5000, price: 100 },    // Confirmed $100 from research
    { min: 5001, max: 10000, price: 150 },   // Confirmed $150 from research
    { min: 10001, max: 15000, price: 225 },
    { min: 15001, max: 20000, price: 300 },
    { min: 20001, max: 25000, price: 375 },  // Confirmed ~$375-400 from research
    { min: 25001, max: 30000, price: 475 },  // Confirmed from user test (27,001 = $475)
    { min: 30001, max: 35000, price: 550 },  // Confirmed from user test (30,001 = $550)
    { min: 35001, max: 40000, price: 625 },
    { min: 40001, max: 45000, price: 700 },
    { min: 45001, max: 50000, price: 720 },  // Confirmed $720 from research
    { min: 50001, max: 60000, price: 850 },
    { min: 60001, max: 70000, price: 975 },
    { min: 70001, max: 85000, price: 1150 },
    { min: 85001, max: 100000, price: 1400 },
    { min: 100001, max: 125000, price: 1700 },
    { min: 125001, max: 150000, price: 2000 },
];

function getPricingTier(count) {
    return PRICING_TIERS.find(tier => count >= tier.min && count <= tier.max) ||
           { min: count, max: count, price: Math.floor(count / 100) * 15 }; // Estimate for larger tiers
}

function calculateSavings(currentCount, inactiveCount) {
    const currentTier = getPricingTier(currentCount);
    const newCount = Math.max(0, currentCount - inactiveCount);
    const newTier = getPricingTier(newCount);

    const monthlySavings = currentTier.price - newTier.price;
    const annualSavings = monthlySavings * 12;

    return { monthlySavings, annualSavings, currentTier, newTier };
}

// Store segment IDs for later export
const segmentCache = {};

// Lambda handler
exports.handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key',
        'Access-Control-Allow-Methods': 'POST,OPTIONS'
    };

    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const apiKey = event.headers['x-api-key'] || event.headers['X-Api-Key'];
    if (!apiKey) {
        return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ error: 'API key required' })
        };
    }

    const path = event.path || event.rawPath || '/';
    const body = JSON.parse(event.body || '{}');

    // Create Klaviyo API client
    const klaviyoClient = axios.create({
        baseURL: 'https://a.klaviyo.com/api',
        headers: {
            'Authorization': `Klaviyo-API-Key ${apiKey}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'revision': '2024-10-15'
        }
    });

    try {
        // Route handling
        if (path.endsWith('/analyze')) {
            // Analyze profiles using segments
            const { daysInactive = 90, includeBounced = true, includeUnsubscribed = true, email } = body;

            // Email is required
            if (!email) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Email address is required' })
                };
            }

            console.log('Starting segment-based analysis...');

            // Step 1: Get the metric IDs for this account (needed for inactive segment)
            console.log('Fetching metrics to find email and order metric IDs...');
            let openedEmailMetricId = null;
            let clickedEmailMetricId = null;
            let placedOrderMetricId = null;
            let receivedEmailMetricId = null;

            try {
                const metricsResponse = await klaviyoClient.get('/metrics/');
                const metrics = metricsResponse.data.data || [];

                // Find the "Opened Email" metric
                const openedEmailMetric = metrics.find(m =>
                    m.attributes.name === 'Opened Email'
                );

                // Find the "Clicked Email" metric
                const clickedEmailMetric = metrics.find(m =>
                    m.attributes.name === 'Clicked Email'
                );

                // Find the "Placed Order" metric
                const placedOrderMetric = metrics.find(m =>
                    m.attributes.name === 'Placed Order'
                );

                // Find the "Received Email" metric
                const receivedEmailMetric = metrics.find(m =>
                    m.attributes.name === 'Received Email'
                );

                if (openedEmailMetric) {
                    openedEmailMetricId = openedEmailMetric.id;
                    console.log(`Found Opened Email metric ID: ${openedEmailMetricId}`);
                } else {
                    console.log('Opened Email metric not found');
                    throw new Error('Could not find "Opened Email" metric in your account');
                }

                if (clickedEmailMetric) {
                    clickedEmailMetricId = clickedEmailMetric.id;
                    console.log(`Found Clicked Email metric ID: ${clickedEmailMetricId}`);
                } else {
                    console.log('Clicked Email metric not found');
                    throw new Error('Could not find "Clicked Email" metric in your account');
                }

                if (placedOrderMetric) {
                    placedOrderMetricId = placedOrderMetric.id;
                    console.log(`Found Placed Order metric ID: ${placedOrderMetricId}`);
                } else {
                    console.log('Placed Order metric not found');
                    throw new Error('Could not find "Placed Order" metric in your account');
                }

                if (receivedEmailMetric) {
                    receivedEmailMetricId = receivedEmailMetric.id;
                    console.log(`Found Received Email metric ID: ${receivedEmailMetricId}`);
                } else {
                    console.log('Received Email metric not found');
                    throw new Error('Could not find "Received Email" metric in your account');
                }
            } catch (metricError) {
                console.error('Error fetching metrics:', metricError.message);
                throw new Error('Unable to fetch metrics. Please ensure your API key has metrics:read permission.');
            }

            // Step 2: Create both segments simultaneously
            console.log('Creating segments...');

            // Prepare the date filters
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysInactive);
            const dateString = cutoffDate.toISOString();
            const allTimeDate = '2015-01-01T00:00:00.000Z';

            // Total profiles segment payload
            const totalSegmentPayload = {
                data: {
                    type: 'segment',
                    attributes: {
                        name: `Total_Active_Profiles_${Date.now()}`,
                        definition: {
                            condition_groups: [
                                {
                                    conditions: [
                                        {
                                            type: 'profile-marketing-consent',
                                            consent: {
                                                channel: 'email',
                                                can_receive_marketing: true,
                                                consent_status: {
                                                    subscription: 'any'
                                                }
                                            }
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                }
            };

            // Inactive profiles segment payload
            const segmentName = `Inactive_${daysInactive}_days_${Date.now()}`;
            const inactiveSegmentPayload = {
                data: {
                    type: 'segment',
                    attributes: {
                        name: segmentName,
                        definition: {
                            condition_groups: [
                                {
                                    conditions: [
                                        {
                                            type: 'profile-marketing-consent',
                                            consent: {
                                                channel: 'email',
                                                can_receive_marketing: true,
                                                consent_status: {
                                                    subscription: 'any'
                                                }
                                            }
                                        }
                                    ]
                                },
                                {
                                    conditions: [
                                        {
                                            type: 'profile-metric',
                                            metric_id: openedEmailMetricId,
                                            measurement: 'count',
                                            measurement_filter: {
                                                type: 'numeric',
                                                operator: 'equals',
                                                value: 0
                                            },
                                            timeframe_filter: {
                                                type: 'date',
                                                operator: 'after',
                                                date: dateString
                                            }
                                        }
                                    ]
                                },
                                {
                                    conditions: [
                                        {
                                            type: 'profile-metric',
                                            metric_id: clickedEmailMetricId,
                                            measurement: 'count',
                                            measurement_filter: {
                                                type: 'numeric',
                                                operator: 'equals',
                                                value: 0
                                            },
                                            timeframe_filter: {
                                                type: 'date',
                                                operator: 'after',
                                                date: dateString
                                            }
                                        }
                                    ]
                                },
                                {
                                    conditions: [
                                        {
                                            type: 'profile-metric',
                                            metric_id: placedOrderMetricId,
                                            measurement: 'count',
                                            measurement_filter: {
                                                type: 'numeric',
                                                operator: 'equals',
                                                value: 0
                                            },
                                            timeframe_filter: {
                                                type: 'date',
                                                operator: 'after',
                                                date: allTimeDate
                                            }
                                        }
                                    ]
                                },
                                {
                                    conditions: [
                                        {
                                            type: 'profile-metric',
                                            metric_id: receivedEmailMetricId,
                                            measurement: 'count',
                                            measurement_filter: {
                                                type: 'numeric',
                                                operator: 'greater-than-or-equal',
                                                value: 5
                                            },
                                            timeframe_filter: {
                                                type: 'date',
                                                operator: 'after',
                                                date: dateString
                                            }
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                }
            };

            // Create both segments (sequentially to avoid throttling)
            let totalSegmentId = null;
            let segmentId = null;

            try {
                // Create total segment first
                const totalSegmentResponse = await klaviyoClient.post('/segments/', totalSegmentPayload);
                totalSegmentId = totalSegmentResponse.data.data.id;
                console.log(`Total segment created with ID: ${totalSegmentId}`);

                // Wait 1 second to avoid throttling
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Create inactive segment
                const inactiveSegmentResponse = await klaviyoClient.post('/segments/', inactiveSegmentPayload);
                segmentId = inactiveSegmentResponse.data.data.id;
                console.log(`Inactive segment created with ID: ${segmentId}`);

                // Store segment ID for export
                segmentCache[apiKey.substring(0, 8)] = segmentId;

                // Wait 60 seconds for both segments to process (large accounts need more time)
                console.log('Waiting 60 seconds for segments to process...');
                await new Promise(resolve => setTimeout(resolve, 60000));

                // Get counts from both segments sequentially with delay to avoid throttling
                const totalSegmentDetail = await klaviyoClient.get(`/segments/${totalSegmentId}/?additional-fields[segment]=profile_count`);

                // Wait 2 seconds between requests to avoid throttling
                await new Promise(resolve => setTimeout(resolve, 2000));

                const inactiveSegmentDetail = await klaviyoClient.get(`/segments/${segmentId}/?additional-fields[segment]=profile_count`);

                const totalProfiles = totalSegmentDetail.data.data.attributes.profile_count || 0;
                const inactiveCount = inactiveSegmentDetail.data.data.attributes.profile_count || 0;

                console.log(`Total active profiles: ${totalProfiles}`);
                console.log(`Inactive profiles: ${inactiveCount}`);

                // Keep both segments for user reference
                // Commenting out deletion as segments are useful for verification
                // try {
                //     await klaviyoClient.delete(`/segments/${totalSegmentId}/`);
                //     console.log('Deleted temporary total segment');
                // } catch (deleteError) {
                //     console.log('Could not delete temporary segment');
                // }

                const activeCount = totalProfiles - inactiveCount;

                // Calculate savings
                const savings = calculateSavings(totalProfiles, inactiveCount);

                // Send Slack notification
                await sendSlackNotification(email, daysInactive, totalProfiles, inactiveCount, savings);

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        totalProfiles,
                        activeProfiles: activeCount,
                        inactiveProfiles: inactiveCount,
                        segmentId,
                        segmentName,
                        monthlySavings: savings.monthlySavings,
                        annualSavings: savings.annualSavings,
                        currentTier: savings.currentTier,
                        newTier: savings.newTier,
                        inactiveProfileIds: []
                    })
                };

            } catch (segmentError) {
                console.error('Error creating segments:', segmentError.response?.data || segmentError.message);
                throw segmentError;
            }


        } else if (path.endsWith('/export')) {
            // Export segment members to CSV
            const { segmentId } = body;
            const cachedSegmentId = segmentId || segmentCache[apiKey.substring(0, 8)];

            if (!cachedSegmentId) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'No segment ID available. Please run analysis first.' })
                };
            }

            console.log(`Exporting profiles from segment ${cachedSegmentId}...`);

            // Get segment members
            const csvRows = ['Profile ID,Email,Phone,Created,Updated'];
            let nextPageUrl = `/segments/${cachedSegmentId}/profiles/?page[size]=100`;
            let exportedCount = 0;
            const maxExport = 5000; // Limit for CSV size

            while (nextPageUrl && exportedCount < maxExport) {
                const response = await klaviyoClient.get(nextPageUrl);
                const profiles = response.data.data || [];

                for (const profile of profiles) {
                    const email = profile.attributes.email || '';
                    const phone = profile.attributes.phone_number || '';
                    const created = profile.attributes.created || '';
                    const updated = profile.attributes.updated || '';

                    csvRows.push(`${profile.id},"${email}","${phone}",${created},${updated}`);
                    exportedCount++;
                }

                nextPageUrl = response.data.links?.next;
                if (nextPageUrl) {
                    nextPageUrl = nextPageUrl.replace('https://a.klaviyo.com/api', '');
                }
            }

            console.log(`Exported ${exportedCount} profiles`);

            return {
                statusCode: 200,
                headers: {
                    ...headers,
                    'Content-Type': 'text/csv',
                    'Content-Disposition': 'attachment; filename="inactive-profiles.csv"'
                },
                body: csvRows.join('\n')
            };

        } else {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Route not found. Available routes: /analyze, /export' })
            };
        }

    } catch (error) {
        console.error('Lambda error:', error.response?.data || error.message);

        // Check for specific Klaviyo errors
        if (error.response?.status === 403) {
            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({
                    error: 'API key missing required permissions. Please ensure your key has accounts:read, segments:full, and profiles:read scopes.'
                })
            };
        }

        return {
            statusCode: error.response?.status || 500,
            headers,
            body: JSON.stringify({
                error: error.response?.data?.errors?.[0]?.detail || error.message || 'Internal server error'
            })
        };
    }
};