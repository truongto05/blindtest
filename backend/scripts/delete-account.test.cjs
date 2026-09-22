const { test } = require("node:test");
const assert = require("node:assert/strict");
const { eraseAccount } = require("./delete-account.cjs");
const id = "11111111-1111-4111-8111-111111111111";
const fixture = () => {
  const operations = [];
  const prisma = {
    accountProfile: {
      findUnique: async (args) => {
        assert.deepEqual(args, { where: { id } });
        return { id, libraryOwnerId: "private-library" };
      },
      delete: async (args) => operations.push(["profile", args]),
    },
    playlist: {
      count: async () => 3,
      deleteMany: async (args) => operations.push(["playlists", args]),
    },
    $transaction: async (action) => action(prisma),
  };
  return {
    prisma,
    operations,
    removeIdentity: async (value) => operations.push(["auth", value]),
  };
};
test("dry-run has no writes or auth deletion", async () => {
  const fixtureData = fixture();
  assert.equal((await eraseAccount({ id, ...fixtureData })).dryRun, true);
  assert.deepEqual(fixtureData.operations, []);
});
test("rejects ambiguous identity or confirmation before any action", async () => {
  const fixtureData = fixture();
  await assert.rejects(
    eraseAccount({ id: "all", confirm: "all", ...fixtureData }),
  );
  await assert.rejects(
    eraseAccount({
      id,
      confirm: "22222222-2222-4222-8222-222222222222",
      ...fixtureData,
    }),
  );
  assert.deepEqual(fixtureData.operations, []);
});
test("deletes only the resolved library then its profile after Auth", async () => {
  const fixtureData = fixture();
  await eraseAccount({ id, confirm: id, ...fixtureData });
  assert.deepEqual(fixtureData.operations, [
    ["auth", id],
    ["playlists", { where: { ownerId: "private-library" } }],
    ["profile", { where: { id } }],
  ]);
});
test("Auth failure preserves all application data for retry", async () => {
  const fixtureData = fixture();
  await assert.rejects(
    eraseAccount({
      id,
      confirm: id,
      ...fixtureData,
      removeIdentity: async () => {
        throw new Error("offline");
      },
    }),
  );
  assert.deepEqual(fixtureData.operations, []);
});
