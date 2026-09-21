# 键型宣传图提示词（v3：自然风横版，牌面尺寸适中）

> 用途：给每个键型家族出一张宣传图。**牌数 = 该家族的键型个数**（不是谱面数 —— AI 画不动也没意义）。
> 叠键 = CJ / FCJ / SJ → **3 张牌**。
>
> 版本沿革：
> - v1 赛博/霓虹竖版 → 站长否掉（不要赛博、要自然、改横版、不要御姐、鼻子一笔带过）。
> - v2 按上面改完出图，**构图被认可**（横版 / 人物在右 / 右手向画面左前举牌 / 略低视角 / 倾斜）。
> - **v3 = 本版**：只改一处 —— 站长反馈「黑桃和字过于大」，故把牌面改成**适中尺寸 + 充足留白**，构图原样锁定。

## 一、通用模板（只改两处：`{{张数}}`、`{{牌面文字}}`）

**中文（实测用的就是这版，出图正常）**

```
动画宣传海报，横版构图（16:9 宽幅），以人物与纸牌为唯一主体。

人物与构图（沿用已认可的那一版）：一位年轻可爱的蓝发二次元少女（少女感，不要御姐、不要成熟女性），
位于画面**右侧**、半身入画，身体略向左侧四分之三侧身；她的**右臂朝画面左前方伸出、举手把 {{张数}} 张
扑克牌举在画面左侧偏上**的位置，牌面朝向镜头；她视线越过牌面**直视观众**，嘴角是自信得意的笑。
**略低视角**，画面整体**轻微倾斜**的动态构图，带一点压迫感。

牌面（最重要）：三张白色扑克牌，圆角、细黑边，略微扇形错开、互不遮挡，牌面正对镜头。
牌面排版要像**真实扑克**、留白充足：每张牌中央一枚**适中大小**的黑色黑桃（约占牌面高度的三分之一），
左上角一行**适中字号**的粗黑字，从左到右依次是 "{{牌面文字}}"；
**不要把黑桃或字母画得过大、不要撑满牌面、不要压住牌边**；字迹清晰、笔画完整、拼写不能错。


头发：蓝色长发，顺滑、成束、层次干净，整齐利落；不要凌乱、不要毛躁、不要炸毛、不要飞扬碎发。

脸：二次元简化五官，鼻子只用一笔带过（一条小短线即可，不要写实立体的鼻子），眼睛清爽有神。

画风：参考山下清悟的「Web系」动画质感 —— 破碎的高饱和色块、柔和的边缘光、细腻颗粒、漂浮光点、
2D 手绘线条叠在 3D 渲染底上、电影感广角；色彩自然、光照自然。不要赛博朋克、不要霓虹堆砌、
不要故障条纹、不要全息投影、不要机械感。

背景：简洁的暗色渐变背景，左上角一团柔和光晕与漂浮光点，隐约一枚放大的黑桃暗纹；
蓝色长发在身后自然垂落延伸至画面右侧与下方；人物穿宽松白色外套/衬衫（系列统一着装，可替换）。
干净、不抢主体。

细节高，线条干净，海报级对比。
```

**English（换用别的模型时用这版，语义与上面一致）**

