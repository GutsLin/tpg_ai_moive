

## Codely Structured Memories

### User

### Feedback

### Project
- [2026-08-18 16:55:30] User uses a relay station (中转站) for Volcano Engine video generation instead of direct API. Relay endpoint: models.kapon.cloud/volcark/api/v3. As of 2026-08-18, the relay only supports `doubao-seedance-2-0-fast-260128` model, not `doubao-seedance-2-0-260128`. **Why:** relay station has a restricted model list. **How to apply:** when debugging video generation errors, check if the model ID is supported by the user's relay station first.
- [2026-08-19 19:09:02] 生产部署：阿里云服务器 8.156.73.136（root SSH，凭据在用户本地 D:\Projects\WebProjects\阿里云_公司.txt，勿存密码）。结构：/opt/narrix/releases/<版本名>/ 完整源码 + deploy/（docker-compose.yml）、/opt/narrix/env/prod/stack.env（NARRIX_IMAGE_TAG 控制镜像 tag）、/opt/narrix/current/prod 软链指向当前版本。容器：narrix-prod-{backend,frontend,worker-video,worker-asset-sync,postgres,redis}-1。部署流程：复制现有 release 目录→替换差异文件→更新 stack.env 的 NARRIX_IMAGE_TAG→docker compose build backend→up -d backend worker-video worker-asset-sync→更新 current/prod 软链。2026-08-19 已部署 prod-20260819-poll-isolation-v2（视频轮询错误隔离修复：单个平台认证失败只终止该任务，不再毒化整批轮询）。
- [2026-08-20 13:20:00] 生产素材可见性策略（prod-20260820-asset-visibility-v3）：项目内所有角色均可查看全部项目素材及详情；member 仅能编辑自己上传的素材，删除仅限 manager。**Why:** 团队协作要求同项目成员共享素材。**How to apply:** 素材权限改动以"看全部、改自己、删靠 manager"为基线。
- [2026-08-20 12:55:00] 火山素材同步已于 2026-08-20 全局关闭（70 个组改仅本地、ark_default_sync_enabled=false）。原因：原火山账号密钥 8-18 失配，替代新账号无素材库订阅（写 API 需高级版）。视频生成走 ToAPIs 不依赖火山素材库。恢复路径：找回旧账号密钥（控制台方舟素材库有 7118 素材者）或新账号订阅高级版后重建组映射。**How to apply:** 排查素材 ark 报错先确认同步是否已重新开启。
- [2026-08-20 14:20:00] 素材同步已切换到 ToAPIs 虚拟人像素材库（prod-20260820-toapis-asset-library-v5，private-avatar API，Bearer 认证，`backend/src/lib/toapis-avatar.ts`）。ProviderAssetClient 按默认视频平台自动选客户端：toapis→ToApisAvatarClient（组ID pg_ 前缀、素材 pa_ 前缀、支持 Image/Video/Audio）、volcano_ark→ArkAkskClient（组ID group- 前缀、仅 Image）。70 个素材组已迁移为 pg_ 映射并恢复同步。视频生成时 pa_ 素材保留 asset:// 引用，未同步素材仍走 OSS 签名 URL。真人人像素材需走 real-avatar H5 认证流程，尚未实现（二期）。**How to apply:** 素材同步报错先看 ark_asset_id/ark_group_id 前缀判断所属平台。

### Reference

