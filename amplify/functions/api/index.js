const axios = require('axios');

// Klaviyo pricing tiers
const PRICING_TIERS = [
    { min: 0, max: 500, price: 0 },
    { min: 501, max: 1000, price: 30 },
    { min: 1001, max: 2500, price: 50 },
    { min: 2501, max: 5000, price: 75 },
    { min: 5001, max: 10000, price: 125 },
    { min: 10001, max: 15000, price: 200 },
    { min: 15001, max: 20000, price: 275 },
    { min: 20001, max: 25000, price: 350 },
    { min: 25001, max: 30000, price: 425 },
    { min: 30001, max: 35000, price: 500 },
    { min: 35001, max: 40000, price: 575 },
    { min: 40001, max: 45000, price: 650 },
    { min: 45001, max: 50000, price: 725 },
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
            const { daysInactive = 90, includeBounced = true, includeUnsubscribed = true } = body;

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

                // Wait 30 seconds for both segments to process
                console.log('Waiting 30 seconds for segments to process...');
                await new Promise(resolve => setTimeout(resolve, 30000));

                // Get counts from both segments
                const [totalSegmentDetail, inactiveSegmentDetail] = await Promise.all([
                    klaviyoClient.get(`/segments/${totalSegmentId}/`),
                    klaviyoClient.get(`/segments/${segmentId}/`)
                ]);

                const totalProfiles = totalSegmentDetail.data.data.attributes.profiles_count || 0;
                const inactiveCount = inactiveSegmentDetail.data.data.attributes.profiles_count || 0;

                console.log(`Total active profiles: ${totalProfiles}`);
                console.log(`Inactive profiles: ${inactiveCount}`);

                // Clean up the total segment (keep the inactive one for export)
                try {
                    await klaviyoClient.delete(`/segments/${totalSegmentId}/`);
                    console.log('Deleted temporary total segment');
                } catch (deleteError) {
                    console.log('Could not delete temporary segment');
                }

                const activeCount = totalProfiles - inactiveCount;

                // Calculate savings
                const savings = calculateSavings(totalProfiles, inactiveCount);

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