```
Anime key visual poster, wide horizontal banner (16:9), the girl and the cards being the only subjects.

Subject & composition (same as the approved version): a young cute blue-haired anime girl — youthful, NOT a
mature onee-san type — placed on the RIGHT side of the frame, waist-up, turned about three-quarter toward the
left; her right arm reaches forward toward the LEFT of the frame, holding up {{N}} playing cards in the upper-
left area, card faces turned toward the camera; she looks PAST the cards straight at the viewer with a proud
confident smirk. Slight low angle, gently tilted dynamic framing, a bit imposing.

Cards (most important): three white playing cards, rounded corners, thin black borders, fanned slightly and
never overlapping, faces squarely toward the camera. The layout must look like REAL playing cards with plenty
of white space: one MODERATE-SIZED black spade pip centred on each card (about one third of the card height),
and one MODERATE-SIZED bold black label in the upper-left area of each card reading "{{TEXT}}".
Do NOT make the pip or the letters oversized, do NOT fill the card face with them, do NOT let them touch the
card edges; text crisp, fully formed, correctly spelled.

Hair: long blue hair, smooth, in clean thick strands, neat layered tips, tidy — NOT messy, NOT frizzy,
NOT windblown, no stray flying strands.

Face: simplified anime features; the nose is just a single small stroke (no realistic 3D nose); clear bright eyes.

Art style: "Web-gen" anime look in the manner of Shingo Yamashita — sliced blocks of saturated color, soft rim
light, fine grain, floating light specks, 2D hand-drawn line art over a 3D-rendered base, cinematic wide lens;
natural colors, natural lighting. NO cyberpunk, NO neon overload, NO glitch stripes, NO holograms, NO mecha feel.

Background: simple dark gradient, a soft glow and floating light specks in the upper-left, a faint oversized
spade motif behind; her long blue hair falls naturally and extends toward the right and bottom of the frame;
she wears a loose white jacket/shirt (consistent across the series, swappable). Clean, never competing with
the subject. High detail, clean linework, poster-grade contrast.
```

**参数**：`size = 1536x1024`（横版）、`quality = high`。

**只改两处**：`{{张数}}` 与 `{{牌面文字}}`；其余整段照抄。

## 二、叠键（本次实例）

- 牌数：**3**（= 该家族的键型个数）
- 牌面文字：`CJ`、`FCJ`、`SJ`（各一张，从左到右）

## 三、出图实测（2026-09-21 第一版）

- **牌数与牌面文字一次就对**（CJ / FCJ / SJ，拼写无误、字号够大、黑桃居中）—— 3 张牌是这套构图的最优解；
  牌再多人手和字母就开始糊，5~6 张以上建议只画黑桃、字母后期 PS 叠。
- **v3 唯一改动**：站长反馈「黑桃和字过于大」→ 牌面改成"适中尺寸 + 充足留白"（黑桃约牌面高 1/3、
  字母放在左上角且字号适中），构图原样不动。
- 两个**已知瑕疵**：
  1. 右下角有出图工具自带的水印（`AI生成 / WORKBUDDY`）→ 宣传图要用得裁掉或仿制图章抹掉。
  2. 画面边缘有轻微彩虹色差 —— 来自模板里的「轻微色差」那句，**不想要就删掉它**。
- 参考图那一版还没做：出图时**参考图没传到**，这版是纯文字生成的，跟站长的参考角色必然不一致。
  参考图补上后走图生图（`image1` + `input_fidelity`）。

## 四、各家族的键型个数（下几张图直接用这个数）

| 家族 | 键型 | 张数 |
|---|---|---|
| 叠键 | CJ、SJ、FCJ | **3** |
| RC（米） | SS、JS、SA、CJ、SJ、FCJ、MX、DP、ADP、STC、MTC、SATC、JTC、WTC、TC、ORC | **16** |
| 面条 LN | RE、CO、TE、DE、JW、SW、LNMX、LNWC、LNTC、IN、LNWL、OLN | **12** |
| HB | HB1–HB5、RCmainHB、LNmainHB、MXHB、MNTB、OHB | **10** |
| SV | SV1、SV2、SI、ME、SVMX、GM | **6** |
| TB | TB | **1** |

（按站内目录 `src/lib/realTypeCatalog.ts` 算，已排除 `PD*` 待分类族。若你要按社区习惯把家族拆得更细，
告诉我成员清单，我照同样口径重算。）

> ⚠️ **RC 的 16 张远超"能画准"的范围**（经验上限约 5~6 张牌的字还看得清）。
> RC 那张建议换构图：卡牌飞散在空中 / 手里只捏 3~4 张清晰牌面，其余当背景虚化，`CJ FCJ SJ …` 全部后期叠字。
> 要的话我按这个思路单独写一版。
