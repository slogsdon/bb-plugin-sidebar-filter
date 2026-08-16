import { createRequire as __createRequire } from "node:module";
import { dirname as __pathDirname } from "node:path";
import { fileURLToPath as __fileURLToPath } from "node:url";
const require = __createRequire(import.meta.url);
var __filename = __fileURLToPath(import.meta.url);
var __dirname = __pathDirname(__filename);

// server.ts
async function plugin(bb) {
  bb.settings.define({
    hideEmptyProjects: {
      type: "boolean",
      label: "Hide projects without active threads",
      default: true
    },
    activeMode: {
      type: "select",
      label: "A thread counts as active when",
      options: ["exists", "running"],
      default: "exists"
    }
  });
  bb.log.info("loaded");
  bb.onDispose(() => {
    bb.log.info("disposed");
  });
}
export {
  plugin as default
};
//# sourceMappingURL=server.js.map
