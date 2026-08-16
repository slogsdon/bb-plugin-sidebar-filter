// bb-plugin-runtime-shim:react
var runtime = globalThis.__bbPluginRuntime;
if (runtime == null || runtime.react == null) {
  throw new Error('Cannot load "react": this bundle must be loaded by the BB app, which provides the shared plugin runtime (globalThis.__bbPluginRuntime).');
}
var mod = runtime.react;
var {
  Activity,
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  Suspense,
  act,
  cache,
  cacheSignal,
  captureOwnerStack,
  cloneElement,
  createContext,
  createElement,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  unstable_useCacheRefresh,
  use,
  useActionState,
  useCallback,
  useContext,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  version
} = mod;

// bb-plugin-runtime-shim:@get-bb/plugin-sdk/app
var runtime2 = globalThis.__bbPluginRuntime;
if (runtime2 == null || runtime2.pluginSdkApp == null) {
  throw new Error('Cannot load "@get-bb/plugin-sdk/app": this bundle must be loaded by the BB app, which provides the shared plugin runtime (globalThis.__bbPluginRuntime).');
}
var mod2 = runtime2.pluginSdkApp;
var {
  Markdown,
  ThreadChat,
  definePluginApp,
  experimental_NewThreadComposer,
  experimental_useSidebarThreadActions,
  experimental_useSidebarThreadPullRequest,
  experimental_useSidebarThreadSplit,
  experimental_useSidebarThreads,
  useBbContext,
  useBbNavigate,
  useComposer,
  useComposerView,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
  useSettings
} = mod2;

// bb-plugin-runtime-shim:react/jsx-runtime
var runtime3 = globalThis.__bbPluginRuntime;
if (runtime3 == null || runtime3.jsxRuntime == null) {
  throw new Error('Cannot load "react/jsx-runtime": this bundle must be loaded by the BB app, which provides the shared plugin runtime (globalThis.__bbPluginRuntime).');
}
var mod3 = runtime3.jsxRuntime;
var {
  Fragment: Fragment2,
  jsx,
  jsxs
} = mod3;

