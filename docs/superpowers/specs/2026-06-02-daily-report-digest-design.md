# 日报摘要阅读流设计

日期：2026-06-02

## 概要

每日新闻阅读拆成三层：

1. 推送消息：中等密度晨报，可直接在飞书里读完，目标约 500-800 个中文字符。
2. 页面摘要：`/day-report/:date` 顶部的结构化阅读层，用于扫读、理解主线和进入主题。
3. 全量来源列表：保留现有 BBC、NYT、Google 关键词新闻列表，作为完整性和可追溯层。

系统整体要求“不遗漏来源新闻”，但推送不负责承载所有事实。完整性由原始列表和覆盖索引保证；阅读效率由结构化摘要保证。

## 目标

1. 让每日推送在不打开页面时也能提供真实概览和重要新闻汇总。
2. 让推送明显短于当前长段落摘要，同时保留足够信息密度。
3. 将 Google 关键词组汇总成每个活跃关键词一句话，尤其是 `FSD` 这类高数量关键词组。
4. 保留完整 BBC、NYT、Google 来源列表，确保来源新闻不消失。
5. 页面只做增量改造，不做整页重写。
6. 旧日报只有 `Summary` 字符串时仍可正常阅读。

## 非目标

1. 不完整重设计 `/day-report`。
2. 不新增新闻源。
3. 不要求飞书推送包含每条原始新闻或每个事实细节。
4. 第一版不做重要度排序配置 UI。
5. 不做数据库迁移；只在现有日报 JSON 中增加可选字段。

## 当前基线

当前 `DayReport` 存储：

1. `Weather`
2. `WeatherIndex`
3. `Summary`
4. `BbcNews`
5. `NytNews`
6. `GoogleNews`

用户提供的样例包含：

1. 5 条 BBC 新闻。
2. 21 条 NYT 新闻。
3. 12 个 Google 关键词组。
4. 5 个 Google 关键词组有真实新闻。
5. 活跃 Google 关键词组内共有 31 条新闻。
6. `Summary` 约 1919 个非空白字符。

当前推送会发送完整 `Summary`，因此推送变成接近完整文章正文，而不是晨间简报。

## 数据模型

在 `DayReport` 上新增可选结构化摘要字段：

```go
type DayReport struct {
    Weather      spider.WeatherReturn
    WeatherIndex spider.IndexReturn
    Summary      string
    Digest       *DayDigest `json:"digest,omitempty"`
    BbcNews      []spider.BBCRssItem
    NytNews      []spider.NYTimesRssItem
    GoogleNews   []struct {
        KeyWord string
        News    []spider.GoogleRssItem
    }
}

type DayDigest struct {
    PushBrief      DailyPushBrief      `json:"pushBrief"`
    Overview       string              `json:"overview"`
    ImportantNews  []DigestItem        `json:"importantNews"`
    KeywordBriefs  []KeywordBrief      `json:"keywordBriefs"`
    TopicBriefs    []TopicBrief        `json:"topicBriefs"`
    Coverage       []DigestCoverage    `json:"coverage"`
}

type DailyPushBrief struct {
    WeatherLine    string          `json:"weatherLine"`
    Overview       string          `json:"overview"`
    ImportantNews  []DigestItem    `json:"importantNews"`
    KeywordBriefs  []KeywordBrief  `json:"keywordBriefs"`
}

type DigestItem struct {
    Title       string   `json:"title"`
    Summary     string   `json:"summary"`
    Topic       string   `json:"topic"`
    Importance  int      `json:"importance"`
    SourceRefs  []string `json:"sourceRefs"`
}

type KeywordBrief struct {
    Keyword     string   `json:"keyword"`
    Summary     string   `json:"summary"`
    Count       int      `json:"count"`
    SourceRefs  []string `json:"sourceRefs"`
}

type TopicBrief struct {
    Topic       string   `json:"topic"`
    Summary     string   `json:"summary"`
    SourceRefs  []string `json:"sourceRefs"`
}

type DigestCoverage struct {
    Ref         string `json:"ref"`
    Topic       string `json:"topic"`
    InPush      bool   `json:"inPush"`
    Importance  int    `json:"importance"`
}
```

