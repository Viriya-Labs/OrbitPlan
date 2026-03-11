import type { ExecutionDestination, ExecutionTarget } from "./types.js";
import type { ExecutionAdapter } from "../integrations/adapters/types.js";
import { ExecutionError } from "./errors.js";

export class ExecutionAdapterRegistry {
  private readonly adapters = new Map<ExecutionDestination, ExecutionAdapter>();

  register(adapter: ExecutionAdapter) {
    this.adapters.set(adapter.destination, adapter);
  }

  get(target: ExecutionTarget): ExecutionAdapter {
    const adapter = this.adapters.get(target.destination);
    if (!adapter) {
      throw new ExecutionError(`No execution adapter registered for destination "${target.destination}".`, {
        code: "adapter_not_registered",
        status: 501,
      });
    }
    return adapter;
  }
}
