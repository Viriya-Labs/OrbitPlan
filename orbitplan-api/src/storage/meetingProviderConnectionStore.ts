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

export const findMeetingProviderConnectionByExternalIdentifiers = async (
  provider: MeetingProvider,
  identifiers: string[],
): Promise<{ userId: string } | null> => {
  const values = identifiers.map((value) => value.trim()).filter(Boolean);
  if (values.length === 0) return null;

  const connections = await prisma.meetingProviderConnection.findMany({
    where: { provider },
    select: {
      userId: true,
      externalUserId: true,
      metadata: true,
    },
  });

  const wanted = new Set(values);
  for (const connection of connections) {
    const metadata =
      typeof connection.metadata === "object" && connection.metadata ? (connection.metadata as Record<string, unknown>) : {};
    const candidates = [
      connection.externalUserId,
      typeof metadata.zoomAccountId === "string" ? metadata.zoomAccountId : undefined,
      typeof metadata.zoomUserId === "string" ? metadata.zoomUserId : undefined,
    ].filter((value): value is string => Boolean(value));

    if (candidates.some((candidate) => wanted.has(candidate))) {
      return { userId: connection.userId };
    }
  }

  return null;
};
