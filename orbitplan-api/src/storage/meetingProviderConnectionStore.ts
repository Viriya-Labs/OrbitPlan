import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import type { MeetingProvider } from "../types/meeting.js";
import type { MeetingProviderOAuthToken } from "../types/meetingProvider.js";

const mapToken = (record: {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scope: string | null;
  externalUserId: string | null;
  externalEmail: string | null;
  metadata: unknown;
}): MeetingProviderOAuthToken => ({
  accessToken: record.accessToken,
  refreshToken: record.refreshToken ?? undefined,
  expiresAt: record.expiresAt.toISOString(),
  scope: record.scope ?? undefined,
  externalUserId: record.externalUserId ?? undefined,
  externalEmail: record.externalEmail ?? undefined,
  metadata: typeof record.metadata === "object" && record.metadata ? (record.metadata as Record<string, unknown>) : undefined,
});

export const getMeetingProviderToken = async (
  provider: MeetingProvider,
  userId: string,
): Promise<MeetingProviderOAuthToken | null> => {
  const token = await prisma.meetingProviderConnection.findUnique({
    where: {
      provider_userId: {
        provider,
        userId,
      },
    },
  });

  return token ? mapToken(token) : null;
};

export const saveMeetingProviderToken = async (
  provider: MeetingProvider,
  userId: string,
  token: MeetingProviderOAuthToken,
) => {
  await prisma.meetingProviderConnection.upsert({
    where: {
      provider_userId: {
        provider,
        userId,
      },
    },
    update: {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken ?? null,
      expiresAt: new Date(token.expiresAt),
      scope: token.scope ?? null,
      externalUserId: token.externalUserId ?? null,
      externalEmail: token.externalEmail ?? null,
      metadata: token.metadata as Prisma.InputJsonValue | undefined,
    },
    create: {
      provider,
      userId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken ?? null,
      expiresAt: new Date(token.expiresAt),
      scope: token.scope ?? null,
      externalUserId: token.externalUserId ?? null,
      externalEmail: token.externalEmail ?? null,
      metadata: token.metadata as Prisma.InputJsonValue | undefined,
    },
  });
};

export const clearMeetingProviderToken = async (provider: MeetingProvider, userId: string) => {
  await prisma.meetingProviderConnection.deleteMany({
    where: {
      provider,
      userId,
    },
  });
};
