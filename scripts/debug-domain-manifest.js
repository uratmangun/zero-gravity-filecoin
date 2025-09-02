#!/usr/bin/env node

require('dotenv').config();

const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

async function debugDomainManifest() {
  const bearerToken = process.env.FARCASTER_BEARER_TOKEN;

  if (!bearerToken) {
    console.error('Error: FARCASTER_BEARER_TOKEN is not set in your .env file.');
    console.log('Please add your bearer token to the .env file to make requests to Farcaster.');
    process.exit(1);
  }

  const domain = process.argv[2];
  const url = `https://client.farcaster.xyz/v1/dev-tools/debug-domain-manifest?domain=${domain}`;

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Authorization': `Bearer ${bearerToken}`,
    'accept': '*/*',
    'fc-amplitude-device-id': 'RhFKhscZZqleZwa7isQJxe',
    'fc-amplitude-session-id': '1756511234470',
    'origin': 'https://farcaster.xyz',
    'referer': 'https://farcaster.xyz/',
    'sec-ch-ua': '"Not;A=Brand";v="99", "Brave";v="139", "Chromium";v="139"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Linux"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'sec-gpc': '1',
    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
  };

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      console.log(`🚀 Attempt ${i + 1}/${MAX_RETRIES}: Debugging domain manifest for: ${domain}...`);
      const response = await fetch(url, {
        method: 'GET',
        headers: headers
      });

      if (response.ok) {
        const responseData = await response.json();
        console.log('✅ Successfully fetched domain manifest debug info:');
        console.log(JSON.stringify(responseData, null, 2));
        return; // Success, exit the function
      } else {
        const responseData = await response.json().catch(() => response.text());
        console.error(`❌ Attempt ${i + 1} failed: ${response.status} ${response.statusText}`);
        console.error('   Response:', responseData);
      }
    } catch (error) {
      console.error(`💥 An unexpected error occurred on attempt ${i + 1}:`);
      console.error(error);
    }

    if (i < MAX_RETRIES - 1) {
      console.log(`Retrying in ${RETRY_DELAY / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }

  console.error(`❌ Failed to debug domain manifest after ${MAX_RETRIES} attempts.`);
  process.exit(1); // Exit with an error code
}

// Execute the function
debugDomainManifest();