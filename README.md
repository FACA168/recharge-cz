# 充值中心（运营版）

纯前端 H5 充值系统，配套 Cloudflare Pages + Supabase 免费部署。

## 架构

| 层 | 技术 | 说明 |
|----|------|------|
| 前端 | 单文件 index.html | 用户交互，所有数据走 /api |
| 代理 | Cloudflare Pages Functions（functions/api.js） | 服务端调用 Supabase，持有 service_role key |
| 数据库 | Supabase Postgres | settings / vouchers / orders 三表 |
| 存储 | Supabase Storage（bucket: files） | 收款码、Logo、Banner、付款截图 |

安全要点：前端永远不持有可写密钥；写库全部由 Pages Functions 完成；密码以 PBKDF2 哈希存储。

## 目录结构

    index.html              前端页面
    functions/api.js        /api 代理
    supabase/schema.sql     建表 + 初始数据 + RLS
    wrangler.toml           Pages 配置
    DEPLOY.md               部署步骤

## 部署

详见 DEPLOY.md。核心：Supabase 建表 + files 公开桶 → GitHub 推送 → Cloudflare Pages 连接 → 配置 SUPABASE_URL / SUPABASE_SERVICE_KEY 环境变量。
