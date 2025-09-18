教育学学术导航（Vercel 静态站点）

概述
- 这是一个纯静态、数据驱动的导航页，用于汇集教育学相关网站与资源。
- 功能：搜索、标签筛选、深浅色主题、管理员导入/导出本地 JSON、拖拽导入、显示“上次更新”。
- 访客看不到导入/导出/重置按钮；仅管理员模式下可见。
- 数据源：data/resources.json（部署时以此文件为准）。

目录结构
- index.html：页面骨架
- css/styles.css：样式（深浅色主题）
- js/app.js：前端逻辑（搜索、标签、导入导出、拖拽）
- data/resources.json：资源数据（唯一需要经常更新的文件）
- data/disciplines.json：学科分类（可编辑的一级/二级学科列表）

本地更新数据（Mac）
- 方式一：直接编辑文件 data/resources.json，保存后在浏览器刷新即可预览。
- 方式二：用“管理员模式”导入本地 JSON 进行临时预览（只写入浏览器 localStorage，不改动仓库文件）。
  - 启用管理员模式的方式：
    - 本地打开（file:// 或 localhost）时会自动启用；或
    - 在网址后加 ?admin=1（或 #admin）；或
    - 快捷键 Ctrl+. / ⌘+. 切换管理员模式（会记忆到 localStorage）。
  - 管理员模式下，右上角会显示“导入 / 导出 / 重置”按钮，并支持拖拽 JSON 到页面导入。

JSON 数据结构（示例）
{
  "meta": {
    "title": "教育学学术导航",
    "description": "...",
    "lastUpdated": "2025-09-18T00:00:00.000Z"
  },
  "resources": [
    {
      "name": "ERIC",
      "url": "https://eric.ed.gov/",
      "description": "...",
      "tags": ["文献数据库", "英文", "教育学"],
      "region": "US",
      "updatedAt": "2025-07-30",
      "pinned": true,
      "disciplines": ["0401"]
    }
  ]
}

字段说明
- name：资源名称（必填）
- url：访问链接（必填）
- description：一句话描述（建议）
- tags：字符串数组，用于筛选（建议）
- region：地区/范围（可选）
- updatedAt：ISO 日期或 YYYY-MM-DD（可选，用于“上次更新”统计）
- pinned：布尔值，true 时在页面顶部优先展示（可选）
- disciplines：数组，填写适用的学科代码；支持父子前缀匹配（如资源写 "0401"，则匹配所有 0401xx 二级学科；写 "04" 则匹配教育学大类的全部二级）

学科分类文件（data/disciplines.json）
- 包含一级学科与其二级学科列表。你可直接编辑、增删条目。
- 页面会在“学科筛选”里提供：一级学科下拉 + 二级学科多选标签。
- 选择二级学科后，仅显示 disciplines 命中的资源；未标注 disciplines 的资源在学科筛选时将被排除（请按需补充）。

部署到 Vercel
- 方式一（推荐）：将此目录初始化为 Git 仓库并推送到 GitHub/GitLab，然后到 Vercel “Import Project” 选择该仓库。
  - Framework Preset: Other
  - Build Command: 无（留空）
  - Output Directory: 根目录（默认）
  - Vercel 会直接当作静态站点部署。
- 方式二：使用 Vercel CLI（需要 Node 环境）：
  - npm i -g vercel
  - vercel（首次）→ vercel --prod（正式）

更新上线
- 只需修改 data/resources.json 并推送到远端，Vercel 会自动重新部署。
- 如需临时在浏览器中预览他人给你的 JSON，可直接在页面“导入”并不影响线上。

注意事项
- 如果第三方站点的图标无法加载，卡片会使用占位图标，不影响使用。
- 若想禁用数据文件的缓存，可在 vercel.json 设置 data/ 路径为 no-store（非必需）。
