# ReviewScope - AI-Powered Review Analysis

A sophisticated review analysis tool that uses Google's Gemini AI to analyze customer reviews from Google Maps locations.

## Features

### 🗺️ Enhanced Google Maps URL Support
- **Standard Google Maps URLs**: `https://maps.google.com/maps/place/...`
- **Search URLs**: `https://maps.google.com/maps/search/...`
- **Query URLs**: `https://maps.google.com/?q=...`
- **New App URLs**: `https://maps.app.goo.gl/...`
- **@ Symbol Support**: `@https://maps.app.goo.gl/3a3YDmhLRacNV9Bs9`

### 🤖 Advanced Gemini AI Integration
- **Expert Business Analysis**: Specialized prompts for actionable insights
- **Comprehensive Analysis**: Sentiment, topics, pain points, highlights, and recommendations
- **Fallback Analysis**: Graceful degradation when AI analysis fails
- **Structured Output**: JSON-formatted responses with validation

### 📊 Rich Analysis Results
- **Overall Sentiment**: Positive, negative, or mixed with confidence scores
- **Topic Summaries**: Detailed breakdown by category (food, service, atmosphere, etc.)
- **Key Examples**: Specific quotes from reviews supporting analysis
- **Customer Pain Points**: Identified issues and concerns
- **Positive Highlights**: What customers love most
- **Actionable Recommendations**: Specific improvement suggestions

## Setup

1. **Install Dependencies**:
   ```bash
   cd server
   npm install
   ```

2. **Environment Variables**:
   Create a `.env` file in the server directory:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
   PORT=5173
   ```

3. **Start Server**:
   ```bash
   npm run dev
   ```

4. **Open Web Interface**:
   Navigate to `http://localhost:5173`

## Usage

1. **Paste Google Maps URL**: Supports all Google Maps formats including the new app URLs
2. **Click Analyze**: The system will extract place information and fetch reviews
3. **View Results**: Get comprehensive AI-powered analysis with actionable insights

## API Endpoints

- `POST /api/analyze` - Analyze reviews from a Google Maps URL
- `GET /api/health` - Health check endpoint

## Testing

Run the URL parsing tests:
```bash
cd server
node test-urls.js
```

## Technologies

- **Backend**: Node.js, Express
- **AI**: Google Gemini 1.5 Flash
- **Maps**: Google Places API
- **Frontend**: HTML, CSS, JavaScript
- **Styling**: Modern CSS with responsive design

## License

MIT License
