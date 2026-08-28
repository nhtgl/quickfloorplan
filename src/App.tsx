import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Canvas } from "./ui/Canvas";
import { Properties } from "./ui/Properties";
import { Toolbar } from "./ui/Toolbar";
import { Warnings } from "./ui/Warnings";
import { loadAutosave, startAutosave } from "./state/autosave";
import { useStore, type Tool } from "./state/store";

const SHORTCUTS: Record<string, Tool> = {
  v: "select",
  h: "pan",
  w: "wall",
  d: "door",
  n: "window",
  p: "passage",
  r: "room",
};

export default function App() {
  const reset = useStore((s) => s.reset);
  const setTool = useStore((s) => s.setTool);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);

  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 600 });
  const [toast, setToast] = useState<{ msg: string; bad: boolean } | null>(null);

  useEffect(() => {
    const saved = loadAutosave();
    if (saved) reset(saved);
    return startAutosave();
  }, [reset]);

  useLayoutEffect(() => {
    const measure = () => {
      const el = stageRef.current;
      if (el) setSize({ width: el.clientWidth, height: el.clientHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "SELECT") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      const tool = SHORTCUTS[e.key.toLowerCase()];
      if (tool && !e.metaKey && !e.ctrlKey) setTool(tool);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setTool, undo, redo]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="app">
      <Toolbar onNotify={(msg, bad) => setToast({ msg, bad: Boolean(bad) })} />
      <main>
        <div className="stage" ref={stageRef}>
          <Canvas width={size.width} height={size.height} />
          <Warnings />
        </div>
        <Properties />
      </main>
      {toast && (
        <div className={toast.bad ? "toast bad" : "toast"} role="status">
          {toast.msg}
        </div>
      )}
    </div>
  );
}
