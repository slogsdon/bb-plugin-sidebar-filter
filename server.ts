// bb-plugin-sidebar-filter — backend entry.
//
// The list itself is pure frontend (the host's sidebar cache); the backend
// only declares the filter settings rendered in Extensions → Plugins and
// editable via `bb plugin config sidebar-filter`.
//
// It also exposes a small RPC surface so the plugin's project ⋯ menu can
// drive the same host-owned project/thread mutations the built-in sidebar
// uses (rename, archive-all, delete).
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const rpcContract = defineRpcContract({
  renameProject: {
    input: z.object({ projectId: z.string(), name: z.string().min(1) }).strict(),
    output: z.object({ ok: z.boolean() }),
  },
  deleteProject: {
    input: z.object({ projectId: z.string() }).strict(),
    output: z.object({ ok: z.boolean() }),
  },
  archiveAllThreads: {
    input: z.object({ projectId: z.string() }).strict(),
    output: z.object({ ok: z.boolean() }),
  },
});

export default async function plugin(bb: BbPluginApi) {
  bb.settings.define({
    hideEmptyProjects: {
      type: "boolean",
      label: "Hide projects without active threads",
      default: true,
    },
    activeMode: {
      type: "select",
      label: "A thread counts as active when",
      options: ["exists", "running"],
      default: "exists",
    },
  });

  bb.rpc.register(rpcContract, {
    async renameProject({ projectId, name }) {
      await bb.sdk.projects.update({ projectId, name });
      return { ok: true };
    },
    async deleteProject({ projectId }) {
      await bb.sdk.projects.delete({ projectId });
      return { ok: true };
    },
    async archiveAllThreads({ projectId }) {
      // Archive every root thread in the project; `archive` cascades to each
      // thread's children, so the whole tree is archived.
      const roots = await bb.sdk.threads.list({
        projectId,
        archived: false,
        hasParent: false,
      });
      for (const thread of roots) {
        await bb.sdk.threads.archive({ threadId: thread.id });
      }
      return { ok: true };
    },
  });

  bb.log.info("loaded");

  bb.onDispose(() => {
    bb.log.info("disposed");
  });
}
