// bb-plugin-sidebar-filter — a replacement for bb's sidebar thread list that
// hides projects without active threads.
//
// Registered through the exclusive `experimental_threadList` slot; the user
// picks it in Settings → Appearance → Sidebar (per client). The host keeps the
// New-thread/search row, the plugin nav rows, and the footer — this component
// owns only the scrolling list.
//
// The list reads the same live cache the built-in list uses
// (`experimental_useSidebarThreads`) and renders one collapsible row per
// project (like the built-in "project" organization mode), but drops projects
// that have no matching threads — "active" means non-archived by default, or
// currently running, per the backend `activeMode` setting.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  definePluginApp,
  experimental_useSidebarThreadActions,
  experimental_useSidebarThreadSplit,
  experimental_useSidebarThreads,
  useSettings,
} from "@get-bb/plugin-sdk/app";
import type {
  PluginSidebarProject,
  PluginSidebarThread,
  PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";

const COLLAPSED_KEY = "bb-plugin-sidebar-filter.collapsed-projects";

function activityRunning(thread: PluginSidebarThread): boolean {
  const a = thread.activity;
  return (
    a.workflows +
      a.backgroundAgents +
      a.backgroundCommands +
      a.planMode +
      a.goals >
    0
  );
}

function isActiveThread(
  thread: PluginSidebarThread,
  mode: "exists" | "running",
): boolean {
  if (mode === "running") {
    return thread.indicator === "runtime" || activityRunning(thread);
  }
  return !thread.isArchived;
}

function matchesQuery(thread: PluginSidebarThread, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${thread.title ?? ""} ${thread.titleFallback ?? ""}`
    .toLowerCase()
    .includes(q);
}

function statusDotClass(thread: PluginSidebarThread): string {
  if (thread.indicator === "runtime" || activityRunning(thread)) {
    return "bg-primary animate-pulse";
  }
  if (thread.indicator === "unread-error") return "bg-destructive";
  if (thread.indicator === "waiting-for-input" || thread.hasPendingInteraction) {
    return "bg-foreground";
  }
  if (thread.isUnread) return "bg-foreground/60";
  return "bg-subtle-foreground/40";
}

function statusDotAria(thread: PluginSidebarThread): string {
  return thread.indicatorLabel ?? (thread.isUnread ? "Unread" : "Idle");
}

function threadTitle(thread: PluginSidebarThread): string {
  return thread.title ?? thread.titleFallback ?? "Untitled";
}

interface RowMenuState {
  threadId: string;
  x: number;
  y: number;
  returnFocus: HTMLButtonElement | null;
}

function FilteredProjectList(props: PluginThreadListProps) {
  const { status, threads, projects } = experimental_useSidebarThreads();
  const actions = experimental_useSidebarThreadActions();
  const { values } = useSettings();
  const hideEmpty = (values?.hideEmptyProjects ?? true) !== false;
  const activeMode: "exists" | "running" =
    values?.activeMode === "running" ? "running" : "exists";

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const toggleCollapsed = (projectId: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        // localStorage unavailable — collapse just won't persist.
      }
      return next;
    });
  };

  // Pinned threads live in their own section on top, like the built-in list;
  // everyone else is grouped under their project.
  const pinned = useMemo(
    () =>
      threads
        .filter(
          (t) =>
            t.isPinned && !t.isArchived && matchesQuery(t, props.searchQuery),
        )
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [threads, props.searchQuery],
  );

  const { projectsWithThreads, byProject } = useMemo(() => {
    const groups = new Map<string, PluginSidebarThread[]>();
    for (const project of projects) groups.set(project.id, []);
    for (const thread of threads) {
      if (thread.isPinned) continue;
      if (!isActiveThread(thread, activeMode)) continue;
      if (!matchesQuery(thread, props.searchQuery)) continue;
      const list = groups.get(thread.projectId);
      if (list === undefined) continue; // thread for an unknown project
      list.push(thread);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    const visible = projects.filter(
      (p) => !hideEmpty || (groups.get(p.id)?.length ?? 0) > 0,
    );
    return { projectsWithThreads: visible, byProject: groups };
  }, [projects, threads, activeMode, hideEmpty, props.searchQuery]);

  if (status === "loading") {
    return (
      <div className="space-y-2 p-2" role="status" aria-label="Loading threads">
        <div className="h-4 w-3/4 rounded-sm bg-sidebar-border/50" />
        <div className="h-4 w-2/3 rounded-sm bg-sidebar-border/50" />
        <div className="h-4 w-1/2 rounded-sm bg-sidebar-border/50" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        Threads are unavailable right now.
      </div>
    );
  }

  return (
    <RowMenuProvider>
      {pinned.length > 0 ? (
        <section className="space-y-0.5 py-1" aria-label="Pinned threads">
          <div className="px-2 pb-0.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-subtle-foreground/70">
            Pinned
          </div>
          {pinned.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              activeThreadId={props.activeThreadId}
              isCompactViewport={props.isCompactViewport}
              onNavigate={props.onNavigate}
            />
          ))}
        </section>
      ) : null}

      <section className="space-y-0.5 py-1" aria-label="Projects">
        {projectsWithThreads.length === 0 ? (
          <div className="px-2 py-3 text-xs text-subtle-foreground/60">
            No projects with active threads.
          </div>
        ) : (
          projectsWithThreads.map((project) => (
            <ProjectGroup
              key={project.id}
              project={project}
              threads={byProject.get(project.id) ?? []}
              isCollapsed={collapsed.has(project.id)}
              onToggleCollapsed={() => toggleCollapsed(project.id)}
              activeThreadId={props.activeThreadId}
              activeProjectId={props.activeProjectId}
              isCompactViewport={props.isCompactViewport}
              onNavigate={props.onNavigate}
            />
          ))
        )}
      </section>
    </RowMenuProvider>
  );
}

function ProjectGroup({
  project,
  threads,
  isCollapsed,
  onToggleCollapsed,
  activeThreadId,
  activeProjectId,
  isCompactViewport,
  onNavigate,
}: {
  project: PluginSidebarProject;
  threads: PluginSidebarThread[];
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
} & Pick<
  PluginThreadListProps,
  "activeThreadId" | "activeProjectId" | "isCompactViewport" | "onNavigate"
>) {
  const actions = experimental_useSidebarThreadActions();
  const isActiveProject = project.id === activeProjectId;
  const handleNewThread = () =>
    actions.openNewThread({ projectId: project.id });

  return (
    <div className="group/project">
      <div
        className={`flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-sm ${
          isActiveProject
            ? "bg-accent text-accent-foreground"
            : "text-foreground hover:bg-accent/50"
        }`}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!isCollapsed}
          aria-label={`${isCollapsed ? "Expand" : "Collapse"} project ${project.name}`}
          className="flex min-w-0 shrink-0 items-center justify-center rounded p-0.5 text-subtle-foreground hover:text-foreground"
        >
          <span
            aria-hidden="true"
            className={`inline-block text-[10px] leading-none transition-transform ${
              isCollapsed ? "-rotate-90" : ""
            }`}
          >
            ▸
          </span>
        </button>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="min-w-0 flex-1 truncate text-left font-medium"
          title={project.name}
        >
          {project.name}
          {threads.length > 0 ? (
            <span className="ml-1.5 text-xs font-normal text-subtle-foreground/70">
              {threads.length}
            </span>
          ) : null}
        </button>
        {!isCompactViewport ? (
          <button
            type="button"
            onClick={handleNewThread}
            aria-label={`New thread in ${project.name}`}
            title="New thread in this project"
            className="rounded p-0.5 text-subtle-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/project:opacity-100"
          >
            +<span className="sr-only">New thread</span>
          </button>
        ) : null}
      </div>
      {!isCollapsed ? (
        <div className="mt-px space-y-px">
          {threads.length === 0 ? (
            <div className="px-2 py-1 text-xs text-subtle-foreground/50">
              No matching threads
            </div>
          ) : (
            threads.map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                activeThreadId={activeThreadId}
                isCompactViewport={isCompactViewport}
                onNavigate={onNavigate}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function ThreadRow({
  thread,
  activeThreadId,
  isCompactViewport,
  onNavigate,
}: {
  thread: PluginSidebarThread;
  activeThreadId: string | null;
  isCompactViewport: boolean;
  onNavigate: () => void;
}) {
  const actions = experimental_useSidebarThreadActions();
  const { splitProps, isAvailable } = experimental_useSidebarThreadSplit(
    thread.id,
  );
  const openMenu = useRowMenu();

  const isActive = thread.id === activeThreadId;
  const title = threadTitle(thread);
  const secondary =
    thread.environment?.branchName ?? thread.host?.name ?? null;

  const handleOpen = (event: ReactMouseEvent) => {
    event.preventDefault();
    actions.open(thread.id);
    onNavigate();
  };

  return (
    <div
      className={`group/row relative rounded-md ${
        isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
      }`}
      onContextMenu={(event) => {
        event.preventDefault();
        openMenu.open(thread.id, event.clientX, event.clientY, null);
      }}
    >
      <a
        data-sidebar-thread-shortcut-target=""
        data-sidebar-thread-id={thread.id}
        href="#"
        onClick={handleOpen}
        onAuxClick={(event) => {
          if (event.button === 1) {
            event.preventDefault();
            actions.open(thread.id, { split: true });
            onNavigate();
          }
        }}
        title={`${title} — ${statusDotAria(thread)}`}
        className={`flex min-w-0 items-center gap-2 rounded-md py-1 pl-2 pr-8 text-sm ${
          thread.isUnread && !isActive
            ? "font-medium text-foreground"
            : "text-muted-foreground"
        }`}
      >
        <span
          aria-hidden="true"
          className={`size-1.5 shrink-0 rounded-full ${statusDotClass(thread)}`}
        />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {isAvailable && !isCompactViewport ? (
          <span
            {...splitProps}
            aria-hidden="true"
            className="shrink-0 text-[10px] text-subtle-foreground/50 opacity-0 transition-opacity group-hover/row:opacity-100"
          >
            ⤢
          </span>
        ) : null}
        {secondary && !isCompactViewport ? (
          <span className="shrink-0 max-w-28 truncate text-[11px] text-subtle-foreground/60">
            {secondary}
          </span>
        ) : null}
      </a>
      <button
        type="button"
        aria-label={`Actions for ${title}`}
        aria-haspopup="menu"
        aria-expanded={openMenu.activeThreadId === thread.id}
        title="Thread actions"
        onClick={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          openMenu.open(thread.id, rect.right, rect.bottom, event.currentTarget);
        }}
        className={`absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-base leading-none text-subtle-foreground transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 ${
          isCompactViewport || isActive
            ? "opacity-100"
            : "opacity-0 group-hover/row:opacity-100"
        }`}
      >
        <span aria-hidden="true">⋯</span>
      </button>
    </div>
  );
}

/* Thread row menu -------------------------------------------------------- */

const RowMenuContext = createContext<{
  activeThreadId: string | null;
  open: (
    threadId: string,
    x: number,
    y: number,
    returnFocus: HTMLButtonElement | null,
  ) => void;
} | null>(null);

function RowMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<RowMenuState | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        menu.returnFocus?.focus();
        close();
      }
    };
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const open = (
    threadId: string,
    x: number,
    y: number,
    returnFocus: HTMLButtonElement | null,
  ) => setMenu({ threadId, x, y, returnFocus });

  return (
    <RowMenuContext.Provider
      value={{ activeThreadId: menu?.threadId ?? null, open }}
    >
      {children}
      {menu ? <RowMenu menu={menu} onClose={() => setMenu(null)} /> : null}
    </RowMenuContext.Provider>
  );
}

function useRowMenu() {
  const ctx = useContext(RowMenuContext);
  if (!ctx) throw new Error("useRowMenu outside RowMenuProvider");
  return ctx;
}

function RowMenu({
  menu,
  onClose,
}: {
  menu: RowMenuState;
  onClose: () => void;
}) {
  const actions = experimental_useSidebarThreadActions();
  const { threads: allThreads } = experimental_useSidebarThreads();
  const thread = allThreads.find((t) => t.id === menu.threadId);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstItemRef.current?.focus();
  }, [menu.threadId]);

  if (!thread) return null;

  const itemClass =
    "w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent focus:bg-accent focus:outline-none";
  const style = {
    left: Math.max(4, Math.min(menu.x, window.innerWidth - 196)),
    top: Math.max(4, Math.min(menu.y, window.innerHeight - 260)),
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]',
      ),
    );
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Home") items[0]?.focus();
    else if (event.key === "End") items.at(-1)?.focus();
    else if (event.key === "ArrowDown")
      items[(current + 1 + items.length) % items.length]?.focus();
    else items[(current - 1 + items.length) % items.length]?.focus();
  };

  return (
    <div
      role="menu"
      aria-label={`Actions for ${threadTitle(thread)}`}
      className="fixed z-50 min-w-40 rounded-md border border-border bg-popover p-1 shadow-lg"
      style={style}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleMenuKeyDown}
    >
      <button
        ref={firstItemRef}
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={() => {
          void actions.setPinned(thread.id, !thread.isPinned);
          onClose();
        }}
      >
        {thread.isPinned ? "Unpin" : "Pin"}
      </button>
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={() => {
          void actions.setRead(thread.id, thread.isUnread);
          onClose();
        }}
      >
        {thread.isUnread ? "Mark as read" : "Mark as unread"}
      </button>
      <div className="my-1 h-px bg-border" role="separator" />
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={() => {
          const nextTitle = window.prompt("Rename thread", threadTitle(thread));
          if (nextTitle?.trim()) void actions.rename(thread.id, nextTitle.trim());
          onClose();
        }}
      >
        Rename…
      </button>
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={() => {
          void navigator.clipboard?.writeText(thread.id).catch(() => undefined);
          onClose();
        }}
      >
        Copy thread ID
      </button>
      <div className="my-1 h-px bg-border" role="separator" />
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={() => {
          actions.archive(thread.id);
          onClose();
        }}
      >
        Archive
      </button>
      <button
        type="button"
        role="menuitem"
        className={`${itemClass} text-destructive`}
        onClick={() => {
          actions.requestDelete(thread.id);
          onClose();
        }}
      >
        Delete…
      </button>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "project-filter",
    title: "Sidebar Project Filter",
    description:
      "Project-grouped thread list that hides projects without active threads.",
    component: FilteredProjectList,
  });
});
