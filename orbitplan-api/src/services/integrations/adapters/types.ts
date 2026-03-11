import type { JiraExportResult } from "../../../types/jira.js";
import type {
  CanonicalExecutionPayload,
  DestinationValidationResult,
  ExecutionDestination,
  ExecutionTarget,
} from "../../execution/types.js";

export interface ExecutionAdapter<
  TDestination extends ExecutionDestination = ExecutionDestination,
  TTarget extends ExecutionTarget = ExecutionTarget,
  TResult = JiraExportResult | unknown,
> {
  readonly destination: TDestination;
  scan(payload: CanonicalExecutionPayload, target: TTarget): Promise<DestinationValidationResult>;
  export(payload: CanonicalExecutionPayload, target: TTarget): Promise<TResult>;
}
