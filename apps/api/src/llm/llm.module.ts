import { Global, Module } from '@nestjs/common';
import { ClaudeProvider } from './claude.provider';
import { GeminiProvider } from './gemini.provider';
import { LLM_PROVIDERS, LlmProvider } from './llm-provider';
import { LlmService } from './llm.service';

@Global()
@Module({
  providers: [
    ClaudeProvider,
    GeminiProvider,
    // Order is preference: Claude when keyed, then Gemini.
    { provide: LLM_PROVIDERS, useFactory: (...providers: LlmProvider[]) => providers, inject: [ClaudeProvider, GeminiProvider] },
    LlmService,
  ],
  exports: [LlmService],
})
export class LlmModule {}
