import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'web')));
app.use(express.static(path.join(__dirname, '..')));

// Configuration
const config = {
  geminiApiKey: process.env.GEMINI_API_KEY,
  mapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
  port: process.env.PORT || 5173,
  maxReviews: 50 // Limit to prevent API overuse
};

// Validate environment
if (!config.geminiApiKey || !config.mapsApiKey) {
  console.error('Missing required API keys. Check your .env file.');
  process.exit(1);
}

class ReviewAnalyzer {
  constructor() {
    this.genai = new GoogleGenerativeAI(config.geminiApiKey);
  }

  // Improved URL parsing with better error handling
  parseGoogleMapsUrl(url) {
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

  // Enhanced place search with better error handling
  async findPlace(query) {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': config.mapsApiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount'
      },
      body: JSON.stringify({ 
        textQuery: query,
        maxResultCount: 1
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Places search failed:', response.status, errorText);
      
      if (response.status === 403) {
        throw new Error('Google Places API access denied. Check your API key and billing settings.');
      }
      throw new Error(`Failed to find place: ${response.status}`);
    }

    const data = await response.json();
    const place = data.places?.[0];

    if (!place) {
      throw new Error(`No results found for "${query}". Try a more specific search term.`);
    }

    return {
      id: place.id,
      name: place.displayName?.text || query,
      rating: place.rating,
      reviewCount: place.userRatingCount
    };
  }

  // Get reviews with pagination support
  async getPlaceReviews(placeId) {
    const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        'X-Goog-Api-Key': config.mapsApiKey,
        'X-Goog-FieldMask': 'reviews,displayName'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get reviews: ${response.status}`);
    }

    const data = await response.json();
    const totalAvailableReviews = (data.reviews || []).length;
    
    console.log(`Found ${totalAvailableReviews} total reviews, limiting to first ${config.maxReviews} substantial reviews`);
    
    const reviews = (data.reviews || [])
      .map(review => ({
        text: review.text?.text || review.originalText?.text || '',
        rating: review.rating,
        time: review.publishTime
      }))
      .filter(review => review.text.length > 10) // Filter out very short reviews
      .slice(0, config.maxReviews);

    if (reviews.length === 0) {
      throw new Error('No substantial reviews found for this place.');
    }

    console.log(`Processing ${reviews.length} reviews (filtered from ${totalAvailableReviews} total)`);

    return {
      name: data.displayName?.text,
      reviews,
      totalFound: reviews.length,
      totalAvailable: totalAvailableReviews,
      limitApplied: totalAvailableReviews > config.maxReviews
    };
  }

  // Enhanced analysis with better error handling and simpler prompt
  async analyzeReviews(placeName, reviews) {
    const reviewTexts = reviews.slice(0, 20).map(r => `Rating: ${r.rating}/5 - ${r.text}`).join('\n---\n');
    
    const prompt = `Analyze these customer reviews for "${placeName}" and provide insights in JSON format.

REVIEWS:
${reviewTexts}

Provide your analysis in this exact JSON structure:
{
  "overallSentiment": "positive",
  "topicSummaries": [
    {
      "topic": "Service Quality",
      "summary": "Brief summary of what customers say about service",
      "mentionCount": 8
    }
  ],
  "keyInsights": [
    "Most important insight from the reviews",
    "Second important insight"
  ],
  "commonPhrases": ["great food", "friendly staff"],
  "customerPainPoints": ["long wait times", "expensive prices"],
  "positiveHighlights": ["excellent service", "delicious food"],
  "recommendations": ["Improve wait times", "Consider more vegetarian options"]
}

Focus on the most mentioned topics (food, service, atmosphere, value, etc.). Keep summaries brief and actionable.`;

    try {
      console.log('Starting AI analysis...');
      
      const model = this.genai.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: {
          temperature: 0.1,
          candidateCount: 1,
          maxOutputTokens: 2048
        }
      });

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      console.log('AI response received:', responseText.substring(0, 200) + '...');
      
      // Clean up the response - remove markdown formatting
      let cleanResponse = responseText.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/```json\s*/, '').replace(/\s*```$/, '');
      }
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/```\s*/, '').replace(/\s*```$/, '');
      }
      
      // Try to extract JSON from response
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('No JSON found in AI response:', responseText);
        return this.generateFallbackAnalysis(placeName, reviews);
      }

      const analysis = JSON.parse(jsonMatch[0]);
      
      // Validate and fix structure
      const validatedAnalysis = {
        overallSentiment: analysis.overallSentiment || 'mixed',
        topicSummaries: Array.isArray(analysis.topicSummaries) ? analysis.topicSummaries : [],
        keyInsights: Array.isArray(analysis.keyInsights) ? analysis.keyInsights : [],
        commonPhrases: Array.isArray(analysis.commonPhrases) ? analysis.commonPhrases : [],
        customerPainPoints: Array.isArray(analysis.customerPainPoints) ? analysis.customerPainPoints : [],
        positiveHighlights: Array.isArray(analysis.positiveHighlights) ? analysis.positiveHighlights : [],
        recommendations: Array.isArray(analysis.recommendations) ? analysis.recommendations : []
      };

      console.log('Analysis completed successfully');
      return validatedAnalysis;

    } catch (error) {
      console.error('AI analysis failed:', error);
      console.log('Generating fallback analysis...');
      return this.generateFallbackAnalysis(placeName, reviews);
    }
  }

  // Improved fallback analysis
  generateFallbackAnalysis(placeName, reviews) {
    console.log('Using fallback analysis');
    
    const totalRating = reviews.reduce((sum, r) => sum + (r.rating || 0), 0);
    const avgRating = totalRating / reviews.length;
    
    const positiveReviews = reviews.filter(r => (r.rating || 0) >= 4).length;
    const negativeReviews = reviews.filter(r => (r.rating || 0) <= 2).length;
    
    let overallSentiment = 'mixed';
    if (positiveReviews > negativeReviews * 2) overallSentiment = 'positive';
    else if (negativeReviews > positiveReviews * 2) overallSentiment = 'negative';
    
    // Simple keyword analysis
    const allText = reviews.map(r => r.text.toLowerCase()).join(' ');
    const commonWords = ['great', 'good', 'excellent', 'amazing', 'love', 'best', 'perfect'];
    const negativeWords = ['bad', 'terrible', 'awful', 'worst', 'hate', 'disappointing'];
    
    const foundPositive = commonWords.filter(word => allText.includes(word));
    const foundNegative = negativeWords.filter(word => allText.includes(word));
    
    return {
      overallSentiment,
      topicSummaries: [
        {
          topic: "Overall Experience",
          summary: `Based on ${reviews.length} reviews with an average rating of ${avgRating.toFixed(1)}/5 stars. ${positiveReviews} positive reviews vs ${negativeReviews} negative reviews.`,
          mentionCount: reviews.length
        }
      ],
      keyInsights: [
        `Average rating: ${avgRating.toFixed(1)}/5 stars`,
        `${Math.round((positiveReviews/reviews.length) * 100)}% of reviews are positive (4+ stars)`,
        `Analyzed ${reviews.length} customer reviews for patterns and sentiment`
      ],
      commonPhrases: foundPositive.length > 0 ? foundPositive.slice(0, 5) : ['N/A'],
      customerPainPoints: foundNegative.length > 0 ? foundNegative.slice(0, 3) : ['No major pain points identified'],
      positiveHighlights: foundPositive.length > 0 ? [`Customers frequently mention: ${foundPositive.join(', ')}`] : ['Generally positive customer feedback'],
      recommendations: [
        'Run a full AI analysis for detailed insights',
        avgRating < 3.5 ? 'Focus on addressing customer concerns' : 'Continue maintaining quality standards'
      ]
    };
  }
}

// API Routes
const analyzer = new ReviewAnalyzer();

app.post('/api/analyze', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        error: 'URL is required',
        hint: 'Please provide a Google Maps URL'
      });
    }

    console.log('Starting analysis for URL:', url);

    // Step 1: Parse URL
    const placeName = analyzer.parseGoogleMapsUrl(url);
    console.log('Extracted place name:', placeName);

    // Step 2: Find place
    const place = await analyzer.findPlace(placeName);
    console.log('Found place:', place.name);

    // Step 3: Get reviews  
    const reviewData = await analyzer.getPlaceReviews(place.id);
    console.log(`Retrieved ${reviewData.reviews.length} reviews`);

    // Step 4: Analyze
    const analysis = await analyzer.analyzeReviews(reviewData.name, reviewData.reviews);
    console.log('Analysis completed');

    // Include reviewData in the response for the frontend
    global.reviewData = reviewData;

    res.json({
      success: true,
      place: {
        name: place.name,
        rating: place.rating,
        reviewCount: place.reviewCount
      },
      reviewsAnalyzed: reviewData.totalFound,
      reviewData: {
        totalFound: reviewData.totalFound,
        totalAvailable: reviewData.totalAvailable,
        limitApplied: reviewData.limitApplied
      },
      analysis
    });

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(400).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'web', 'index.html'));
});

app.listen(config.port, () => {
  console.log(`🚀 Review analyzer running on http://localhost:${config.port}`);
  console.log('🔍 Endpoints: POST /api/analyze, GET /api/health');
});