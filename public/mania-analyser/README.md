# 难度估计运行时

当前版本目录：`3.0.0/`。来源为用户提供的`osumania_map_analyser-3.0.0.zip`，取其中`ManiaMapAnalyser by Leo_Black/config.js`和`js/`计算模块。

压缩包SHA-256：`72b6e4f1e7a75bed142747066f45b8a4199b2f7774f6828399ffdd305b7b91d0`。

## 默认算法

以该压缩包的`config.js`为准：`estimatorAlgorithm: Mixed`、`forceSunnyWindow: true`、`etternaVersion: 0.72.3`、`companellaEtternaVersion: 0.74.0`、`extendedEstimationRange: false`。Mixed使用新版Roxy、Azusa、XDC1、Daniel、Companella和Sunny路由；7K可路由到Polaris。低难RC新增Azusa与Companella融合，RC路径支持XDC1分歧切换和融合。SunnyWindow替换LN标签时遵循新版XDC1显示门槛。

算法、解析器、区间表、Interlude、MinaCalc、ONNX模型和浏览器运行时均来自3.0.0压缩包。旧`2026-11-13/`目录保留供已打开的2.0.0页面使用；新页面统一加载`3.0.0/`，避免跨版本混用。

`estimate.js`直接调用原版`js/pipeline/runAnalysisPipeline.js`，保留Mixed路由、Sunny归一化和超过300秒的4K候选谱面前置MSD时长修正。图表、Pattern和显示用MSD计算关闭；管线的Companella二次MSD也延迟到真正产生`mixedCompanellaPlan`时，由`companella.js`使用默认0.74.0版本计算特征。这些按需优化不改变成功估算的结果。SunnyWindow替换LN标签及Companella融合后处理对照原版`js/app/core/analysis.js`。

网页通过同源模块Worker执行计算。部分低难RC和HB/LN分支会加载模型；XDC1等无需模型的路径不加载ONNX。模型及WASM在首次需要时加载，后续同一Worker复用。

运行时以原生ESM提供，保留`import.meta.url`对模型和WASM的相对寻址。更新运行时请建立新版本目录，并修改`src/lib/maniaEstimator.ts`中的`RUNTIME_ROOT`，避免旧页面的算法模块与新模型混用。

## 网站适配

- `worker.js`只传回难度结果，不把算法调试数组复制到页面。
- 模型下载、计算失败时向网页报告估计失败，保留用户已填写的值；下次重试重新创建Worker。原版overlay在模型失败时会继续显示前面的部分结果，网站采用明确失败，避免将部分结果当成完整估计。时长修正沿用原版管线的MSD不可用时跳过修正行为。
- `estimator/companellaEstimator.js`、`ett/calc.js`增加失败后清除初始化Promise，允许重试。
- 模型、WASM及模块都由网站自身提供。模型文件约0.3MB，ONNX WASM约12.4MB；它们按需请求。
- 本目录只包含计算和配置文件。网站无需tosu、OBS或独立分析器服务。

作者原MIT许可保留在版本目录的`LICENSE`中。ONNX Runtime 1.24.3的许可和第三方声明保留在`estimator/companella/ort/`中。

## 验证

`node --test --experimental-strip-types scripts/maniaAnalyser.test.mjs scripts/rawBeatmap.test.mjs`覆盖RC、HB、LN分支组合、失败重试、下载队列、上传版本变化和R2优先读取。

2026-11-16使用Edge无头浏览器执行真实模型和WASM，对照3.0.0原版完整pipeline及后处理，11类谱面的难度标签、数值及LN星数全部一致，涵盖低难RC融合、XDC1、高段融合、HB、LN、长图和6K/7K回退。浏览器对比记录位于本机`output/analyser3-browser-parity.json`。
