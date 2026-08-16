// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import {
  loadPluginApp,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";
import type {
  PluginSidebarProject,
  PluginSidebarThread,
  PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

const project: PluginSidebarProject = {
  id: "project-1",
  name: "Sidebar Filter",
  isPersonal: false,
};

const thread: PluginSidebarThread = {
  id: "thread-1",
  projectId: project.id,
  title: "Fix sidebar actions",
  titleFallback: null,
  parentThreadId: null,
  sectionId: null,
  originKind: null,
  originPluginId: null,
  providerId: "codex",
  hasPendingInteraction: false,
  activity: {
    workflows: 0,
    backgroundAgents: 0,
    backgroundCommands: 0,
    planMode: 0,
    goals: 0,
  },
  indicator: "none",
  indicatorLabel: null,
  isUnread: false,
  isPinned: false,
  isArchived: false,
  environment: null,
  host: null,
  createdAt: 1,
  updatedAt: 2,
  lastReadAt: 2,
  latestAttentionAt: 2,
};

const slotProps: PluginThreadListProps = {
  activeThreadId: null,
  activeProjectId: project.id,
  isCompactViewport: false,
  onNavigate: vi.fn(),
  searchQuery: "",
};

let threadList: Awaited<ReturnType<typeof loadPluginApp>>["threadLists"][number];

beforeAll(async () => {
  const app = await loadPluginApp(() => import("./app"));
  threadList = app.threadLists[0]!;
});

beforeEach(() => {
  vi.restoreAllMocks();
  const storage = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
});

afterEach(cleanup);

function renderThreadList() {
  return renderSlot(threadList, slotProps, {
    settings: { hideEmptyProjects: true, activeMode: "exists" },
    sidebarThreads: { status: "ready", projects: [project], threads: [thread] },
  });
}

describe("sidebar thread actions", () => {
  test("opens the row menu from a visible actions button", () => {
    const slot = renderThreadList();

    fireEvent.click(
      slot.getByRole("button", { name: "Actions for Fix sidebar actions" }),
    );

    expect(slot.getByRole("menu")).toBeTruthy();
    expect(slot.getByRole("menuitem", { name: "Archive" })).toBeTruthy();
    expect(slot.getByRole("menuitem", { name: "Delete…" })).toBeTruthy();
  });

  test("renames a thread through the host sidebar action", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("Renamed thread");
    const slot = renderThreadList();

    fireEvent.click(
      slot.getByRole("button", { name: "Actions for Fix sidebar actions" }),
    );
    fireEvent.click(slot.getByRole("menuitem", { name: "Rename…" }));

    await waitFor(() =>
      expect(slot.inspection.sidebarActionCalls).toContainEqual({
        method: "rename",
        threadId: thread.id,
        title: "Renamed thread",
      }),
    );
  });

  test("copies the thread id without opening the thread", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const slot = renderThreadList();

    fireEvent.contextMenu(
      slot.getByRole("link", { name: "Fix sidebar actions" }),
    );
    fireEvent.click(slot.getByRole("menuitem", { name: "Copy thread ID" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(thread.id));
    expect(slot.inspection.sidebarActionCalls).toEqual([]);
  });

  test("routes archive and delete through the host flows", () => {
    const slot = renderThreadList();
    const actionsButton = slot.getByRole("button", {
      name: "Actions for Fix sidebar actions",
    });

    fireEvent.click(actionsButton);
    fireEvent.click(slot.getByRole("menuitem", { name: "Archive" }));
    fireEvent.click(actionsButton);
    fireEvent.click(slot.getByRole("menuitem", { name: "Delete…" }));

    expect(slot.inspection.sidebarActionCalls).toEqual([
      { method: "archive", threadId: thread.id },
      { method: "requestDelete", threadId: thread.id },
    ]);
  });
});
