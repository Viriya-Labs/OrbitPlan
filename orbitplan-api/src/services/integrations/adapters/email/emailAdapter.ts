import type { ExecutionAdapter } from "../types.js";
import type { DestinationValidationResult, EmailExecutionResult, CanonicalExecutionPayload, EmailExecutionTarget } from "../../../execution/types.js";
import { emailExportService } from "./emailExportService.js";
import { emailScanService } from "./emailScanService.js";

export const emailAdapter: ExecutionAdapter<"email", EmailExecutionTarget, EmailExecutionResult> = {
  destination: "email",

  async scan(payload: CanonicalExecutionPayload, target: EmailExecutionTarget): Promise<DestinationValidationResult> {
    return emailScanService.scan(payload, target);
  },

  async export(payload: CanonicalExecutionPayload, target: EmailExecutionTarget): Promise<EmailExecutionResult> {
    return emailExportService.export(payload, target);
  },
};
