# Supabase 配置指南

## 1. 创建 Supabase 项目

1. 访问 [supabase.com](https://supabase.com) 并注册账号
2. 点击 "New Project" 创建新项目
3. 选择区域（建议选择离你最近的区域）
4. 设置数据库密码（请记住此密码）
5. 等待项目创建完成（约 2 分钟）

## 2. 获取 API 凭证

1. 进入项目后，点击左侧菜单的 "Project Settings"
2. 点击 "API"
3. 复制以下两个值：
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 3. 配置环境变量

编辑 `.env.local` 文件，替换占位符：

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

## 4. 创建数据库表

1. 在 Supabase Dashboard 中，点击左侧菜单的 "SQL Editor"
2. 点击 "New query"
3. 复制 `supabase-schema.sql` 文件的内容并粘贴
4. 点击 "Run" 执行 SQL

## 5. 配置 Google OAuth

### 5.1 获取 Google OAuth 凭证

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目或选择现有项目
3. 启用 "Google+ API"：
   - 点击左侧菜单 "APIs & Services" → "Library"
   - 搜索 "Google+ API" 并启用
4. 创建 OAuth 凭证：
   - 点击左侧菜单 "APIs & Services" → "Credentials"
   - 点击 "Create Credentials" → "OAuth client ID"
   - 选择 "Web application"
   - 设置 "Authorized redirect URIs" 为：
     ```
     https://your-project-id.supabase.co/auth/v1/callback
     ```
   - 复制 **Client ID** 和 **Client Secret**

### 5.2 在 Supabase 中配置 Google Provider

1. 在 Supabase Dashboard 中，点击左侧菜单的 "Authentication"
2. 点击 "Providers"
3. 找到 "Google" 并点击展开
4. 启用 Google Provider
5. 填入从 Google Cloud Console 获取的：
   - **Client ID**
   - **Client Secret**
6. 点击 "Save"

## 6. 测试认证

1. 启动开发服务器：`npm run dev`
2. 访问 `http://localhost:3000/login`
3. 测试 Google 登录
4. 测试邮箱注册和登录

## 常见问题

### Q: 登录后没有重定向？

A: 检查 Google Cloud Console 中的 "Authorized redirect URIs" 是否正确配置。

### Q: 数据没有同步到云端？

A: 检查浏览器控制台是否有错误，确认数据库表已正确创建。

### Q: 免费额度用完了？

A: Supabase 免费套餐提供：
- 50,000 月活用户
- 500MB 数据库
- 1GB 文件存储

对于 MVP 阶段完全够用。如果超出，可以考虑升级到 Pro 套餐 ($25/月)。

## 下一步

配置完成后，用户可以：
- 使用 Google 账号一键登录
- 使用邮箱注册和登录
- 练习数据自动同步到云端
- 在多设备间访问自己的数据
