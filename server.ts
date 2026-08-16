// bb-plugin-sidebar-filter — backend entry.
//
// The list itself is pure frontend (the host's sidebar cache); the backend
// only declares the filter settings rendered in Extensions → Plugins and
// editable via `bb plugin config sidebar-filter`.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

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

  bb.log.info("loaded");

  bb.onDispose(() => {
    bb.log.info("disposed");
  });
}