import { getMeetingById } from "../../storage/meetingsStore.js";
import { emailAdapter } from "../integrations/adapters/email/emailAdapter.js";
import { jiraAdapter } from "../integrations/adapters/jira/jiraAdapter.js";
import type { ExecutionRunRequest, ExecutionRunResult, CanonicalExecutionPayload, DestinationValidationResult } from "./types.js";
import { ExecutionAdapterRegistry } from "./adapterRegistry.js";
import { executionProfileService } from "./executionProfileService.js";
import { ExecutionError } from "./errors.js";

const adapterRegistry = new ExecutionAdapterRegistry();
adapterRegistry.register(emailAdapter);
adapterRegistry.register(jiraAdapter);

export const executionService = {
  async buildPayloadForMeeting(meetingId: string, profile: string): Promise<CanonicalExecutionPayload> {
    const meetingDetail = await getMeetingById(meetingId);
    if (!meetingDetail) {
      throw new ExecutionError("Meeting not found", { code: "meeting_not_found", status: 404 });
    }

    const normalizedProfile = executionProfileService.normalize(profile);
    return executionProfileService.buildCanonicalPayload(meetingDetail, normalizedProfile);
  },

  async scan(request: ExecutionRunRequest): Promise<DestinationValidationResult> {
    const payload = await this.buildPayloadForMeeting(request.meetingId, request.profile);
    const adapter = adapterRegistry.get(request.target);
    return adapter.scan(payload, request.target);
  },

  async export(request: ExecutionRunRequest): Promise<ExecutionRunResult> {
    const payload = await this.buildPayloadForMeeting(request.meetingId, request.profile);
    const adapter = adapterRegistry.get(request.target);
    const result = await adapter.export(payload, request.target);

    return {
      destination: request.target.destination,
      profile: payload.profile,
      result,
    };
  },
};
