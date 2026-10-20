# Maa Verge Logo

主资源为 [logo.png](../apps/desktop/public/logo.png)，1024×1024 RGBA PNG。采用蓝色渐变圆角背景和帕拉斯头部的白色图形，保留双角、发型及玫瑰。角色参考为用户提供的《明日方舟》帕拉斯图片，图标风格参考 Clash Verge。

2026-10-21 按用户指定，通过 imagegen 技能的 CLI/API 模式调用 `gpt-image-2.5-flare`，使用图片编辑接口传入参考图。接口返回 1254×1254 图片；本地去除四角与外界连通的白色底，再缩放至 1024×1024。接口配置和密钥仅从本机读取，不保存到项目。

侧栏、启动页与浏览器图标直接使用主资源。桌面、安装包和托盘使用其衍生图标。运行以下命令可从主资源重新生成三个 PNG、ICO 和 ICNS，无需再次调用图片模型：

```sh
node tools/generate-icons.mjs
```

脚本使用项目已安装的 Tauri CLI，并对 ICNS 的独立尺寸条目排序，保持生成结果可重复。

## 本次生成的完整提示词

```text
Use case: logo-brand / style-transfer
Asset type: Maa Verge desktop application icon, one final square icon.
Reference image: the attached illustration is Pallas (帕拉斯) from Arknights. Use it as the identity reference, especially her swept bull horns, short layered bob with distinctive bangs, and the rose flower with leaves on the upper-left side. Remove the picture frame, hands, body, accessories and all scenery.

Create a refined, minimal app logo in the visual language of Clash Verge: a beautifully balanced white mascot silhouette centered on a rich blue gradient rounded-square tile. The subject must be recognizable as Pallas's head, not a generic anime girl, bull, cat or sheep. Match the reference's head silhouette and asymmetrical upward-curving horns. Keep the iconic rose flower and its leaves clearly recognizable and integrated into the head silhouette. The rose must remain white, never red. The full flower and both horns must fit inside the tile with comfortable optical padding.

Style: professional, very clean vector-like shapes, crisp smooth contours, flat pure-white foreground with restrained blue negative-space cutouts to suggest her hair and facial structure. Use the attached reference's character identity while simplifying aggressively for a legible 24–32px application icon. Do not reproduce the full illustration. No detailed anime rendering, line-art sketch, or 3D mascot. Avoid a huge featureless white circle; design an elegant recognizable head silhouette. Small simple facial negative space is allowed if it improves recognition; do not add complex eyes or colored hair.

Background: blue family only, subtle cyan-blue to royal-blue/indigo gradient, rounded square with about 22 percent corner radius, polished and calm. The rounded-square tile nearly fills the 1024×1024 square canvas. Clean plain exterior corners, no display mockup, no outer cast shadow, no additional margin or border decoration.

Composition: one centered app icon, strong visual hierarchy, harmonious head/rose/horn proportions, visually balanced even though the horns and flower are asymmetrical. No letters, no wordmark, no text, no watermark, no grids, no variants sheet, no extra flowers. Deliver exactly one final 1024×1024 PNG icon.
```
