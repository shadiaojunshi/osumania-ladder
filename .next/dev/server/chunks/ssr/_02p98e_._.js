module.exports = [
"[project]/src/stores/viewStore.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useViewStore",
    ()=>useViewStore
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/zustand/esm/react.mjs [app-ssr] (ecmascript)");
;
const useViewStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zustand$2f$esm$2f$react$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["create"])((set)=>({
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
}),
"[project]/data/scales/reform-dan.json.[json].cjs [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {

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
}),
"[project]/src/lib/difficulty.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$scales$2f$reform$2d$dan$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/data/scales/reform-dan.json.[json].cjs [app-ssr] (ecmascript)");
;
const levels = __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$scales$2f$reform$2d$dan$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].levels;
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
}),
"[project]/data/tournaments/mwc-4k-2024.json.[json].cjs [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {

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
}),
"[project]/data/tournaments/mwc-4k-2023.json.[json].cjs [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {

module.exports = {
    "id": "mwc-4k-2023",
    "name": "osu!mania 4K World Cup 2023",
    "abbreviation": "MWC 2023",
    "forumUrl": "https://osu.ppy.sh/community/forums/topics/1838291",
    "wikiUrl": "https://osu.ppy.sh/wiki/en/Tournaments/MWC/2023_4K",
    "keyCount": 4,
    "year": 2023,
    "tags": [
        "official",
        "4k",
        "world-cup"
    ],
    "rounds": [
        {
            "id": "mwc23-qual",
            "name": "Qualifiers",
            "abbreviation": "Qual",
            "order": 0,
            "isQualifier": true,
            "difficulty": {
                "min": 8.0,
                "max": 12.0,
                "average": 10.0
            },
            "maps": [
                {
                    "slot": "ST1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "Stage 1",
                    "difficulty": 8.0
                },
                {
                    "slot": "ST2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "Stage 2",
                    "difficulty": 9.0
                },
                {
                    "slot": "ST3",
                    "type": "LN",
                    "realType": "CO",
                    "name": "Stage 3",
                    "difficulty": 9.5
                },
                {
                    "slot": "ST4",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "Stage 4",
                    "difficulty": 10.0
                },
                {
                    "slot": "ST5",
                    "type": "RC",
                    "realType": "CJ",
                    "name": "Stage 5",
                    "difficulty": 10.5
                },
                {
                    "slot": "ST6",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "Stage 6",
                    "difficulty": 11.0
                },
                {
                    "slot": "ST7",
                    "type": "LN",
                    "realType": "RE",
                    "name": "Stage 7",
                    "difficulty": 11.5
                },
                {
                    "slot": "ST8",
                    "type": "RC",
                    "realType": "SA",
                    "name": "Stage 8",
                    "difficulty": 12.0
                }
            ]
        },
        {
            "id": "mwc23-ro32",
            "name": "Round of 32",
            "abbreviation": "RO32",
            "order": 1,
            "bestOf": 9,
            "difficulty": {
                "min": 8.5,
                "max": 12.5,
                "average": 10.5
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
                    "realType": "CJ",
                    "name": "RC3",
                    "difficulty": 8.5
                },
                {
                    "slot": "RC4",
                    "type": "RC",
                    "realType": "SA",
                    "name": "RC4",
                    "difficulty": 10.0
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 10.5
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2",
                    "difficulty": 11.0
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 11.0
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 11.5
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1",
                    "difficulty": 10.5
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB",
                    "difficulty": 12.5
                }
            ]
        },
        {
            "id": "mwc23-ro16",
            "name": "Round of 16",
            "abbreviation": "RO16",
            "order": 2,
            "bestOf": 9,
            "difficulty": {
                "min": 9.5,
                "max": 13.5,
                "average": 11.5
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
                    "slot": "RC4",
                    "type": "RC",
                    "realType": "SA",
                    "name": "RC4",
                    "difficulty": 11.0
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 11.5
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2",
                    "difficulty": 12.0
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 12.0
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 12.5
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1",
                    "difficulty": 11.5
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB",
                    "difficulty": 13.5
                }
            ]
        },
        {
            "id": "mwc23-qf",
            "name": "Quarterfinals",
            "abbreviation": "QF",
            "order": 3,
            "bestOf": 11,
            "difficulty": {
                "min": 10.5,
                "max": 14.5,
                "average": 12.5
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1",
                    "difficulty": 11.0
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2",
                    "difficulty": 11.5
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "CJ",
                    "name": "RC3",
                    "difficulty": 10.5
                },
                {
                    "slot": "RC4",
                    "type": "RC",
                    "realType": "SA",
                    "name": "RC4",
                    "difficulty": 12.0
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 12.5
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2",
                    "difficulty": 13.0
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 13.0
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 13.5
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1",
                    "difficulty": 12.5
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB",
                    "difficulty": 14.5
                }
            ]
        },
        {
            "id": "mwc23-sf",
            "name": "Semifinals",
            "abbreviation": "SF",
            "order": 4,
            "bestOf": 11,
            "difficulty": {
                "min": 11.5,
                "max": 15.5,
                "average": 13.5
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1",
                    "difficulty": 12.0
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2",
                    "difficulty": 12.5
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "CJ",
                    "name": "RC3",
                    "difficulty": 11.5
                },
                {
                    "slot": "RC4",
                    "type": "RC",
                    "realType": "SA",
                    "name": "RC4",
                    "difficulty": 13.0
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 13.5
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2",
                    "difficulty": 14.0
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 14.0
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 14.5
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1",
                    "difficulty": 13.5
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB",
                    "difficulty": 15.5
                }
            ]
        },
        {
            "id": "mwc23-f",
            "name": "Finals",
            "abbreviation": "F",
            "order": 5,
            "bestOf": 13,
            "difficulty": {
                "min": 12.5,
                "max": 16.0,
                "average": 14.2
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1",
                    "difficulty": 13.0
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2",
                    "difficulty": 13.5
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "CJ",
                    "name": "RC3",
                    "difficulty": 12.5
                },
                {
                    "slot": "RC4",
                    "type": "RC",
                    "realType": "SA",
                    "name": "RC4",
                    "difficulty": 14.0
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 14.5
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2",
                    "difficulty": 15.0
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 14.8
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 15.2
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1",
                    "difficulty": 14.0
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB",
                    "difficulty": 16.0
                }
            ]
        },
        {
            "id": "mwc23-gf",
            "name": "Grand Finals",
            "abbreviation": "GF",
            "order": 6,
            "bestOf": 13,
            "difficulty": {
                "min": 13.0,
                "max": 16.5,
                "average": 14.8
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1",
                    "difficulty": 13.5
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2",
                    "difficulty": 14.0
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "CJ",
                    "name": "RC3",
                    "difficulty": 13.0
                },
                {
                    "slot": "RC4",
                    "type": "RC",
                    "realType": "SA",
                    "name": "RC4",
                    "difficulty": 14.5
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 15.0
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2",
                    "difficulty": 15.5
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 15.5
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 15.8
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1",
                    "difficulty": 14.5
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB",
                    "difficulty": 16.5
                }
            ]
        }
    ],
    "customTypes": []
};
}),
"[project]/data/tournaments/gbc-2025-spring.json.[json].cjs [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {

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
}),
"[project]/data/tournaments/gbc-2024-autumn.json.[json].cjs [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {

