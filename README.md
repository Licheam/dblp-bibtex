---
title: DBLP BibTeX Quick Finder
emoji: 📚
colorFrom: green
colorTo: blue
sdk: docker
pinned: false
---

# DBLP BibTeX 快速查询

一个轻量网页工具：输入论文标题，通过本地代理调用 DBLP API 进行模糊匹配，点击结果后直接查看纯文本 BibTeX。

## 功能

- 论文标题搜索（DBLP `search/publ/api`）
- 会议/期刊检索（支持 `PLDI 2025` 这类输入）
- 前端模糊排序（优先展示更接近的标题）
- 可选循环搜索，失败后每 2 秒自动重试，直到拿到候选结果
- 可选会议/期刊循环查询，失败后每 2 秒自动重试，直到拿到结果
- 可选循环获取 BibTeX，失败后每 2 秒自动重试，直到成功
- 点击候选结果，拉取对应 `.bib` 纯文本
- 支持将当前候选结果的全部 BibTeX 合并展示
- 一键复制 BibTeX

## 目录结构

- `index.html`：页面结构
- `styles.css`：样式
- `app.js`：搜索、匹配、BibTeX 获取逻辑
- `server.py`：静态文件服务和 DBLP 代理接口

## 运行方式（推荐 `uv`）

在项目目录执行：

```bash
PORT=8000 uv run python server.py
```

浏览器打开：

- <http://localhost:8000>

## 不用 uv 的方式

```bash
PORT=8000 python3 server.py
```

## Docker 运行

构建镜像：

```bash
docker build -t dblp-bibtex:latest .
```

启动容器：

```bash
docker run --rm -p 8000:7860 dblp-bibtex:latest
```

浏览器打开：

- <http://localhost:8000>

## Hugging Face 部署（Docker Space）

1. 在 Hugging Face 新建一个 Space，`SDK` 选择 `Docker`。
2. 把当前仓库代码推送到该 Space 对应仓库（至少包含 `index.html`、`styles.css`、`app.js`、`Dockerfile`）。
3. 本项目 `Dockerfile` 已监听 `0.0.0.0:7860`，可直接被 Hugging Face Space 识别。
4. 等待构建完成后，打开 Space 页面即可在线使用。

如果你是本地先验证 Docker 镜像，可先执行上面的 `docker build` + `docker run`。

## 使用步骤

1. 输入论文标题（例如 `Attention Is All You Need`）
2. 点击“搜索”或按 Enter
3. 如果 DBLP 最近不稳定，可以点击“循环搜索”，页面会每 2 秒重试一次，直到搜到结果或你手动停止
4. 或者输入会议/期刊查询（例如 `PLDI 2025`），点击“查询会议/期刊”获取该会议/期刊论文列表
5. 会议/期刊网络不稳定时可点击“循环查询”，页面会每 2 秒重试一次，直到有结果或你手动停止
6. 在候选列表中点击目标论文
7. 如果 BibTeX 获取失败，可点击“循环获取BibTeX”，页面会每 2 秒重试一次，成功后自动停止
8. 点击“合并全部BibTeX”可把当前候选论文的 BibTeX 批量拉取并合并展示
9. 右侧查看纯文本 BibTeX，必要时点击“复制”

## 常见问题

- 为什么不能直接双击 `index.html` 打开？
  - 直接用 `file://` 打开时，浏览器无法访问本地代理接口，也无法稳定跨域请求 DBLP。请用 `server.py` 启动。

- 搜索失败怎么办？
  - 先检查网络。
  - 尝试精简关键词（去掉副标题或特殊符号）。
  - DBLP 接口偶发超时可重试。
  - 如果报 `search upstream failed` 或 `bib upstream failed`，说明是服务端访问 DBLP 失败，不再是浏览器跨域问题。

## API 说明

- 搜索接口：`https://dblp.org/search/publ/api?q=<query>&h=20&format=json`
- BibTeX 接口：`https://dblp.org/rec/<key>.bib`（或搜索结果中的 `url + .bib`）
- 本项目代理接口：`/api/search?q=<query>&h=20`、`/api/venue?q=<venue+year>` 和 `/api/bib?url=<bib_url>`

## 开源协议

本项目采用 [MIT License](LICENSE) 许可协议。
