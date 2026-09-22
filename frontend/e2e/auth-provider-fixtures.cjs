// Only the isolated test command loads this file; never a production entrypoint.
if (
  process.env.NODE_ENV !== "test" ||
  !/^pulse_e2e_[a-f0-9]{16}$/.test(process.env.PULSE_E2E_SCHEMA || "") ||
  process.env.SUPABASE_URL !== "https://pulse-auth.test"
) {
  throw new Error("Les fixtures Auth nécessitent le serveur E2E isolé.");
}
const nock = require("../../backend/node_modules/nock");
nock("https://pulse-auth.test")
  .persist()
  .get("/auth/v1/user")
  .reply(function () {
    const header = this.req.headers.authorization || "";
    try {
      const [_, payload, signature] = header.replace(/^Bearer /, "").split(".");
      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
      if (
        signature !== "pulse_e2e_signature" ||
        decoded.iss !== "pulse-e2e" ||
        decoded.exp < Date.now() / 1000 ||
        !/^[0-9a-f-]{36}$/.test(decoded.sub)
      )
        throw new Error("fixture token");
      return [
        200,
        {
          id: decoded.sub,
          email: `${decoded.sub}@pulse.test`,
          email_confirmed_at: "2026-01-01T00:00:00Z",
          is_anonymous: false,
          role: "authenticated",
        },
      ];
    } catch {
      return [401, { message: "Invalid fixture session" }];
    }
  });
