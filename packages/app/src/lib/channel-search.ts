type SearchableChannel = {
  lastMessage: string | null;
  name: string;
};

export function matchingChannels<T extends SearchableChannel>(
  channels: T[] | undefined,
  query: string,
): T[] {
  if (!channels) {
    return [];
  }
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return channels;
  }
  return channels.filter((channel) =>
    [channel.name, channel.lastMessage].some((field) => field?.toLowerCase().includes(needle)),
  );
}
