import type { ChatArtifact } from "../components/ChatTurnDetails";
let pending: ChatArtifact | undefined;
export function queueChatArtifact(artifact: ChatArtifact) { pending = artifact; }
export function takeChatArtifact(projectPath: string) {
  if (pending?.projectPath !== projectPath) return undefined;
  const artifact = pending;
  pending = undefined;
  return artifact;
}
