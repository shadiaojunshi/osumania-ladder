(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/stores/viewStore.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useViewStore",
    ()=>useViewStore
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/zustand/esm/react.mjs [app-client] (ecmascript)");
;
const useViewStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["create"])((set)=>({
        mode: 'round',
        zoom: 1,
        rowHeight: 40,
        columnWidth: 160,
        rfLnOffset: 0,
        activeFilter: null,
        searchQuery: '',
        setMode: (mode)=>set({
                mode
            }),
        setZoom: (zoom)=>set({
                zoom
            }),
        setRowHeight: (h)=>set({
                rowHeight: h
            }),
        setColumnWidth: (w)=>set({
                columnWidth: w
            }),
        setRfLnOffset: (offset)=>set({
                rfLnOffset: offset
            }),
        setActiveFilter: (filter)=>set({
                activeFilter: filter
            }),
        setSearchQuery: (query)=>set({
                searchQuery: query
            })
    }));
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/data/scales/reform-dan.json.[json].cjs [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {

module.exports = {
    "id": "reform-dan",
    "name": "Reform Dan Scale",
    "type": "rice",
    "levels": [
        {
            "id": "eta+",
            "name": "η+",
            "numericValue": 17.3,
            "color": "#000000"
        },
        {
            "id": "eta",
            "name": "η",
            "numericValue": 17.0,
            "color": "#050510"
        },
        {
            "id": "eta-",
            "name": "η-",
            "numericValue": 16.7,
            "color": "#0a0a1a"
        },
        {
            "id": "zeta+",
            "name": "ζ+",
            "numericValue": 16.3,
            "color": "#10082a"
        },
        {
            "id": "zeta",
            "name": "ζ",
            "numericValue": 16.0,
            "color": "#1a0d3d"
        },
        {
            "id": "zeta-",
            "name": "ζ-",
            "numericValue": 15.7,
            "color": "#200f4a"
        },
        {
            "id": "epsilon+",
            "name": "ε+",
            "numericValue": 15.3,
            "color": "#2a1060"
        },
        {
            "id": "epsilon",
            "name": "ε",
            "numericValue": 15.0,
            "color": "#331177"
        },
        {
            "id": "epsilon-",
            "name": "ε-",
            "numericValue": 14.7,
            "color": "#3d1280"
        },
        {
            "id": "delta+",
            "name": "δ+",
            "numericValue": 14.3,
            "color": "#551a8b"
        },
        {
            "id": "delta",
            "name": "δ",
            "numericValue": 14.0,
            "color": "#6b2299"
        },
        {
            "id": "delta-",
            "name": "δ-",
            "numericValue": 13.7,
            "color": "#7a1a6b"
        },
        {
            "id": "gamma+",
            "name": "γ+",
            "numericValue": 13.3,
            "color": "#8b1a4a"
        },
        {
            "id": "gamma",
            "name": "γ",
            "numericValue": 13.0,
            "color": "#9b1b2e"
        },
        {
            "id": "gamma-",
            "name": "γ-",
            "numericValue": 12.7,
            "color": "#a82020"
        },
        {
            "id": "beta+",
            "name": "β+",
            "numericValue": 12.3,
            "color": "#b83318"
        },
        {
            "id": "beta",
            "name": "β",
            "numericValue": 12.0,
            "color": "#cc4400"
        },
        {
            "id": "beta-",
            "name": "β-",
            "numericValue": 11.7,
            "color": "#d45a00"
        },
        {
            "id": "alpha+",
            "name": "α+",
            "numericValue": 11.3,
            "color": "#dd6600"
        },
        {
            "id": "alpha",
            "name": "α",
            "numericValue": 11.0,
            "color": "#e67300"
        },
        {
            "id": "alpha-",
            "name": "α-",
            "numericValue": 10.7,
            "color": "#ee8800"
        },
        {
            "id": "rf10+",
            "name": "10+",
            "numericValue": 10.3,
            "color": "#ccaa00"
        },
        {
            "id": "rf10",
            "name": "10",
            "numericValue": 10.0,
            "color": "#bbbb00"
        },
        {
            "id": "rf10-",
            "name": "10-",
            "numericValue": 9.7,
            "color": "#aacc00"
        },
        {
            "id": "rf9+",
            "name": "9+",
            "numericValue": 9.3,
            "color": "#99cc00"
        },
        {
            "id": "rf9",
            "name": "9",
            "numericValue": 9.0,
            "color": "#88cc00"
        },
        {
            "id": "rf9-",
            "name": "9-",
            "numericValue": 8.7,
            "color": "#77cc11"
        },
        {
            "id": "rf8+",
            "name": "8+",
            "numericValue": 8.3,
            "color": "#66bb22"
        },
        {
            "id": "rf8",
            "name": "8",
            "numericValue": 8.0,
            "color": "#55aa33"
        },
        {
            "id": "rf8-",
            "name": "8-",
            "numericValue": 7.7,
            "color": "#449944"
        },
        {
            "id": "rf7+",
            "name": "7+",
            "numericValue": 7.3,
            "color": "#338855"
        },
        {
            "id": "rf7",
            "name": "7",
            "numericValue": 7.0,
            "color": "#228866"
        },
        {
            "id": "rf7-",
            "name": "7-",
            "numericValue": 6.7,
            "color": "#118877"
        },
        {
            "id": "rf6+",
            "name": "6+",
            "numericValue": 6.3,
            "color": "#008888"
        },
        {
            "id": "rf6",
            "name": "6",
            "numericValue": 6.0,
            "color": "#007799"
        },
        {
            "id": "rf6-",
            "name": "6-",
            "numericValue": 5.7,
            "color": "#0066aa"
        },
        {
            "id": "rf5+",
            "name": "5+",
            "numericValue": 5.3,
            "color": "#3388cc"
        },
        {
            "id": "rf5",
            "name": "5",
            "numericValue": 5.0,
            "color": "#4499dd"
        },
        {
            "id": "rf5-",
            "name": "5-",
            "numericValue": 4.7,
            "color": "#55aaee"
        },
        {
            "id": "rf4+",
            "name": "4+",
            "numericValue": 4.3,
            "color": "#66b5f0"
        },
        {
            "id": "rf4",
            "name": "4",
            "numericValue": 4.0,
            "color": "#77c0f4"
        },
        {
            "id": "rf4-",
            "name": "4-",
            "numericValue": 3.7,
            "color": "#88ccf7"
        },
        {
            "id": "rf3+",
            "name": "3+",
            "numericValue": 3.3,
            "color": "#99d4f9"
        },
        {
            "id": "rf3",
            "name": "3",
            "numericValue": 3.0,
            "color": "#aaddfa"
        },
        {
            "id": "rf3-",
            "name": "3-",
            "numericValue": 2.7,
            "color": "#bbe5fb"
        },
        {
            "id": "rf2+",
            "name": "2+",
            "numericValue": 2.3,
            "color": "#cceafc"
        },
        {
            "id": "rf2",
            "name": "2",
            "numericValue": 2.0,
            "color": "#ddf0fd"
        },
        {
            "id": "rf2-",
            "name": "2-",
            "numericValue": 1.7,
            "color": "#e5f3fe"
        },
        {
            "id": "rf1+",
            "name": "1+",
            "numericValue": 1.3,
            "color": "#edf7fe"
        },
        {
            "id": "rf1",
            "name": "1",
            "numericValue": 1.0,
            "color": "#f0f9ff"
        },
        {
            "id": "intro3",
            "name": "intro3",
            "numericValue": 0.75,
            "color": "#f5fbff"
        },
        {
            "id": "intro2",
            "name": "intro2",
            "numericValue": 0.5,
            "color": "#f8fcff"
        },
        {
            "id": "intro1",
            "name": "intro1",
            "numericValue": 0.25,
            "color": "#fbfdff"
        },
        {
            "id": "intro1-",
            "name": "intro1-",
            "numericValue": 0.1,
            "color": "#fdfeff"
        }
    ]
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/lib/difficulty.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "difficultyToY",
    ()=>difficultyToY,
    "getDifficultyColor",
    ()=>getDifficultyColor,
    "getGradientForRange",
    ()=>getGradientForRange,
    "yToDifficulty",
    ()=>yToDifficulty
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$scales$2f$reform$2d$dan$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/data/scales/reform-dan.json.[json].cjs [app-client] (ecmascript)");
;
const levels = __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$scales$2f$reform$2d$dan$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].levels;
function difficultyToY(difficulty, containerHeight, range) {
    const ratio = (range.max - difficulty) / (range.max - range.min);
    return ratio * containerHeight;
}
function yToDifficulty(y, containerHeight, range) {
    const ratio = y / containerHeight;
    return range.max - ratio * (range.max - range.min);
}
function getDifficultyColor(difficulty) {
    for(let i = 0; i < levels.length - 1; i++){
        const upper = levels[i];
        const lower = levels[i + 1];
        if (difficulty >= lower.numericValue && difficulty <= upper.numericValue) {
            const t = (difficulty - lower.numericValue) / (upper.numericValue - lower.numericValue);
            return interpolateColor(lower.color, upper.color, t);
        }
    }
    if (difficulty >= levels[0].numericValue) return levels[0].color;
    return levels[levels.length - 1].color;
}
function interpolateColor(color1, color2, t) {
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);
    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
function getGradientForRange(minDiff, maxDiff) {
    if (maxDiff - minDiff < 1) {
        const midColor = getDifficultyColor((minDiff + maxDiff) / 2);
        return midColor;
    }
    const stops = [];
    const steps = Math.min(Math.ceil(maxDiff - minDiff), 8);
    for(let i = 0; i <= steps; i++){
        const diff = maxDiff - i / steps * (maxDiff - minDiff);
        const color = getDifficultyColor(diff);
        const pct = Math.round(i / steps * 100);
        stops.push(`${color} ${pct}%`);
    }
    return `linear-gradient(to bottom, ${stops.join(', ')})`;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/data/tournaments/mwc-4k-2024.json.[json].cjs [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {

module.exports = {
    "id": "mwc-4k-2024",
    "name": "osu!mania 4K World Cup 2024",
    "abbreviation": "MWC 4K 2024",
    "forumUrl": "https://osu.ppy.sh/community/forums/topics/1게시판",
    "wikiUrl": "https://osu.ppy.sh/wiki/en/Tournaments/MWC/2024_4K",
    "keyCount": 4,
    "year": 2024,
    "tags": [
        "official",
        "4k",
        "world-cup"
    ],
    "rounds": [
        {
            "id": "mwc2024-qual",
            "name": "Qualifiers",
            "abbreviation": "Qual",
            "order": 0,
            "isQualifier": true,
            "difficulty": {
                "min": 8.5,
                "max": 11.0,
                "average": 9.8
            },
            "maps": [
                {
                    "slot": "ST1",
                    "type": "ST",
                    "realType": "JS",
                    "name": "Stage 1",
                    "difficulty": 8.5
                },
                {
                    "slot": "ST2",
                    "type": "ST",
                    "realType": "SA",
                    "name": "Stage 2",
                    "difficulty": 9.0
                },
                {
                    "slot": "ST3",
                    "type": "ST",
                    "realType": "HB1",
                    "name": "Stage 3",
                    "difficulty": 9.5
                },
                {
                    "slot": "ST4",
                    "type": "ST",
                    "realType": "RE",
                    "name": "Stage 4",
                    "difficulty": 10.0
                },
                {
                    "slot": "ST5",
                    "type": "ST",
                    "realType": "CJ",
                    "name": "Stage 5",
                    "difficulty": 10.2
                },
                {
                    "slot": "ST6",
                    "type": "ST",
                    "realType": "SV1",
                    "name": "Stage 6",
                    "difficulty": 10.5
                },
                {
                    "slot": "ST7",
                    "type": "ST",
                    "realType": "SS",
                    "name": "Stage 7",
                    "difficulty": 11.0
                }
            ]
        },
        {
            "id": "mwc2024-ro32",
            "name": "Round of 32",
            "abbreviation": "RO32",
            "order": 1,
            "bestOf": 9,
            "difficulty": {
                "min": 9.0,
                "max": 11.5,
                "average": 10.2
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1 - Stream",
                    "difficulty": 9.5
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2 - Jumpstream",
                    "difficulty": 9.8
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "SA",
                    "name": "RC3 - Stamina",
                    "difficulty": 10.0
                },
                {
                    "slot": "RC4",
                    "type": "RC",
                    "realType": "CJ",
                    "name": "RC4 - Chordjack",
                    "difficulty": 9.2
                },
                {
                    "slot": "RC5",
                    "type": "RC",
                    "realType": "TC",
                    "name": "RC5 - Tech",
                    "difficulty": 9.0
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1 - Speed Hybrid",
                    "difficulty": 10.2
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2 - Jack Hybrid",
                    "difficulty": 10.0
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1 - Coordination",
                    "difficulty": 10.5
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2 - Release",
                    "difficulty": 10.8
                },
                {
                    "slot": "LN3",
                    "type": "LN",
                    "realType": "DE",
                    "name": "LN3 - Density",
                    "difficulty": 11.0
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1 - Pattern",
                    "difficulty": 10.0
                },
                {
                    "slot": "SV2",
                    "type": "SV",
                    "realType": "SV2",
                    "name": "SV2 - Rhythm",
                    "difficulty": 10.5
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB - Tiebreaker",
                    "difficulty": 11.5
                }
            ]
        },
        {
            "id": "mwc2024-ro16",
            "name": "Round of 16",
            "abbreviation": "RO16",
            "order": 2,
            "bestOf": 9,
            "difficulty": {
                "min": 10.0,
                "max": 12.5,
                "average": 11.2
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1 - Stream",
                    "difficulty": 10.5
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2 - Jumpstream",
                    "difficulty": 10.8
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "SA",
                    "name": "RC3 - Stamina",
                    "difficulty": 11.0
                },
                {
                    "slot": "RC4",
                    "type": "RC",
                    "realType": "CJ",
                    "name": "RC4 - Chordjack",
                    "difficulty": 10.2
                },
                {
                    "slot": "RC5",
                    "type": "RC",
                    "realType": "TC",
                    "name": "RC5 - Tech",
                    "difficulty": 10.0
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1 - Speed Hybrid",
                    "difficulty": 11.2
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB3",
                    "name": "HB2 - Tech Hybrid",
                    "difficulty": 11.0
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1 - Coordination",
                    "difficulty": 11.5
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2 - Release",
                    "difficulty": 11.8
                },
                {
                    "slot": "LN3",
                    "type": "LN",
                    "realType": "DE",
                    "name": "LN3 - Density",
                    "difficulty": 12.0
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1 - Pattern",
                    "difficulty": 11.0
                },
                {
                    "slot": "SV2",
                    "type": "SV",
                    "realType": "SV2",
                    "name": "SV2 - Rhythm",
                    "difficulty": 11.5
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB - Tiebreaker",
                    "difficulty": 12.5
                }
            ]
        },
        {
            "id": "mwc2024-qf",
            "name": "Quarterfinals",
            "abbreviation": "QF",
            "order": 3,
            "bestOf": 11,
            "difficulty": {
                "min": 11.0,
                "max": 13.5,
                "average": 12.2
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1 - Stream",
                    "difficulty": 11.5
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2 - Jumpstream",
                    "difficulty": 11.8
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "SA",
                    "name": "RC3 - Stamina",
                    "difficulty": 12.0
                },
                {
                    "slot": "RC4",
                    "type": "RC",
                    "realType": "CJ",
                    "name": "RC4 - Chordjack",
                    "difficulty": 11.2
                },
                {
                    "slot": "RC5",
                    "type": "RC",
                    "realType": "MX",
                    "name": "RC5 - Mix",
                    "difficulty": 11.0
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1 - Speed Hybrid",
                    "difficulty": 12.2
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2 - Jack Hybrid",
                    "difficulty": 12.0
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1 - Coordination",
                    "difficulty": 12.5
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2 - Release",
                    "difficulty": 12.8
                },
                {
                    "slot": "LN3",
                    "type": "LN",
                    "realType": "DE",
                    "name": "LN3 - Density",
                    "difficulty": 13.0
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1 - Pattern",
                    "difficulty": 12.0
                },
                {
                    "slot": "SV2",
                    "type": "SV",
                    "realType": "SV2",
                    "name": "SV2 - Rhythm",
                    "difficulty": 12.5
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB - Tiebreaker",
                    "difficulty": 13.5
                }
            ]
        },
        {
            "id": "mwc2024-sf",
            "name": "Semifinals",
            "abbreviation": "SF",
            "order": 4,
            "bestOf": 11,
            "difficulty": {
                "min": 12.0,
                "max": 14.5,
                "average": 13.2
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1 - Stream",
                    "difficulty": 12.5
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2 - Jumpstream",
                    "difficulty": 12.8
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "SA",
                    "name": "RC3 - Stamina",
                    "difficulty": 13.0
                },
                {
                    "slot": "RC4",
                    "type": "RC",
                    "realType": "CJ",
                    "name": "RC4 - Chordjack",
                    "difficulty": 12.2
                },
                {
                    "slot": "RC5",
                    "type": "RC",
                    "realType": "MX",
                    "name": "RC5 - Mix",
                    "difficulty": 12.0
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1 - Speed Hybrid",
                    "difficulty": 13.2
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB3",
                    "name": "HB2 - Tech Hybrid",
                    "difficulty": 13.0
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1 - Coordination",
                    "difficulty": 13.5
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2 - Release",
                    "difficulty": 13.8
                },
                {
                    "slot": "LN3",
                    "type": "LN",
                    "realType": "DE",
                    "name": "LN3 - Density",
                    "difficulty": 14.0
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1 - Pattern",
                    "difficulty": 13.0
                },
                {
                    "slot": "SV2",
                    "type": "SV",
                    "realType": "SV2",
                    "name": "SV2 - Rhythm",
                    "difficulty": 13.5
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB - Tiebreaker",
                    "difficulty": 14.5
                }
            ]
        },
        {
            "id": "mwc2024-f",
            "name": "Finals",
            "abbreviation": "F",
            "order": 5,
            "bestOf": 13,
            "difficulty": {
                "min": 13.0,
                "max": 15.5,
                "average": 14.2
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1 - Stream",
                    "difficulty": 13.5
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2 - Jumpstream",
                    "difficulty": 13.8
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "SA",
                    "name": "RC3 - Stamina",
                    "difficulty": 14.0
                },
                {
                    "slot": "RC4",
                    "type": "RC",
                    "realType": "CJ",
                    "name": "RC4 - Chordjack",
                    "difficulty": 13.2
                },
                {
                    "slot": "RC5",
                    "type": "RC",
                    "realType": "MX",
                    "name": "RC5 - Mix",
                    "difficulty": 13.0
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1 - Speed Hybrid",
                    "difficulty": 14.2
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2 - Jack Hybrid",
                    "difficulty": 14.0
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1 - Coordination",
                    "difficulty": 14.5
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2 - Release",
                    "difficulty": 14.8
                },
                {
                    "slot": "LN3",
                    "type": "LN",
                    "realType": "DE",
                    "name": "LN3 - Density",
                    "difficulty": 15.0
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1 - Pattern",
                    "difficulty": 14.0
                },
                {
                    "slot": "SV2",
                    "type": "SV",
                    "realType": "SV2",
                    "name": "SV2 - Rhythm",
                    "difficulty": 14.5
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB - Tiebreaker",
                    "difficulty": 15.5
                }
            ]
        },
        {
            "id": "mwc2024-gf",
            "name": "Grand Finals",
            "abbreviation": "GF",
            "order": 6,
            "bestOf": 13,
            "difficulty": {
                "min": 14.0,
                "max": 16.5,
                "average": 15.2
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1 - Stream",
                    "difficulty": 14.5
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2 - Jumpstream",
                    "difficulty": 14.8
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "SA",
                    "name": "RC3 - Stamina",
                    "difficulty": 15.0
                },
                {
                    "slot": "RC4",
                    "type": "RC",
                    "realType": "CJ",
                    "name": "RC4 - Chordjack",
                    "difficulty": 14.2
                },
                {
                    "slot": "RC5",
                    "type": "RC",
                    "realType": "MX",
                    "name": "RC5 - Mix",
                    "difficulty": 14.0
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1 - Speed Hybrid",
                    "difficulty": 15.2
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2 - Jack Hybrid",
                    "difficulty": 15.0
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1 - Coordination",
                    "difficulty": 15.5
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2 - Release",
                    "difficulty": 15.8
                },
                {
                    "slot": "LN3",
                    "type": "LN",
                    "realType": "DE",
                    "name": "LN3 - Density",
                    "difficulty": 16.0
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1 - Pattern",
                    "difficulty": 15.0
                },
                {
                    "slot": "SV2",
                    "type": "SV",
                    "realType": "SV2",
                    "name": "SV2 - Rhythm",
                    "difficulty": 15.5
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB - Tiebreaker",
                    "difficulty": 16.5
                }
            ]
        }
    ],
    "customTypes": []
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/data/tournaments/gbc-2025-spring.json.[json].cjs [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {

module.exports = {
    "id": "gbc-2025-spring",
    "name": "GBC 2025 Spring",
    "abbreviation": "GBC 2025 Spring",
    "forumUrl": "https://osu.ppy.sh/community/forums/topics/example",
    "keyCount": 4,
    "year": 2025,
    "tags": [
        "community",
        "4k"
    ],
    "rounds": [
        {
            "id": "gbc2025s-qual",
            "name": "Qualifiers",
            "abbreviation": "Qual",
            "order": 0,
            "isQualifier": true,
            "difficulty": {
                "min": 6.0,
                "max": 9.0,
                "average": 7.5
            },
            "maps": [
                {
                    "slot": "ST1",
                    "type": "ST",
                    "realType": "JS",
                    "name": "Stage 1",
                    "difficulty": 6.0
                },
                {
                    "slot": "ST2",
                    "type": "ST",
                    "realType": "SA",
                    "name": "Stage 2",
                    "difficulty": 6.5
                },
                {
                    "slot": "ST3",
                    "type": "ST",
                    "realType": "HB1",
                    "name": "Stage 3",
                    "difficulty": 7.0
                },
                {
                    "slot": "ST4",
                    "type": "ST",
                    "realType": "RE",
                    "name": "Stage 4",
                    "difficulty": 7.5
                },
                {
                    "slot": "ST5",
                    "type": "ST",
                    "realType": "CJ",
                    "name": "Stage 5",
                    "difficulty": 8.0
                },
                {
                    "slot": "ST6",
                    "type": "ST",
                    "realType": "SV1",
                    "name": "Stage 6",
                    "difficulty": 8.5
                },
                {
                    "slot": "ST7",
                    "type": "ST",
                    "realType": "SS",
                    "name": "Stage 7",
                    "difficulty": 9.0
                }
            ]
        },
        {
            "id": "gbc2025s-r1",
            "name": "Round 1",
            "abbreviation": "R1",
            "order": 1,
            "bestOf": 9,
            "difficulty": {
                "min": 6.5,
                "max": 9.5,
                "average": 8.0
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1",
                    "difficulty": 7.0
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2",
                    "difficulty": 7.5
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "CJ",
                    "name": "RC3",
                    "difficulty": 6.5
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 7.8
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2",
                    "difficulty": 8.0
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 8.2
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 8.5
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1",
                    "difficulty": 8.0
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB",
                    "difficulty": 9.5
                }
            ]
        },
        {
            "id": "gbc2025s-r2",
            "name": "Round 2",
            "abbreviation": "R2",
            "order": 2,
            "bestOf": 9,
            "difficulty": {
                "min": 7.5,
                "max": 10.5,
                "average": 9.0
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1",
                    "difficulty": 8.0
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2",
                    "difficulty": 8.5
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "SA",
                    "name": "RC3",
                    "difficulty": 7.5
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 8.8
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB3",
                    "name": "HB2",
                    "difficulty": 9.0
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 9.2
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "DE",
                    "name": "LN2",
                    "difficulty": 9.5
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV2",
                    "name": "SV1",
                    "difficulty": 9.0
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB",
                    "difficulty": 10.5
                }
            ]
        },
        {
            "id": "gbc2025s-r3",
            "name": "Round 3",
            "abbreviation": "R3",
            "order": 3,
            "bestOf": 11,
            "difficulty": {
                "min": 8.5,
                "max": 11.5,
                "average": 10.0
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1",
                    "difficulty": 9.0
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2",
                    "difficulty": 9.5
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "SA",
                    "name": "RC3",
                    "difficulty": 8.5
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 9.8
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2",
                    "difficulty": 10.0
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 10.2
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 10.5
                },
                {
                    "slot": "LN3",
                    "type": "LN",
                    "realType": "DE",
                    "name": "LN3",
                    "difficulty": 10.8
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1",
                    "difficulty": 10.0
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB",
                    "difficulty": 11.5
                }
            ]
        },
        {
            "id": "gbc2025s-r4",
            "name": "Round 4",
            "abbreviation": "R4",
            "order": 4,
            "bestOf": 11,
            "difficulty": {
                "min": 9.5,
                "max": 12.5,
                "average": 11.0
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1",
                    "difficulty": 10.0
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2",
                    "difficulty": 10.5
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "CJ",
                    "name": "RC3",
                    "difficulty": 9.5
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 10.8
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB3",
                    "name": "HB2",
                    "difficulty": 11.0
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 11.2
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 11.5
                },
                {
                    "slot": "LN3",
                    "type": "LN",
                    "realType": "DE",
                    "name": "LN3",
                    "difficulty": 11.8
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1",
                    "difficulty": 11.0
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB",
                    "difficulty": 12.5
                }
            ]
        }
    ],
    "customTypes": []
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/ladder/HoverCard.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "HoverCard",
    ()=>HoverCard
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
'use client';
;
function HoverCard({ round, tournament, x, y, onMouseEnter, onMouseLeave }) {
    const diffLabel = getDifficultyLabel(round.difficulty.average);
    const cardX = Math.min(x + 12, window.innerWidth - 280);
    const cardY = Math.min(y + 12, window.innerHeight - 200);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 max-w-xs",
        style: {
            left: cardX,
            top: cardY
        },
        onMouseEnter: onMouseEnter,
        onMouseLeave: onMouseLeave,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "font-semibold text-sm mb-1",
                children: [
                    tournament.abbreviation,
                    " ",
                    round.abbreviation
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/ladder/HoverCard.tsx",
                lineNumber: 32,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-xs text-gray-600 mb-2",
                children: diffLabel
            }, void 0, false, {
                fileName: "[project]/src/components/ladder/HoverCard.tsx",
                lineNumber: 35,
                columnNumber: 7
            }, this),
            tournament.forumUrl && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                href: tournament.forumUrl,
                target: "_blank",
                rel: "noopener noreferrer",
                className: "text-xs text-blue-500 hover:underline block",
                children: "论坛帖"
            }, void 0, false, {
                fileName: "[project]/src/components/ladder/HoverCard.tsx",
                lineNumber: 39,
                columnNumber: 9
            }, this),
            tournament.wikiUrl && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                href: tournament.wikiUrl,
                target: "_blank",
                rel: "noopener noreferrer",
                className: "text-xs text-blue-500 hover:underline block",
                children: "Wiki"
            }, void 0, false, {
                fileName: "[project]/src/components/ladder/HoverCard.tsx",
                lineNumber: 49,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-xs text-gray-400 mt-1",
                children: [
                    round.maps.length,
                    " 张谱面 · 难度 ",
                    round.difficulty.min.toFixed(1),
                    " ~ ",
                    round.difficulty.max.toFixed(1)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/ladder/HoverCard.tsx",
                lineNumber: 58,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/ladder/HoverCard.tsx",
        lineNumber: 26,
        columnNumber: 5
    }, this);
}
_c = HoverCard;
function getDifficultyLabel(avg) {
    if (avg >= 17) return '~η';
    if (avg >= 16) return '~ζ';
    if (avg >= 15) return '~ε';
    if (avg >= 14) return '~δ';
    if (avg >= 13) return '~γ';
    if (avg >= 12) return '~β';
    if (avg >= 11) return '~α';
    if (avg >= 10) return '~10th Dan';
    if (avg >= 9) return '~9th Dan';
    if (avg >= 8) return '~8th Dan';
    if (avg >= 7) return '~7th Dan';
    if (avg >= 6) return '~6th Dan';
    if (avg >= 5) return '~5th Dan';
    return `~${Math.floor(avg)}th Dan`;
}
var _c;
__turbopack_context__.k.register(_c, "HoverCard");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/ladder/LadderView.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "LadderView",
    ()=>LadderView
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/stores/viewStore.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/difficulty.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$tournaments$2f$mwc$2d$4k$2d$2024$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/data/tournaments/mwc-4k-2024.json.[json].cjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$tournaments$2f$gbc$2d$2025$2d$spring$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/data/tournaments/gbc-2025-spring.json.[json].cjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ladder$2f$HoverCard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ladder/HoverCard.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
;
const tournaments = [
    __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$tournaments$2f$mwc$2d$4k$2d$2024$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"],
    __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$tournaments$2f$gbc$2d$2025$2d$spring$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"]
];
const DIFFICULTY_RANGE = {
    min: 0.5,
    max: 17.5
};
function LadderView() {
    _s();
    const { mode, zoom, columnWidth, rowHeight, activeFilter, searchQuery } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useViewStore"])();
    const containerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [hoveredRound, setHoveredRound] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [hoverLocked, setHoverLocked] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const diffRange = DIFFICULTY_RANGE.max - DIFFICULTY_RANGE.min;
    const containerHeight = diffRange * rowHeight * zoom;
    const filteredTournaments = tournaments.filter((t)=>{
        if (!searchQuery) return true;
        return t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.abbreviation.toLowerCase().includes(searchQuery.toLowerCase());
    });
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex-1 overflow-auto relative ladder-container",
        ref: containerRef,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "relative flex gap-2 px-2 pt-2",
                style: {
                    height: containerHeight,
                    minWidth: filteredTournaments.length * (columnWidth + 8)
                },
                children: filteredTournaments.map((tournament)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(TournamentColumn, {
                        tournament: tournament,
                        mode: mode,
                        containerHeight: containerHeight,
                        columnWidth: columnWidth,
                        activeFilter: activeFilter,
                        onHover: (round, x, y)=>{
                            if (!hoverLocked) setHoveredRound({
                                round,
                                tournament,
                                x,
                                y
                            });
                        },
                        onLeave: ()=>{
                            if (!hoverLocked) setHoveredRound(null);
                        }
                    }, tournament.id, false, {
                        fileName: "[project]/src/components/ladder/LadderView.tsx",
                        lineNumber: 37,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/components/ladder/LadderView.tsx",
                lineNumber: 32,
                columnNumber: 7
            }, this),
            hoveredRound && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ladder$2f$HoverCard$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HoverCard"], {
                round: hoveredRound.round,
                tournament: hoveredRound.tournament,
                x: hoveredRound.x,
                y: hoveredRound.y,
                onMouseEnter: ()=>setHoverLocked(true),
                onMouseLeave: ()=>{
                    setHoverLocked(false);
                    setHoveredRound(null);
                }
            }, void 0, false, {
                fileName: "[project]/src/components/ladder/LadderView.tsx",
                lineNumber: 51,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/ladder/LadderView.tsx",
        lineNumber: 31,
        columnNumber: 5
    }, this);
}
_s(LadderView, "NPkPhaQAsLBqlRHuInC1zJAevm4=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useViewStore"]
    ];
});
_c = LadderView;
function TournamentColumn({ tournament, mode, containerHeight, columnWidth, activeFilter, onHover, onLeave }) {
    if (mode === 'tournament') {
        const allDiffs = tournament.rounds.flatMap((r)=>[
                r.difficulty.min,
                r.difficulty.max
            ]);
        const minDiff = Math.min(...allDiffs);
        const maxDiff = Math.max(...allDiffs);
        const top = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["difficultyToY"])(maxDiff, containerHeight, DIFFICULTY_RANGE);
        const bottom = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["difficultyToY"])(minDiff, containerHeight, DIFFICULTY_RANGE);
        const height = Math.max(bottom - top, 32);
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "relative shrink-0",
            style: {
                width: columnWidth
            },
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "text-xs text-center text-gray-500 truncate mb-1 font-medium",
                    children: tournament.abbreviation
                }, void 0, false, {
                    fileName: "[project]/src/components/ladder/LadderView.tsx",
                    lineNumber: 91,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "round-box absolute left-0 right-0",
                    style: {
                        top: top + 20,
                        height,
                        background: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getGradientForRange"])(minDiff, maxDiff)
                    },
                    children: tournament.abbreviation
                }, void 0, false, {
                    fileName: "[project]/src/components/ladder/LadderView.tsx",
                    lineNumber: 94,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/ladder/LadderView.tsx",
            lineNumber: 90,
            columnNumber: 7
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "relative shrink-0",
        style: {
            width: columnWidth
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-xs text-center text-gray-500 truncate mb-1 font-medium",
                children: tournament.abbreviation
            }, void 0, false, {
                fileName: "[project]/src/components/ladder/LadderView.tsx",
                lineNumber: 110,
                columnNumber: 7
            }, this),
            tournament.rounds.map((round)=>{
                const top = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["difficultyToY"])(round.difficulty.max, containerHeight, DIFFICULTY_RANGE);
                const bottom = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["difficultyToY"])(round.difficulty.min, containerHeight, DIFFICULTY_RANGE);
                const height = Math.max(bottom - top, 36);
                if (mode === 'type') {
                    const types = getUniqueTypes(round);
                    return types.map((type)=>{
                        const typeMaps = round.maps.filter((m)=>m.type === type);
                        const typeMin = Math.min(...typeMaps.map((m)=>m.difficulty));
                        const typeMax = Math.max(...typeMaps.map((m)=>m.difficulty));
                        const typeTop = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["difficultyToY"])(typeMax, containerHeight, DIFFICULTY_RANGE);
                        const typeBottom = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["difficultyToY"])(typeMin, containerHeight, DIFFICULTY_RANGE);
                        const typeHeight = Math.max(typeBottom - typeTop, 28);
                        const isDimmed = activeFilter && activeFilter !== type;
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: `round-box absolute left-0 right-0 ${isDimmed ? 'dimmed' : ''}`,
                            style: {
                                top: typeTop + 20,
                                height: typeHeight,
                                background: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getGradientForRange"])(typeMin, typeMax),
                                fontSize: '10px'
                            },
                            onMouseEnter: (e)=>onHover(round, e.clientX, e.clientY),
                            onMouseLeave: onLeave,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "truncate block w-full",
                                children: [
                                    tournament.abbreviation,
                                    " ",
                                    round.abbreviation,
                                    " ",
                                    type
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/ladder/LadderView.tsx",
                                lineNumber: 142,
                                columnNumber: 17
                            }, this)
                        }, `${round.id}-${type}`, false, {
                            fileName: "[project]/src/components/ladder/LadderView.tsx",
                            lineNumber: 130,
                            columnNumber: 15
                        }, this);
                    });
                }
                const isDimmed = activeFilter && !round.maps.some((m)=>m.type === activeFilter);
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: `round-box absolute left-0 right-0 ${isDimmed ? 'dimmed' : ''}`,
                    style: {
                        top: top + 20,
                        height,
                        background: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getGradientForRange"])(round.difficulty.min, round.difficulty.max)
                    },
                    onMouseEnter: (e)=>onHover(round, e.clientX, e.clientY),
                    onMouseLeave: onLeave,
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "truncate block w-full",
                        children: [
                            tournament.abbreviation,
                            " ",
                            round.abbreviation
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/ladder/LadderView.tsx",
                        lineNumber: 162,
                        columnNumber: 13
                    }, this)
                }, round.id, false, {
                    fileName: "[project]/src/components/ladder/LadderView.tsx",
                    lineNumber: 151,
                    columnNumber: 11
                }, this);
            })
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/ladder/LadderView.tsx",
        lineNumber: 109,
        columnNumber: 5
    }, this);
}
_c1 = TournamentColumn;
function getUniqueTypes(round) {
    const seen = new Set();
    return round.maps.map((m)=>m.type).filter((t)=>{
        if (seen.has(t)) return false;
        seen.add(t);
        return true;
    });
}
var _c, _c1;
__turbopack_context__.k.register(_c, "LadderView");
__turbopack_context__.k.register(_c1, "TournamentColumn");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/data/scales/ln-dan.json.[json].cjs [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {

module.exports = {
    "id": "ln-dan",
    "name": "LN Dan Scale",
    "type": "ln",
    "levels": [
        {
            "id": "ln17+",
            "name": "17+",
            "numericValue": 17.3,
            "color": "#000000"
        },
        {
            "id": "ln17",
            "name": "17",
            "numericValue": 17.0,
            "color": "#050510"
        },
        {
            "id": "ln17-",
            "name": "17-",
            "numericValue": 16.7,
            "color": "#0a0a1a"
        },
        {
            "id": "ln16+",
            "name": "16+",
            "numericValue": 16.3,
            "color": "#10082a"
        },
        {
            "id": "ln16",
            "name": "16",
            "numericValue": 16.0,
            "color": "#1a0d3d"
        },
        {
            "id": "ln16-",
            "name": "16-",
            "numericValue": 15.7,
            "color": "#200f4a"
        },
        {
            "id": "ln15+",
            "name": "15+",
            "numericValue": 15.3,
            "color": "#2a1060"
        },
        {
            "id": "ln15",
            "name": "15",
            "numericValue": 15.0,
            "color": "#331177"
        },
        {
            "id": "ln15-",
            "name": "15-",
            "numericValue": 14.7,
            "color": "#3d1280"
        },
        {
            "id": "ln14+",
            "name": "14+",
            "numericValue": 14.3,
            "color": "#551a8b"
        },
        {
            "id": "ln14",
            "name": "14",
            "numericValue": 14.0,
            "color": "#6b2299"
        },
        {
            "id": "ln14-",
            "name": "14-",
            "numericValue": 13.7,
            "color": "#7a1a6b"
        },
        {
            "id": "ln13+",
            "name": "13+",
            "numericValue": 13.3,
            "color": "#8b1a4a"
        },
        {
            "id": "ln13",
            "name": "13",
            "numericValue": 13.0,
            "color": "#9b1b2e"
        },
        {
            "id": "ln13-",
            "name": "13-",
            "numericValue": 12.7,
            "color": "#a82020"
        },
        {
            "id": "ln12+",
            "name": "12+",
            "numericValue": 12.3,
            "color": "#b83318"
        },
        {
            "id": "ln12",
            "name": "12",
            "numericValue": 12.0,
            "color": "#cc4400"
        },
        {
            "id": "ln12-",
            "name": "12-",
            "numericValue": 11.7,
            "color": "#d45a00"
        },
        {
            "id": "ln11+",
            "name": "11+",
            "numericValue": 11.3,
            "color": "#dd6600"
        },
        {
            "id": "ln11",
            "name": "11",
            "numericValue": 11.0,
            "color": "#e67300"
        },
        {
            "id": "ln11-",
            "name": "11-",
            "numericValue": 10.7,
            "color": "#ee8800"
        },
        {
            "id": "ln10+",
            "name": "10+",
            "numericValue": 10.3,
            "color": "#ccaa00"
        },
        {
            "id": "ln10",
            "name": "10",
            "numericValue": 10.0,
            "color": "#bbbb00"
        },
        {
            "id": "ln10-",
            "name": "10-",
            "numericValue": 9.7,
            "color": "#aacc00"
        },
        {
            "id": "ln9+",
            "name": "9+",
            "numericValue": 9.3,
            "color": "#99cc00"
        },
        {
            "id": "ln9",
            "name": "9",
            "numericValue": 9.0,
            "color": "#88cc00"
        },
        {
            "id": "ln9-",
            "name": "9-",
            "numericValue": 8.7,
            "color": "#77cc11"
        },
        {
            "id": "ln8+",
            "name": "8+",
            "numericValue": 8.3,
            "color": "#66bb22"
        },
        {
            "id": "ln8",
            "name": "8",
            "numericValue": 8.0,
            "color": "#55aa33"
        },
        {
            "id": "ln8-",
            "name": "8-",
            "numericValue": 7.7,
            "color": "#449944"
        },
        {
            "id": "ln7+",
            "name": "7+",
            "numericValue": 7.3,
            "color": "#338855"
        },
        {
            "id": "ln7",
            "name": "7",
            "numericValue": 7.0,
            "color": "#228866"
        },
        {
            "id": "ln7-",
            "name": "7-",
            "numericValue": 6.7,
            "color": "#118877"
        },
        {
            "id": "ln6+",
            "name": "6+",
            "numericValue": 6.3,
            "color": "#008888"
        },
        {
            "id": "ln6",
            "name": "6",
            "numericValue": 6.0,
            "color": "#007799"
        },
        {
            "id": "ln6-",
            "name": "6-",
            "numericValue": 5.7,
            "color": "#0066aa"
        },
        {
            "id": "ln5+",
            "name": "5+",
            "numericValue": 5.3,
            "color": "#1155aa"
        },
        {
            "id": "ln5",
            "name": "5",
            "numericValue": 5.0,
            "color": "#2255aa"
        },
        {
            "id": "ln5-",
            "name": "5-",
            "numericValue": 4.7,
            "color": "#3355aa"
        },
        {
            "id": "ln4+",
            "name": "4+",
            "numericValue": 4.3,
            "color": "#4455aa"
        },
        {
            "id": "ln4",
            "name": "4",
            "numericValue": 4.0,
            "color": "#5566aa"
        },
        {
            "id": "ln4-",
            "name": "4-",
            "numericValue": 3.7,
            "color": "#6677aa"
        },
        {
            "id": "ln3+",
            "name": "3+",
            "numericValue": 3.3,
            "color": "#7788aa"
        },
        {
            "id": "ln3",
            "name": "3",
            "numericValue": 3.0,
            "color": "#8899aa"
        },
        {
            "id": "ln3-",
            "name": "3-",
            "numericValue": 2.7,
            "color": "#99aabb"
        },
        {
            "id": "ln2+",
            "name": "2+",
            "numericValue": 2.3,
            "color": "#99aabb"
        },
        {
            "id": "ln2",
            "name": "2",
            "numericValue": 2.0,
            "color": "#aabbcc"
        },
        {
            "id": "ln2-",
            "name": "2-",
            "numericValue": 1.7,
            "color": "#aabbcc"
        },
        {
            "id": "ln1+",
            "name": "1+",
            "numericValue": 1.3,
            "color": "#bbccdd"
        },
        {
            "id": "ln1",
            "name": "1",
            "numericValue": 1.0,
            "color": "#bbccdd"
        }
    ]
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/sidebar/LeftScale.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "LeftScale",
    ()=>LeftScale
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/stores/viewStore.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/difficulty.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$scales$2f$reform$2d$dan$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/data/scales/reform-dan.json.[json].cjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$scales$2f$ln$2d$dan$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/data/scales/ln-dan.json.[json].cjs [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
const reformLevels = __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$scales$2f$reform$2d$dan$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].levels;
const lnLevels = __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$scales$2f$ln$2d$dan$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].levels;
const DIFFICULTY_RANGE = {
    min: 0.5,
    max: 17.5
};
const MAJOR_LEVELS = new Set([
    'eta',
    'zeta',
    'epsilon',
    'delta',
    'gamma',
    'beta',
    'alpha',
    'rf10',
    'rf9',
    'rf8',
    'rf7',
    'rf6',
    'rf5',
    'rf4',
    'rf3',
    'rf2',
    'rf1',
    'intro3',
    'intro2',
    'intro1'
]);
function LeftScale() {
    _s();
    const { zoom, rowHeight, activeFilter } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useViewStore"])();
    const diffRange = DIFFICULTY_RANGE.max - DIFFICULTY_RANGE.min;
    const containerHeight = diffRange * rowHeight * zoom;
    const showLn = activeFilter === 'LN';
    const levels = showLn ? lnLevels : reformLevels;
    const majorSet = showLn ? new Set(lnLevels.filter((l)=>!l.id.includes('+') && !l.id.includes('-')).map((l)=>l.id)) : MAJOR_LEVELS;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "w-[100px] border-r border-gray-200 relative overflow-hidden shrink-0",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-xs text-center text-gray-400 py-1 border-b border-gray-100 font-medium",
                children: showLn ? 'LN 段' : '难度 (RF)'
            }, void 0, false, {
                fileName: "[project]/src/components/sidebar/LeftScale.tsx",
                lineNumber: 33,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "relative",
                style: {
                    height: containerHeight
                },
                children: levels.map((level)=>{
                    const y = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["difficultyToY"])(level.numericValue, containerHeight, DIFFICULTY_RANGE);
                    const isMajor = majorSet.has(level.id);
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "absolute left-0 right-0 flex items-center",
                        style: {
                            top: y - 8
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "scale-label pl-2 pr-1",
                                style: {
                                    color: level.color,
                                    fontSize: isMajor ? '13px' : '10px',
                                    opacity: isMajor ? 1 : 0.6
                                },
                                children: level.name
                            }, void 0, false, {
                                fileName: "[project]/src/components/sidebar/LeftScale.tsx",
                                lineNumber: 47,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex-1 h-px",
                                style: {
                                    backgroundColor: isMajor ? '#e5e7eb' : 'transparent'
                                }
                            }, void 0, false, {
                                fileName: "[project]/src/components/sidebar/LeftScale.tsx",
                                lineNumber: 57,
                                columnNumber: 15
                            }, this)
                        ]
                    }, level.id, true, {
                        fileName: "[project]/src/components/sidebar/LeftScale.tsx",
                        lineNumber: 42,
                        columnNumber: 13
                    }, this);
                })
            }, void 0, false, {
                fileName: "[project]/src/components/sidebar/LeftScale.tsx",
                lineNumber: 36,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/sidebar/LeftScale.tsx",
        lineNumber: 32,
        columnNumber: 5
    }, this);
}
_s(LeftScale, "pOnpnoO0WCj1sdVtXC9Y6cu/yrI=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useViewStore"]
    ];
});
_c = LeftScale;
var _c;
__turbopack_context__.k.register(_c, "LeftScale");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/data/references.json.[json].cjs [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {

module.exports = {
    "points": [
        {
            "label": "MWC 2025 GF",
            "difficulty": 16.2
        },
        {
            "label": "MWC 2025 F",
            "difficulty": 15.2
        },
        {
            "label": "MWC 2025 SF",
            "difficulty": 14.2
        },
        {
            "label": "MWC 2025 QF",
            "difficulty": 13.2
        },
        {
            "label": "MWC 2025 RO16",
            "difficulty": 12.2
        },
        {
            "label": "MWC 2025 RO32",
            "difficulty": 11.2
        },
        {
            "label": "GBC 2025 Spring R4",
            "difficulty": 11.0
        },
        {
            "label": "GBC 2025 Spring R3",
            "difficulty": 10.0
        },
        {
            "label": "GBC 2025 Spring R2",
            "difficulty": 9.0
        },
        {
            "label": "GBC 2025 Spring R1",
            "difficulty": 8.0
        }
    ]
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/sidebar/RightReferences.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "RightReferences",
    ()=>RightReferences
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/stores/viewStore.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/difficulty.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$references$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/data/references.json.[json].cjs [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
const DIFFICULTY_RANGE = {
    min: 0.5,
    max: 17.5
};
function RightReferences() {
    _s();
    const { zoom, rowHeight } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useViewStore"])();
    const diffRange = DIFFICULTY_RANGE.max - DIFFICULTY_RANGE.min;
    const containerHeight = diffRange * rowHeight * zoom;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "w-[180px] border-l border-gray-200 relative overflow-hidden shrink-0",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-xs text-center text-gray-400 py-1 border-b border-gray-100 font-medium",
                children: "参考标尺"
            }, void 0, false, {
                fileName: "[project]/src/components/sidebar/RightReferences.tsx",
                lineNumber: 16,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "relative",
                style: {
                    height: containerHeight
                },
                children: __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$references$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].points.map((point)=>{
                    const y = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["difficultyToY"])(point.difficulty, containerHeight, DIFFICULTY_RANGE);
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "absolute left-0 right-0 flex items-center",
                        style: {
                            top: y - 8
                        },
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "w-3 h-px bg-purple-300 mr-1"
                            }, void 0, false, {
                                fileName: "[project]/src/components/sidebar/RightReferences.tsx",
                                lineNumber: 28,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-xs text-gray-600 truncate",
                                children: point.label
                            }, void 0, false, {
                                fileName: "[project]/src/components/sidebar/RightReferences.tsx",
                                lineNumber: 29,
                                columnNumber: 15
                            }, this)
                        ]
                    }, point.label, true, {
                        fileName: "[project]/src/components/sidebar/RightReferences.tsx",
                        lineNumber: 23,
                        columnNumber: 13
                    }, this);
                })
            }, void 0, false, {
                fileName: "[project]/src/components/sidebar/RightReferences.tsx",
                lineNumber: 19,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/sidebar/RightReferences.tsx",
        lineNumber: 15,
        columnNumber: 5
    }, this);
}
_s(RightReferences, "TsnSAcECO2sETX49JlEIiOwtGRc=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useViewStore"]
    ];
});
_c = RightReferences;
var _c;
__turbopack_context__.k.register(_c, "RightReferences");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/controls/ControlBar.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ControlBar",
    ()=>ControlBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/stores/viewStore.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
