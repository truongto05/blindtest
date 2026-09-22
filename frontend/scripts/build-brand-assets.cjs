// Run from any directory: node frontend/scripts/build-brand-assets.cjs
const { readFile, stat } = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const publicDirectory = path.resolve(__dirname, "../public");
const accent = "#d1ed62";
const ink = "#171515";
const svgUrl = (source) =>
  `data:image/svg+xml;base64,${Buffer.from(source).toString("base64")}`;

function socialCard(icon, font) {
  return `<!doctype html><html lang="fr"><head><style>
    @font-face {font-family:Unbounded;src:url(data:font/woff2;base64,${font.toString("base64")}) format('woff2');font-weight:400 900;}
    *{box-sizing:border-box} html,body{margin:0;width:1200px;height:630px;overflow:hidden}
    body{padding:64px 76px;color:#f3f4ee;background:${ink};font:24px Arial,sans-serif}
    header{display:flex;align-items:center;gap:22px;font:800 46px Unbounded,Arial,sans-serif;letter-spacing:-3px}
    header img{width:78px;height:78px}
    h1{margin:58px 0 22px;font:800 68px/1.22 Unbounded,Arial,sans-serif;letter-spacing:-3px;word-spacing:3px}
    h1 span{color:${accent}} p{margin:0;color:#bdb4ae}
    footer{position:absolute;left:76px;right:76px;bottom:50px;border-top:1px solid #494039;padding-top:25px;display:flex;justify-content:space-between;align-items:center;color:#bdb4ae;font-size:20px}
    .signal{display:flex;align-items:end;gap:7px}.signal i{display:block;width:11px;height:20px;background:#ed987f;transform:skewX(-12deg)}.signal i:nth-child(2){height:32px;background:#8ed8d0}.signal i:last-child{height:44px;background:${accent}}
  </style></head><body><header><img alt="" src="${svgUrl(icon)}"/>Pulse</header><h1>Reconnais le son.<br/><span>Avant les autres.</span></h1><p>Le blind test à jouer seul ou entre amis.</p><footer><span>blindtest-tt.vercel.app</span><span class="signal"><i></i><i></i><i></i></span></footer></body></html>`;
}

async function main() {
  const icon = await readFile(
    path.join(publicDirectory, "pulse-icon.svg"),
    "utf8",
  );
  const font = await readFile(
    path.join(publicDirectory, "fonts/unbounded-latin.woff2"),
  );
  const assets = [
    { name: "pulse-icon-192.png", width: 192, height: 192, source: icon },
    { name: "pulse-icon-512.png", width: 512, height: 512, source: icon },
    {
      name: "pulse-maskable-512.png",
      width: 512,
      height: 512,
      source: icon,
      background: accent,
    },
    {
      name: "apple-touch-icon.png",
      width: 180,
      height: 180,
      source: icon,
      background: accent,
    },
    {
      name: "pulse-og.png",
      width: 1200,
      height: 630,
      html: socialCard(icon, font),
    },
  ];
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await page.route("**/*", (route) => route.abort());
    for (const asset of assets) {
      await page.setViewportSize({ width: asset.width, height: asset.height });
      await page.setContent(
        asset.html ||
          `<!doctype html><html lang="fr"><head><style>
        html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${asset.background || "transparent"}}
        img{display:block;width:100%;height:100%}
      </style></head><body><img id="asset" alt="" src="${svgUrl(asset.source)}"></body></html>`,
      );
      await page
        .locator("img")
        .evaluateAll((images) =>
          Promise.all(images.map((image) => image.decode())),
        );
      await page.evaluate(() => document.fonts.ready);
      const file = path.join(publicDirectory, asset.name);
      await page.screenshot({ path: file, omitBackground: !asset.background });
      const png = await readFile(file);
      const width = png.readUInt32BE(16);
      const height = png.readUInt32BE(20);
      if (width !== asset.width || height !== asset.height)
        throw new Error(`Unexpected dimensions for ${asset.name}`);
      const { size } = await stat(file);
      console.info(
        `${asset.name}: ${width} × ${height}, ${(size / 1024).toFixed(1)} KiB`,
      );
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Brand assets could not be generated.",
  );
  process.exitCode = 1;
});
