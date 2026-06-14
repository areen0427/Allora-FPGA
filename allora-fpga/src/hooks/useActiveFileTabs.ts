import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ProjectFile } from "../pages/dashboard/types";
import { isHdlFile } from "./utils";

type UseActiveFileTabsParams = {
  projectFiles: ProjectFile[];
  initialActiveFileName?: string | null;
  initialTopLevelFileName?: string | null;
  setFiles: Dispatch<SetStateAction<ProjectFile[]>>;
};

export function useActiveFileTabs({
  projectFiles,
  initialActiveFileName,
  initialTopLevelFileName,
  setFiles,
}: UseActiveFileTabsParams) {
  const [activeFileName, setActiveFileName] = useState<string | null>(
    initialActiveFileName ?? null,
  );
  const [openFileNames, setOpenFileNames] = useState<string[]>(
    initialActiveFileName
      ? [initialActiveFileName]
      : projectFiles[0]?.name
        ? [projectFiles[0].name]
        : [],
  );
  const [topLevelFileName, setTopLevelFileNameState] = useState<string | null>(
    initialTopLevelFileName &&
      projectFiles.some((f) => f.name === initialTopLevelFileName)
      ? initialTopLevelFileName
      : (projectFiles.find((f) => isHdlFile(f.name))?.name ?? null),
  );
  const [dirtyFileNames, setDirtyFileNames] = useState<string[]>([]);

  const activeFile = projectFiles.find((file) => file.name === activeFileName);

  const makeTopLevelFile = useCallback(
    (fileName: string | null) => {
      setTopLevelFileNameState(fileName);
      if (!fileName) return;

      setFiles((currentFiles) => {
        const fileIndex = currentFiles.findIndex((f) => f.name === fileName);
        if (fileIndex <= 0) return currentFiles;
        const nextFiles = [...currentFiles];
        const [topLevelFile] = nextFiles.splice(fileIndex, 1);
        return [topLevelFile, ...nextFiles];
      });
    },
    [setFiles],
  );

  useEffect(() => {
    const hdlFiles = projectFiles.filter((file) => isHdlFile(file.name));
    if (hdlFiles.length === 0) {
      setTopLevelFileNameState(null);
      return;
    }

    if (
      !topLevelFileName ||
      !hdlFiles.some((file) => file.name === topLevelFileName)
    ) {
      makeTopLevelFile(hdlFiles[0].name);
    }
  }, [makeTopLevelFile, projectFiles, topLevelFileName]);

  function openFile(fileName: string) {
    setOpenFileNames((current) => [...new Set([...current, fileName])]);
    setActiveFileName(fileName);
  }

  function closeOpenFile(fileName: string) {
    setOpenFileNames((current) => {
      const nextOpenFiles = current.filter((name) => name !== fileName);
      if (activeFileName === fileName) {
        setActiveFileName(nextOpenFiles[0] ?? null);
      }
      return nextOpenFiles;
    });
  }

  function updateActiveFile(content: string) {
    if (!activeFileName) {
      return null;
    }

    setFiles((currentFiles) =>
      currentFiles.map((file) =>
        file.name === activeFileName ? { ...file, content } : file,
      ),
    );
    return activeFileName;
  }

  function updateOpenFileAfterRename(oldName: string, newName: string) {
    setOpenFileNames((current) =>
      current.map((n) => (n === oldName ? newName : n)),
    );
    setDirtyFileNames((current) =>
      current.map((n) => (n === oldName ? newName : n)),
    );
  }

  function removeOpenFile(fileName: string) {
    setOpenFileNames((current) => current.filter((name) => name !== fileName));
  }

  return {
    activeFileName,
    setActiveFileName,
    openFileNames,
    setOpenFileNames,
    topLevelFileName,
    setTopLevelFileName: makeTopLevelFile,
    dirtyFileNames,
    setDirtyFileNames,
    activeFile,
    openFile,
    closeOpenFile,
    updateActiveFile,
    makeTopLevelFile,
    updateOpenFileAfterRename,
    removeOpenFile,
  };
}