// app.tsx
var COLLAPSED_KEY = "bb-plugin-sidebar-filter.collapsed-projects";
function activityRunning(thread) {
  const a = thread.activity;
  return a.workflows + a.backgroundAgents + a.backgroundCommands + a.planMode + a.goals > 0;
}
function isActiveThread(thread, mode) {
  if (mode === "running") {
    return thread.indicator === "runtime" || activityRunning(thread);
  }
  return !thread.isArchived;
}
function matchesQuery(thread, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${thread.title ?? ""} ${thread.titleFallback ?? ""}`.toLowerCase().includes(q);
}
function statusDotClass(thread) {
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
function statusDotAria(thread) {
  return thread.indicatorLabel ?? (thread.isUnread ? "Unread" : "Idle");
}
function threadTitle(thread) {
  return thread.title ?? thread.titleFallback ?? "Untitled";
}
function FilteredProjectList(props) {
  const { status, threads, projects } = experimental_useSidebarThreads();
  const actions = experimental_useSidebarThreadActions();
  const { values } = useSettings();
  const hideEmpty = (values?.hideEmptyProjects ?? true) !== false;
  const activeMode = values?.activeMode === "running" ? "running" : "exists";
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY);
      return raw ? new Set(JSON.parse(raw)) : /* @__PURE__ */ new Set();
    } catch {
      return /* @__PURE__ */ new Set();
    }
  });
  const toggleCollapsed = (projectId) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
      }
      return next;
    });
  };
  const pinned = useMemo(
    () => threads.filter(
      (t) => t.isPinned && !t.isArchived && matchesQuery(t, props.searchQuery)
    ).sort((a, b) => b.updatedAt - a.updatedAt),
    [threads, props.searchQuery]
  );
  const { projectsWithThreads, byProject } = useMemo(() => {
    const groups = /* @__PURE__ */ new Map();
    for (const project of projects) groups.set(project.id, []);
    for (const thread of threads) {
      if (thread.isPinned) continue;
      if (!isActiveThread(thread, activeMode)) continue;
      if (!matchesQuery(thread, props.searchQuery)) continue;
      const list = groups.get(thread.projectId);
      if (list === void 0) continue;
      list.push(thread);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    const visible = projects.filter(
      (p) => !hideEmpty || (groups.get(p.id)?.length ?? 0) > 0
    );
    return { projectsWithThreads: visible, byProject: groups };
  }, [projects, threads, activeMode, hideEmpty, props.searchQuery]);
  if (status === "loading") {
    return /* @__PURE__ */ jsxs("div", { className: "space-y-2 p-2", role: "status", "aria-label": "Loading threads", children: [
      /* @__PURE__ */ jsx("div", { className: "h-4 w-3/4 rounded-sm bg-sidebar-border/50" }),
      /* @__PURE__ */ jsx("div", { className: "h-4 w-2/3 rounded-sm bg-sidebar-border/50" }),
      /* @__PURE__ */ jsx("div", { className: "h-4 w-1/2 rounded-sm bg-sidebar-border/50" })
    ] });
  }
  if (status === "error") {
    return /* @__PURE__ */ jsx("div", { className: "p-3 text-xs text-muted-foreground", children: "Threads are unavailable right now." });
  }
  return /* @__PURE__ */ jsxs(RowMenuProvider, { children: [
    pinned.length > 0 ? /* @__PURE__ */ jsxs("section", { className: "space-y-0.5 py-1", "aria-label": "Pinned threads", children: [
      /* @__PURE__ */ jsx("div", { className: "px-2 pb-0.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-subtle-foreground/70", children: "Pinned" }),
      pinned.map((thread) => /* @__PURE__ */ jsx(
        ThreadRow,
        {
          thread,
          activeThreadId: props.activeThreadId,
          isCompactViewport: props.isCompactViewport,
          onNavigate: props.onNavigate
        },
        thread.id
      ))
    ] }) : null,
    /* @__PURE__ */ jsx("section", { className: "space-y-0.5 py-1", "aria-label": "Projects", children: projectsWithThreads.length === 0 ? /* @__PURE__ */ jsx("div", { className: "px-2 py-3 text-xs text-subtle-foreground/60", children: "No projects with active threads." }) : projectsWithThreads.map((project) => /* @__PURE__ */ jsx(
      ProjectGroup,
      {
        project,
        threads: byProject.get(project.id) ?? [],
        isCollapsed: collapsed.has(project.id),
        onToggleCollapsed: () => toggleCollapsed(project.id),
        activeThreadId: props.activeThreadId,
        activeProjectId: props.activeProjectId,
        isCompactViewport: props.isCompactViewport,
        onNavigate: props.onNavigate
      },
      project.id
    )) })
  ] });
}
function ProjectGroup({
  project,
  threads,
  isCollapsed,
  onToggleCollapsed,
  activeThreadId,
  activeProjectId,
  isCompactViewport,
  onNavigate
}) {
  const actions = experimental_useSidebarThreadActions();
  const isActiveProject = project.id === activeProjectId;
  const handleNewThread = () => actions.openNewThread({ projectId: project.id });
  return /* @__PURE__ */ jsxs("div", { className: "group/project", children: [
    /* @__PURE__ */ jsxs(
      "div",
      {
        className: `flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-sm ${isActiveProject ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent/50"}`,
        children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: onToggleCollapsed,
              "aria-expanded": !isCollapsed,
              "aria-label": `${isCollapsed ? "Expand" : "Collapse"} project ${project.name}`,
              className: "flex min-w-0 shrink-0 items-center justify-center rounded p-0.5 text-subtle-foreground hover:text-foreground",
              children: /* @__PURE__ */ jsx(
                "span",
                {
                  "aria-hidden": "true",
                  className: `inline-block text-[10px] leading-none transition-transform ${isCollapsed ? "-rotate-90" : ""}`,
                  children: "\u25B8"
                }
              )
            }
          ),
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: onToggleCollapsed,
              className: "min-w-0 flex-1 truncate text-left font-medium",
              title: project.name,
              children: [
                project.name,
                threads.length > 0 ? /* @__PURE__ */ jsx("span", { className: "ml-1.5 text-xs font-normal text-subtle-foreground/70", children: threads.length }) : null
              ]
            }
          ),
          !isCompactViewport ? /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: handleNewThread,
              "aria-label": `New thread in ${project.name}`,
              title: "New thread in this project",
              className: "rounded p-0.5 text-subtle-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/project:opacity-100",
              children: [
                "+",
                /* @__PURE__ */ jsx("span", { className: "sr-only", children: "New thread" })
              ]
            }
          ) : null
        ]
      }
    ),
    !isCollapsed ? /* @__PURE__ */ jsx("div", { className: "mt-px space-y-px", children: threads.length === 0 ? /* @__PURE__ */ jsx("div", { className: "px-2 py-1 text-xs text-subtle-foreground/50", children: "No matching threads" }) : threads.map((thread) => /* @__PURE__ */ jsx(
      ThreadRow,
      {
        thread,
        activeThreadId,
        isCompactViewport,
        onNavigate
      },
      thread.id
    )) }) : null
  ] });
}
function ThreadRow({
  thread,
  activeThreadId,
  isCompactViewport,
  onNavigate
}) {
  const actions = experimental_useSidebarThreadActions();
  const { splitProps, isAvailable } = experimental_useSidebarThreadSplit(
    thread.id
  );
  const openMenu = useRowMenu();
  const isActive = thread.id === activeThreadId;
  const title = threadTitle(thread);
  const secondary = thread.environment?.branchName ?? thread.host?.name ?? null;
  const handleOpen = (event) => {
    event.preventDefault();
    actions.open(thread.id);
    onNavigate();
  };
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `group/row relative rounded-md ${isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"}`,
      onContextMenu: (event) => {
        event.preventDefault();
        openMenu.open(thread.id, event.clientX, event.clientY, null);
      },
      children: [
        /* @__PURE__ */ jsxs(
          "a",
          {
            "data-sidebar-thread-shortcut-target": "",
            "data-sidebar-thread-id": thread.id,
            href: "#",
            onClick: handleOpen,
            onAuxClick: (event) => {
              if (event.button === 1) {
                event.preventDefault();
                actions.open(thread.id, { split: true });
                onNavigate();
              }
            },
            title: `${title} \u2014 ${statusDotAria(thread)}`,
            className: `flex min-w-0 items-center gap-2 rounded-md py-1 pl-2 pr-8 text-sm ${thread.isUnread && !isActive ? "font-medium text-foreground" : "text-muted-foreground"}`,
            children: [
              /* @__PURE__ */ jsx(
                "span",
                {
                  "aria-hidden": "true",
                  className: `size-1.5 shrink-0 rounded-full ${statusDotClass(thread)}`
                }
              ),
              /* @__PURE__ */ jsx("span", { className: "min-w-0 flex-1 truncate", children: title }),
              isAvailable && !isCompactViewport ? /* @__PURE__ */ jsx(
                "span",
                {
                  ...splitProps,
                  "aria-hidden": "true",
                  className: "shrink-0 text-[10px] text-subtle-foreground/50 opacity-0 transition-opacity group-hover/row:opacity-100",
                  children: "\u2922"
                }
              ) : null,
              secondary && !isCompactViewport ? /* @__PURE__ */ jsx("span", { className: "shrink-0 max-w-28 truncate text-[11px] text-subtle-foreground/60", children: secondary }) : null
            ]
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            "aria-label": `Actions for ${title}`,
            "aria-haspopup": "menu",
            "aria-expanded": openMenu.activeThreadId === thread.id,
            title: "Thread actions",
            onClick: (event) => {
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              openMenu.open(thread.id, rect.right, rect.bottom, event.currentTarget);
            },
            className: `absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-base leading-none text-subtle-foreground transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 ${isCompactViewport || isActive ? "opacity-100" : "opacity-0 group-hover/row:opacity-100"}`,
            children: /* @__PURE__ */ jsx("span", { "aria-hidden": "true", children: "\u22EF" })
          }
        )
      ]
    }
  );
}
var RowMenuContext = createContext(null);
function RowMenuProvider({ children }) {
  const [menu, setMenu] = useState(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (event) => {
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
  const open = (threadId, x, y, returnFocus) => setMenu({ threadId, x, y, returnFocus });
  return /* @__PURE__ */ jsxs(
    RowMenuContext.Provider,
    {
      value: { activeThreadId: menu?.threadId ?? null, open },
      children: [
        children,
        menu ? /* @__PURE__ */ jsx(RowMenu, { menu, onClose: () => setMenu(null) }) : null
      ]
    }
  );
}
function useRowMenu() {
  const ctx = useContext(RowMenuContext);
  if (!ctx) throw new Error("useRowMenu outside RowMenuProvider");
  return ctx;
}
function RowMenu({
  menu,
  onClose
}) {
  const actions = experimental_useSidebarThreadActions();
  const { threads: allThreads } = experimental_useSidebarThreads();
  const thread = allThreads.find((t) => t.id === menu.threadId);
  const firstItemRef = useRef(null);
  useEffect(() => {
    firstItemRef.current?.focus();
  }, [menu.threadId]);
  if (!thread) return null;
  const itemClass = "w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent focus:bg-accent focus:outline-none";
  const style = {
    left: Math.max(4, Math.min(menu.x, window.innerWidth - 196)),
    top: Math.max(4, Math.min(menu.y, window.innerHeight - 260))
  };
  const handleMenuKeyDown = (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(
      event.currentTarget.querySelectorAll(
        '[role="menuitem"]'
      )
    );
    const current = items.indexOf(document.activeElement);
    if (event.key === "Home") items[0]?.focus();
    else if (event.key === "End") items.at(-1)?.focus();
    else if (event.key === "ArrowDown")
      items[(current + 1 + items.length) % items.length]?.focus();
    else items[(current - 1 + items.length) % items.length]?.focus();
  };
  return /* @__PURE__ */ jsxs(
    "div",
    {
      role: "menu",
      "aria-label": `Actions for ${threadTitle(thread)}`,
      className: "fixed z-50 min-w-40 rounded-md border border-border bg-popover p-1 shadow-lg",
      style,
      onClick: (event) => event.stopPropagation(),
      onKeyDown: handleMenuKeyDown,
      children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            ref: firstItemRef,
            type: "button",
            role: "menuitem",
            className: itemClass,
            onClick: () => {
              void actions.setPinned(thread.id, !thread.isPinned);
              onClose();
            },
            children: thread.isPinned ? "Unpin" : "Pin"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            role: "menuitem",
            className: itemClass,
            onClick: () => {
              void actions.setRead(thread.id, thread.isUnread);
              onClose();
            },
            children: thread.isUnread ? "Mark as read" : "Mark as unread"
          }
        ),
        /* @__PURE__ */ jsx("div", { className: "my-1 h-px bg-border", role: "separator" }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            role: "menuitem",
            className: itemClass,
            onClick: () => {
              const nextTitle = window.prompt("Rename thread", threadTitle(thread));
              if (nextTitle?.trim()) void actions.rename(thread.id, nextTitle.trim());
              onClose();
            },
            children: "Rename\u2026"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            role: "menuitem",
            className: itemClass,
            onClick: () => {
              void navigator.clipboard?.writeText(thread.id).catch(() => void 0);
              onClose();
            },
            children: "Copy thread ID"
          }
        ),
        /* @__PURE__ */ jsx("div", { className: "my-1 h-px bg-border", role: "separator" }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            role: "menuitem",
            className: itemClass,
            onClick: () => {
              actions.archive(thread.id);
              onClose();
            },
            children: "Archive"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            role: "menuitem",
            className: `${itemClass} text-destructive`,
            onClick: () => {
              actions.requestDelete(thread.id);
              onClose();
            },
            children: "Delete\u2026"
          }
        )
      ]
    }
  );
}
var app_default = definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "project-filter",
    title: "Sidebar Project Filter",
    description: "Project-grouped thread list that hides projects without active threads.",
    component: FilteredProjectList
  });
});
export {
  app_default as default
};
