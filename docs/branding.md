# Maa Verge Logo

主资源为 [logo.png](../apps/desktop/public/logo.png)，1024×1024 RGBA PNG。采用蓝色渐变圆形背景和帕拉斯头部的白色图形，保留双角、发型及玫瑰。角色参考为用户提供的《明日方舟》帕拉斯图片，图标风格参考 Clash Verge。

2026-10-21 按用户指定，通过 imagegen 技能的 CLI/API 模式调用 `gpt-image-2.5-flare`，使用图片编辑接口传入参考图。接口返回 1254×1254 图片；本地去除四角与外界连通的白色底，再缩放至 1024×1024。接口配置和密钥仅从本机读取，不保存到项目。

2026-10-22 再次按用户指定，使用本机 Codex 当前 provider 的 URL 和 API Key，通过 imagegen CLI 的图片编辑接口调用 `gpt-image-2.5-flare`，以原 Logo 为输入保留角色并改为圆形。返回 1254×1254 图片；本地向内裁去四边各 4px，施加抗锯齿圆形 alpha 并缩放到 1024×1024，去掉外围白底和白色边缘。凭据仅注入 CLI 进程环境，不输出或存储到仓库。

侧栏、启动页与浏览器图标直接使用主资源。Windows/Linux、安装包和托盘使用其衍生图标。macOS ICNS 将主图以 824×824 居中放入 1024×1024 透明画布（每边 100px 留白），避免 Dock 图标明显大于相邻应用；Tauri 开发态与发行 `.app` 共用此 ICNS。macOS 桌面侧栏品牌区顶部预留 32px 原生窗口按钮空间，32px Logo 与 Maa Verge 标题在其下方左对齐，文字沿用通用响应式字号，在 900px 窄桌面仍可完整显示；其他平台与浏览器布局保持原样。运行以下命令可从主资源重新生成三个 PNG、ICO 和 ICNS，无需再次调用图片模型：

```sh
node tools/generate-icons.mjs
```

脚本使用项目已安装的 Tauri CLI，以临时 SVG 内嵌 PNG 完成 macOS 留白合成，无额外图片工具或 Python 依赖；对 ICNS 的独立尺寸条目排序，保持生成结果可重复。

## 圆形版本的完整提示词（2026-10-22）

```text
Use case: logo-brand / precise-object-edit
Asset type: Maa Verge desktop application icon, one final circular icon.
Input image 1: existing Maa Verge logo; this is the edit target and identity reference.
Primary request: change the rounded-square blue tile into a perfectly circular blue disc, retaining the existing white Pallas (帕拉斯) mascot, asymmetrical bull horns, short layered hair, face, rose and leaves. Preserve the visual identity, clean white shapes, facial expression, cyan-to-royal-blue/indigo gradient and professional Clash Verge-like icon style. Adjust the mascot's scale and spacing only as needed so both horns, the whole rose and the hair fit comfortably within the circle. Keep the face legible at 24px.
Composition: a single centered circular disc inscribed in the square canvas, touching the center of all four canvas edges. Center the mascot optically with balanced breathing room inside the disc. Outside the circular disc use a clean pure-white background that can be removed locally. The edge must be a mathematically smooth circle, not a rounded square, oval, badge outline, or a perspective view.
Constraints: preserve the supplied mascot and blue gradient; no redesign of the character, no additional flowers, no letters, no text, no wordmark, no border, no drop shadow, no mockup, no variants sheet, no watermark. Deliver exactly one final square PNG image.
```

## 初始圆角版本的提示词（2026-10-21）

```text
Use case: logo-brand / style-transfer
Asset type: Maa Verge desktop application icon, one final square icon.
Reference image: the attached illustration is Pallas (帕拉斯) from Arknights. Use it as the identity reference, especially her swept bull horns, short layered bob with distinctive bangs, and the rose flower with leaves on the upper-left side. Remove the picture frame, hands, body, accessories and all scenery.

Create a refined, minimal app logo in the visual language of Clash Verge: a beautifully balanced white mascot silhouette centered on a rich blue gradient rounded-square tile. The subject must be recognizable as Pallas's head, not a generic anime girl, bull, cat or sheep. Match the reference's head silhouette and asymmetrical upward-curving horns. Keep the iconic rose flower and its leaves clearly recognizable and integrated into the head silhouette. The rose must remain white, never red. The full flower and both horns must fit inside the tile with comfortable optical padding.

Style: professional, very clean vector-like shapes, crisp smooth contours, flat pure-white foreground with restrained blue negative-space cutouts to suggest her hair and facial structure. Use the attached reference's character identity while simplifying aggressively for a legible 24–32px application icon. Do not reproduce the full illustration. No detailed anime rendering, line-art sketch, or 3D mascot. Avoid a huge featureless white circle; design an elegant recognizable head silhouette. Small simple facial negative space is allowed if it improves recognition; do not add complex eyes or colored hair.

Background: blue family only, subtle cyan-blue to royal-blue/indigo gradient, rounded square with about 22 percent corner radius, polished and calm. The rounded-square tile nearly fills the 1024×1024 square canvas. Clean plain exterior corners, no display mockup, no outer cast shadow, no additional margin or border decoration.

Composition: one centered app icon, strong visual hierarchy, harmonious head/rose/horn proportions, visually balanced even though the horns and flower are asymmetrical. No letters, no wordmark, no text, no watermark, no grids, no variants sheet, no extra flowers. Deliver exactly one final 1024×1024 PNG icon.
```