module.exports = {
    "id": "gbc-2024-autumn",
    "name": "GBC 2024 Autumn",
    "abbreviation": "GBC 2024A",
    "forumUrl": "https://osu.ppy.sh/community/forums/topics/example2",
    "keyCount": 4,
    "year": 2024,
    "tags": [
        "community",
        "4k"
    ],
    "rounds": [
        {
            "id": "gbc24a-qual",
            "name": "Qualifiers",
            "abbreviation": "Qual",
            "order": 0,
            "isQualifier": true,
            "difficulty": {
                "min": 7.0,
                "max": 10.0,
                "average": 8.5
            },
            "maps": [
                {
                    "slot": "ST1",
                    "type": "RC",
                    "realType": "JS",
                    "name": "Stage 1",
                    "difficulty": 7.0
                },
                {
                    "slot": "ST2",
                    "type": "RC",
                    "realType": "SA",
                    "name": "Stage 2",
                    "difficulty": 7.5
                },
                {
                    "slot": "ST3",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "Stage 3",
                    "difficulty": 8.0
                },
                {
                    "slot": "ST4",
                    "type": "LN",
                    "realType": "CO",
                    "name": "Stage 4",
                    "difficulty": 8.5
                },
                {
                    "slot": "ST5",
                    "type": "RC",
                    "realType": "CJ",
                    "name": "Stage 5",
                    "difficulty": 9.0
                },
                {
                    "slot": "ST6",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "Stage 6",
                    "difficulty": 9.5
                },
                {
                    "slot": "ST7",
                    "type": "LN",
                    "realType": "RE",
                    "name": "Stage 7",
                    "difficulty": 10.0
                }
            ]
        },
        {
            "id": "gbc24a-r1",
            "name": "Round 1",
            "abbreviation": "R1",
            "order": 1,
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
                    "realType": "CJ",
                    "name": "RC3",
                    "difficulty": 7.5
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 9.0
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2",
                    "difficulty": 9.2
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 9.5
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 9.8
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
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
            "id": "gbc24a-r2",
            "name": "Round 2",
            "abbreviation": "R2",
            "order": 2,
            "bestOf": 9,
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
                    "difficulty": 10.0
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2",
                    "difficulty": 10.2
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 10.5
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
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
            "id": "gbc24a-r3",
            "name": "Round 3",
            "abbreviation": "R3",
            "order": 3,
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
                    "difficulty": 11.0
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2",
                    "difficulty": 11.2
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 11.5
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 11.8
                },
                {
                    "slot": "LN3",
                    "type": "LN",
                    "realType": "DE",
                    "name": "LN3",
                    "difficulty": 12.0
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
        },
        {
            "id": "gbc24a-r4",
            "name": "Round 4",
            "abbreviation": "R4",
            "order": 4,
            "bestOf": 11,
            "difficulty": {
                "min": 10.5,
                "max": 13.5,
                "average": 12.0
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1",
                    "difficulty": 11.0
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2",
                    "difficulty": 11.5
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "SA",
                    "name": "RC3",
                    "difficulty": 10.5
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 12.0
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB3",
                    "name": "HB2",
                    "difficulty": 12.2
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 12.5
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 12.8
                },
                {
                    "slot": "LN3",
                    "type": "LN",
                    "realType": "DE",
                    "name": "LN3",
                    "difficulty": 13.0
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1",
                    "difficulty": 12.0
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB",
                    "difficulty": 13.5
                }
            ]
        }
    ],
    "customTypes": []
};
}),
"[project]/data/tournaments/oc4k-2024.json.[json].cjs [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {

