import { registerAs } from '@nestjs/config';

/**
 * The model behind image search, the advisor and review summaries. Gemini
 * reuses the match judge's GEMINI_API_KEY(S); ANTHROPIC_API_KEY, when set,
 * puts Claude first.
 */
export default registerAs('llm', () => ({
  geminiModel: process.env.LLM_GEMINI_MODEL ?? 'gemini-2.5-flash',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
  claudeModel: process.env.LLM_CLAUDE_MODEL ?? 'claude-sonnet-5-5',
  // Image searches per user per day (each one is a vision call).
  advisorDailyLimit: parseInt(process.env.ADVISOR_DAILY_LIMIT ?? '30', 10),
  imageSearchDailyLimit: parseInt(process.env.IMAGE_SEARCH_DAILY_LIMIT ?? '30', 10),
}));
