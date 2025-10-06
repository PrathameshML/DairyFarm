const { GoogleGenerativeAI } = require('@google/generative-ai');

// Gemini-only wrapper. No OpenAI fallback.
function getGeminiModel() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const genAI = new GoogleGenerativeAI(key);
    const modelName = process.env.GEMINI_MODEL || 'gemini-pro';
    return genAI.getGenerativeModel({ model: modelName });
  } catch (e) {
    console.error('Gemini init error:', e?.message || e);
    return null;
  }
}

async function askGemini(prompt, { structuredData } = {}) {
  const model = getGeminiModel();
  if (!model) {
    return {
      usedGemini: false,
      text: 'Gemini is not configured (missing GEMINI_API_KEY). Showing basic analytics only.',
      structured: structuredData || null,
    };
  }

  try {
    const context = structuredData
      ? `\nHere is JSON data you can analyze. Keep answer concise in bullets.\nJSON (may be truncated):\n${JSON.stringify(structuredData).slice(0, 25000)}`
      : '';
    const fullPrompt = `${prompt}${context}`;
    const result = await model.generateContent(fullPrompt);
    const text = typeof result?.response?.text === 'function' ? result.response.text() : 'No response';
    return { usedGemini: true, text, structured: structuredData || null };
  } catch (e) {
    console.error('Gemini call error:', e?.message || e);
    return {
      usedGemini: false,
      text: 'Gemini request failed. Showing basic analytics only.',
      structured: structuredData || null,
    };
  }
}

module.exports = { askGemini };
