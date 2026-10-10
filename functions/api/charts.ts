import { chartTargets, publicChartVersion } from '../../src/generated/publicCharts'
import { makeChartCatalog, publicChart, type PublicChartsEnv } from './_lib/publicCharts'

const catalog = makeChartCatalog(chartTargets)
// 把 ctx.waitUntil 交给 publicChart：释放配额租约是尽力而为的收尾动作，
// 不能再让冷请求多等一个 Durable Object 往返 —— 见 _lib/publicCharts.ts 的 finally。
export const onRequestGet: PagesFunction<PublicChartsEnv> = ({ request, env, waitUntil }) =>
  publicChart(request, env, catalog, publicChartVersion, { waitUntil: (task) => waitUntil(task) })
