# 部署文档：充值中心上线到 Cloudflare（免费）

目标：用 GitHub + Cloudflare Pages + Supabase 免费部署，使用 xxx.pages.dev 免费子域。

## 第 1 步：Supabase 建表 + 存储桶

1. Supabase → SQL Editor → New query，粘贴 supabase/schema.sql 全部内容 → Run
2. Supabase → Storage → New bucket，Name 填 `files`，勾选 Public bucket → Create

## 第 2 步：GitHub 推送本仓库

仓库根目录需有 index.html、functions/api.js、supabase/schema.sql、wrangler.toml。

## 第 3 步：Cloudflare Pages 连接部署

1. Cloudflare → Workers & Pages → Create → Pages → Connect to Git
2. 选中 recharge-cz 仓库
3. Framework preset 选 None；Build command 留空；Build output directory 填 .
4. Save and Deploy

## 第 4 步：配置环境变量（关键）

Cloudflare 项目 → Settings → Environment variables → Production：

| 变量名 | 值 |
|--------|-----|
| SUPABASE_URL | https://lwfkjcosjiemkellkdme.supabase.co |
| SUPABASE_SERVICE_KEY | service_role key（Settings → API 复制，存备忘录那个） |

保存后 Deployments → 最新部署 Retry deploy 让变量生效。

## 第 5 步：验证

打开 https://recharge-cz.pages.dev ：
- 首页领券 → 下一步 → 选金额 → 提交订单，能正常写入即成功
- 连点 5 次顶部站点名进后台，首次在「网站设置」设管理密码（≥6位）

## 安全提醒

- service_role key 只在 Cloudflare 环境变量配置，绝不提交 git 或发他人
- 管理密码以 PBKDF2 哈希存储，非明文
- 上线后务必设强管理密码并定期更换