`SourceRefs` 和 `DigestCoverage.Ref` 使用稳定的本地引用，例如 `bbc:0`、`nyt:12`、`google:3:0`。Google 引用格式为 `google:<groupIndex>:<itemIndex>`，对应已存储 `GoogleNews` 数组中的关键词组下标和新闻下标。这样摘要不需要复制链接，前端也能把摘要关联回原始新闻。

保留现有 `Summary` 字符串。新日报可以由 `DayDigest` 生成一个纯文本 fallback；旧日报缺少 `Digest` 时，前端继续使用 `Summary`。

## 推送消息

推送应是中等密度，不是极简通知。目标形态：

```text
日安，06月02日
杭州：多云，23-33℃；明天有雨。

今日概览：
今天的主线是国际安全局势升温、中国相关科技与国家能力竞争、美国国内制度与产业争议。BBC/NYT 中，中东、埃塞俄比亚、缅甸等安全新闻占比较高；中国相关报道集中在煤矿事故、AI 监控、芯片获取、生物医药竞争；美国则围绕 AI 裁员、公共卫生叙事、司法信任出现多篇深度报道。

重要新闻：
1. 中东：以色列扩大针对真主党的军事行动，美国也报告在伊朗南部打击目标，并拦截针对驻科威特美军的袭击。
2. 中国：BBC 关注煤矿灾难背后的非法劳工和秘密隧道，NYT 则聚焦中国 AI 监控、英伟达芯片采购和药物研发竞争。
3. 美国：AI 裁员、公共卫生中“个人责任”叙事回归、联邦法官批评司法部律师缺乏坦诚，是今天几条主要制度议题。
4. 其他：澳门男童交通事故引发社会关注，埃塞俄比亚选举、尼加拉瓜土著领袖去世、委内瑞拉公共服务崩溃等值得留意。

关注关键词：
FSD：特斯拉在中国围绕宣传与功能落地面临诉讼，同时继续招聘本地智驾测试岗位，国内车企也在借 FSD 概念加速智驾叙事。
苹果眼镜：多篇消息指向苹果智能眼镜延后到 2027 年底前后，但市场仍关注其品牌、设计和 AI 能力。
GTA6：Take-Two 业绩与 GTA6 预期继续绑定，GTA5 累计销量接近 2.3 亿份。

完整日报：链接
```

推送约束：

1. 整体目标 500-800 个中文字符。
2. `Overview` 控制在 120-220 个中文字符。
3. `ImportantNews` 包含 3-6 条。
4. 每条重要新闻控制在 45-90 个中文字符。
5. 推送里的 `KeywordBriefs` 只包含有新闻的活跃关键词组，并限制在 3-6 个。
6. 每个关键词汇总只写一句，控制在 35-75 个中文字符。
7. 推送不得包含原始新闻 description，也不得出现长逗号链式堆叠。

## AI Prompt 契约

AI 应返回 JSON，不返回自由文本。Prompt 需要明确：

1. 推送是可读晨报，不是完整新闻归档。
2. 推送内容允许舍弃次要事实。
3. 每条 BBC、NYT、Google 来源新闻都必须出现在 `coverage` 中。
4. 高数量 Google 关键词组必须去重聚合成一句趋势描述。
5. 低信号或单条离散关键词新闻可以只进入 coverage，不必进入推送。
6. 对可信度较低的 Google 来源，涉及判断或立场时要写成“据报道/报道称”，不能直接采纳为事实。
7. 输出必须是符合后端结构体的合法 JSON。

后端需要校验：

1. JSON 可解析。
2. `overview`、`importantNews`、`keywordBriefs` 存在。
3. `coverage` 只引用存在的 source refs。
4. 推送文本长度大体符合预算。

如果校验失败，后端用更严格的修复 prompt 重试一次。仍失败时，保留原始新闻列表，并推送一条确定性的短消息，说明摘要生成失败并附日报链接。

## 页面设计

第一版不重写整个页面。保留现有天气卡片、BBC 列表、NYT 列表、Google 列表、日期选择和导航行为。

页面摘要不复用推送文案。推送是线性晨报，目标是直接读完；页面摘要是阅读控制台，目标是让用户判断哪些主题值得展开，并能快速回到原始来源。

