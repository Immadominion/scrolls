"use client";

import { useEffect, useState, useRef } from "react";

export function useGlobalDrop(onFiles: (files: FileList) => void) {
    const [isDropTarget, setIsDropTarget] = useState(false);
    const cbRef = useRef(onFiles);

    useEffect(() => {
        cbRef.current = onFiles;
    }, [onFiles]);

    useEffect(() => {
        let dragDepth = 0;
        
        function dragHasFiles(event: DragEvent) {
            return event.dataTransfer?.types.includes("Files");
        }

        const handleDragEnter = (event: DragEvent) => {
            if (!dragHasFiles(event)) return;
            event.preventDefault();
            dragDepth += 1;
            setIsDropTarget(true);
        };

        const handleDragOver = (event: DragEvent) => {
            if (!dragHasFiles(event)) return;
            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = "copy";
            }
        };

        const handleDragLeave = (event: DragEvent) => {
            if (!dragHasFiles(event)) return;
            event.preventDefault();
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) {
                setIsDropTarget(false);
            }
        };

        const handleDrop = (event: DragEvent) => {
            if (!dragHasFiles(event)) return;
            event.preventDefault();
            dragDepth = 0;
            setIsDropTarget(false);
            if (event.dataTransfer?.files) {
                cbRef.current(event.dataTransfer.files);
            }
        };

        window.addEventListener("dragenter", handleDragEnter);
        window.addEventListener("dragover", handleDragOver);
        window.addEventListener("dragleave", handleDragLeave);
        window.addEventListener("drop", handleDrop);

        return () => {
            window.removeEventListener("dragenter", handleDragEnter);
            window.removeEventListener("dragover", handleDragOver);
            window.removeEventListener("dragleave", handleDragLeave);
            window.removeEventListener("drop", handleDrop);
        };
    }, []);

    return isDropTarget;
}
