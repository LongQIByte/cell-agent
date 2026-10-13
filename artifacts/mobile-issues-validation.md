# 移动端 issues 验证记录

日期：2026-10-13（Asia/Shanghai）。覆盖 GitHub #19–#25。

## 实现与验证

| Issue | 实现 | 当前证据 |
| --- | --- | --- |
| #19 会话分支 | 原生 thread/fork，来源关系读取 forkedFromId，后续独立执行 | 真实 Codex 中创建分支、继承前轮校验字符串、原会话内容不变；重启恢复关系 |
| #20 界面与照片 | 统一字号、间距和工具卡片；所有待发送照片可横向浏览、预览、移除；三项设置同排 | Web 文件选择器添加两张图片、分别预览与移除；320/390/820px 无按钮遮挡；主题和字体回归通过 |
| #21 README | 首页仅保留用途、功能、快速开始和文档入口 | 使用与开发细节完整迁入 docs/usage-and-development.md，相对链接已调整 |
| #22 重命名 | 会话管理菜单编辑名称，原生 thread/name/set | 原生读回名称；Web 列表同步显示新名称 |
| #23 全局置顶 | 单独顶层置顶区域，跨电脑与项目集中展示，无重复行 | 单元测试覆盖折叠项目、同名跨电脑、搜索；Web 覆盖归档、恢复、刷新 |
| #24 新建入口与近期图片 | 标题右侧加号；授权相册最近 5 分钟拍摄或修改的图片，确认添加、不自动发送、忽略持久化 | Web 验证新入口；真机有限相册授权及两张近期图片提示已验证；时间边界、导入图片无拍摄时间、排除已处理图片和数量限制通过单元测试 |
| #25 Plan/Goal 与指标 | 原生模式及目标控制；任务状态、最近模型请求上下文、本轮用量、助手字符速度 | 真实 Codex Plan → 执行、Goal 暂停/继续/结束/清除与重启恢复；Web 功能面板操作、草稿与附件保留；指标计算和隔离测试通过 |

类型检查通过；45 项 Node 单元测试、19 项 Web 场景（包括真实 LAN/Codex 执行）、服务包生命周期集成测试通过。Web 的权限恢复用例读取实际本机沙箱状态，兼容测试机配置为只读的情况，不假定完全访问。

原生 API 验收使用独立测试工作目录，自动化测试会话已归档。手机测试保留用户实际发送的 hi 会话，未改写用户已有会话。测试输出与截图在 `.local/`、`artifacts/`，配对密钥不进入仓库。

## 运行与设备边界

按用户指定，最终后台 service 运行在 Windows，Relay 8787 和 Windows Agent 在线，访问入口为 `http://192.168.0.2:8787`。运行目录为 `C:\Users\tangzhifeng\Documents\Codex\cell-agent-windows-20261013\codex-remote-service`。

服务明确使用桌面当前的 `codex-cli 0.162.0-alpha.17.2` 和 `C:\Users\tangzhifeng\.codex`。项目接口读回 cell-agent、bfte、paseo、llm-as-policy、us-army-doctrine；手机显示 cell-agent 及当前桌面会话。先前 WSL service 已停止，只移除了本任务使用的 8787 转发，现为 Windows 原生监听。远程 SSH 主机的项目仍需要对应主机 Agent，不把其数据混入 Windows 本机。

手机为 vivo X Fold3 Pro（V2337A），Android 16 / SDK 36。Windows USB ADB 独立使用 5038 端口，保留 WSL 的 5037 实例。正式 APK 已构建并覆盖安装，保留应用数据；2026-10-13 09:30:53 安装的 APK SHA256：`efeaef414f98a94cf8f5bd0fcef6003cb33d24b918b1097c90ee53919441f004`。

真机已检查新建入口、模型/推理/权限同排、软键盘下发送按钮可见、底部安全区、Plan 切换保留草稿、Goal 面板字段、真实消息及运行指标。近期图片使用本次创建的两张测试 PNG，系统仅授权这两张照片；已验证出现两张图片的确认提示。逐图预览/移除的完整流程已在 Web 验证，Android 确认添加后的完整流程及 iOS 真机尚未完成验收。

真机检查发现并修复 Android 导入图片缺少 DATE_TAKEN 被 createdAfter 漏掉、AssetInfo 只返回 uri 而非 iOS localUri 的差异；最终 APK 包含修复。构建下载使用 `.local/` 临时网络配置处理 WSL DNS/Java 下载问题，该配置不提交，也不改变系统代理。

主要截图（本机留档，不提交二进制）：`artifacts/phone-windows-projects.png`、`artifacts/phone-keyboard.png`、`artifacts/phone-plan.png`。
