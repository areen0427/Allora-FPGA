import { invokeTauri } from "./tauri";
export type ChatChangeReview = {
  id: string;
  projectPath: string;
  files: { path: string; before: string | null; after: string | null }[];
  skipped: number;
  canRestore?: boolean;
};
export const chatCheckpoints = {
  create: (projectPath: string) => invokeTauri<{ id: string; projectPath: string }>("ai_chat_checkpoint_create", { projectPath }),
  review: (id: string) => invokeTauri<ChatChangeReview>("ai_chat_checkpoint_review", { id }),
  restore: (id: string) => invokeTauri<{ restored: number }>("ai_chat_checkpoint_restore", { id }),
  createdReview: (projectPath: string) => invokeTauri<ChatChangeReview>("ai_chat_checkpoint_created_review", { projectPath }),
};
