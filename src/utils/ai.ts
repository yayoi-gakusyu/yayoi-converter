
export async function generateContentWithRetry(
  ai: any,
  config: { model: string; contents: { parts: any[] }; config: { responseMimeType: string } },
  maxRetries: number = 3
): Promise<any> {
  let delay = 1000;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const response = await ai.models.generateContent(config);
      return response;
    } catch (error: any) {
      // Check for 503 (Service Unavailable) or 429 (Too Many Requests)
      const errorStr = (error.message || '').toLowerCase();
      const isRetryable = errorStr.includes('503') || 
                          errorStr.includes('429') ||
                          errorStr.includes('unavailable') ||
                          errorStr.includes('high demand');
      
      if (isRetryable && i < maxRetries) {
        console.warn(`Gemini API error (503/429). Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
        continue;
      }
      
      if (errorStr.includes('503') || errorStr.includes('unavailable') || errorStr.includes('high demand')) {
        throw new Error('現在Gemini APIが非常に混雑しています。一時的な過負荷（503）が発生しました。少し時間を置いてから再度お試しいただくか、右上の設定から別のモデル（Gemini 1.5 Flash等）に変更してみてください。');
      }
      
      if (errorStr.includes('429')) {
        throw new Error('リクエストが多すぎます（429）。APIの制限に達した可能性があります。しばらく待ってから再度お試しください。');
      }

      throw error;
    }
  }
}
