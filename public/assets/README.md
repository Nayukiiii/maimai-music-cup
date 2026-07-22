# Asset Pack

把你有权使用的静态资源放在这里，然后在 `src/data/assetOverrides.ts` 里映射到歌曲 id。

推荐结构：

```text
public/assets/
  jackets/
    mock-001.webp
  previews/
    mock-001.mp3
```

映射示例：

```ts
export const assetOverrides = {
  "mock-001": {
    jacket: "/assets/jackets/mock-001.webp",
    previewAudio: "/assets/previews/mock-001.mp3"
  }
};
```

注意：请只放你自己制作、获得授权、或许可证允许 Web 发布的封面和试听片段。

也可以使用根目录的 `asset-sources.example.json` 作为模板，创建 `asset-sources.json` 后运行：

```bash
npm run assets:import
```

导入脚本会把资源缓存到 `public/assets/`，并生成 `src/data/assetOverrides.ts`。
