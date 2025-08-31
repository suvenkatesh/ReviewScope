import 'dotenv/config';
import 'dotenv/config';

// Create a simple test function since ReviewAnalyzer is not exported
function testUrlParsing(url) {
  try {
    // Remove @ symbol if present at the beginning
    let cleanUrl = url.trim();
    if (cleanUrl.startsWith('@')) {
      cleanUrl = cleanUrl.substring(1);
    }
    
    const urlObj = new URL(cleanUrl);
    
    // Validate it's a Google Maps URL
    if (!urlObj.hostname.includes('google.com') && 
        !urlObj.hostname.includes('maps.google') && 
        !urlObj.hostname.includes('maps.app.goo.gl')) {
      throw new Error('Please provide a valid Google Maps URL');
    }

    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    
    // Handle various Google Maps URL formats
    const patterns = [
      // /maps/place/Place+Name
      () => {
        const idx = pathParts.indexOf('place');
        if (idx !== -1 && pathParts[idx + 1] && !pathParts[idx + 1].startsWith('@')) {
          return decodeURIComponent(pathParts[idx + 1]).replace(/\+/g, ' ');
        }
      },
      // /maps/search/Place+Name  
      () => {
        const idx = pathParts.indexOf('search');
        if (idx !== -1 && pathParts[idx + 1]) {
          return decodeURIComponent(pathParts[idx + 1]).replace(/\+/g, ' ');
        }
      },
      // maps.app.goo.gl format - extract from query params or path
      () => {
        if (urlObj.hostname.includes('maps.app.goo.gl')) {
          // Try to get place name from query parameters
          const q = urlObj.searchParams.get('q');
          if (q) return decodeURIComponent(q).replace(/\+/g, ' ');
          
          // Try to get from path if it contains location info
          const path = urlObj.pathname;
          if (path && path !== '/') {
            // For short URLs, we might need to follow redirects or extract from path
            return 'Location from Google Maps';
          }
        }
      },
      // ?q=Place+Name
      () => {
        const q = urlObj.searchParams.get('q');
        if (q) return decodeURIComponent(q).replace(/\+/g, ' ');
      }
    ];

    for (const pattern of patterns) {
      const result = pattern();
      if (result) return result.trim();
    }

    // If we can't extract a specific name, return a generic identifier
    if (urlObj.hostname.includes('maps.app.goo.gl')) {
      return 'Google Maps Location';
    }

    throw new Error('Could not extract place name from this URL format');
  } catch (error) {
    if (error.message.includes('Invalid URL')) {
      throw new Error('Please provide a valid URL');
    }
    throw error;
  }
}

// Test URL parsing
const testUrls = [
  '@https://maps.app.goo.gl/3a3YDmhLRacNV9Bs9',
  'https://maps.app.goo.gl/3a3YDmhLRacNV9Bs9',
  'https://maps.google.com/maps/place/Restaurant+Name',
  'https://maps.google.com/maps/search/Cafe+Location',
  'https://maps.google.com/?q=Business+Name',
  'https://maps.app.goo.gl/abc123?q=Test+Location',
  'invalid-url',
  'https://example.com/not-google-maps'
];

console.log('Testing URL parsing...\n');

testUrls.forEach((url, index) => {
  console.log(`Test ${index + 1}: ${url}`);
  try {
    const placeName = testUrlParsing(url);
    console.log(`✅ Success: "${placeName}"\n`);
  } catch (error) {
    console.log(`❌ Error: ${error.message}\n`);
  }
});

console.log('URL parsing tests completed!');

// Check environment variables
console.log('\nEnvironment variables:');
console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '✅ Set' : '❌ Missing');
console.log('GOOGLE_MAPS_API_KEY:', process.env.GOOGLE_MAPS_API_KEY ? '✅ Set' : '❌ Missing');
