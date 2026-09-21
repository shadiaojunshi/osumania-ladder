/**
 * 欢迎框正文（站长 2026-09-21 提供的原文）。
 *
 * ⚠️ **一个字都不要改** —— 包括标点、半角/全角、空格、人名的大小写与方括号。
 * 站长明确要求原样展示，所以它**不放进** `messages.zh.ts` / `messages.en.ts`：
 * 那两张表是"可翻译"的，这里是"公告原文"。
 *
 * 数组每一项 = 一段，按顺序渲染；**第 0 项是标题**（组件里单独取出来做标题）。
 */
export const WELCOME_LINES = [
  '欢迎来到 osu!mania 天梯榜！',
  'osu!mania 天梯榜（osu!mania Ladder）是由 shadiaojunshi 等人构建的一个网站，旨在收集与分类 4k 比赛谱面，并提供键型专项练习包的下载。',
  '目前，网站以谱面分类为核心。网站收录了50多个比赛的成千张不同的谱面。同时，网站也提供部分比赛难度作为参考（尽管尚不完整，且不怎么准）：你可以点击对应的方框，查看一轮图池的详细信息，甚至查看每个谱面的可视化键型。由于每次更新图包后无法保留原有的成绩，网站会以相对较低的频率进行更新。',
  '理论上，谱面中的每个 Note 都不会被修改，而视频与 storyboard 会被删除。由于网站初期缺少部分键型的分类，一些 wildcard 被归入了其他类别。如果你对录入比赛等后台工作感兴趣，欢迎联系 shadiaojunshi。',
  '特别感谢 3_Macau、bili_TYL、ddtt0、Hanenya、Polytetral、Reisen165543337（排名不分先后，以首字母排序）以及全体谱师对网站构建与比赛录入工作的大力支持！',
  '感谢 Mizar、HowtoplaySV、基尔霍夫、neeeeeh、橙叶、fanqiu、六神花露水、nmksssd、linglingyi001、GT-cangbai、bakamacro、Hylotl、灿若繁星、卢米、v1do、bubu、CapooFanboy、[Crz]Nickname、Lzq12345、tortoise_in_sky、Leo_black、dragiee、Endless fare、Yuiesta、[TCD] Dzar03、Rush_FTK、WOEM2436、千仙、Perilla、anfish、my_angel_plana 等玩家（排名不分先后，如有遗漏敬请谅解）对网站提出的建议。',
  '最后，希望这些谱面能成为你 4k 进步之路上的助推器！',
] as const
