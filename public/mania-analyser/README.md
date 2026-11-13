# 难度估计运行时

当前版本目录：`2026-11-13/`。来源为用户提供的`ManiaMapAnalyser.by.Leo_Black (2).zip`及2.0.0发布说明。

压缩包SHA-256：`790da04dd0b85dc0d67ff212560ca2ddca34c41a8c820fc94f70ef7297e75322`。

## 默认算法

以该压缩包的`config.js`为准：`estimatorAlgorithm: Mixed`、`forceSunnyWindow: true`、`companellaEtternaVersion: 0.74.0`。Mixed内部按谱面选择Roxy、Azusa、Daniel、Companella或Sunny。SunnyWindow替换LN标签，Companella分支随后完成模型预测，并保留替换后的LN标签。

原先网站的26个算法文件与本次压缩包忽略行尾空白后相同；此次补全原先未执行的SunnyWindow及Companella步骤。原有算法文件迁移到本目录，避免维护两份算法。新增依赖均来自压缩包，包括Interlude、MinaCalc、ONNX模型及其浏览器WASM运行时。

`estimate.js`只组合难度估计所需的步骤，对照原版`js/pipeline/runAnalysisPipeline.js`及`js/app/analysis.js`。`companella.js`按新版默认的MinaCalc版本计算模型特征。网页通过同源模块Worker执行计算，纯RC不会加载模型；模型及WASM在首次需要时加载，后续同一Worker复用。

运行时以原生ESM提供，保留`import.meta.url`对模型和WASM的相对寻址。更新运行时请建立新版本目录，并修改`src/lib/maniaEstimator.ts`中的`RUNTIME_ROOT`，避免旧页面的算法模块与新模型混用。

## 网站适配

- `worker.js`只传回难度结果，不把算法调试数组复制到页面。
- 模型下载、计算失败时向网页报告估计失败，保留用户已填写的值；下次重试重新创建Worker。原版overlay在模型失败时会继续显示前面的部分结果，网站采用明确失败，避免将部分结果当成完整估计。
- `estimator/companellaEstimator.js`、`ett/calc.js`增加失败后清除初始化Promise，允许重试。
- 模型、WASM及模块都由网站自身提供。模型文件约0.3MB，ONNX WASM约12.4MB；它们按需请求。
- 本目录只包含计算和配置文件。网站无需tosu、OBS或独立分析器服务。

作者原MIT许可保留在版本目录的`LICENSE`中。ONNX Runtime 1.24.3的许可和第三方声明保留在`estimator/companella/ort/`中。

## 验证

`node --test --experimental-strip-types scripts/maniaAnalyser.test.mjs scripts/rawBeatmap.test.mjs`覆盖RC、HB、LN分支组合、失败重试、下载队列、上传版本变化和R2优先读取。

2026-11-13使用Edge无头浏览器执行真实模型和WASM，对照压缩包原版完整pipeline及后处理，验证难度标签、数值及LN星数一致。浏览器验证记录位于本机`output/analyser-update-2026-11-13/`。
