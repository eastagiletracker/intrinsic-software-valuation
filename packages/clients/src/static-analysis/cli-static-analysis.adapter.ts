import type {
  SccResult,
  JscpdResult,
  KnipResult,
  StaticAnalysisPort,
} from "./port.js";
import { runScc } from "./scc-adapter.js";
import { runJscpd } from "./jscpd-adapter.js";
import { runKnip } from "./knip-adapter.js";

/**
 * CLI-based implementation of `StaticAnalysisPort`.
 *
 * Delegates to individual tool adapters (scc, jscpd, knip) that wrap
 * their respective CLI tools via `execa`.
 */
export class CliStaticAnalysisAdapter implements StaticAnalysisPort {
  async scc(directory: string): Promise<SccResult> {
    return runScc(directory);
  }

  async jscpd(directory: string): Promise<JscpdResult> {
    return runJscpd(directory);
  }

  async knip(directory: string): Promise<KnipResult> {
    return runKnip(directory);
  }
}
