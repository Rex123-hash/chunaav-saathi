const https = require('https');

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
  console.error("❌ ERROR: GEMINI_API_KEY environment variable is missing or invalid.");
  console.error("Please run this command first:");
  console.error('$env:GEMINI_API_KEY="AIzaSy...your-actual-key-here"');
  process.exit(1);
}

console.log("🔍 Fetching available models for your API Key...\n");

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.error) {
        console.error("❌ API ERROR:", parsed.error.message);
        return;
      }
      
      const generateModels = parsed.models.filter(m => 
        m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')
      );
      
      console.log("✅ Models supported for generateContent:");
      generateModels.forEach(m => {
        console.log(`   - ${m.name.replace('models/', '')}`);
      });
      
      console.log("\n💡 Pick one of the models above (like 'gemini-1.5-flash-8b' or 'gemini-2.0-flash') to update the agent files.");
    } catch (e) {
      console.error("❌ Failed to parse response:", e);
    }
  });
}).on('error', (e) => {
  console.error("❌ Network error:", e);
});