module.exports = {
    "id": "oc4k-2024",
    "name": "osu!catch 4K 2024",
    "abbreviation": "OC4K 2024",
    "keyCount": 4,
    "year": 2024,
    "tags": [
        "community",
        "4k"
    ],
    "rounds": [
        {
            "id": "oc4k24-ro32",
            "name": "Round of 32",
            "abbreviation": "RO32",
            "order": 1,
            "bestOf": 9,
            "difficulty": {
                "min": 5.0,
                "max": 7.5,
                "average": 6.2
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1",
                    "difficulty": 5.5
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2",
                    "difficulty": 6.0
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "CJ",
                    "name": "RC3",
                    "difficulty": 5.0
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 6.5
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 6.8
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 7.0
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1",
                    "difficulty": 6.0
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB",
                    "difficulty": 7.5
                }
            ]
        },
        {
            "id": "oc4k24-ro16",
            "name": "Round of 16",
            "abbreviation": "RO16",
            "order": 2,
            "bestOf": 9,
            "difficulty": {
                "min": 6.0,
                "max": 8.5,
                "average": 7.2
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1",
                    "difficulty": 6.5
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2",
                    "difficulty": 7.0
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "SA",
                    "name": "RC3",
                    "difficulty": 6.0
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 7.5
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 7.8
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 8.0
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1",
                    "difficulty": 7.0
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB",
                    "difficulty": 8.5
                }
            ]
        },
        {
            "id": "oc4k24-qf",
            "name": "Quarterfinals",
            "abbreviation": "QF",
            "order": 3,
            "bestOf": 11,
            "difficulty": {
                "min": 7.0,
                "max": 9.5,
                "average": 8.2
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1",
                    "difficulty": 7.5
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2",
                    "difficulty": 8.0
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "CJ",
                    "name": "RC3",
                    "difficulty": 7.0
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 8.5
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2",
                    "difficulty": 8.8
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 8.8
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 9.0
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
            "id": "oc4k24-sf",
            "name": "Semifinals",
            "abbreviation": "SF",
            "order": 4,
            "bestOf": 11,
            "difficulty": {
                "min": 8.0,
                "max": 10.5,
                "average": 9.2
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1",
                    "difficulty": 8.5
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2",
                    "difficulty": 9.0
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "SA",
                    "name": "RC3",
                    "difficulty": 8.0
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 9.5
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2",
                    "difficulty": 9.8
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 9.8
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 10.0
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
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
            "id": "oc4k24-f",
            "name": "Finals",
            "abbreviation": "F",
            "order": 5,
            "bestOf": 13,
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
                    "name": "RC1",
                    "difficulty": 9.5
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2",
                    "difficulty": 10.0
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "CJ",
                    "name": "RC3",
                    "difficulty": 9.0
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 10.5
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2",
                    "difficulty": 10.8
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 10.8
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 11.0
                },
                {
                    "slot": "LN3",
                    "type": "LN",
                    "realType": "DE",
                    "name": "LN3",
                    "difficulty": 11.2
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
        }
    ],
    "customTypes": []
};
}),
"[project]/data/tournaments/ycm-2024.json.[json].cjs [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {

module.exports = {
    "id": "ycm-2024",
    "name": "YCM 4K 2024",
    "abbreviation": "YCM 2024",
    "keyCount": 4,
    "year": 2024,
    "tags": [
        "community",
        "4k",
        "chinese"
    ],
    "rounds": [
        {
            "id": "ycm24-qual",
            "name": "Qualifiers",
            "abbreviation": "Qual",
            "order": 0,
            "isQualifier": true,
            "difficulty": {
                "min": 4.0,
                "max": 7.0,
                "average": 5.5
            },
            "maps": [
                {
                    "slot": "ST1",
                    "type": "RC",
                    "realType": "JS",
                    "name": "Stage 1",
                    "difficulty": 4.0
                },
                {
                    "slot": "ST2",
                    "type": "RC",
                    "realType": "SA",
                    "name": "Stage 2",
                    "difficulty": 4.5
                },
                {
                    "slot": "ST3",
                    "type": "LN",
                    "realType": "CO",
                    "name": "Stage 3",
                    "difficulty": 5.0
                },
                {
                    "slot": "ST4",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "Stage 4",
                    "difficulty": 5.5
                },
                {
                    "slot": "ST5",
                    "type": "RC",
                    "realType": "CJ",
                    "name": "Stage 5",
                    "difficulty": 6.0
                },
                {
                    "slot": "ST6",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "Stage 6",
                    "difficulty": 6.5
                },
                {
                    "slot": "ST7",
                    "type": "LN",
                    "realType": "RE",
                    "name": "Stage 7",
                    "difficulty": 7.0
                }
            ]
        },
        {
            "id": "ycm24-ro16",
            "name": "Round of 16",
            "abbreviation": "RO16",
            "order": 1,
            "bestOf": 9,
            "difficulty": {
                "min": 4.5,
                "max": 7.5,
                "average": 6.0
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1",
                    "difficulty": 5.0
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2",
                    "difficulty": 5.5
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "CJ",
                    "name": "RC3",
                    "difficulty": 4.5
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 6.0
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 6.5
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 6.8
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1",
                    "difficulty": 6.0
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB",
                    "difficulty": 7.5
                }
            ]
        },
        {
            "id": "ycm24-qf",
            "name": "Quarterfinals",
            "abbreviation": "QF",
            "order": 2,
            "bestOf": 9,
            "difficulty": {
                "min": 5.5,
                "max": 8.5,
                "average": 7.0
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1",
                    "difficulty": 6.0
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2",
                    "difficulty": 6.5
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "SA",
                    "name": "RC3",
                    "difficulty": 5.5
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 7.0
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2",
                    "difficulty": 7.2
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 7.5
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 7.8
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1",
                    "difficulty": 7.0
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB",
                    "difficulty": 8.5
                }
            ]
        },
        {
            "id": "ycm24-sf",
            "name": "Semifinals",
            "abbreviation": "SF",
            "order": 3,
            "bestOf": 11,
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
                    "difficulty": 8.0
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2",
                    "difficulty": 8.2
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 8.5
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 8.8
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
            "id": "ycm24-f",
            "name": "Finals",
            "abbreviation": "F",
            "order": 4,
            "bestOf": 13,
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
                    "difficulty": 9.0
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2",
                    "difficulty": 9.2
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 9.5
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 9.8
                },
                {
                    "slot": "LN3",
                    "type": "LN",
                    "realType": "DE",
                    "name": "LN3",
                    "difficulty": 10.0
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
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
        }
    ],
    "customTypes": []
};
}),
"[project]/data/tournaments/emt-2024.json.[json].cjs [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {

module.exports = {
    "id": "emt-2024",
    "name": "ETT Mania Tournament 2024",
    "abbreviation": "EMT 2024",
    "keyCount": 4,
    "year": 2024,
    "tags": [
        "community",
        "4k"
    ],
    "rounds": [
        {
            "id": "emt24-ro32",
            "name": "Round of 32",
            "abbreviation": "RO32",
            "order": 1,
            "bestOf": 9,
            "difficulty": {
                "min": 3.5,
                "max": 6.0,
                "average": 4.8
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1",
                    "difficulty": 4.0
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2",
                    "difficulty": 4.5
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "CJ",
                    "name": "RC3",
                    "difficulty": 3.5
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 5.0
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 5.2
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 5.5
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1",
                    "difficulty": 4.5
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB",
                    "difficulty": 6.0
                }
            ]
        },
        {
            "id": "emt24-ro16",
            "name": "Round of 16",
            "abbreviation": "RO16",
            "order": 2,
            "bestOf": 9,
            "difficulty": {
                "min": 4.5,
                "max": 7.0,
                "average": 5.8
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1",
                    "difficulty": 5.0
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2",
                    "difficulty": 5.5
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "SA",
                    "name": "RC3",
                    "difficulty": 4.5
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 6.0
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 6.2
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 6.5
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1",
                    "difficulty": 5.5
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB",
                    "difficulty": 7.0
                }
            ]
        },
        {
            "id": "emt24-qf",
            "name": "Quarterfinals",
            "abbreviation": "QF",
            "order": 3,
            "bestOf": 11,
            "difficulty": {
                "min": 5.5,
                "max": 8.0,
                "average": 6.8
            },
            "maps": [
                {
                    "slot": "RC1",
                    "type": "RC",
                    "realType": "SS",
                    "name": "RC1",
                    "difficulty": 6.0
                },
                {
                    "slot": "RC2",
                    "type": "RC",
                    "realType": "JS",
                    "name": "RC2",
                    "difficulty": 6.5
                },
                {
                    "slot": "RC3",
                    "type": "RC",
                    "realType": "CJ",
                    "name": "RC3",
                    "difficulty": 5.5
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 7.0
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2",
                    "difficulty": 7.2
                },
                {
                    "slot": "LN1",
                    "type": "LN",
                    "realType": "CO",
                    "name": "LN1",
                    "difficulty": 7.2
                },
                {
                    "slot": "LN2",
                    "type": "LN",
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 7.5
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1",
                    "difficulty": 6.5
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB",
                    "difficulty": 8.0
                }
            ]
        },
        {
            "id": "emt24-sf",
            "name": "Semifinals",
            "abbreviation": "SF",
            "order": 4,
            "bestOf": 11,
            "difficulty": {
                "min": 6.5,
                "max": 9.0,
                "average": 7.8
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
                    "realType": "SA",
                    "name": "RC3",
                    "difficulty": 6.5
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 8.0
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2",
                    "difficulty": 8.2
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
                    "difficulty": 7.5
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB",
                    "difficulty": 9.0
                }
            ]
        },
        {
            "id": "emt24-f",
            "name": "Finals",
            "abbreviation": "F",
            "order": 5,
            "bestOf": 13,
            "difficulty": {
                "min": 7.5,
                "max": 10.0,
                "average": 8.8
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
                    "realType": "CJ",
                    "name": "RC3",
                    "difficulty": 7.5
                },
                {
                    "slot": "HB1",
                    "type": "HB",
                    "realType": "HB1",
                    "name": "HB1",
                    "difficulty": 9.0
                },
                {
                    "slot": "HB2",
                    "type": "HB",
                    "realType": "HB2",
                    "name": "HB2",
                    "difficulty": 9.2
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
                    "realType": "RE",
                    "name": "LN2",
                    "difficulty": 9.5
                },
                {
                    "slot": "SV1",
                    "type": "SV",
                    "realType": "SV1",
                    "name": "SV1",
                    "difficulty": 8.5
                },
                {
                    "slot": "TB",
                    "type": "TB",
                    "realType": "TB",
                    "name": "TB",
                    "difficulty": 10.0
                }
            ]
        }
    ],
    "customTypes": []
};
}),
"[project]/src/components/ladder/HoverCard.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "HoverCard",
    ()=>HoverCard
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/stores/viewStore.ts [app-ssr] (ecmascript)");
'use client';
;
;
function HoverCard({ round, tournament, x, y, onMouseEnter, onMouseLeave }) {
    const { activeFilter } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useViewStore"])();
    const diffLabel = buildDifficultyLabel(round, activeFilter);
    const cardX = ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : x + 12;
    const cardY = ("TURBOPACK compile-time falsy", 0) ? "TURBOPACK unreachable" : y + 12;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 max-w-xs",
        style: {
            left: cardX,
            top: cardY
        },
        onMouseEnter: onMouseEnter,
        onMouseLeave: onMouseLeave,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "font-semibold text-sm mb-1",
                children: [
                    tournament.abbreviation,
                    " ",
                    round.abbreviation
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/ladder/HoverCard.tsx",
                lineNumber: 34,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-xs text-gray-700 mb-2 font-mono",
                children: diffLabel
            }, void 0, false, {
                fileName: "[project]/src/components/ladder/HoverCard.tsx",
                lineNumber: 37,
                columnNumber: 7
            }, this),
            tournament.forumUrl && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                href: tournament.forumUrl,
                target: "_blank",
                rel: "noopener noreferrer",
                className: "text-xs text-blue-500 hover:underline block mb-0.5",
                children: "🔗 论坛帖"
            }, void 0, false, {
                fileName: "[project]/src/components/ladder/HoverCard.tsx",
                lineNumber: 41,
                columnNumber: 9
            }, this),
            tournament.wikiUrl && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                href: tournament.wikiUrl,
                target: "_blank",
                rel: "noopener noreferrer",
                className: "text-xs text-blue-500 hover:underline block mb-0.5",
                children: "📖 Wiki"
            }, void 0, false, {
                fileName: "[project]/src/components/ladder/HoverCard.tsx",
                lineNumber: 51,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-xs text-gray-400 mt-1.5 pt-1.5 border-t border-gray-100",
                children: [
                    round.maps.length,
                    " 张谱面 · 难度 ",
                    round.difficulty.min.toFixed(1),
                    " ~ ",
                    round.difficulty.max.toFixed(1)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/ladder/HoverCard.tsx",
                lineNumber: 60,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/ladder/HoverCard.tsx",
        lineNumber: 28,
        columnNumber: 5
    }, this);
}
function buildDifficultyLabel(round, activeFilter) {
    const avg = round.difficulty.average;
    const rfLabel = getRfDanName(avg);
    const lnLabel = getLnDanName(avg);
    if (activeFilter === 'RC' || activeFilter === 'SV') {
        return `~${rfLabel}`;
    }
    if (activeFilter === 'LN') {
        return `~${lnLabel}`;
    }
    if (activeFilter === 'HB') {
        return `~${rfLabel} / ${lnLabel}`;
    }
    return `~${rfLabel} / ${lnLabel}`;
}
function getRfDanName(diff) {
    if (diff >= 17) return 'η';
    if (diff >= 16) return 'ζ';
    if (diff >= 15) return 'ε';
    if (diff >= 14) return 'δ';
    if (diff >= 13) return 'γ';
    if (diff >= 12) return 'β';
    if (diff >= 11) return 'α';
    if (diff >= 10) return '10th';
    if (diff >= 9) return '9th';
    if (diff >= 8) return '8th';
    if (diff >= 7) return '7th';
    if (diff >= 6) return '6th';
    if (diff >= 5) return '5th';
    if (diff >= 4) return '4th';
    if (diff >= 3) return '3rd';
    if (diff >= 2) return '2nd';
    if (diff >= 1) return '1st';
    return 'intro';
}
function getLnDanName(diff) {
    const lnVal = Math.round(diff);
    if (lnVal >= 17) return 'LN17';
    if (lnVal <= 1) return 'LN1';
    return `LN${lnVal}`;
}
}),
"[project]/data/scales/ln-dan.json.[json].cjs [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {

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
}),
"[project]/data/references.json.[json].cjs [app-ssr] (ecmascript)", ((__turbopack_context__, module, exports) => {

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
}),
"[project]/src/components/ladder/LadderView.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "LadderView",
    ()=>LadderView
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/stores/viewStore.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/difficulty.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$tournaments$2f$mwc$2d$4k$2d$2024$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/data/tournaments/mwc-4k-2024.json.[json].cjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$tournaments$2f$mwc$2d$4k$2d$2023$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/data/tournaments/mwc-4k-2023.json.[json].cjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$tournaments$2f$gbc$2d$2025$2d$spring$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/data/tournaments/gbc-2025-spring.json.[json].cjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$tournaments$2f$gbc$2d$2024$2d$autumn$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/data/tournaments/gbc-2024-autumn.json.[json].cjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$tournaments$2f$oc4k$2d$2024$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/data/tournaments/oc4k-2024.json.[json].cjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$tournaments$2f$ycm$2d$2024$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/data/tournaments/ycm-2024.json.[json].cjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$tournaments$2f$emt$2d$2024$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/data/tournaments/emt-2024.json.[json].cjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$virtual$2f$dist$2f$esm$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/@tanstack/react-virtual/dist/esm/index.js [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ladder$2f$HoverCard$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ladder/HoverCard.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$scales$2f$reform$2d$dan$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/data/scales/reform-dan.json.[json].cjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$scales$2f$ln$2d$dan$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/data/scales/ln-dan.json.[json].cjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$references$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/data/references.json.[json].cjs [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
;
;
;
;
;
;
;
;
const tournaments = [
    __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$tournaments$2f$mwc$2d$4k$2d$2024$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"],
    __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$tournaments$2f$mwc$2d$4k$2d$2023$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"],
    __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$tournaments$2f$gbc$2d$2025$2d$spring$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"],
    __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$tournaments$2f$gbc$2d$2024$2d$autumn$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"],
    __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$tournaments$2f$oc4k$2d$2024$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"],
    __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$tournaments$2f$ycm$2d$2024$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"],
    __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$tournaments$2f$emt$2d$2024$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"]
];
const DIFFICULTY_RANGE = {
    min: 0.5,
    max: 17.5
};
const BOX_HEIGHT_TYPE = 28;
const COL_GAP = 8;
function LadderView() {
    const { mode, zoom, columnWidth, rowHeight, rfLnOffset, activeFilter, searchQuery } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useViewStore"])();
    const scrollContainerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const leftRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const rightRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const [hoveredRound, setHoveredRound] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const hideTimeoutRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const diffRange = DIFFICULTY_RANGE.max - DIFFICULTY_RANGE.min;
    const containerHeight = diffRange * rowHeight * zoom;
    const filteredTournaments = tournaments.filter((t)=>{
        if (!searchQuery) return true;
        return t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.abbreviation.toLowerCase().includes(searchQuery.toLowerCase());
    });
    const columnVirtualizer = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$tanstack$2f$react$2d$virtual$2f$dist$2f$esm$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["useVirtualizer"])({
        horizontal: true,
        count: filteredTournaments.length,
        getScrollElement: ()=>scrollContainerRef.current,
        estimateSize: ()=>columnWidth + COL_GAP,
        overscan: 3
    });
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        columnVirtualizer.measure();
    }, [
        columnWidth,
        columnVirtualizer
    ]);
    const handleScroll = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        const el = scrollContainerRef.current;
        if (!el) return;
        const scrollTop = el.scrollTop;
        if (leftRef.current) leftRef.current.scrollTop = scrollTop;
        if (rightRef.current) rightRef.current.scrollTop = scrollTop;
    }, []);
    const showHover = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((round, tournament, x, y)=>{
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        }
        setHoveredRound({
            round,
            tournament,
            x,
            y
        });
    }, []);
    const scheduleHide = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        hideTimeoutRef.current = setTimeout(()=>{
            setHoveredRound(null);
        }, 150);
    }, []);
    const cancelHide = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        }
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        return ()=>{
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        };
    }, []);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex-1 flex overflow-hidden",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(LeftScaleInner, {
                ref: leftRef,
                containerHeight: containerHeight
            }, void 0, false, {
                fileName: "[project]/src/components/ladder/LadderView.tsx",
                lineNumber: 88,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 overflow-auto",
                ref: scrollContainerRef,
                onScroll: handleScroll,
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "relative pt-2",
                    style: {
                        height: containerHeight,
                        width: columnVirtualizer.getTotalSize() + 16
                    },
                    children: columnVirtualizer.getVirtualItems().map((virtualCol)=>{
                        const tournament = filteredTournaments[virtualCol.index];
                        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "absolute top-0",
                            style: {
                                left: virtualCol.start + 8,
                                width: columnWidth,
                                height: containerHeight
                            },
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(TournamentColumn, {
                                tournament: tournament,
                                mode: mode,
                                containerHeight: containerHeight,
                                columnWidth: columnWidth,
                                activeFilter: activeFilter,
                                rfLnOffset: rfLnOffset,
                                onHover: (round, x, y)=>showHover(round, tournament, x, y),
                                onLeave: scheduleHide
                            }, void 0, false, {
                                fileName: "[project]/src/components/ladder/LadderView.tsx",
                                lineNumber: 114,
                                columnNumber: 17
                            }, this)
                        }, tournament.id, false, {
                            fileName: "[project]/src/components/ladder/LadderView.tsx",
                            lineNumber: 105,
                            columnNumber: 15
                        }, this);
                    })
                }, void 0, false, {
                    fileName: "[project]/src/components/ladder/LadderView.tsx",
                    lineNumber: 95,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/ladder/LadderView.tsx",
                lineNumber: 90,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(RightRefInner, {
                ref: rightRef,
                containerHeight: containerHeight
            }, void 0, false, {
                fileName: "[project]/src/components/ladder/LadderView.tsx",
                lineNumber: 130,
                columnNumber: 7
            }, this),
            hoveredRound && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ladder$2f$HoverCard$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["HoverCard"], {
                round: hoveredRound.round,
                tournament: hoveredRound.tournament,
                x: hoveredRound.x,
                y: hoveredRound.y,
                onMouseEnter: cancelHide,
                onMouseLeave: ()=>setHoveredRound(null)
            }, void 0, false, {
                fileName: "[project]/src/components/ladder/LadderView.tsx",
                lineNumber: 133,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/ladder/LadderView.tsx",
        lineNumber: 87,
        columnNumber: 5
    }, this);
}
;
;
;
;
const reformLevels = __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$scales$2f$reform$2d$dan$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].levels;
const lnLevels = __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$scales$2f$ln$2d$dan$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].levels;
const MAJOR_RF = new Set([
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
const MAJOR_LN = new Set(lnLevels.filter((l)=>!l.id.includes('+') && !l.id.includes('-')).map((l)=>l.id));
const LeftScaleInner = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["forwardRef"])(function LeftScaleInner({ containerHeight }, ref) {
    const { activeFilter, rfLnOffset } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useViewStore"])();
    const showOnlyLn = activeFilter === 'LN' || activeFilter === 'HB';
    const showOnlyRf = activeFilter === 'RC' || activeFilter === 'SV';
    const showBoth = !showOnlyLn && !showOnlyRf;
    const totalWidth = showBoth ? 140 : 100;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `border-r border-gray-200 overflow-hidden shrink-0`,
        style: {
            width: totalWidth
        },
        ref: ref,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "relative",
            style: {
                height: containerHeight
            },
            children: [
                !showOnlyLn && reformLevels.map((level)=>{
                    const y = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["difficultyToY"])(level.numericValue, containerHeight, DIFFICULTY_RANGE);
                    const isMajor = MAJOR_RF.has(level.id);
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "absolute flex items-center",
                        style: {
                            top: y - 8,
                            left: 0,
                            width: showBoth ? 70 : 100
                        },
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "scale-label pl-2",
                            style: {
                                color: level.color,
                                fontSize: isMajor ? '12px' : '9px',
                                opacity: isMajor ? 1 : 0.4
                            },
                            children: level.name
                        }, void 0, false, {
                            fileName: "[project]/src/components/ladder/LadderView.tsx",
                            lineNumber: 188,
                            columnNumber: 17
                        }, this)
                    }, level.id, false, {
                        fileName: "[project]/src/components/ladder/LadderView.tsx",
                        lineNumber: 183,
                        columnNumber: 15
                    }, this);
                }),
                !showOnlyRf && lnLevels.map((level)=>{
                    const lnY = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["difficultyToY"])(level.numericValue - rfLnOffset, containerHeight, DIFFICULTY_RANGE);
                    const isMajor = MAJOR_LN.has(level.id);
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "absolute flex items-center",
                        style: {
                            top: lnY - 8,
                            right: 0,
                            width: showBoth ? 65 : 100
                        },
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "scale-label text-right w-full pr-2",
                            style: {
                                color: '#6366f1',
                                fontSize: isMajor ? '11px' : '9px',
                                opacity: isMajor ? 0.9 : 0.35
                            },
                            children: level.name
                        }, void 0, false, {
                            fileName: "[project]/src/components/ladder/LadderView.tsx",
                            lineNumber: 212,
                            columnNumber: 17
                        }, this)
                    }, level.id, false, {
                        fileName: "[project]/src/components/ladder/LadderView.tsx",
                        lineNumber: 207,
                        columnNumber: 15
                    }, this);
                })
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/ladder/LadderView.tsx",
            lineNumber: 177,
            columnNumber: 9
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/ladder/LadderView.tsx",
        lineNumber: 176,
        columnNumber: 7
    }, this);
});
;
const RightRefInner = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["forwardRef"])(function RightRefInner({ containerHeight }, ref) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "w-[180px] border-l border-gray-200 overflow-hidden shrink-0",
        ref: ref,
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "relative",
            style: {
                height: containerHeight
            },
            children: __TURBOPACK__imported__module__$5b$project$5d2f$data$2f$references$2e$json$2e5b$json$5d2e$cjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"].points.map((point)=>{
                const y = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["difficultyToY"])(point.difficulty, containerHeight, DIFFICULTY_RANGE);
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "absolute left-0 right-0 flex items-center",
                    style: {
                        top: y - 8
                    },
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "w-3 h-px bg-purple-300 mr-1"
                        }, void 0, false, {
                            fileName: "[project]/src/components/ladder/LadderView.tsx",
                            lineNumber: 246,
                            columnNumber: 17
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "text-xs text-gray-600 truncate",
                            children: point.label
                        }, void 0, false, {
                            fileName: "[project]/src/components/ladder/LadderView.tsx",
                            lineNumber: 247,
                            columnNumber: 17
                        }, this)
                    ]
                }, point.label, true, {
                    fileName: "[project]/src/components/ladder/LadderView.tsx",
                    lineNumber: 241,
                    columnNumber: 15
                }, this);
            })
        }, void 0, false, {
            fileName: "[project]/src/components/ladder/LadderView.tsx",
            lineNumber: 237,
            columnNumber: 9
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/ladder/LadderView.tsx",
        lineNumber: 236,
        columnNumber: 7
    }, this);
});
function TournamentColumn({ tournament, mode, containerHeight, columnWidth, activeFilter, rfLnOffset, onHover, onLeave }) {
    if (mode === 'tournament') {
        const allDiffs = tournament.rounds.flatMap((r)=>r.maps.map((m)=>m.type === 'LN' || m.type === 'HB' ? m.difficulty - rfLnOffset : m.difficulty));
        const minDiff = Math.min(...allDiffs);
        const maxDiff = Math.max(...allDiffs);
        const top = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["difficultyToY"])(maxDiff, containerHeight, DIFFICULTY_RANGE);
        const bottom = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["difficultyToY"])(minDiff, containerHeight, DIFFICULTY_RANGE);
        const height = Math.max(bottom - top, 40);
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "relative shrink-0",
            style: {
                width: columnWidth
            },
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "text-xs text-center text-gray-500 truncate mb-1 font-medium sticky top-0 bg-white z-20",
                    children: tournament.abbreviation
                }, void 0, false, {
                    fileName: "[project]/src/components/ladder/LadderView.tsx",
                    lineNumber: 288,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "round-box absolute left-0 right-0",
                    style: {
                        top: top + 20,
                        height,
                        background: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getGradientForRange"])(minDiff, maxDiff)
                    },
                    onMouseEnter: (e)=>onHover(tournament.rounds[tournament.rounds.length - 1], e.clientX, e.clientY),
                    onMouseLeave: onLeave,
                    children: tournament.abbreviation
                }, void 0, false, {
                    fileName: "[project]/src/components/ladder/LadderView.tsx",
                    lineNumber: 291,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/ladder/LadderView.tsx",
            lineNumber: 287,
            columnNumber: 7
        }, this);
    }
    if (mode === 'round') {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "relative shrink-0",
            style: {
                width: columnWidth
            },
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "text-xs text-center text-gray-500 truncate mb-1 font-medium sticky top-0 bg-white z-20",
                    children: tournament.abbreviation
                }, void 0, false, {
                    fileName: "[project]/src/components/ladder/LadderView.tsx",
                    lineNumber: 306,
                    columnNumber: 9
                }, this),
                tournament.rounds.map((round)=>{
                    const adjustedDiffs = round.maps.map((m)=>m.type === 'LN' || m.type === 'HB' ? m.difficulty - rfLnOffset : m.difficulty);
                    const minDiff = Math.min(...adjustedDiffs);
                    const maxDiff = Math.max(...adjustedDiffs);
                    const top = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["difficultyToY"])(maxDiff, containerHeight, DIFFICULTY_RANGE);
                    const bottom = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["difficultyToY"])(minDiff, containerHeight, DIFFICULTY_RANGE);
                    const boxH = Math.max(bottom - top, 24);
                    const isDimmed = activeFilter && !round.maps.some((m)=>m.type === activeFilter);
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: `round-box absolute left-1 right-1 ${isDimmed ? 'dimmed' : ''}`,
                        style: {
                            top,
                            height: boxH,
                            background: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getGradientForRange"])(minDiff, maxDiff)
                        },
                        onMouseEnter: (e)=>onHover(round, e.clientX, e.clientY),
                        onMouseLeave: onLeave,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "truncate block w-full text-center",
                            children: [
                                tournament.abbreviation,
                                " ",
                                round.abbreviation
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/ladder/LadderView.tsx",
                            lineNumber: 332,
                            columnNumber: 15
                        }, this)
                    }, round.id, false, {
                        fileName: "[project]/src/components/ladder/LadderView.tsx",
                        lineNumber: 321,
                        columnNumber: 13
                    }, this);
                })
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/ladder/LadderView.tsx",
            lineNumber: 305,
            columnNumber: 7
        }, this);
    }
    // mode === 'type'
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "relative shrink-0",
        style: {
            width: columnWidth
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-xs text-center text-gray-500 truncate mb-1 font-medium sticky top-0 bg-white z-20",
                children: tournament.abbreviation
            }, void 0, false, {
                fileName: "[project]/src/components/ladder/LadderView.tsx",
                lineNumber: 345,
                columnNumber: 7
            }, this),
            tournament.rounds.map((round)=>{
                const types = getUniqueTypes(round);
                return types.map((type)=>{
                    const typeMaps = round.maps.filter((m)=>m.type === type);
                    const typeAvg = typeMaps.reduce((s, m)=>s + m.difficulty, 0) / typeMaps.length;
                    const adjustedAvg = type === 'LN' || type === 'HB' ? typeAvg - rfLnOffset : typeAvg;
                    const y = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["difficultyToY"])(adjustedAvg, containerHeight, DIFFICULTY_RANGE);
                    const boxH = BOX_HEIGHT_TYPE;
                    const isDimmed = activeFilter && activeFilter !== type;
                    const color = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$difficulty$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getDifficultyColor"])(adjustedAvg);
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: `round-box absolute left-1 right-1 ${isDimmed ? 'dimmed' : ''}`,
                        style: {
                            top: y - boxH / 2,
                            height: boxH,
                            background: color,
                            fontSize: '10px'
                        },
                        onMouseEnter: (e)=>onHover(round, e.clientX, e.clientY),
                        onMouseLeave: onLeave,
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "truncate block w-full text-center",
                            children: [
                                tournament.abbreviation,
                                " ",
                                round.abbreviation,
                                " ",
                                type
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/ladder/LadderView.tsx",
                            lineNumber: 372,
                            columnNumber: 15
                        }, this)
                    }, `${round.id}-${type}`, false, {
                        fileName: "[project]/src/components/ladder/LadderView.tsx",
                        lineNumber: 360,
                        columnNumber: 13
                    }, this);
                });
            })
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/ladder/LadderView.tsx",
        lineNumber: 344,
        columnNumber: 5
    }, this);
}
function getUniqueTypes(round) {
    const seen = new Set();
    return round.maps.map((m)=>m.type).filter((t)=>{
        if (seen.has(t)) return false;
        seen.add(t);
        return true;
    });
}
}),
"[project]/src/components/controls/ControlBar.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ControlBar",
    ()=>ControlBar
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/stores/viewStore.ts [app-ssr] (ecmascript)");
'use client';
;
;
function ControlBar() {
    const { zoom, setZoom, columnWidth, setColumnWidth, rowHeight, setRowHeight, rfLnOffset, setRfLnOffset } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useViewStore"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("footer", {
        className: "h-14 border-t border-gray-200 flex items-center px-4 gap-4 shrink-0 bg-gray-50",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-1.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs text-gray-500",
                        children: "缩放"
                    }, void 0, false, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 16,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>setZoom(Math.max(0.5, +(zoom - 0.1).toFixed(1))),
                        className: "w-6 h-6 rounded bg-gray-200 text-sm flex items-center justify-center hover:bg-gray-300",
                        children: "-"
                    }, void 0, false, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 17,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs w-10 text-center font-mono",
                        children: [
                            Math.round(zoom * 100),
                            "%"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 23,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>setZoom(Math.min(3, +(zoom + 0.1).toFixed(1))),
                        className: "w-6 h-6 rounded bg-gray-200 text-sm flex items-center justify-center hover:bg-gray-300",
                        children: "+"
                    }, void 0, false, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 24,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/controls/ControlBar.tsx",
                lineNumber: 15,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "w-px h-6 bg-gray-300"
            }, void 0, false, {
                fileName: "[project]/src/components/controls/ControlBar.tsx",
                lineNumber: 32,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-1.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs text-gray-500",
                        children: "列宽"
                    }, void 0, false, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 35,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                        type: "range",
                        min: 80,
                        max: 280,
                        value: columnWidth,
                        onChange: (e)=>setColumnWidth(Number(e.target.value)),
                        className: "w-20 h-1 accent-purple-600"
                    }, void 0, false, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 36,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs font-mono text-gray-600 w-8",
                        children: columnWidth
                    }, void 0, false, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 44,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/controls/ControlBar.tsx",
                lineNumber: 34,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-1.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs text-gray-500",
                        children: "行高"
                    }, void 0, false, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 48,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                        type: "range",
                        min: 20,
                        max: 100,
                        value: rowHeight,
                        onChange: (e)=>setRowHeight(Number(e.target.value)),
                        className: "w-20 h-1 accent-purple-600"
                    }, void 0, false, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 49,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs font-mono text-gray-600 w-6",
                        children: rowHeight
                    }, void 0, false, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 57,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/controls/ControlBar.tsx",
                lineNumber: 47,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "w-px h-6 bg-gray-300"
            }, void 0, false, {
                fileName: "[project]/src/components/controls/ControlBar.tsx",
                lineNumber: 60,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-1.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs text-gray-500",
                        children: "RF/LN 对齐"
                    }, void 0, false, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 63,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                        type: "range",
                        min: -3,
                        max: 3,
                        step: 1,
                        value: rfLnOffset,
                        onChange: (e)=>setRfLnOffset(Number(e.target.value)),
                        className: "w-16 h-1 accent-indigo-500"
                    }, void 0, false, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 64,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs font-mono text-indigo-600",
                        children: [
                            "rf10=ln",
                            10 + rfLnOffset
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/controls/ControlBar.tsx",
                        lineNumber: 73,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/controls/ControlBar.tsx",
                lineNumber: 62,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "ml-auto text-xs text-gray-400",
                children: "osu!mania Ladder v0.1"
            }, void 0, false, {
                fileName: "[project]/src/components/controls/ControlBar.tsx",
                lineNumber: 78,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/controls/ControlBar.tsx",
        lineNumber: 14,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/components/Header.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Header",
    ()=>Header
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/stores/viewStore.ts [app-ssr] (ecmascript)");
'use client';
;
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
    const { mode, setMode, activeFilter, setActiveFilter, searchQuery, setSearchQuery } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$stores$2f$viewStore$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useViewStore"])();
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
        className: "h-14 border-b border-gray-200 flex items-center px-4 gap-4 shrink-0",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                className: "text-lg font-bold whitespace-nowrap",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
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
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-1 ml-4",
                children: VIEW_MODES.map((vm)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-1 ml-4",
                children: TYPE_FILTERS.map((f)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "ml-auto flex items-center gap-2",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
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
}),
"[project]/src/app/page.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Home
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ladder$2f$LadderView$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/ladder/LadderView.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$controls$2f$ControlBar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/controls/ControlBar.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$Header$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/Header.tsx [app-ssr] (ecmascript)");
'use client';
;
;
;
;
function Home() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "h-screen flex flex-col overflow-hidden",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$Header$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Header"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 10,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$ladder$2f$LadderView$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["LadderView"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 11,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$controls$2f$ControlBar$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ControlBar"], {}, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 12,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/page.tsx",
        lineNumber: 9,
        columnNumber: 5
    }, this);
}
}),
];

//# sourceMappingURL=_02p98e_._.js.map