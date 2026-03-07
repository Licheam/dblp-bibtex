# DBLP BibTeX 快速查询

一个轻量网页工具：输入论文标题，调用 DBLP API 进行模糊匹配，点击结果后直接查看纯文本 BibTeX。

## 功能

- 论文标题搜索（DBLP `search/publ/api`）
- 前端模糊排序（优先展示更接近的标题）
- 点击候选结果，拉取对应 `.bib` 纯文本
- 一键复制 BibTeX

## 目录结构

- `index.html`：页面结构
- `styles.css`：样式
- `app.js`：搜索、匹配、BibTeX 获取逻辑

## 运行方式（推荐 `uv`）

在项目目录执行：

```bash
uv run python -m http.server 8000
```

浏览器打开：

- <http://localhost:8000>

## 不用 uv 的方式

```bash
python3 -m http.server 8000
```

## 使用步骤

1. 输入论文标题（例如 `Attention Is All You Need`）
2. 点击“搜索”或按 Enter
3. 在候选列表中点击目标论文
4. 右侧查看纯文本 BibTeX，必要时点击“复制”

## 常见问题

- 为什么不能直接双击 `index.html` 打开？
  - 直接用 `file://` 打开时，浏览器可能拦截跨域请求。请用本地 HTTP 服务（上面的 `uv` 或 `python3` 命令）。

- 搜索失败怎么办？
  - 先检查网络。
  - 尝试精简关键词（去掉副标题或特殊符号）。
  - DBLP 接口偶发超时可重试。

## API 说明

- 搜索接口：`https://dblp.org/search/publ/api?q=<query>&h=20&format=json`
- BibTeX 接口：`https://dblp.org/rec/<key>.bib`（或搜索结果中的 `url + .bib`）

## 开源协议

本项目采用 [MIT License](LICENSE) 许可协议。
