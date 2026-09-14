# Luma · 人生操作系统

个人任务、习惯、目标与专注记录。公开网页： https://power0623.github.io/Hello/

## 开发与检查

需要 Node.js 22.13 或更新版本，使用 pnpm 安装依赖。

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm test:security
pnpm build:pages
```

`app/` 为页面和数据逻辑；`public/` 为资源与公开账号配置；`supabase/schema.sql` 为云端表和数据隔离规则。

GitHub Pages 从仓库根目录发布，根目录的 `index.html` 为构建产物。源码修改后运行 `pnpm build:pages`，将 `github-pages-dist/` 的内容更新到发布根目录。构建目录不纳入源码跟踪。

## 账号开通

目前空账号配置表示沿用本地保存。真实账号、云同步需要在自己的 Supabase 项目执行数据库脚本，配置登录邮件和回跳地址，并填写 `public/luma-config.json` 后重新发布。

完整步骤见 [账号开通与新版说明](docs/账号开通与新版说明.md)。只允许在公开配置中填写 Project URL 与 publishable key，不能填写数据库密码或服务端私密密钥。

本地数据逻辑测试和内存 PostgreSQL 权限测试不替代实际部署后的双账号验证。
