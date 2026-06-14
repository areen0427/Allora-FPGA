import { useState, useEffect, useRef } from "react";
import type { BoardDefinition } from "../data/boards";
import type { SavedProject } from "../data/projects";
import type { ProjectFile } from "../pages/dashboard/types";
import { saveProject } from "../data/projects";
import { writeProjectFile } from "../lib/projectWorkspace";
import { getErrorMessage } from "./utils";
import type { SaveStatus } from "./utils";

type UseSaveProjectParams = {
  project: SavedProject | null;
  board: BoardDefinition;
  files: ProjectFile[];
  activeFileName: string | null;
  topLevelFileName: string | null;
  autoSave: boolean;
  autoSaveInterval: string;
};

export function useSaveProject({
  project,
  board,
  files,
  activeFileName,
  topLevelFileName,
  autoSave,
  autoSaveInterval,
}: UseSaveProjectParams) {
  const projectPath = project?.projectPath;
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [saveErrorMessage, setSaveErrorMessage] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState(project?.updatedAt ?? "");

  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const latestSaveStateRef = useRef({
    project,
    boardId: board.id,
    files,
    activeFileName,
    topLevelFileName,
    projectPath,
  });

  useEffect(() => {
    latestSaveStateRef.current = {
      project,
      boardId: board.id,
      files,
      activeFileName,
      topLevelFileName,
      projectPath,
    };
  }, [activeFileName, board.id, files, project, projectPath, topLevelFileName]);

  async function saveCurrentProject() {
    if (isSavingRef.current) {
      pendingSaveRef.current = true;
      setSaveStatus("saving");
      return;
    }

    isSavingRef.current = true;

    try {
      do {
        pendingSaveRef.current = false;
        const snapshot = latestSaveStateRef.current;
        if (!snapshot.project) return;

        setSaveStatus("saving");
        setSaveErrorMessage("");

        const now = new Date().toISOString();
        const nextProject = {
          ...snapshot.project,
          boardId: snapshot.boardId,
          files: snapshot.files,
          activeFileName: snapshot.activeFileName,
          topLevelFileName: snapshot.topLevelFileName,
          updatedAt: now,
        };

        saveProject(nextProject);

        if (snapshot.projectPath) {
          await Promise.all(
            snapshot.files
              .filter((file) => file.path && !file.isBinary)
              .map((file) =>
                writeProjectFile(file.path as string, file.content),
              ),
          );
        }
        setLastSavedAt(now);
      } while (pendingSaveRef.current);

      setSaveStatus("saved");
    } catch (error) {
      setSaveStatus("error");
      setSaveErrorMessage(getErrorMessage(error));
    } finally {
      isSavingRef.current = false;
    }
  }

  useEffect(() => {
    function handleSaveShortcut(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== "s" ||
        (!event.metaKey && !event.ctrlKey)
      ) {
        return;
      }

      event.preventDefault();
      void saveCurrentProject();
    }

    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [activeFileName, board.id, files, project, projectPath]);

  useEffect(() => {
    if (!project || !autoSave || saveStatus !== "unsaved") return;

    const delay =
      autoSaveInterval === "5s" ? 5000 : autoSaveInterval === "30s" ? 30000 : 0;

    if (delay === 0) {
      void saveCurrentProject();
      return;
    }

    const timeout = window.setTimeout(() => {
      void saveCurrentProject();
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [
    activeFileName,
    board.id,
    files,
    project,
    projectPath,
    saveStatus,
    autoSave,
    autoSaveInterval,
  ]);

  function markWorkspaceUnsaved(fileName?: string | null) {
    if (isSavingRef.current) {
      pendingSaveRef.current = true;
    }

    setSaveStatus("unsaved");
    setSaveErrorMessage("");

    if (!fileName) return;

    // dirtyFileNames is managed by useActiveFileTabs, so we expose this
    // and let Dashboard handle dirtyFileNames updates
  }

  const showManualSaveButton = !autoSave || autoSaveInterval !== "immediate";

  return {
    saveStatus,
    setSaveStatus,
    saveErrorMessage,
    setSaveErrorMessage,
    lastSavedAt,
    setLastSavedAt,
    saveCurrentProject,
    markWorkspaceUnsaved,
    showManualSaveButton,
  };
}
