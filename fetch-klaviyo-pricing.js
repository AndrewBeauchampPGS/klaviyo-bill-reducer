const { chromium } = require('playwright');

async function fetchKlaviyoPricing() {
    const browser = await chromium.launch({
        headless: true,
        args: ['--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    // Test points for pricing tiers - testing boundaries and key values
    const contactPoints = [
        251, 501, 1001, 2501, 5001, 7501, 10001, 12501, 15001, 17501,
        20001, 22501, 25001, 27501, 30001, 32501, 35001, 37501, 40001,
        42501, 45001, 50001, 60001, 70001, 85001, 100001, 125001, 150001
    ];

    const prices = {};

    for (const contacts of contactPoints) {
        try {
            const url = `https://www.klaviyo.com/pricing?contacts=${contacts}&smsCredits=150`;
            console.log(`Fetching price for ${contacts} contacts...`);

            // Navigate to the page
            await page.goto(url, {
                waitUntil: 'networkidle',
                timeout: 30000
            });

            // Wait a bit for JavaScript to render prices
            await page.waitForTimeout(3000);

            // Try multiple selectors to find the price
            let price = null;

            // Strategy 1: Look for price in specific containers
            const selectors = [
                'div[data-testid*="price"]',
                'span[data-testid*="price"]',
                'div[class*="price"]:has-text("$")',
                'span[class*="price"]:has-text("$")',
                'div:has-text("$"):has-text("/month")',
                '*:has-text("per month"):has-text("$")',
                'div.pricing-calculator-result',
                'div[class*="calculator"]'
            ];

            for (const selector of selectors) {
                try {
                    const elements = await page.$$(selector);
                    for (const element of elements) {
                        const text = await element.textContent();
                        // Look for price pattern like $XXX or $X,XXX
                        const match = text.match(/\$(\d{1,3}(?:,\d{3})*)/);
                        if (match) {
                            const priceValue = parseInt(match[1].replace(',', ''));
                            // Filter out obvious wrong values (like $20 which is base price or very high values)
                            if (priceValue > 15 && priceValue < 10000) {
                                price = priceValue;
                                break;
                            }
                        }
                    }
                    if (price) break;
                } catch (e) {
                    // Continue to next selector
                }
            }

            // Strategy 2: If no price found, try to get all text and find price pattern
            if (!price) {
                const bodyText = await page.textContent('body');
                // Look for patterns like "$XXX per month" or "$XXX/month"
                const matches = bodyText.match(/\$(\d{1,3}(?:,\d{3})*)(?:\s*(?:per month|\/month))/gi);
                if (matches) {
                    for (const match of matches) {
                        const priceMatch = match.match(/\$(\d{1,3}(?:,\d{3})*)/);
                        if (priceMatch) {
                            const priceValue = parseInt(priceMatch[1].replace(',', ''));
                            if (priceValue > 15 && priceValue < 10000) {
                                price = priceValue;
                                break;
                            }
                        }
                    }
                }
            }

            if (price) {
                prices[contacts] = price;
                console.log(`✓ ${contacts} contacts: $${price}/month`);
            } else {
                console.log(`✗ Could not find price for ${contacts} contacts`);
            }

            // Small delay between requests to be respectful
            await page.waitForTimeout(1000);

        } catch (error) {
            console.error(`Error fetching price for ${contacts}: ${error.message}`);
        }
    }

    await browser.close();

    // Output results
    console.log('\n=== Klaviyo Pricing Tiers (Email Only) ===');
    console.log('const PRICING_TIERS = [');

    let lastPrice = 0;
    let rangeStart = null;

    const sortedContacts = Object.keys(prices).map(Number).sort((a, b) => a - b);

    for (let i = 0; i < sortedContacts.length; i++) {
        const contacts = sortedContacts[i];
        const price = prices[contacts];

        if (i === 0) {
            // First tier starts at previous boundary
            if (contacts === 251) {
                console.log(`    { min: 0, max: 250, price: 0 },  // Free tier`);
            }
            console.log(`    { min: ${contacts}, max: ${sortedContacts[i + 1] ? sortedContacts[i + 1] - 1 : contacts + 499}, price: ${price} },`);
        } else if (i === sortedContacts.length - 1) {
            // Last tier
            console.log(`    { min: ${contacts}, max: ${contacts + 49999}, price: ${price} },`);
        } else {
            // Middle tiers
            const nextContact = sortedContacts[i + 1];
            console.log(`    { min: ${contacts}, max: ${nextContact - 1}, price: ${price} },`);
        }
    }

    console.log('];');

    return prices;
}

// Run the scraper
fetchKlaviyoPricing()
    .then(prices => {
        console.log('\nSuccessfully fetched', Object.keys(prices).length, 'pricing points');
    })
    .catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });