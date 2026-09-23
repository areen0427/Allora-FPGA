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
};

const AUTO_SAVE_INTERVAL_MS = 30_000;

export function useSaveProject({
  project,
  board,
  files,
  activeFileName,
  topLevelFileName,
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

    // Capture before Monaco's command service so the desktop/browser default
    // never intercepts Cmd+S or Ctrl+S.
    window.addEventListener("keydown", handleSaveShortcut, true);
    return () => window.removeEventListener("keydown", handleSaveShortcut, true);
  }, [activeFileName, board.id, files, project, projectPath]);

  useEffect(() => {
    if (!project || saveStatus !== "unsaved") return;

    const timeout = window.setTimeout(() => {
      void saveCurrentProject();
    }, AUTO_SAVE_INTERVAL_MS);
    return () => window.clearTimeout(timeout);
  }, [project, saveStatus]);

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

  const showManualSaveButton = true;

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
