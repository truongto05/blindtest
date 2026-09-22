import type { BrowserContext } from "@playwright/test";

/** A decodable, silent WAV keeps browser playback real without external audio. */
export async function audioFixture(context: BrowserContext) {
  const sampleCount = 8000 * 3;
  const wav = Buffer.alloc(44 + sampleCount * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(sampleCount * 2, 40);
  await context.route("https://cdnt-preview.dzcdn.net/pulse-e2e/**", (route) =>
    route.fulfill({ contentType: "audio/wav", body: wav }),
  );
}