将当前长文本 `概要` 卡片替换为结构化顶部区域：

1. `今日重点`：来自 `DayDigest.PushBrief.ImportantNews`，每条显示标题、一句话摘要和“查看来源 N 条”展开入口。展开后显示关联原文，不显示内部重要度分数。
2. `主题地图`：来自 `DayDigest.TopicBriefs`，每个主题显示标题、来源数量、一句总结，并提供展开入口。展开后显示关联原文，不在卡片内复写长摘要。
3. `关注新闻`：来自 `DayDigest.KeywordBriefs`，按关注关键词显示关键词、来源数量和一句趋势判断。例如 `FSD  查看来源 11 条  诉讼 + 本地化测试 + 国内智驾叙事`。
4. 页面不显示 `coverage.inPush` 或 `importance` 这类内部字段，也不显示“已进入推送”或“推送 X 条”标签。

页面顶部可以覆盖比推送更多的主题，但每个主题仍保持短句。细节通过展开区和下方原始列表承接，不在顶部重新写一篇摘要正文。

原始列表继续放在下方。它们仍然是不遗漏新闻的事实来源。如果有 `coverage`，每条原始新闻应能关联到主题；是否显示“进入推送”标记可以放在第一版或后续小步完成。

如果 `DayDigest` 不存在，`SummaryCard` 按当前逻辑渲染旧 `Summary` 文本。

## 流程

生成流程：

1. 像现在一样采集天气、BBC、NYT、Google 新闻。
2. 像现在一样翻译 BBC 和 NYT。
3. 构造紧凑 AI 输入：
   - BBC 标题、摘要、时间、下标。
   - NYT 标题、摘要、时间、下标。
   - Google 关键词、标题、时间、组下标、条目下标。
4. 生成 `DayDigest` JSON。
5. 校验并规范化 digest。
6. 从 digest 生成 fallback `Summary` 文本。
7. 持久化完整日报。
8. 使用 `DayDigest.PushBrief` 生成推送 Markdown。

读取流程：

1. `getReport` 返回现有日报对象，并附带可选 `Digest`。
2. 前端优先检查 `Digest`。
3. 有 `Digest` 时渲染阅读控制台：今日重点、主题地图、关注新闻。
4. 无 `Digest` 时渲染现有 `SummaryCard`。
5. 原始新闻列表按现状渲染。

## 错误处理

1. AI 摘要失败不得丢失原始新闻数据。
2. digest JSON 无效时记录日志并重试一次。
3. coverage 引用无效时在规范化阶段移除并记录日志。
4. 旧日报缺少 digest 是预期情况，使用 `Summary` fallback。
5. 空 Google 关键词组不进入推送关键词摘要。

## 验证

后端验证：

1. 单元测试 digest 校验：合法引用、非法引用、缺少必填字段。
2. 单元测试推送 Markdown 生成，覆盖样例规模的 digest。
3. API 回归：`generateReport` 仍能持久化日报，`getReport` 仍返回原始 `BbcNews`、`NytNews`、`GoogleNews`。

前端验证：

1. 没有 `Digest` 的旧日报仍渲染旧概要卡片。
2. 有 `Digest` 的新日报渲染今日重点、主题地图和关注新闻，而不是复刻推送正文。
3. 原始 BBC、NYT、Google 列表仍位于摘要区域下方。
4. 移动端摘要文本不横向溢出，阅读区保持可扫读。

使用用户样例做人工验收：

1. 推送输出在 500-800 个中文字符之间。
2. `FSD` 被汇总为一句趋势描述，而不是逐条标题列表。
3. 页面仍暴露全部 5 条 BBC、21 条 NYT 和活跃 Google 关键词新闻。
4. 页面顶部呈现今日重点、主题地图和关注新闻，不复刻推送正文，也不需要先读完 1900 字长段落才能进入原始新闻。

## 发布策略

1. 旧日报继续可读，因为保留 `Summary` fallback。
2. 新日报同时包含 `Digest` 和 `Summary`。
3. 只有 digest 生成成功时，推送才切换到 `Digest.PushBrief`。
4. 第一版不需要新增后台配置。
