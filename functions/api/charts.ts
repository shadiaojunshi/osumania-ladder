import { chartTargets, publicChartVersion } from '../../src/generated/publicCharts'
import { makeChartCatalog, publicChart, type PublicChartsEnv } from './_lib/publicCharts'

const catalog = makeChartCatalog(chartTargets)
export const onRequestGet: PagesFunction<PublicChartsEnv> = ({ request, env }) => publicChart(request, env, catalog, publicChartVersion)