function ControlBar() {
    _s();
    const { zoom, setZoom, columnWidth, setColumnWidth, rowHeight, setRowHeight } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useViewStore"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("footer", {
        className: "h-16 border-t border-gray-200 flex items-center px-4 gap-6 shrink-0 bg-gray-50",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs text-gray-500",
                        children: "缩放"
                    }, void 0, false, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 11,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>setZoom(Math.max(0.5, zoom - 0.1)),
                        className: "w-6 h-6 rounded bg-gray-200 text-sm flex items-center justify-center hover:bg-gray-300",
                        children: "-"
                    }, void 0, false, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 12,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs w-10 text-center",
                        children: [
                            Math.round(zoom * 100),
                            "%"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 18,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>setZoom(Math.min(3, zoom + 0.1)),
                        className: "w-6 h-6 rounded bg-gray-200 text-sm flex items-center justify-center hover:bg-gray-300",
                        children: "+"
                    }, void 0, false, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 19,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/controls/ControlBar.tsx",
                lineNumber: 10,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs text-gray-500",
                        children: "列宽"
                    }, void 0, false, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 28,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                        type: "range",
                        min: 100,
                        max: 250,
                        value: columnWidth,
                        onChange: (e)=>setColumnWidth(Number(e.target.value)),
                        className: "w-24 h-1 accent-purple-600"
                    }, void 0, false, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 29,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs w-8",
                        children: columnWidth
                    }, void 0, false, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 37,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/controls/ControlBar.tsx",
                lineNumber: 27,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs text-gray-500",
                        children: "行高"
                    }, void 0, false, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 41,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                        type: "range",
                        min: 20,
                        max: 80,
                        value: rowHeight,
                        onChange: (e)=>setRowHeight(Number(e.target.value)),
                        className: "w-24 h-1 accent-purple-600"
                    }, void 0, false, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 42,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs w-8",
                        children: rowHeight
                    }, void 0, false, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 50,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/controls/ControlBar.tsx",
                lineNumber: 40,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "ml-auto text-xs text-gray-400",
                children: "osu!mania Difficulty Ladder v0.1"
            }, void 0, false, {
                fileName: "[project]/src/components/controls/ControlBar.tsx",
                lineNumber: 53,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/controls/ControlBar.tsx",
        lineNumber: 9,
        columnNumber: 5
    }, this);
}
_s(ControlBar, "LnBTVtcsqTKfceJMhNpL1dDTThU=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useViewStore"]
    ];
});
_c = ControlBar;
var _c;
__turbopack_context__.k.register(_c, "ControlBar");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/Header.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Header",
    ()=>Header
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/stores/viewStore.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
const VIEW_MODES = [
    {
        key: 'tournament',
        label: '整场比赛',
        num: '0'
    },
    {
        key: 'round',
        label: '每轮图池',
        num: '1'
    },
    {
        key: 'type',
        label: '每轮键型',
        num: '2'
    }
];
const TYPE_FILTERS = [
    '全部',
    'RC',
    'HB',
    'LN',
    'SV',
    'TB'
];
function Header() {
    _s();
    const { mode, setMode, activeFilter, setActiveFilter, searchQuery, setSearchQuery } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useViewStore"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
        className: "h-14 border-b border-gray-200 flex items-center px-4 gap-4 shrink-0",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                className: "text-lg font-bold whitespace-nowrap",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-purple-700",
                        children: "osu!mania"
                    }, void 0, false, {
                        fileName: "[project]/src/components/Header.tsx",
                        lineNumber: 19,
                        columnNumber: 9
                    }, this),
                    " 难度天梯榜"
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/Header.tsx",
                lineNumber: 18,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-1 ml-4",
                children: VIEW_MODES.map((vm)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>setMode(vm.key),
                        className: `px-3 py-1.5 rounded text-sm font-medium transition-colors ${mode === vm.key ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`,
                        children: vm.label
                    }, vm.key, false, {
                        fileName: "[project]/src/components/Header.tsx",
                        lineNumber: 24,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/components/Header.tsx",
                lineNumber: 22,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-1 ml-4",
                children: TYPE_FILTERS.map((f)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>setActiveFilter(f === '全部' ? null : f),
                        className: `px-2.5 py-1 rounded text-sm transition-colors ${f === '全部' && !activeFilter || activeFilter === f ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`,
                        children: f
                    }, f, false, {
                        fileName: "[project]/src/components/Header.tsx",
                        lineNumber: 40,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/components/Header.tsx",
                lineNumber: 38,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "ml-auto flex items-center gap-2",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                    type: "text",
                    placeholder: "搜索比赛或轮次...",
                    value: searchQuery,
                    onChange: (e)=>setSearchQuery(e.target.value),
                    className: "px-3 py-1.5 border border-gray-300 rounded text-sm w-48 focus:outline-none focus:border-purple-400"
                }, void 0, false, {
                    fileName: "[project]/src/components/Header.tsx",
                    lineNumber: 55,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/Header.tsx",
                lineNumber: 54,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/Header.tsx",
        lineNumber: 17,
        columnNumber: 5
    }, this);
}
_s(Header, "OmuOHIllYoDfnE4ztOErdT4AXNE=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useViewStore"]
    ];
});
_c = Header;
var _c;
__turbopack_context__.k.register(_c, "Header");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/app/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Home
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ladder$2f$LadderView$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ladder/LadderView.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$sidebar$2f$LeftScale$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/sidebar/LeftScale.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$sidebar$2f$RightReferences$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/sidebar/RightReferences.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$controls$2f$ControlBar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/controls/ControlBar.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$Header$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/Header.tsx [app-client] (ecmascript)");
'use client';
;
;
;
;
;
;
function Home() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "h-screen flex flex-col overflow-hidden",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$Header$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Header"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 12,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 flex overflow-hidden",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$sidebar$2f$LeftScale$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["LeftScale"], {}, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 14,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ladder$2f$LadderView$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["LadderView"], {}, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 15,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$sidebar$2f$RightReferences$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["RightReferences"], {}, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 16,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 13,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$controls$2f$ControlBar$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ControlBar"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 18,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/page.tsx",
        lineNumber: 11,
        columnNumber: 5
    }, this);
}
_c = Home;
var _c;
__turbopack_context__.k.register(_c, "Home");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/node_modules/next/dist/compiled/react/cjs/react-jsx-dev-runtime.development.js [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
/**
 * @license React
 * react-jsx-dev-runtime.development.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */ "use strict";
"production" !== ("TURBOPACK compile-time value", "development") && function() {
    function getComponentNameFromType(type) {
        if (null == type) return null;
        if ("function" === typeof type) return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
        if ("string" === typeof type) return type;
        switch(type){
            case REACT_FRAGMENT_TYPE:
                return "Fragment";
            case REACT_PROFILER_TYPE:
                return "Profiler";
            case REACT_STRICT_MODE_TYPE:
                return "StrictMode";
            case REACT_SUSPENSE_TYPE:
                return "Suspense";
            case REACT_SUSPENSE_LIST_TYPE:
                return "SuspenseList";
            case REACT_ACTIVITY_TYPE:
                return "Activity";
            case REACT_VIEW_TRANSITION_TYPE:
                return "ViewTransition";
        }
        if ("object" === typeof type) switch("number" === typeof type.tag && console.error("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."), type.$$typeof){
            case REACT_PORTAL_TYPE:
                return "Portal";
            case REACT_CONTEXT_TYPE:
                return type.displayName || "Context";
            case REACT_CONSUMER_TYPE:
                return (type._context.displayName || "Context") + ".Consumer";
            case REACT_FORWARD_REF_TYPE:
                var innerType = type.render;
                type = type.displayName;
                type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
                return type;
            case REACT_MEMO_TYPE:
                return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
            case REACT_LAZY_TYPE:
                innerType = type._payload;
                type = type._init;
                try {
                    return getComponentNameFromType(type(innerType));
                } catch (x) {}
        }
        return null;
    }
    function testStringCoercion(value) {
        return "" + value;
    }
    function checkKeyStringCoercion(value) {
        try {
            testStringCoercion(value);
            var JSCompiler_inline_result = !1;
        } catch (e) {
            JSCompiler_inline_result = !0;
        }
        if (JSCompiler_inline_result) {
            JSCompiler_inline_result = console;
            var JSCompiler_temp_const = JSCompiler_inline_result.error;
            var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
            JSCompiler_temp_const.call(JSCompiler_inline_result, "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.", JSCompiler_inline_result$jscomp$0);
            return testStringCoercion(value);
        }
    }
    function getTaskName(type) {
        if (type === REACT_FRAGMENT_TYPE) return "<>";
        if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE) return "<...>";
        try {
            var name = getComponentNameFromType(type);
            return name ? "<" + name + ">" : "<...>";
        } catch (x) {
            return "<...>";
        }
    }
    function getOwner() {
        var dispatcher = ReactSharedInternals.A;
        return null === dispatcher ? null : dispatcher.getOwner();
    }
    function UnknownOwner() {
        return Error("react-stack-top-frame");
    }
    function hasValidKey(config) {
        if (hasOwnProperty.call(config, "key")) {
            var getter = Object.getOwnPropertyDescriptor(config, "key").get;
            if (getter && getter.isReactWarning) return !1;
        }
        return void 0 !== config.key;
    }
    function defineKeyPropWarningGetter(props, displayName) {
        function warnAboutAccessingKey() {
            specialPropKeyWarningShown || (specialPropKeyWarningShown = !0, console.error("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)", displayName));
        }
        warnAboutAccessingKey.isReactWarning = !0;
        Object.defineProperty(props, "key", {
            get: warnAboutAccessingKey,
            configurable: !0
        });
    }
    function elementRefGetterWithDeprecationWarning() {
        var componentName = getComponentNameFromType(this.type);
        didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = !0, console.error("Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."));
        componentName = this.props.ref;
        return void 0 !== componentName ? componentName : null;
    }
    function ReactElement(type, key, props, owner, debugStack, debugTask) {
        var refProp = props.ref;
        type = {
            $$typeof: REACT_ELEMENT_TYPE,
            type: type,
            key: key,
            props: props,
            _owner: owner
        };
        null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
            enumerable: !1,
            get: elementRefGetterWithDeprecationWarning
        }) : Object.defineProperty(type, "ref", {
            enumerable: !1,
            value: null
        });
        type._store = {};
        Object.defineProperty(type._store, "validated", {
            configurable: !1,
            enumerable: !1,
            writable: !0,
            value: 0
        });
        Object.defineProperty(type, "_debugInfo", {
            configurable: !1,
            enumerable: !1,
            writable: !0,
            value: null
        });
        Object.defineProperty(type, "_debugStack", {
            configurable: !1,
            enumerable: !1,
            writable: !0,
            value: debugStack
        });
        Object.defineProperty(type, "_debugTask", {
            configurable: !1,
            enumerable: !1,
            writable: !0,
            value: debugTask
        });
        Object.freeze && (Object.freeze(type.props), Object.freeze(type));
        return type;
    }
    function jsxDEVImpl(type, config, maybeKey, isStaticChildren, debugStack, debugTask) {
        var children = config.children;
        if (void 0 !== children) if (isStaticChildren) if (isArrayImpl(children)) {
            for(isStaticChildren = 0; isStaticChildren < children.length; isStaticChildren++)validateChildKeys(children[isStaticChildren]);
            Object.freeze && Object.freeze(children);
        } else console.error("React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead.");
        else validateChildKeys(children);
        if (hasOwnProperty.call(config, "key")) {
            children = getComponentNameFromType(type);
            var keys = Object.keys(config).filter(function(k) {
                return "key" !== k;
            });
            isStaticChildren = 0 < keys.length ? "{key: someKey, " + keys.join(": ..., ") + ": ...}" : "{key: someKey}";
            didWarnAboutKeySpread[children + isStaticChildren] || (keys = 0 < keys.length ? "{" + keys.join(": ..., ") + ": ...}" : "{}", console.error('A props object containing a "key" prop is being spread into JSX:\n  let props = %s;\n  <%s {...props} />\nReact keys must be passed directly to JSX without using spread:\n  let props = %s;\n  <%s key={someKey} {...props} />', isStaticChildren, children, keys, children), didWarnAboutKeySpread[children + isStaticChildren] = !0);
        }
        children = null;
        void 0 !== maybeKey && (checkKeyStringCoercion(maybeKey), children = "" + maybeKey);
        hasValidKey(config) && (checkKeyStringCoercion(config.key), children = "" + config.key);
        if ("key" in config) {
            maybeKey = {};
            for(var propName in config)"key" !== propName && (maybeKey[propName] = config[propName]);
        } else maybeKey = config;
        children && defineKeyPropWarningGetter(maybeKey, "function" === typeof type ? type.displayName || type.name || "Unknown" : type);
        return ReactElement(type, children, maybeKey, getOwner(), debugStack, debugTask);
    }
    function validateChildKeys(node) {
        isValidElement(node) ? node._store && (node._store.validated = 1) : "object" === typeof node && null !== node && node.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node._payload.status ? isValidElement(node._payload.value) && node._payload.value._store && (node._payload.value._store.validated = 1) : node._store && (node._store.validated = 1));
    }
    function isValidElement(object) {
        return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
    }
    var React = __turbopack_context__.r("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)"), REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = Symbol.for("react.memo"), REACT_LAZY_TYPE = Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = Symbol.for("react.activity"), REACT_VIEW_TRANSITION_TYPE = Symbol.for("react.view_transition"), REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"), ReactSharedInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, hasOwnProperty = Object.prototype.hasOwnProperty, isArrayImpl = Array.isArray, createTask = console.createTask ? console.createTask : function() {
        return null;
    };
    React = {
        react_stack_bottom_frame: function(callStackForError) {
            return callStackForError();
        }
    };
    var specialPropKeyWarningShown;
    var didWarnAboutElementRef = {};
    var unknownOwnerDebugStack = React.react_stack_bottom_frame.bind(React, UnknownOwner)();
    var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
    var didWarnAboutKeySpread = {};
    exports.Fragment = REACT_FRAGMENT_TYPE;
    exports.jsxDEV = function(type, config, maybeKey, isStaticChildren) {
        var trackActualOwner = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
        if (trackActualOwner) {
            var previousStackTraceLimit = Error.stackTraceLimit;
            Error.stackTraceLimit = 10;
            var debugStackDEV = Error("react-stack-top-frame");
            Error.stackTraceLimit = previousStackTraceLimit;
        } else debugStackDEV = unknownOwnerDebugStack;
        return jsxDEVImpl(type, config, maybeKey, isStaticChildren, debugStackDEV, trackActualOwner ? createTask(getTaskName(type)) : unknownOwnerDebugTask);
    };
}();
}),
"[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
'use strict';
if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
;
else {
    module.exports = __turbopack_context__.r("[project]/node_modules/next/dist/compiled/react/cjs/react-jsx-dev-runtime.development.js [app-client] (ecmascript)");
}
}),
"[project]/node_modules/zustand/esm/vanilla.mjs [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createStore",
    ()=>createStore
]);
const createStoreImpl = (createState)=>{
    let state;
    const listeners = /* @__PURE__ */ new Set();
    const setState = (partial, replace)=>{
        const nextState = typeof partial === "function" ? partial(state) : partial;
        if (!Object.is(nextState, state)) {
            const previousState = state;
            state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
            listeners.forEach((listener)=>listener(state, previousState));
        }
    };
    const getState = ()=>state;
    const getInitialState = ()=>initialState;
    const subscribe = (listener)=>{
        listeners.add(listener);
        return ()=>listeners.delete(listener);
    };
    const api = {
        setState,
        getState,
        getInitialState,
        subscribe
    };
    const initialState = state = createState(setState, getState, api);
    return api;
};
const createStore = (createState)=>createState ? createStoreImpl(createState) : createStoreImpl;
;
}),
"[project]/node_modules/zustand/esm/react.mjs [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "create",
    ()=>create,
    "useStore",
    ()=>useStore
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$vanilla$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/zustand/esm/vanilla.mjs [app-client] (ecmascript)");
;
;
const identity = (arg)=>arg;
function useStore(api, selector = identity) {
    const slice = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useSyncExternalStore(api.subscribe, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useCallback({
        "useStore.useSyncExternalStore[slice]": ()=>selector(api.getState())
    }["useStore.useSyncExternalStore[slice]"], [
        api,
        selector
    ]), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useCallback({
        "useStore.useSyncExternalStore[slice]": ()=>selector(api.getInitialState())
    }["useStore.useSyncExternalStore[slice]"], [
        api,
        selector
    ]));
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].useDebugValue(slice);
    return slice;
}
const createImpl = (createState)=>{
    const api = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$vanilla$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createStore"])(createState);
    const useBoundStore = (selector)=>useStore(api, selector);
    Object.assign(useBoundStore, api);
    return useBoundStore;
};
const create = (createState)=>createState ? createImpl(createState) : createImpl;
;
}),
]);

//# sourceMappingURL=_0yqf-33._.js.map