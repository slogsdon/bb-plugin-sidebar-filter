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
//
// Within a project, threads render as a tree: a parent thread shows its child
// threads nested beneath it (matching the built-in thread organization), and
// each project row carries the built-in-style ⋯ menu on hover with project
// actions (new thread, rename, archive all, delete).
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
  useRpc,
  useSettings,
} from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
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

interface ThreadForest {
  roots: PluginSidebarThread[];
  childrenOf: ReadonlyMap<string, PluginSidebarThread[]>;
}

type MenuState =
  | {
      kind: "thread";
      threadId: string;
      x: number;
      y: number;
      returnFocus: HTMLButtonElement | null;
    }
  | {
      kind: "project";
      projectId: string;
      x: number;
      y: number;
      returnFocus: HTMLButtonElement | null;
    };

function FilteredProjectList(props: PluginThreadListProps) {
  const { status, threads, projects } = experimental_useSidebarThreads();
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
  // everyone else is grouped under their project as a thread tree.
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

  const { visibleProjects, forests } = useMemo(() => {
    const byId = new Map(threads.map((t) => [t.id, t]));

    // Threads that match the active + search filters.
    const matched = threads.filter(
      (t) =>
        !t.isPinned &&
        isActiveThread(t, activeMode) &&
        matchesQuery(t, props.searchQuery),
    );

    // Keep a thread if it matches, OR it is an ancestor of a matching thread,
    // so the parent chain stays visible under the child it belongs to.
    const showSet = new Set<string>();
    const addWithAncestors = (thread: PluginSidebarThread) => {
      let current: PluginSidebarThread | undefined = thread;
      while (current && !showSet.has(current.id)) {
        showSet.add(current.id);
        current = current.parentThreadId
          ? byId.get(current.parentThreadId)
          : undefined;
      }
    };
    for (const thread of matched) addWithAncestors(thread);

    const byProject = new Map<string, PluginSidebarThread[]>();
    for (const project of projects) byProject.set(project.id, []);
    for (const thread of threads) {
      if (!showSet.has(thread.id)) continue;
      byProject.get(thread.projectId)?.push(thread);
    }

    const sortByUpdated = (a: PluginSidebarThread, b: PluginSidebarThread) =>
      b.updatedAt - a.updatedAt;

    const builtForests = new Map<string, ThreadForest>();
    for (const project of projects) {
      const projectThreads = byProject.get(project.id) ?? [];
      const childrenOf = new Map<string, PluginSidebarThread[]>();
      const roots: PluginSidebarThread[] = [];
      for (const thread of projectThreads) {
        if (
          thread.parentThreadId &&
          showSet.has(thread.parentThreadId) &&
          byId.has(thread.parentThreadId)
        ) {
          const siblings = childrenOf.get(thread.parentThreadId) ?? [];
          siblings.push(thread);
          childrenOf.set(thread.parentThreadId, siblings);
        } else {
          roots.push(thread);
        }
      }
      roots.sort(sortByUpdated);
      for (const siblings of childrenOf.values()) siblings.sort(sortByUpdated);
      builtForests.set(project.id, { roots, childrenOf });
    }

    const visible = projects.filter(
      (p) => !hideEmpty || (builtForests.get(p.id)?.roots.length ?? 0) > 0,
    );

    return { visibleProjects: visible, forests: builtForests };
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
    <MenuProvider>
      {pinned.length > 0 ? (
        <section className="space-y-0.5 py-1" aria-label="Pinned threads">
          <div className="px-2 pb-0.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-subtle-foreground/70">
            Pinned
          </div>
          {pinned.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              depth={0}
              childrenOf={null}
              activeThreadId={props.activeThreadId}
              isCompactViewport={props.isCompactViewport}
              onNavigate={props.onNavigate}
            />
          ))}
        </section>
      ) : null}

      <section className="space-y-0.5 py-1" aria-label="Projects">
        {visibleProjects.length === 0 ? (
          <div className="px-2 py-3 text-xs text-subtle-foreground/60">
            No projects with active threads.
          </div>
        ) : (
          visibleProjects.map((project) => {
            const forest = forests.get(project.id);
            if (!forest || forest.roots.length === 0) return null;
            return (
              <ProjectGroup
                key={project.id}
                project={project}
                forest={forest}
                isCollapsed={collapsed.has(project.id)}
                onToggleCollapsed={() => toggleCollapsed(project.id)}
                activeThreadId={props.activeThreadId}
                activeProjectId={props.activeProjectId}
                isCompactViewport={props.isCompactViewport}
                onNavigate={props.onNavigate}
              />
            );
          })
        )}
      </section>
    </MenuProvider>
  );
}

