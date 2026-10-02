import type { AiChatModel } from "./aiChat";

export function reasoningFor(model: AiChatModel | undefined, preferred: string) {
  const choices = model?.supportedReasoningEfforts ?? [];
  return choices.find((option) => option.reasoningEffort === preferred)?.reasoningEffort
    ?? choices.find((option) => option.reasoningEffort === "medium")?.reasoningEffort
    ?? choices.find((option) => option.reasoningEffort === model?.defaultReasoningEffort)?.reasoningEffort
    ?? choices[0]?.reasoningEffort;
}

