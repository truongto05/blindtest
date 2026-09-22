export type PublicProfile = {
  id: string;
  displayName: string;
  friendCode: string;
  createdAt: string;
};

export type AccountData = {
  profile: PublicProfile | null;
  libraryOwnerId?: string;
};
export type FriendRequest = {
  id: string;
  profile: PublicProfile;
  createdAt: string;
};
export type FriendsData = {
  friends: PublicProfile[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
};
export type RoomInvitation = {
  id: string;
  profile: PublicProfile;
  roomCode: string;
  expiresAt: string;
};