function ProjectGroup({
  project,
  forest,
  isCollapsed,
  onToggleCollapsed,
  activeThreadId,
  activeProjectId,
  isCompactViewport,
  onNavigate,
}: {
  project: PluginSidebarProject;
  forest: ThreadForest;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
} & Pick<
  PluginThreadListProps,
  "activeThreadId" | "activeProjectId" | "isCompactViewport" | "onNavigate"
>) {
  const isActiveProject = project.id === activeProjectId;
  const menu = useMenu();
  const totalCount =
    forest.roots.length +
    [...forest.childrenOf.values()].reduce((n, siblings) => n + siblings.length, 0);
  const handleNewThread = () =>
    experimental_useSidebarThreadActions().openNewThread({ projectId: project.id });

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
          {totalCount > 0 ? (
            <span className="ml-1.5 text-xs font-normal text-subtle-foreground/70">
              {totalCount}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          aria-label={`Project actions for ${project.name}`}
          aria-haspopup="menu"
          title="Project actions"
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            menu.openProject(
              project.id,
              rect.right,
              rect.bottom,
              event.currentTarget,
            );
          }}
          className={`rounded p-0.5 text-subtle-foreground transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 ${
            isCompactViewport || isActiveProject
              ? "opacity-100"
              : "opacity-0 group-hover/project:opacity-100"
          }`}
        >
          <span aria-hidden="true">⋯</span>
        </button>
      </div>
      {!isCollapsed ? (
        <div className="mt-px space-y-px">
          {forest.roots.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              depth={0}
              childrenOf={forest.childrenOf}
              activeThreadId={activeThreadId}
              isCompactViewport={isCompactViewport}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ThreadRow({
  thread,
  depth,
  childrenOf,
  activeThreadId,
  isCompactViewport,
  onNavigate,
}: {
  thread: PluginSidebarThread;
  depth: number;
  childrenOf: ReadonlyMap<string, PluginSidebarThread[]> | null;
  activeThreadId: string | null;
  isCompactViewport: boolean;
  onNavigate: () => void;
}) {
  const actions = experimental_useSidebarThreadActions();
  const { splitProps, isAvailable } = experimental_useSidebarThreadSplit(
    thread.id,
  );
  const menu = useMenu();

  const isActive = thread.id === activeThreadId;
  const title = threadTitle(thread);
  const secondary =
    thread.environment?.branchName ?? thread.host?.name ?? null;
  const children = childrenOf?.get(thread.id) ?? [];

  const handleOpen = (event: ReactMouseEvent) => {
    event.preventDefault();
    actions.open(thread.id);
    onNavigate();
  };

  const row = (
    <div
      className={`group/row relative rounded-md ${
        isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
      }`}
      onContextMenu={(event) => {
        event.preventDefault();
        menu.openThread(thread.id, event.clientX, event.clientY, null);
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
        style={{ paddingLeft: 8 + depth * 14 }}
        className={`flex min-w-0 items-center gap-2 rounded-md py-1 pr-8 text-sm ${
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
        aria-expanded={menu.activeThreadId === thread.id}
        title="Thread actions"
        onClick={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          menu.openThread(
            thread.id,
            rect.right,
            rect.bottom,
            event.currentTarget,
          );
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

  if (children.length === 0) return row;

  return (
    <div>
      {row}
      <div className="space-y-px">
        {children.map((child) => (
          <ThreadRow
            key={child.id}
            thread={child}
            depth={depth + 1}
            childrenOf={childrenOf}
            activeThreadId={activeThreadId}
            isCompactViewport={isCompactViewport}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

/* Menus (thread + project) --------------------------------------------- */

const MenuContext = createContext<{
  activeThreadId: string | null;
  activeProjectId: string | null;
  openThread: (
    threadId: string,
    x: number,
    y: number,
    returnFocus: HTMLButtonElement | null,
  ) => void;
  openProject: (
    projectId: string,
    x: number,
    y: number,
    returnFocus: HTMLButtonElement | null,
  ) => void;
} | null>(null);

function MenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null);

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

  const openThread = (
    threadId: string,
    x: number,
    y: number,
    returnFocus: HTMLButtonElement | null,
  ) => setMenu({ kind: "thread", threadId, x, y, returnFocus });
  const openProject = (
    projectId: string,
    x: number,
    y: number,
    returnFocus: HTMLButtonElement | null,
  ) => setMenu({ kind: "project", projectId, x, y, returnFocus });

  return (
    <MenuContext.Provider
      value={{
        activeThreadId: menu?.kind === "thread" ? menu.threadId : null,
        activeProjectId: menu?.kind === "project" ? menu.projectId : null,
        openThread,
        openProject,
      }}
    >
      {children}
      {menu?.kind === "thread" ? (
        <RowMenu menu={menu} onClose={() => setMenu(null)} />
      ) : null}
      {menu?.kind === "project" ? (
        <ProjectMenu menu={menu} onClose={() => setMenu(null)} />
      ) : null}
    </MenuContext.Provider>
  );
}

function useMenu() {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error("useMenu outside MenuProvider");
  return ctx;
}

function focusableItems(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
  );
}

function clampStyle(x: number, y: number, width: number, height: number) {
  return {
    left: Math.max(4, Math.min(x, window.innerWidth - width)),
    top: Math.max(4, Math.min(y, window.innerHeight - height)),
  };
}

const menuItemClass =
  "w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent focus:bg-accent focus:outline-none";

function MenuShell({
  label,
  menu,
  onClose,
  children,
}: {
  label: string;
  menu: MenuState;
  onClose: () => void;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) focusableItems(containerRef.current).at(0)?.focus();
  }, [menu.kind, menu.kind === "thread" ? menu.threadId : menu.projectId]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = focusableItems(event.currentTarget);
    const current = items.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    if (event.key === "Home") items[0]?.focus();
    else if (event.key === "End") items.at(-1)?.focus();
    else if (event.key === "ArrowDown")
      items[(current + 1 + items.length) % items.length]?.focus();
    else items[(current - 1 + items.length) % items.length]?.focus();
  };

  return (
    <div
      ref={containerRef}
      role="menu"
      aria-label={label}
      className="fixed z-50 min-w-40 rounded-md border border-border bg-popover p-1 shadow-lg"
      style={clampStyle(menu.x, menu.y, 196, 260)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}

function RowMenu({
  menu,
  onClose,
}: {
  menu: Extract<MenuState, { kind: "thread" }>;
  onClose: () => void;
}) {
  const actions = experimental_useSidebarThreadActions();
  const { threads: allThreads } = experimental_useSidebarThreads();
  const thread = allThreads.find((t) => t.id === menu.threadId);

  if (!thread) return null;
  const title = threadTitle(thread);

  return (
    <MenuShell
      label={`Actions for ${title}`}
      menu={menu}
      onClose={onClose}
    >
      <button
        type="button"
        role="menuitem"
        className={menuItemClass}
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
        className={menuItemClass}
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
        className={menuItemClass}
        onClick={() => {
          const nextTitle = window.prompt("Rename thread", title);
          if (nextTitle?.trim()) void actions.rename(thread.id, nextTitle.trim());
          onClose();
        }}
      >
        Rename…
      </button>
      <button
        type="button"
        role="menuitem"
        className={menuItemClass}
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
        className={menuItemClass}
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
        className={`${menuItemClass} text-destructive`}
        onClick={() => {
          actions.requestDelete(thread.id);
          onClose();
        }}
      >
        Delete…
      </button>
    </MenuShell>
  );
}

function ProjectMenu({
  menu,
  onClose,
}: {
  menu: Extract<MenuState, { kind: "project" }>;
  onClose: () => void;
}) {
  const actions = experimental_useSidebarThreadActions();
  const rpc = useRpc<typeof rpcContract>();
  const { projects: allProjects } = experimental_useSidebarThreads();
  const project = allProjects.find((p) => p.id === menu.projectId);

  if (!project) return null;
  const projectName = project.name;

  return (
    <MenuShell
      label={`Project actions for ${projectName}`}
      menu={menu}
      onClose={onClose}
    >
      <button
        type="button"
        role="menuitem"
        className={menuItemClass}
        onClick={() => {
          actions.openNewThread({ projectId: project.id });
          onClose();
        }}
      >
        New thread
      </button>
      <button
        type="button"
        role="menuitem"
        className={menuItemClass}
        onClick={() => {
          const nextName = window.prompt("Rename project", projectName);
          if (nextName?.trim()) {
            void rpc
              .call("renameProject", { projectId: project.id, name: nextName.trim() })
              .catch(() => undefined);
          }
          onClose();
        }}
      >
        Rename…
      </button>
      <button
        type="button"
        role="menuitem"
        className={menuItemClass}
        onClick={() => {
          void rpc
            .call("archiveAllThreads", { projectId: project.id })
            .catch(() => undefined);
          onClose();
        }}
      >
        Archive all threads
      </button>
      <div className="my-1 h-px bg-border" role="separator" />
      <button
        type="button"
        role="menuitem"
        className={`${menuItemClass} text-destructive`}
        onClick={() => {
          if (window.confirm(`Delete project "${projectName}"?`)) {
            void rpc
              .call("deleteProject", { projectId: project.id })
              .catch(() => undefined);
          }
          onClose();
        }}
      >
        Delete project…
      </button>
    </MenuShell>
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
