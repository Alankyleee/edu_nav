教育学学术导航（Vercel 静态站点）

概述
- 这是一个纯静态、数据驱动的导航页，用于汇集教育学相关网站与资源。
- 功能：搜索、标签筛选、深浅色主题、管理员导入/导出本地 JSON、拖拽导入、显示“上次更新”。
- 访客看不到导入/导出/重置按钮；仅管理员模式下可见。
- 数据源：data/resources.json（部署时以此文件为准）。

目录结构
- index.html：页面骨架
- css/styles.css：样式（深浅色主题）
- js/app.js：前端逻辑（本地搜索、学科筛选、学术搜索下拉、导入导出、拖拽）
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

学术搜索（顶部）
- 顶部提供一个学术搜索下拉，支持 Google 学术、百度学术、CNKI、ERIC、Semantic Scholar、JSTOR、SAGE、Wiley、Taylor & Francis、Springer、ScienceDirect。
- 选择引擎后输入关键词并按回车/点“搜索”，在新窗口打开对应平台的搜索结果。
- 默认搜索引擎会记忆在浏览器（localStorage）。
- 可选“限定域名”输入框：在支持 site: 语法的搜索引擎（Google 学术、百度学术）会将 site:domain 追加到查询中，其它平台将忽略该限制。
- 可选“时间范围”：近1/3/5年。目前时间过滤仅对 Google 学术生效（通过 as_ylo 参数实现），其它引擎暂不处理。

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

提交网站功能（右侧抽屉）
- 顶部右侧“📝 提交网站”按钮打开提交表单，包含名称、链接、简介、标签、学科代码、联系邮箱与验证码。
- 验证码：简单算式验证码（前端校验）。
- 管理员模式下：提交会直接把记录追加到本地预览（写入 localStorage），便于即时检查呈现效果；如需上线请手动合并到 data/resources.json。
- 访客：表单会尝试用 mailto 打开默认邮件客户端，将 JSON 填入邮件正文。
  - 要启用邮件提交，请在 data/resources.json 的 meta 中新增字段：
    - submitEmail: "你的接收邮箱"
  - 未配置邮箱时，会自动将 JSON 复制到剪贴板，便于用户自行发送。

后端存储（Cloudflare KV，推荐）
- 已内置 /api/submit 接口，支持将提交记录写入 Cloudflare Workers KV。
- 配置步骤（Cloudflare 控制台）：
  1) 创建 KV Namespace（Workers & Pages -> KV -> Create）。
  2) 记下 Namespace ID 与 Account ID。
  3) 创建 API Token（My Profile -> API Tokens -> Create Token）：授予 “Workers KV Storage: Edit” 权限（Account 级）。
  4) 在 Vercel 项目 Settings -> Environment Variables 设置：
     - CF_ACCOUNT_ID：你的 Cloudflare Account ID
     - CF_KV_NAMESPACE_ID：KV Namespace ID
     - CF_API_TOKEN：上一步创建的 API Token
     - CF_KV_PREFIX（可选）：键前缀，默认 submissions:
     - SUBMIT_RATE_LIMIT（可选）：每小时最多提交次数，默认 5
     - SUBMIT_ALLOW_ORIGINS（可选）：允许的 Origin 白名单，逗号分隔（设置后将拒绝不在名单内的来源）
- 部署后，提交记录会以 JSON 写入 KV，键为 `${CF_KV_PREFIX}${id}`，其中 id 为服务端生成的随机 ID。
- 如需查看或导出记录：
  - Cloudflare Dash -> Workers KV -> 进入命名空间搜索 key；或
  - 使用 Cloudflare API 列出 keys：GET /client/v4/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/keys
  - 再按 key 读取 value：GET /values/{key}

管理员审核面板（内置）
- 顶部“🗂 审核提交”按钮仅在管理员模式下可见（见前文管理员模式说明）。
- 首次打开需填入管理员令牌（Vercel 环境变量 ADMIN_TOKEN 的值），保存后即可从右侧抽屉载入提交列表。
- 列表分页加载（每次 20 条），支持按状态筛选（全部/待审核/已通过/已拒绝）。
- 可直接在面板内“通过/拒绝”，状态会写回 Cloudflare KV；支持为每条提交填写“备注”并一同保存。
- 相关后端接口：
  - GET /api/admin_list?limit=20&cursor=...（需要 header: x-admin-token）
  - POST /api/admin_update { id, status }（需要 header: x-admin-token）
- 需要在 Vercel 配置以下环境变量：
  - ADMIN_TOKEN：管理员令牌（自定义一串强随机字符串）

注意事项
- 如果第三方站点的图标无法加载，卡片会使用占位图标，不影响使用。
- 若想禁用数据文件的缓存，可在 vercel.json 设置 data/ 路径为 no-store（非必需）。
