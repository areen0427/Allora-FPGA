import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Circle, LoaderCircle, X, AlertCircle } from "lucide-react";
import type { ChatTool } from "../lib/chatResults";
import "./ChatTaskPanel.css";

export type Activity = {
  id: string;
  kind: "plan" | "agent" | "task";
  title: string;
  status: "pending" | "running" | "complete" | "error";
  parentId?: string;
  detail?: string;
  steps?: { step: string; status: "pending" | "in_progress" | "completed" | "running" | "complete" | "error" }[];
};
export type { ChatTool } from "../lib/chatResults";

/** A custom hierarchy glyph keeps agent coordination distinct from conversation history. */
export function ChatHierarchyIcon({ size = 19 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
    <rect x="8.5" y="2.5" width="7" height="5" rx="1.5" />
    <path d="M12 7.5v4M5 16v-4.5h14V16" />
    <rect x="1.5" y="16" width="7" height="5.5" rx="1.5" />
    <rect x="15.5" y="16" width="7" height="5.5" rx="1.5" />
    <path d="M10.5 5h3M3.75 18.75h2.5m11.5 0h2.5" />
  </svg>;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "running" || status === "in_progress") return <LoaderCircle size={14} className="chat-task-spinning" />;
  if (status === "complete" || status === "completed") return <Check size={14} />;
  if (status === "error") return <AlertCircle size={14} />;
  return <Circle size={12} />;
}

export default function ChatTaskPanel({ activities, tools, busy, ultra }: {
  activities: Activity[]; tools: ChatTool[]; busy: boolean; ultra: boolean;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(busy && ultra);
  const previousBusy = useRef(false);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (busy && !previousBusy.current && ultra) setExpanded(true);
    previousBusy.current = busy;
  }, [busy, ultra]);
  const visible = ultra || activities.length > 0;
  if (!visible) return null;
  const plans = activities.filter((activity) => activity.kind === "plan");
  const agents = activities.filter((activity) => activity.kind === "agent");
  const tasks = activities.filter((activity) => activity.kind === "task");
  const completed = tasks.filter((activity) => activity.status === "complete").length;
  const runningTools = tools.filter((tool) => tool.status === "running");
  function close() { setExpanded(false); toggle.current?.focus(); }
  function renderActivity(activity: Activity) {
    const parent = activity.parentId ? activities.find((item) => item.id === activity.parentId) : undefined;
    return <li key={activity.id} className={`chat-task-item ${activity.status}`}>
      <span className="chat-task-status" aria-label={activity.status}><StatusIcon status={activity.status} /></span>
      <div><strong>{activity.title}</strong>{parent && <small className="chat-task-parent">↳ {parent.title}</small>}
        {activity.detail && <p>{activity.detail}</p>}
        {!!activity.steps?.length && <ol className="chat-plan-steps">{activity.steps.map((step, index) => <li key={`${index}:${step.step}`} className={step.status}>
          <span aria-label={step.status}><StatusIcon status={step.status} /></span><span>{step.step}</span>
        </li>)}</ol>}
      </div>
    </li>;
  }
  return <aside className={`chat-task-panel ${expanded ? "expanded" : "collapsed"}`} aria-label="Task activity">
    <button ref={toggle} type="button" data-glass="off" className="chat-task-toggle" aria-controls={id} aria-expanded={expanded}
      title={expanded ? "Collapse task activity" : "Expand task activity"} onClick={() => setExpanded((value) => !value)}>
      <ChatHierarchyIcon />{expanded && <span>Task activity</span>}
      {expanded ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
      {!expanded && (busy || runningTools.length > 0) && <span className="chat-task-live-dot" aria-label="Work in progress" />}
    </button>
    <div id={id} className="chat-task-panel-body" hidden={!expanded} onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
      <header><div><strong>{busy ? "In progress" : "Latest turn"}</strong><small>{tasks.length ? `${completed} of ${tasks.length} tasks complete` : busy ? "Live activity from this turn" : "Activity from the latest turn"}</small></div>
        <button type="button" data-glass="off" className="chat-task-close" aria-label="Collapse task activity" onClick={close}><X size={16} /></button>
      </header>
      {!!plans.length && <section aria-label="Plan"><h3>Plan</h3><ul>{plans.map(renderActivity)}</ul></section>}
      {!!agents.length && <section aria-label="Subagents"><h3>Agents <span>{agents.length}</span></h3><ul>{agents.map(renderActivity)}</ul></section>}
      {!!tasks.length && <section aria-label="Tasks"><h3>Tasks</h3><ul>{tasks.map(renderActivity)}</ul></section>}
      {!!tools.length && <section aria-label="Tools"><h3>Tools <span>{tools.length}</span></h3><ul>{tools.map((tool) => <li key={tool.id} className={`chat-task-item ${tool.status}`}>
        <span className="chat-task-status" aria-label={tool.status}><StatusIcon status={tool.status} /></span>
        <details><summary>{tool.name.replace(/^mcp__allora__|^allora[._]/, "").replaceAll("_", " ")}</summary>
          {tool.input && <div className="chat-task-tool-data"><small>Input</small><pre>{tool.input}</pre></div>}
          {tool.output && <div className="chat-task-tool-data"><small>Result</small><pre>{tool.output}</pre></div>}
          {!tool.input && !tool.output && <p>{tool.status === "running" ? "Waiting for the tool result." : "No additional output was returned."}</p>}
        </details>
      </li>)}</ul></section>}
      {!activities.length && !tools.length && <p className="chat-task-empty">{busy ? "The agent is considering the request. Plans, delegated tasks, and tool calls will appear as they start." : "Plans, agents, and tools will appear here when work begins."}</p>}
    </div>
  </aside>;
}
