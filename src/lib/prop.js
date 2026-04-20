import { clampNum, uid } from "@/lib/utils";
import { getTradeAccountKey, NO_ACCOUNT_ID, normalizeAccountId } from "@/lib/noAccount.js";
import { isDeleted } from "@/lib/tombstones.js";

// Import prop firm logos
import ftmoLogo from "@/assets/ftmo.png";
import fundingPipsLogo from "@/assets/funding-pips.avif";
import the5ersLogo from "@/assets/the-5ers.png";

// -----------------------------------------------------------------------------
// Prop Templates (Built-ins + User-defined)
// -----------------------------------------------------------------------------

// Featured firms - shown by default
export const FEATURED_FIRMS = ["FTMO", "Funding Pips", "Funding Pips Pro", "The 5%ers"];

// FTMO Programs
const FTMO_TEMPLATES = [
  {
    id: "ftmo_classic_2step",
    firm: "FTMO",
    name: "Classic 2‑Step",
    type: "two_phase",
    currency: "$",
    sizes: [10000, 25000, 50000, 100000, 200000],
    profitSplitPct: 80,
    description: "Most popular challenge with balanced rules",
    featured: true,
    phases: [
      {
        id: "phase1",
        label: "Challenge",
        kind: "evaluation",
        rules: {
          profitTargetPct: 10,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 4,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "phase2",
        label: "Verification",
        kind: "evaluation",
        rules: {
          profitTargetPct: 5,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 4,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "funded",
        label: "Funded",
        kind: "funded",
        rules: {
          profitTargetPct: null,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "static",
        },
        profitSplitPct: 80,
      },
    ],
    payoutPolicy: {
      cycleDays: 14,
      firstPayoutAfterDays: 14,
      minPayoutTrader: 50,
    },
  },
  {
    id: "ftmo_aggressive_2step",
    firm: "FTMO",
    name: "Aggressive 2‑Step",
    type: "two_phase",
    currency: "$",
    sizes: [10000, 25000, 50000, 100000, 200000],
    profitSplitPct: 80,
    description: "Higher targets with more risk tolerance",
    featured: true,
    phases: [
      {
        id: "phase1",
        label: "Challenge",
        kind: "evaluation",
        rules: {
          profitTargetPct: 20,
          maxLossPct: 10,
          maxDailyLossPct: 10,
          minTradingDays: 4,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "phase2",
        label: "Verification",
        kind: "evaluation",
        rules: {
          profitTargetPct: 10,
          maxLossPct: 10,
          maxDailyLossPct: 10,
          minTradingDays: 4,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "funded",
        label: "Funded",
        kind: "funded",
        rules: {
          profitTargetPct: null,
          maxLossPct: 10,
          maxDailyLossPct: 10,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "static",
        },
        profitSplitPct: 80,
      },
    ],
    payoutPolicy: {
      cycleDays: 14,
      firstPayoutAfterDays: 14,
      minPayoutTrader: 50,
    },
  },
  {
    id: "ftmo_swing_2step",
    firm: "FTMO",
    name: "Swing 2‑Step",
    type: "two_phase",
    currency: "$",
    sizes: [10000, 25000, 50000, 100000, 200000],
    profitSplitPct: 80,
    description: "No time limits, perfect for swing traders",
    featured: true,
    phases: [
      {
        id: "phase1",
        label: "Challenge",
        kind: "evaluation",
        rules: {
          profitTargetPct: 10,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 4,
          minDaysMode: "trading",
          maxLossType: "static",
          timeLimitDays: null, // No time limit
        },
      },
      {
        id: "phase2",
        label: "Verification",
        kind: "evaluation",
        rules: {
          profitTargetPct: 5,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 4,
          minDaysMode: "trading",
          maxLossType: "static",
          timeLimitDays: null,
        },
      },
      {
        id: "funded",
        label: "Funded",
        kind: "funded",
        rules: {
          profitTargetPct: null,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "static",
        },
        profitSplitPct: 80,
      },
    ],
    payoutPolicy: {
      cycleDays: 14,
      firstPayoutAfterDays: 14,
      minPayoutTrader: 50,
    },
  },
];

// Funding Pips Programs
const FUNDINGPIPS_TEMPLATES = [
  {
    id: "fundingpips_2step",
    firm: "Funding Pips",
    name: "Evaluation 2‑Step",
    type: "two_phase",
    currency: "$",
    sizes: [5000, 10000, 25000, 50000, 100000, 200000],
    profitSplitPct: 80,
    description: "Standard 2-phase evaluation",
    featured: true,
    phases: [
      {
        id: "phase1",
        label: "Phase 1",
        kind: "evaluation",
        rules: {
          profitTargetPct: 8,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 3,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "phase2",
        label: "Phase 2",
        kind: "evaluation",
        rules: {
          profitTargetPct: 5,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 3,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "funded",
        label: "Funded",
        kind: "funded",
        rules: {
          profitTargetPct: null,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "static",
        },
        profitSplitPct: 80,
      },
    ],
    payoutPolicy: {
      cycleDays: 14,
      firstPayoutAfterDays: 0,
      minPayoutTrader: 100,
    },
  },
  {
    id: "fundingpips_1step",
    firm: "Funding Pips",
    name: "One‑Step",
    type: "one_phase",
    currency: "$",
    sizes: [5000, 10000, 25000, 50000, 100000, 200000],
    profitSplitPct: 80,
    description: "Single phase, faster to funded",
    featured: true,
    phases: [
      {
        id: "phase1",
        label: "One‑Step",
        kind: "evaluation",
        rules: {
          profitTargetPct: 10,
          maxLossPct: 6,
          maxDailyLossPct: 3,
          minTradingDays: 3,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "funded",
        label: "Funded",
        kind: "funded",
        rules: {
          profitTargetPct: null,
          maxLossPct: 6,
          maxDailyLossPct: 3,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "static",
        },
        profitSplitPct: 80,
      },
    ],
    payoutPolicy: {
      cycleDays: 14,
      firstPayoutAfterDays: 0,
      minPayoutTrader: 100,
    },
  },
  {
    id: "fundingpips_instant",
    firm: "Funding Pips",
    name: "Instant Funding",
    type: "instant",
    currency: "$",
    sizes: [2500, 5000, 10000, 25000, 50000],
    profitSplitPct: 60,
    description: "Skip evaluation, trade funded immediately",
    featured: true,
    phases: [
      {
        id: "funded",
        label: "Funded",
        kind: "funded",
        rules: {
          profitTargetPct: null,
          maxLossPct: 6,
          maxDailyLossPct: 3,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "trailing",
        },
        profitSplitPct: 60,
      },
    ],
    payoutPolicy: {
      cycleDays: 14,
      firstPayoutAfterDays: 14,
      minPayoutTrader: 50,
    },
  },
  {
    id: "fundingpips_3step",
    firm: "Funding Pips",
    name: "Evaluation 3‑Step",
    type: "three_phase",
    currency: "$",
    sizes: [10000, 25000, 50000, 100000, 200000],
    profitSplitPct: 90,
    description: "Lower targets per phase, higher profit split",
    featured: true,
    phases: [
      {
        id: "phase1",
        label: "Phase 1",
        kind: "evaluation",
        rules: {
          profitTargetPct: 5,
          maxLossPct: 8,
          maxDailyLossPct: 4,
          minTradingDays: 3,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "phase2",
        label: "Phase 2",
        kind: "evaluation",
        rules: {
          profitTargetPct: 5,
          maxLossPct: 8,
          maxDailyLossPct: 4,
          minTradingDays: 3,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "phase3",
        label: "Phase 3",
        kind: "evaluation",
        rules: {
          profitTargetPct: 5,
          maxLossPct: 8,
          maxDailyLossPct: 4,
          minTradingDays: 3,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "funded",
        label: "Funded",
        kind: "funded",
        rules: {
          profitTargetPct: null,
          maxLossPct: 8,
          maxDailyLossPct: 4,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "static",
        },
        profitSplitPct: 90,
      },
    ],
    payoutPolicy: {
      cycleDays: 14,
      firstPayoutAfterDays: 0,
      minPayoutTrader: 100,
    },
  },
  // Funding Pips Pro - 6% profit target for both phases
  {
    id: "fundingpips_pro",
    firm: "Funding Pips Pro",
    name: "Pro 2‑Step",
    type: "two_phase",
    currency: "$",
    sizes: [5000, 10000, 25000, 50000, 100000, 200000],
    profitSplitPct: 80,
    description: "Pro evaluation with 6% profit targets",
    featured: true,
    phases: [
      {
        id: "phase1",
        label: "Phase 1",
        kind: "evaluation",
        rules: {
          profitTargetPct: 6,
          maxLossPct: 6,
          maxDailyLossPct: 3,
          minTradingDays: 3,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "phase2",
        label: "Phase 2",
        kind: "evaluation",
        rules: {
          profitTargetPct: 6,
          maxLossPct: 6,
          maxDailyLossPct: 3,
          minTradingDays: 3,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "funded",
        label: "Funded",
        kind: "funded",
        rules: {
          profitTargetPct: null,
          maxLossPct: 6,
          maxDailyLossPct: 3,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "static",
        },
        profitSplitPct: 80,
      },
    ],
    payoutPolicy: {
      cycleDays: 14,
      firstPayoutAfterDays: 0,
      minPayoutTrader: 100,
    },
  },
];

// The 5%ers Programs
const THE5ERS_TEMPLATES = [
  {
    id: "the5ers_highstakes",
    firm: "The 5%ers",
    name: "High Stakes 2‑Step",
    type: "two_phase",
    currency: "$",
    sizes: [2500, 5000, 10000, 25000, 50000, 100000],
    profitSplitPct: 80,
    description: "Classic high stakes challenge",
    featured: true,
    phases: [
      {
        id: "phase1",
        label: "Phase 1",
        kind: "evaluation",
        rules: {
          profitTargetPct: 8,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 3,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "phase2",
        label: "Phase 2",
        kind: "evaluation",
        rules: {
          profitTargetPct: 5,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 3,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "funded",
        label: "Funded",
        kind: "funded",
        rules: {
          profitTargetPct: null,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "static",
        },
        profitSplitPct: 80,
      },
    ],
    payoutPolicy: {
      cycleDays: 14,
      firstPayoutAfterDays: 14,
      minPayoutTrader: 50,
    },
  },
  {
    id: "the5ers_lowrisk",
    firm: "The 5%ers",
    name: "Low Risk 1‑Step",
    type: "one_phase",
    currency: "$",
    sizes: [10000, 20000, 40000, 60000, 100000],
    profitSplitPct: 50,
    description: "Lower risk, progressive scaling",
    featured: true,
    phases: [
      {
        id: "phase1",
        label: "Evaluation",
        kind: "evaluation",
        rules: {
          profitTargetPct: 6,
          maxLossPct: 4,
          maxDailyLossPct: 2,
          minTradingDays: 3,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "funded",
        label: "Funded",
        kind: "funded",
        rules: {
          profitTargetPct: null,
          maxLossPct: 4,
          maxDailyLossPct: 2,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "static",
        },
        profitSplitPct: 50,
      },
    ],
    payoutPolicy: {
      cycleDays: 14,
      firstPayoutAfterDays: 14,
      minPayoutTrader: 50,
    },
  },
  {
    id: "the5ers_instant",
    firm: "The 5%ers",
    name: "Instant Funding",
    type: "instant",
    currency: "$",
    sizes: [10000, 20000, 40000, 60000, 100000],
    profitSplitPct: 50,
    description: "Skip evaluation, start funded",
    featured: true,
    phases: [
      {
        id: "funded",
        label: "Funded",
        kind: "funded",
        rules: {
          profitTargetPct: null,
          maxLossPct: 5,
          maxDailyLossPct: 3,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "trailing",
        },
        profitSplitPct: 50,
      },
    ],
    payoutPolicy: {
      cycleDays: 14,
      firstPayoutAfterDays: 30,
      minPayoutTrader: 50,
    },
  },
  {
    id: "the5ers_bootcamp",
    firm: "The 5%ers",
    name: "Bootcamp",
    type: "one_phase",
    currency: "$",
    sizes: [25000, 50000, 100000],
    profitSplitPct: 100,
    description: "Free entry, prove your skills",
    featured: true,
    phases: [
      {
        id: "phase1",
        label: "Bootcamp",
        kind: "evaluation",
        rules: {
          profitTargetPct: 6,
          maxLossPct: 5,
          maxDailyLossPct: 2,
          minTradingDays: 5,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "funded",
        label: "Funded",
        kind: "funded",
        rules: {
          profitTargetPct: null,
          maxLossPct: 5,
          maxDailyLossPct: 2,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "static",
        },
        profitSplitPct: 100,
      },
    ],
    payoutPolicy: {
      cycleDays: 30,
      firstPayoutAfterDays: 30,
      minPayoutTrader: 50,
    },
  },
];

// Additional firms (hidden by default, shown with "Show More")
const ADDITIONAL_TEMPLATES = [
  // FundedNext
  {
    id: "fundednext_stellar_2step",
    firm: "FundedNext",
    name: "Stellar 2‑Step",
    type: "two_phase",
    currency: "$",
    sizes: [6000, 15000, 25000, 50000, 100000, 200000],
    profitSplitPct: 80,
    featured: false,
    phases: [
      {
        id: "phase1",
        label: "Phase 1",
        kind: "evaluation",
        rules: {
          profitTargetPct: 8,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 3,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "phase2",
        label: "Phase 2",
        kind: "evaluation",
        rules: {
          profitTargetPct: 5,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 3,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "funded",
        label: "Funded",
        kind: "funded",
        rules: {
          profitTargetPct: null,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "static",
        },
        profitSplitPct: 80,
      },
    ],
  },
  {
    id: "fundednext_stellar_lite",
    firm: "FundedNext",
    name: "Stellar Lite",
    type: "two_phase",
    currency: "$",
    sizes: [5000, 10000, 25000, 50000, 100000, 200000],
    profitSplitPct: 80,
    featured: false,
    phases: [
      {
        id: "phase1",
        label: "Phase 1",
        kind: "evaluation",
        rules: {
          profitTargetPct: 8,
          maxLossPct: 8,
          maxDailyLossPct: 4,
          minTradingDays: 5,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "phase2",
        label: "Phase 2",
        kind: "evaluation",
        rules: {
          profitTargetPct: 4,
          maxLossPct: 8,
          maxDailyLossPct: 4,
          minTradingDays: 5,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "funded",
        label: "Funded",
        kind: "funded",
        rules: {
          profitTargetPct: null,
          maxLossPct: 8,
          maxDailyLossPct: 4,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "static",
        },
        profitSplitPct: 95,
      },
    ],
  },
  {
    id: "fundednext_stellar_1step",
    firm: "FundedNext",
    name: "Stellar One‑Step",
    type: "one_phase",
    currency: "$",
    sizes: [6000, 15000, 25000, 50000, 100000, 200000],
    profitSplitPct: 80,
    featured: false,
    phases: [
      {
        id: "phase1",
        label: "One‑Step",
        kind: "evaluation",
        rules: {
          profitTargetPct: 10,
          maxLossPct: 6,
          maxDailyLossPct: 3,
          minTradingDays: 3,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "funded",
        label: "Funded",
        kind: "funded",
        rules: {
          profitTargetPct: null,
          maxLossPct: 6,
          maxDailyLossPct: 3,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "static",
        },
        profitSplitPct: 80,
      },
    ],
  },
  // E8 Funding
  {
    id: "e8_2step",
    firm: "E8 Funding",
    name: "E8 Track",
    type: "two_phase",
    currency: "$",
    sizes: [25000, 50000, 100000, 250000],
    profitSplitPct: 80,
    featured: false,
    phases: [
      {
        id: "phase1",
        label: "Phase 1",
        kind: "evaluation",
        rules: {
          profitTargetPct: 8,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "phase2",
        label: "Phase 2",
        kind: "evaluation",
        rules: {
          profitTargetPct: 5,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "funded",
        label: "Funded",
        kind: "funded",
        rules: {
          profitTargetPct: null,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "static",
        },
        profitSplitPct: 80,
      },
    ],
  },
  // True Forex Funds
  {
    id: "tff_2step",
    firm: "True Forex Funds",
    name: "2 Step Challenge",
    type: "two_phase",
    currency: "$",
    sizes: [10000, 25000, 50000, 100000, 200000],
    profitSplitPct: 80,
    featured: false,
    phases: [
      {
        id: "phase1",
        label: "Challenge",
        kind: "evaluation",
        rules: {
          profitTargetPct: 8,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 5,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "phase2",
        label: "Verification",
        kind: "evaluation",
        rules: {
          profitTargetPct: 5,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 5,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "funded",
        label: "Funded",
        kind: "funded",
        rules: {
          profitTargetPct: null,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "static",
        },
        profitSplitPct: 80,
      },
    ],
  },
  // Alpha Capital Group
  {
    id: "alphacapital_2step",
    firm: "Alpha Capital",
    name: "2 Phase Evaluation",
    type: "two_phase",
    currency: "$",
    sizes: [10000, 25000, 50000, 100000, 200000],
    profitSplitPct: 80,
    featured: false,
    phases: [
      {
        id: "phase1",
        label: "Phase 1",
        kind: "evaluation",
        rules: {
          profitTargetPct: 8,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 3,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "phase2",
        label: "Phase 2",
        kind: "evaluation",
        rules: {
          profitTargetPct: 5,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 3,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "funded",
        label: "Funded",
        kind: "funded",
        rules: {
          profitTargetPct: null,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "static",
        },
        profitSplitPct: 80,
      },
    ],
  },
  // Goat Funded Trader
  {
    id: "goat_2step",
    firm: "Goat Funded",
    name: "2 Step Classic",
    type: "two_phase",
    currency: "$",
    sizes: [8000, 15000, 25000, 50000, 100000, 200000],
    profitSplitPct: 80,
    featured: false,
    phases: [
      {
        id: "phase1",
        label: "Phase 1",
        kind: "evaluation",
        rules: {
          profitTargetPct: 8,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 3,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "phase2",
        label: "Phase 2",
        kind: "evaluation",
        rules: {
          profitTargetPct: 5,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 3,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "funded",
        label: "Funded",
        kind: "funded",
        rules: {
          profitTargetPct: null,
          maxLossPct: 10,
          maxDailyLossPct: 5,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "static",
        },
        profitSplitPct: 80,
      },
    ],
  },
  // BlueBerry Markets
  {
    id: "blueberry_2step",
    firm: "BlueBerry",
    name: "Standard 2 Phase",
    type: "two_phase",
    currency: "$",
    sizes: [10000, 25000, 50000, 100000, 200000],
    profitSplitPct: 85,
    featured: false,
    phases: [
      {
        id: "phase1",
        label: "Phase 1",
        kind: "evaluation",
        rules: {
          profitTargetPct: 8,
          maxLossPct: 10,
          maxDailyLossPct: 4,
          minTradingDays: 5,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "phase2",
        label: "Phase 2",
        kind: "evaluation",
        rules: {
          profitTargetPct: 4,
          maxLossPct: 10,
          maxDailyLossPct: 4,
          minTradingDays: 5,
          minDaysMode: "trading",
          maxLossType: "static",
        },
      },
      {
        id: "funded",
        label: "Funded",
        kind: "funded",
        rules: {
          profitTargetPct: null,
          maxLossPct: 10,
          maxDailyLossPct: 4,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "static",
        },
        profitSplitPct: 85,
      },
    ],
  },
  // Topstep (futures)
  {
    id: "topstep_50k",
    firm: "Topstep",
    name: "Trading Combine $50K",
    type: "one_phase",
    currency: "$",
    sizes: [50000, 100000, 150000],
    profitSplitPct: 90,
    featured: false,
    phases: [
      {
        id: "phase1",
        label: "Combine",
        kind: "evaluation",
        rules: {
          profitTargetPct: 6,
          maxLossPct: 4,
          maxDailyLossPct: 2,
          minTradingDays: 5,
          minDaysMode: "trading",
          maxLossType: "trailing",
        },
      },
      {
        id: "funded",
        label: "Funded",
        kind: "funded",
        rules: {
          profitTargetPct: null,
          maxLossPct: 4,
          maxDailyLossPct: 2,
          minTradingDays: 0,
          minDaysMode: "trading",
          maxLossType: "trailing",
        },
        profitSplitPct: 90,
      },
    ],
  },
];

// Combine all built-in templates
export const BUILTIN_PROP_TEMPLATES = [
  ...FTMO_TEMPLATES,
  ...FUNDINGPIPS_TEMPLATES,
  ...THE5ERS_TEMPLATES,
  ...ADDITIONAL_TEMPLATES,
];

// Get featured templates only
export function getFeaturedTemplates(templates) {
  return (templates || []).filter(t => t.featured !== false && FEATURED_FIRMS.includes(t.firm));
}

// Get additional/hidden templates
export function getAdditionalTemplates(templates) {
  return (templates || []).filter(t => !FEATURED_FIRMS.includes(t.firm) || t.featured === false);
}

export function normalizePhase(phase, idx = 0) {
  const p = phase || {};
  const rules = p.rules || {};
  return {
    id: String(p.id || `phase${idx + 1}`),
    label: String(p.label || `Phase ${idx + 1}`),
    kind: p.kind === "funded" ? "funded" : "evaluation",
    profitSplitPct: p.profitSplitPct === null || p.profitSplitPct === undefined ? null : clampNum(p.profitSplitPct),
    rules: {
      profitTargetPct: rules.profitTargetPct === null || rules.profitTargetPct === undefined ? null : clampNum(rules.profitTargetPct),
      maxLossPct: rules.maxLossPct === null || rules.maxLossPct === undefined ? null : clampNum(rules.maxLossPct),
      maxDailyLossPct: rules.maxDailyLossPct === null || rules.maxDailyLossPct === undefined ? null : clampNum(rules.maxDailyLossPct),
      minTradingDays: rules.minTradingDays === null || rules.minTradingDays === undefined ? null : Math.max(0, Math.round(clampNum(rules.minTradingDays))),
      minDaysMode: rules.minDaysMode === "profitable" ? "profitable" : "trading",
      profitableDayMinPct:
        rules.profitableDayMinPct === null || rules.profitableDayMinPct === undefined ? null : clampNum(rules.profitableDayMinPct),
      maxLossType: rules.maxLossType === "trailing" ? "trailing" : "static",
      timeLimitDays: rules.timeLimitDays === null || rules.timeLimitDays === undefined ? null : Math.max(0, Math.round(clampNum(rules.timeLimitDays))),
    },
  };
}

export function normalizeTemplate(tpl) {
  const t = tpl || {};
  const phasesIn = Array.isArray(t.phases) ? t.phases : [];
  const phases = phasesIn.length ? phasesIn.map((p, i) => normalizePhase(p, i)) : [normalizePhase({}, 0)];
  // Ensure at least one phase id is unique
  const seen = new Set();
  const phasesUniq = phases.map((p, i) => {
    let id = String(p.id || `phase${i + 1}`);
    while (seen.has(id)) id = `${id}_${i}`;
    seen.add(id);
    return { ...p, id };
  });
  return {
    id: String(t.id || uid()),
    firm: String(t.firm || ""),
    name: String(t.name || ""),
    type: String(t.type || (phasesUniq.length === 1 ? "one_phase" : phasesUniq.length === 3 ? "two_phase" : "custom")),
    currency: String(t.currency || "$"),
    sizes: Array.isArray(t.sizes) ? t.sizes.map((n) => clampNum(n)).filter((n) => n > 0) : [],
    profitSplitPct: t.profitSplitPct === null || t.profitSplitPct === undefined ? null : clampNum(t.profitSplitPct),
    description: String(t.description || ""),
    featured: t.featured !== false,
    payoutPolicy: normalizePayoutPolicy(t.payoutPolicy),
    phases: phasesUniq,
    // Avatar/icon support for custom programs
    avatar: t.avatar || null, // { type: "emoji" | "image", emoji?: string, imageData?: string }
    color: t.color || null, // Accent color hex string
    // Optional metadata for UI
    createdAt: typeof t.createdAt === "number" ? t.createdAt : undefined,
    updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : undefined,
    sourceBuiltinId: t.sourceBuiltinId || undefined,
  };
}

// -----------------------------------------------------------------------------
// Payout policy + forecasting (used for Live/Funded accounts)
// -----------------------------------------------------------------------------

export function normalizePayoutPolicy(p) {
  const x = p || {};
  const cycleDays = x.cycleDays === null || x.cycleDays === undefined ? 14 : Math.max(0, Math.round(clampNum(x.cycleDays)));
  const firstPayoutAfterDays =
    x.firstPayoutAfterDays === null || x.firstPayoutAfterDays === undefined ? 14 : Math.max(0, Math.round(clampNum(x.firstPayoutAfterDays)));
  const minPayoutTrader = x.minPayoutTrader === null || x.minPayoutTrader === undefined ? 50 : Math.max(0, clampNum(x.minPayoutTrader));
  const allowMultiplePerCycle = !!x.allowMultiplePerCycle;
  const maxPayoutsPerCycle = x.maxPayoutsPerCycle === null || x.maxPayoutsPerCycle === undefined ? 1 : Math.max(1, Math.round(clampNum(x.maxPayoutsPerCycle)));
  const cycleAnchor = x.cycleAnchor === "last_paid" ? "last_paid" : "funded_start";
  return { cycleDays, firstPayoutAfterDays, minPayoutTrader, allowMultiplePerCycle, maxPayoutsPerCycle, cycleAnchor };
}

export function getPayoutPolicy(account, templates) {
  const tpl = getTemplate(templates, account?.prop?.templateId);
  const base = normalizePayoutPolicy(tpl?.payoutPolicy);
  // Optional per-account override (kept minimal; advanced users can edit templates)
  const ov = account?.prop?.payoutPolicyOverride;
  if (!ov) return base;
  return normalizePayoutPolicy({ ...base, ...(ov || {}) });
}

function msDays(n) {
  return Math.round(clampNum(n)) * 24 * 60 * 60 * 1000;
}

function round2(n) {
  const x = clampNum(n);
  return Math.round(x * 100) / 100;
}

export function computePayoutForecast(account, templates, nowTs = Date.now()) {
  const acc = account || null;
  if (!acc?.prop?.templateId) return null;
  const tpl = getTemplate(templates, acc.prop.templateId);
  const ph = getPhase(tpl, acc.prop.phaseId);
  if (!tpl || !ph || ph.kind !== "funded") return null;

  const policy = getPayoutPolicy(acc, templates);
  const startedAt = Number(acc?.prop?.startedAt || acc?.createdAt || 0) || 0;
  const earliestAt = startedAt + msDays(policy.firstPayoutAfterDays);

  const { splitPct, paidTrader, pendingTrader, paidGross, pendingGross, payouts } = summarizePayouts(acc, templates);

  const startEq = clampNum(acc.prop?.size ?? acc.startingEquity ?? 0);
  const curEq = clampNum(acc.currentEquity ?? startEq);
  const profitGross = Math.max(0, curEq - startEq);
  // When payouts are deducted from equity, profitGross understates total earnings.
  // Add back paid gross to get the true total profit for trader share calculation.
  const totalProfitGross = profitGross + clampNum(paidGross);
  const availableGross = Math.max(0, profitGross - clampNum(pendingGross));
  const availableTrader = Math.max(0, totalProfitGross * (clampNum(splitPct) / 100) - clampNum(paidTrader) - clampNum(pendingTrader));

  // Get reset timestamp for filtering
  const lastResetAt = Number(acc?.prop?.lastPayoutResetAt || 0) || 0;
  
  // Filter payouts to only those in current cycle (after last reset)
  const isInCurrentCycle = (p) => {
    if (!lastResetAt) return true;
    const ts = Number(p?.paidAt || p?.requestedAt || 0);
    return ts > lastResetAt;
  };

  const pendingExists = Array.isArray(payouts) && payouts.some((p) => p?.status === "requested" && isInCurrentCycle(p));
  const paidInCycle = Array.isArray(payouts) ? payouts.filter((p) => p?.status === "paid" && p?.paidAt && isInCurrentCycle(p)) : [];
  const lastPaidAt = paidInCycle.length ? Math.max(...paidInCycle.map((p) => Number(p.paidAt || 0))) : null;

  // Check for one-time cycle reset (cycleResetAt). When set and no pending payout,
  // use it as the new anchor so that the payout is available today.
  const cycleResetAt = Number(acc?.prop?.cycleResetAt) || 0;
  const isCycleReset = cycleResetAt > 0 && !pendingExists;

  const cycleLen = msDays(policy.cycleDays);
  const anchorBase = policy.cycleAnchor === "last_paid" && lastPaidAt ? lastPaidAt : earliestAt;
  // When cycle is reset, use cycleResetAt as the new anchor so payout starts from today
  const anchor = isCycleReset ? cycleResetAt : anchorBase;
  const hasCycles = policy.cycleDays > 0;
  let cycleStartAt = anchor;
  let cycleEndAt = anchor + cycleLen;
  let cycleIndex = 0;
  if (hasCycles) {
    if (nowTs < anchor) {
      cycleIndex = -1;
      cycleStartAt = anchor;
      cycleEndAt = anchor + cycleLen;
    } else {
      cycleIndex = Math.floor((nowTs - anchor) / cycleLen);
      cycleStartAt = anchor + cycleIndex * cycleLen;
      cycleEndAt = cycleStartAt + cycleLen;
    }
  } else {
    // No cycles => always eligible after earliestAt
    cycleIndex = 0;
    cycleStartAt = earliestAt;
    cycleEndAt = Number.POSITIVE_INFINITY;
  }

  const cycleCountStart = cycleStartAt;
  const cycleCountEnd = cycleEndAt;
  const nonCanceled = Array.isArray(payouts) ? payouts.filter((p) => p?.status !== "canceled" && isInCurrentCycle(p)) : [];
  const inCycle = nonCanceled.filter((p) => {
    const ts = Number(p?.requestedAt || p?.paidAt || 0);
    return ts >= cycleCountStart && ts < cycleCountEnd;
  });

  const maxPerCycle = policy.allowMultiplePerCycle ? policy.maxPayoutsPerCycle : 1;
  const cycleLimitReached = hasCycles && inCycle.length >= maxPerCycle;

  let eligible = true;
  let reason = null;
  let nextEligibleAt = nowTs;

  if (pendingExists) {
    eligible = false;
    reason = "pending_payout";
    nextEligibleAt = null;
  } else if (!isCycleReset && nowTs < earliestAt) {
    // Skip before_first_window check if cycle is reset
    eligible = false;
    reason = "before_first_window";
    nextEligibleAt = earliestAt;
  } else if (availableTrader + 1e-9 < clampNum(policy.minPayoutTrader)) {
    eligible = false;
    reason = "min_payout";
    nextEligibleAt = hasCycles ? cycleEndAt : nowTs;
  } else if (!isCycleReset && cycleLimitReached) {
    // Skip cycle_limit check if cycle is reset
    eligible = false;
    reason = "cycle_limit";
    nextEligibleAt = cycleEndAt;
  } else if (!isCycleReset && policy.cycleAnchor === "last_paid" && lastPaidAt && hasCycles && nowTs < lastPaidAt + cycleLen) {
    // Skip cooldown check if cycle is reset
    eligible = false;
    reason = "cooldown";
    nextEligibleAt = lastPaidAt + cycleLen;
  }

  const requestAmountTrader = round2(availableTrader);
  const requestAmountGross = round2(payoutGrossFromTrader(requestAmountTrader, splitPct));

  return {
    policy,
    splitPct,
    startedAt,
    earliestAt,
    lastPaidAt,
    cycleIndex,
    cycleStartAt,
    cycleEndAt: Number.isFinite(cycleEndAt) ? cycleEndAt : null,
    payoutsInCycle: inCycle.length,
    maxPayoutsPerCycle: maxPerCycle,
    eligible,
    reason,
    nextEligibleAt,
    profitGross: round2(profitGross),
    paidTrader: round2(paidTrader),
    pendingTrader: round2(pendingTrader),
    paidGross: round2(paidGross),
    pendingGross: round2(pendingGross),
    availableGross: round2(availableGross),
    availableTrader: round2(availableTrader),
    requestAmountTrader,
    requestAmountGross,
    pendingExists,
  };
}

export function computePayoutWindows(account, templates, count = 4, nowTs = Date.now()) {
  const fc = computePayoutForecast(account, templates, nowTs);
  if (!fc) return [];
  const cycleDays = fc.policy.cycleDays;
  const cycleLen = msDays(cycleDays);
  const out = [];
  if (!cycleDays || cycleDays <= 0) {
    out.push({ at: fc.earliestAt, label: "Eligible" });
    return out;
  }
  // Next window starts on cycle boundaries from anchor.
  const anchor = fc.policy.cycleAnchor === "last_paid" && fc.lastPaidAt ? fc.lastPaidAt : fc.earliestAt;
  const start = Math.max(fc.earliestAt, nowTs);
  const idx0 = start <= anchor ? 0 : Math.ceil((start - anchor) / cycleLen);
  for (let i = 0; i < count; i++) {
    const at = anchor + (idx0 + i) * cycleLen;
    out.push({ at, label: `+${(idx0 + i) * cycleDays}d` });
  }
  return out;
}

export function mergePropTemplates(userTemplates) {
  const custom = Array.isArray(userTemplates) ? userTemplates.map((t) => normalizeTemplate(t)) : [];
  const builtins = BUILTIN_PROP_TEMPLATES.map((t) => normalizeTemplate(t));
  // Prefer custom template if id collides (custom can override)
  const byId = new Map();
  for (const b of builtins) byId.set(b.id, { ...b, isBuiltin: true });
  for (const c of custom) byId.set(c.id, { ...c, isBuiltin: false });
  return Array.from(byId.values());
}

export function getTemplate(templates, templateId) {
  const list = Array.isArray(templates) ? templates : [];
  const id = String(templateId || "");
  return list.find((t) => String(t.id) === id) || null;
}

export function getPhase(template, phaseId) {
  const tpl = template || null;
  if (!tpl) return null;
  const id = String(phaseId || "");
  const phases = Array.isArray(tpl.phases) ? tpl.phases : [];
  return phases.find((p) => String(p.id) === id) || phases[0] || null;
}

export function getPhaseIndex(template, phaseId) {
  const tpl = template || null;
  const phases = Array.isArray(tpl?.phases) ? tpl.phases : [];
  return phases.findIndex((p) => String(p.id) === String(phaseId || ""));
}

export function getNextPhaseId(template, phaseId) {
  const idx = getPhaseIndex(template, phaseId);
  if (idx < 0) return null;
  const phases = Array.isArray(template?.phases) ? template.phases : [];
  return phases[idx + 1]?.id || null;
}

export function phaseStatusLabel(template, phaseId, payouts) {
  const ph = getPhase(template, phaseId);
  const idx = getPhaseIndex(template, phaseId);
  const isFunded = ph?.kind === "funded";
  const hasPendingPayout = Array.isArray(payouts) && payouts.some((p) => p?.status === "requested");
  if (isFunded && hasPendingPayout) return "On payout";
  if (isFunded) return "Live";
  const n = idx >= 0 ? idx + 1 : 1;
  return `Phase ${n}`;
}

export function isLivePropAccount(account, templates) {
  const tpl = getTemplate(templates, account?.prop?.templateId);
  const ph = getPhase(tpl, account?.prop?.phaseId);
  return !!(tpl && ph && ph.kind === "funded");
}

export function getProfitSplitPct(account, templates) {
  const tpl = getTemplate(templates, account?.prop?.templateId);
  const ph = getPhase(tpl, account?.prop?.phaseId);
  const override = account?.prop?.profitSplitPctOverride;
  if (override !== null && override !== undefined && String(override) !== "") return clampNum(override);
  const phaseSplit = ph?.profitSplitPct;
  if (phaseSplit !== null && phaseSplit !== undefined) return clampNum(phaseSplit);
  const tplSplit = tpl?.profitSplitPct;
  if (tplSplit !== null && tplSplit !== undefined) return clampNum(tplSplit);
  return 100;
}

// -----------------------------------------------------------------------------
// Payouts (only allowed for funded/live phases)
// -----------------------------------------------------------------------------

export function normalizePayout(p) {
  const x = p || {};
  const status = x.status === "paid" ? "paid" : x.status === "canceled" ? "canceled" : "requested";
  return {
    id: String(x.id || uid()),
    amountTrader: clampNum(x.amountTrader),
    requestedAt: typeof x.requestedAt === "number" ? x.requestedAt : Date.now(),
    paidAt: typeof x.paidAt === "number" ? x.paidAt : null,
    status,
    note: String(x.note || "").slice(0, 500),
  };
}

export function normalizePayouts(list) {
  return Array.isArray(list) ? list.map(normalizePayout) : [];
}

export function payoutGrossFromTrader(amountTrader, profitSplitPct) {
  const pct = Math.max(1e-9, clampNum(profitSplitPct));
  return clampNum(amountTrader) / (pct / 100);
}

/**
 * Summarize payouts for an account, with support for payout cycle resets.
 * 
 * When `lastPayoutResetAt` is set on the account, only payouts that occurred
 * AFTER that timestamp are included in paidGross/pendingGross calculations.
 * This prevents double-counting when equity is reset after marking a payout as paid.
 * 
 * The returned `payouts` array always contains ALL payouts (for UI/history).
 * But `paidGross`, `pendingGross`, `paidTrader`, `pendingTrader` only count
 * payouts relevant to the current payout cycle.
 */
export function summarizePayouts(account, templates) {
  const payouts = normalizePayouts(account?.prop?.payouts);
  const split = getProfitSplitPct(account, templates);
  
  // Get the last payout reset timestamp (if any)
  // Payouts before this time should not be counted in available profit calculations
  // because the equity was already reset when they were paid out.
  const lastResetAt = Number(account?.prop?.lastPayoutResetAt || 0) || 0;
  
  // Filter function to check if a payout is in the current cycle
  const isInCurrentCycle = (p) => {
    if (!lastResetAt) return true; // No reset = count all payouts
    const ts = Number(p?.paidAt || p?.requestedAt || 0);
    // Use strict > to exclude payouts that were marked paid at reset time
    return ts > lastResetAt;
  };
  
  // For calculation purposes, only count payouts in the current cycle
  const paid = payouts.filter((p) => p.status === "paid" && isInCurrentCycle(p));
  const pending = payouts.filter((p) => p.status === "requested" && isInCurrentCycle(p));
  
  const paidTrader = paid.reduce((s, p) => s + clampNum(p.amountTrader), 0);
  const pendingTrader = pending.reduce((s, p) => s + clampNum(p.amountTrader), 0);
  const paidGross = paid.reduce((s, p) => s + payoutGrossFromTrader(p.amountTrader, split), 0);
  const pendingGross = pending.reduce((s, p) => s + payoutGrossFromTrader(p.amountTrader, split), 0);
  
  // Return all payouts for UI display, but cycle-aware totals for calculations
  return { splitPct: split, paidTrader, pendingTrader, paidGross, pendingGross, payouts };
}

// -----------------------------------------------------------------------------
// Legacy mapping (old firm/program model -> templateId)
// -----------------------------------------------------------------------------

const LEGACY_MAP = {
  // From older versions of this app
  ftmo: "ftmo_classic_2step",
  fundingpips: "fundingpips_2step",
  "the5ers": "the5ers_highstakes",
  fundednext: "fundednext_stellar_2step",
};

export function mapLegacyPropToTemplateId(firmId, programId) {
  const f = String(firmId || "").toLowerCase();
  const p = String(programId || "").toLowerCase();
  // Prefer program id if it contains useful info
  if (p.includes("1") && f.includes("fundingpips")) return "fundingpips_1step";
  if (p.includes("lite") && f.includes("fundednext")) return "fundednext_stellar_lite";
  if (p.includes("1") && f.includes("fundednext")) return "fundednext_stellar_1step";
  return LEGACY_MAP[f] || null;
}

// -----------------------------------------------------------------------------
// Evaluation (rules engine) - Enhanced with breach detection
// -----------------------------------------------------------------------------

// Convert timestamp or ISO date string to LOCAL date string (YYYY-MM-DD)
// IMPORTANT: Uses local timezone, not UTC, to avoid date shifting
function toISODateLocal(input) {
  if (!input) return null;
  
  // If input is already a string like "2026-02-01", extract just the date part
  if (typeof input === "string") {
    // Check if it's an ISO date string (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
    const match = input.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  
  // If it's a timestamp, convert to local date
  const d = new Date(input);
  if (isNaN(d.getTime())) return null;
  
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Legacy UTC version - kept for backward compatibility but should migrate away from this
function isoDate(ts) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function getAllocPnL(trade, accountId) {
  // Normalize accountId for consistent comparison with getTradeAccountKey
  const targetId = normalizeAccountId(accountId);
  
  // Check allocations first
  const allocs = Array.isArray(trade?.allocations) ? trade.allocations : [];
  let pnl = 0;
  let found = false;
  
  for (const a of allocs) {
    // Use getTradeAccountKey for consistent normalization
    if (getTradeAccountKey(a) !== targetId) continue;
    pnl += clampNum(a.pnl);
    found = true;
  }
  
  // Fallback: if trade has direct accountId match, use trade-level pnl
  if (!found && getTradeAccountKey(trade) === targetId) {
    // Try to get pnl from trade directly
    pnl = clampNum(trade.pnl ?? trade.pnlAbs ?? 0);
    // If allocations exist but no matching accountId, sum all allocation pnl
    if (pnl === 0 && allocs.length > 0) {
      pnl = allocs.reduce((s, a) => s + clampNum(a?.pnl), 0);
    }
  }
  
  return pnl;
}

function collectTradesForAccount(trades, accountId, fromTs) {
  const out = [];
  
  // Normalize accountId for consistent comparison with getTradeAccountKey
  const targetId = normalizeAccountId(accountId);
  
  // Debug logging - always on for now to diagnose equity curve issues
  const DEBUG = typeof window !== "undefined";
  if (DEBUG) {
    console.group(`[collectTradesForAccount] accountId=${targetId}, totalTrades=${trades?.length || 0}, fromTs=${fromTs}`);
  }
  
  let skippedNoTs = 0;
  let skippedTooOld = 0;
  let skippedNoMatch = 0;
  let skippedNoPnl = 0;
  
  for (const t of trades || []) {
    if (!t || isDeleted(t)) continue;
    
    // Get the trade date - priority: date (string), closedAt, createdAt
    // trade.date is typically an ISO string like "2026-02-01"
    const tradeDateStr = t.date || null;
    const tradeTs = t.closedAt || t.createdAt || 0;
    
    // Parse date for filtering
    let ts;
    if (tradeDateStr && typeof tradeDateStr === "string") {
      // Parse ISO date string to timestamp
      ts = new Date(tradeDateStr + "T12:00:00").getTime(); // Use noon to avoid timezone issues
    } else {
      ts = Number(tradeTs) || 0;
    }
    
    if (!ts) {
      skippedNoTs++;
      continue;
    }
    
    if (fromTs && ts < fromTs) {
      skippedTooOld++;
      continue;
    }
    
    // Check if trade belongs to this account
    // Method 1: Check allocations for matching accountId (using getTradeAccountKey for consistent normalization)
    const allocs = Array.isArray(t.allocations) ? t.allocations : [];
    const hasAllocMatch = allocs.some((a) => getTradeAccountKey(a) === targetId);
    
    // Method 2: Check direct trade.accountId (using getTradeAccountKey for consistent normalization)
    const hasDirectMatch = getTradeAccountKey(t) === targetId;
    
    // Trade must match via at least one method
    const hasMatch = hasAllocMatch || hasDirectMatch;
    
    // Pass targetId to getAllocPnL for consistent matching
    const pnl = getAllocPnL(t, targetId);
    
    // Log every trade to see what's happening
    if (DEBUG && !hasMatch) {
      console.log(`[trade ${t.id}] NO MATCH - date: ${tradeDateStr}, direct: ${getTradeAccountKey(t)}, allocs: [${allocs.map(a => getTradeAccountKey(a)).join(', ')}], target: ${targetId}`);
    } else if (DEBUG && hasMatch) {
      console.log(`[trade ${t.id}] MATCH - date: ${tradeDateStr}, pnl: ${pnl}`);
    }
    
    // Skip if no match to this account
    if (!hasMatch) {
      skippedNoMatch++;
      continue;
    }
    
    // Skip only if pnl is 0 AND no allocations AND no trade-level pnl data exists
    if (pnl === 0 && allocs.length === 0 && t?.pnl == null && t?.pnlAbs == null) {
      skippedNoPnl++;
      continue;
    }
    
    // Get the day key - use the string date if available, otherwise convert timestamp
    const dayKey = toISODateLocal(tradeDateStr) || toISODateLocal(tradeTs);
    
    out.push({ ts, pnl, tradeId: t.id, date: t.date, dayKey });
  }
  
  if (DEBUG) {
    console.log(`[collectTradesForAccount] RESULT: collected ${out.length} trades`, {
      skippedNoTs,
      skippedTooOld,
      skippedNoMatch,
      skippedNoPnl,
      collected: out.length,
      trades: out.map(o => ({ date: o.date, pnl: o.pnl })),
    });
    console.groupEnd();
  }
  
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

function buildDailyPnL(tradesForAcc) {
  const byDay = new Map();
  
  for (const it of tradesForAcc) {
    // Use pre-computed dayKey from collectTradesForAccount
    // Fallback to toISODateLocal if dayKey not present
    const day = it.dayKey || toISODateLocal(it.date) || toISODateLocal(it.ts);
    if (!day) continue;
    
    const current = byDay.get(day) || { pnl: 0, count: 0 };
    current.pnl += clampNum(it.pnl);
    current.count += 1;
    byDay.set(day, current);
  }
  
  // Diagnostic logging (can be removed later)
  if (typeof window !== "undefined" && window.DEBUG_PROP_TRADES) {
    console.group("[prop] dailyPnL buckets");
    byDay.forEach((v, day) => {
      console.log(day, "count=", v.count, "pnl=", v.pnl);
    });
    console.groupEnd();
  }
  
  const days = Array.from(byDay.entries())
    .map(([day, data]) => ({ day, pnl: data.pnl }))
    .sort((a, b) => a.day.localeCompare(b.day));
  return days;
}

export function evaluatePropAccount(account, trades, templates) {
  const acc = account || null;
  const prop = acc?.prop || null;
  if (!acc || !prop || !prop.templateId) return null;

  const tpl = getTemplate(templates, prop.templateId);
  const ph = getPhase(tpl, prop.phaseId);
  if (!tpl || !ph) return null;

  const idx = getPhaseIndex(tpl, ph.id);
  const baseRules = ph.rules || {};
  const ov = prop.rulesOverride || {};
  const rules = {
    profitTargetPct: ov.profitTargetPct ?? baseRules.profitTargetPct,
    maxLossPct: ov.maxLossPct ?? baseRules.maxLossPct,
    maxDailyLossPct: ov.maxDailyLossPct ?? baseRules.maxDailyLossPct,
    minTradingDays: ov.minTradingDays ?? baseRules.minTradingDays,
    minDaysMode: ov.minDaysMode ?? baseRules.minDaysMode,
    profitableDayMinPct: ov.profitableDayMinPct ?? baseRules.profitableDayMinPct,
    maxLossType: ov.maxLossType ?? baseRules.maxLossType,
  };

  // IMPORTANT: for prop accounts, all rule thresholds (profit target, max loss,
  // daily loss, etc.) should be based on the program "account size".
  // Users can edit an account later and change the prop size; in that case
  // `startingEquity` may be stale. So we always prefer `prop.size`.
  const startEq = clampNum(prop.size ?? acc.startingEquity ?? 0);
  const curEq = clampNum(acc.currentEquity ?? startEq);
  const profitAbs = curEq - startEq;
  const profitPct = startEq ? (profitAbs / startEq) * 100 : 0;
  const targetAbs = rules.profitTargetPct ? (startEq * clampNum(rules.profitTargetPct)) / 100 : 0;

  const fromTs = Number(prop.startedAt || acc.createdAt || 0);
  const tradesForAcc = collectTradesForAccount(trades || [], acc.id, fromTs);
  const daily = buildDailyPnL(tradesForAcc);
  
  // DEBUG: Log equity curve calculation
  if (typeof window !== "undefined") {
    console.log("[evaluatePropAccount]", {
      accountId: acc.id,
      accountName: acc.name,
      totalTradesInput: trades?.length || 0,
      tradesCollected: tradesForAcc.length,
      dailyBuckets: daily.length,
      daily: daily.map(d => ({ day: d.day, pnl: d.pnl })),
      startEq,
      curEq,
      fromTs,
      fromTsDate: fromTs ? new Date(fromTs).toISOString() : null,
    });
  }
  
  // Include manual trading days from account (for days that weren't recorded as trades)
  const manualTradingDays = clampNum(acc.manualTradingDays);
  const tradingDays = daily.length + manualTradingDays;

  const thresholdProfDayAbs = rules.profitableDayMinPct ? (startEq * clampNum(rules.profitableDayMinPct)) / 100 : 0;
  const profitableDays = daily.filter((d) => clampNum(d.pnl) > 0 && clampNum(d.pnl) >= thresholdProfDayAbs).length;

  // Worst day
  let worstDay = null;
  let worstDayPnl = 0;
  for (const d of daily) {
    if (worstDay === null || d.pnl < worstDayPnl) {
      worstDay = d.day;
      worstDayPnl = d.pnl;
    }
  }

  // Daily limit breaches with detailed info
  const failures = [];
  const breaches = []; // More detailed breach info
  const maxDailyLossAbs = rules.maxDailyLossPct ? (startEq * Math.abs(clampNum(rules.maxDailyLossPct))) / 100 : null;
  if (maxDailyLossAbs !== null) {
    for (const d of daily) {
      if (d.pnl < 0 && Math.abs(d.pnl) - maxDailyLossAbs > 1e-9) {
        failures.push({ type: "max_daily_loss", day: d.day, pnl: d.pnl, limitAbs: -maxDailyLossAbs });
        breaches.push({
          type: "daily_loss",
          date: d.day,
          value: d.pnl,
          limit: -maxDailyLossAbs,
          message: `Daily loss ${Math.abs(d.pnl).toFixed(2)} exceeded limit ${maxDailyLossAbs.toFixed(2)}`,
        });
      }
    }
  }

  // Equity curve for max loss
  const maxLossAbs = rules.maxLossPct ? (startEq * Math.abs(clampNum(rules.maxLossPct))) / 100 : null;
  let minEquity = startEq;
  let peakEquity = startEq;
  let eq = startEq;
  let worstTrailFloor = null;
  const equityCurve = [{ day: null, equity: startEq }];
  
  for (const d of daily) {
    eq += clampNum(d.pnl);
    equityCurve.push({ day: d.day, equity: eq });
    if (eq < minEquity) minEquity = eq;
    if (eq > peakEquity) peakEquity = eq;
    if (rules.maxLossType === "trailing" && maxLossAbs !== null) {
      const floor = peakEquity - maxLossAbs;
      worstTrailFloor = worstTrailFloor === null ? floor : Math.max(worstTrailFloor, floor);
      if (eq < floor - 1e-9) {
        failures.push({ type: "max_loss_trailing", day: d.day, equity: eq, floor });
        breaches.push({
          type: "trailing_loss",
          date: d.day,
          value: eq,
          limit: floor,
          message: `Equity ${eq.toFixed(2)} fell below trailing floor ${floor.toFixed(2)}`,
        });
      }
    }
  }
  if (rules.maxLossType !== "trailing" && maxLossAbs !== null) {
    if (minEquity < startEq - maxLossAbs - 1e-9) {
      failures.push({ type: "max_loss", equity: minEquity, limitAbs: startEq - maxLossAbs });
      breaches.push({
        type: "max_loss",
        value: minEquity,
        limit: startEq - maxLossAbs,
        message: `Account equity ${minEquity.toFixed(2)} breached max loss ${(startEq - maxLossAbs).toFixed(2)}`,
      });
    }
  }

  const daysNeeded = rules.minTradingDays === null || rules.minTradingDays === undefined ? 0 : Math.max(0, clampNum(rules.minTradingDays));
  const daysOk =
    rules.minDaysMode === "profitable" ? profitableDays >= daysNeeded : tradingDays >= daysNeeded;
  const targetOk = !rules.profitTargetPct || profitAbs >= targetAbs - 1e-9;

  const breached = failures.length > 0;
  const passed = !breached && daysOk && targetOk && ph.kind === "evaluation";
  const status = breached ? "failed" : passed ? "passed" : "in_progress";

  // Progress indicators (0-100)
  const targetProgress = rules.profitTargetPct ? Math.min(100, Math.max(0, (profitPct / rules.profitTargetPct) * 100)) : 100;
  const daysProgress = daysNeeded > 0 ? Math.min(100, (tradingDays / daysNeeded) * 100) : 100;
  const drawdownUsed = maxLossAbs ? Math.min(100, (Math.max(0, startEq - minEquity) / maxLossAbs) * 100) : 0;
  const dailyDrawdownUsed = maxDailyLossAbs && worstDayPnl < 0 ? Math.min(100, (Math.abs(worstDayPnl) / maxDailyLossAbs) * 100) : 0;

  return {
    status,
    templateId: tpl.id,
    phaseId: ph.id,
    phaseIndex: idx,
    phaseName: ph.label,
    firmName: tpl.firm,
    programName: tpl.name,
    metrics: {
      startEq,
      curEq,
      profitAbs,
      profitPct,
      targetAbs,
      targetPct: rules.profitTargetPct,
      maxLossAbs,
      maxLossPct: rules.maxLossPct,
      maxDailyLossAbs,
      maxDailyLossPct: rules.maxDailyLossPct,
      tradingDays,
      profitableDays,
      minTradingDays: daysNeeded,
      minDaysMode: rules.minDaysMode,
      profitableDayMinPct: rules.profitableDayMinPct ?? null,
      worstDay,
      worstDayPnl,
      peakEquity,
      minEquity,
      worstTrailFloor,
      equityCurve,
    },
    progress: {
      target: targetProgress,
      days: daysProgress,
      drawdown: drawdownUsed,
      dailyDrawdown: dailyDrawdownUsed,
      targetOk,
      daysOk,
    },
    failures,
    breaches,
    checks: {
      targetMet: targetOk,
      daysMet: daysOk,
      withinDrawdown: !breached,
    },
  };
}

export function deriveAccountStatusFromProp(account, evalRes, templates) {
  const acc = account || null;
  if (!acc?.prop?.templateId) return acc?.status || "Live";
  const tpl = getTemplate(templates, acc.prop.templateId);
  const ph = getPhase(tpl, acc.prop.phaseId);
  const payouts = acc?.prop?.payouts;
  if (evalRes?.status === "failed") return "Failed";
  if (evalRes?.status === "passed" && ph?.kind !== "funded") return "Passed";
  return phaseStatusLabel(tpl, ph?.id, payouts);
}

export function createNextPropAccountFrom(prevAcc, templates, nextPhaseId) {
  const tpl = getTemplate(templates, prevAcc?.prop?.templateId);
  const nextPhase = getPhase(tpl, nextPhaseId);
  if (!tpl || !nextPhase) return null;

  const size = clampNum(prevAcc?.prop?.size ?? prevAcc?.startingEquity);
  const currency = String(tpl.currency || prevAcc?.currency || "$");
  const nameBase = `${tpl.firm || "Prop"} ${size}${currency === "$" ? "" : ""}`.trim();
  const name = `${nameBase}${nextPhase?.label ? ` • ${nextPhase.label}` : ""}`.trim();
  const now = Date.now();

  return {
    id: uid(),
    name,
    currency,
    startingEquity: size,
    currentEquity: size,
    defaultRiskPct: 0,
    avatar: prevAcc?.avatar || { type: "emoji", emoji: "💼" },
    color: prevAcc?.color || "#6366f1",
    createdAt: now,
    status: phaseStatusLabel(tpl, nextPhaseId, []),
    notes: "",
    prop: {
      templateId: tpl.id,
      phaseId: nextPhaseId,
      size,
      startedAt: now,
      isCurrent: true,
      completedAt: null,
      autoProgress: !!prevAcc?.prop?.autoProgress,
      rulesOverride: {},
      profitSplitPctOverride: prevAcc?.prop?.profitSplitPctOverride ?? null,
      previousAccountId: prevAcc?.id,
      nextAccountId: null,
      autoProgressDone: {},
      eval: null,
      payouts: [],
    },
  };
}

// -----------------------------------------------------------------------------
// Template helpers for UI
// -----------------------------------------------------------------------------

export function makeTemplateSkeleton(kind = "two_phase") {
  const now = Date.now();
  const id = uid();
  if (kind === "one_phase") {
    return normalizeTemplate({
      id,
      firm: "Custom",
      name: "One‑Step",
      type: "one_phase",
      currency: "$",
      sizes: [10000, 25000, 50000],
      profitSplitPct: 80,
      createdAt: now,
      updatedAt: now,
      phases: [
        {
          id: "phase1",
          label: "Phase 1",
          kind: "evaluation",
          rules: { profitTargetPct: 10, maxLossPct: 10, maxDailyLossPct: 5, minTradingDays: 3, minDaysMode: "trading", maxLossType: "static" },
        },
        {
          id: "funded",
          label: "Funded",
          kind: "funded",
          rules: { profitTargetPct: null, maxLossPct: 10, maxDailyLossPct: 5, minTradingDays: 0, minDaysMode: "trading", maxLossType: "static" },
          profitSplitPct: 80,
        },
      ],
    });
  }
  if (kind === "instant") {
    return normalizeTemplate({
      id,
      firm: "Custom",
      name: "Instant Funding",
      type: "instant",
      currency: "$",
      sizes: [5000, 10000, 25000],
      profitSplitPct: 60,
      createdAt: now,
      updatedAt: now,
      phases: [
        {
          id: "funded",
          label: "Funded",
          kind: "funded",
          rules: { profitTargetPct: null, maxLossPct: 6, maxDailyLossPct: 3, minTradingDays: 0, minDaysMode: "trading", maxLossType: "trailing" },
          profitSplitPct: 60,
        },
      ],
    });
  }
  if (kind === "three_phase") {
    return normalizeTemplate({
      id,
      firm: "Custom",
      name: "3‑Step",
      type: "three_phase",
      currency: "$",
      sizes: [10000, 25000, 50000],
      profitSplitPct: 90,
      createdAt: now,
      updatedAt: now,
      phases: [
        {
          id: "phase1",
          label: "Phase 1",
          kind: "evaluation",
          rules: { profitTargetPct: 5, maxLossPct: 10, maxDailyLossPct: 5, minTradingDays: 3, minDaysMode: "trading", maxLossType: "static" },
        },
        {
          id: "phase2",
          label: "Phase 2",
          kind: "evaluation",
          rules: { profitTargetPct: 5, maxLossPct: 10, maxDailyLossPct: 5, minTradingDays: 3, minDaysMode: "trading", maxLossType: "static" },
        },
        {
          id: "phase3",
          label: "Phase 3",
          kind: "evaluation",
          rules: { profitTargetPct: 5, maxLossPct: 10, maxDailyLossPct: 5, minTradingDays: 3, minDaysMode: "trading", maxLossType: "static" },
        },
        {
          id: "funded",
          label: "Funded",
          kind: "funded",
          rules: { profitTargetPct: null, maxLossPct: 10, maxDailyLossPct: 5, minTradingDays: 0, minDaysMode: "trading", maxLossType: "static" },
          profitSplitPct: 90,
        },
      ],
    });
  }
  if (kind === "custom") {
    return normalizeTemplate({
      id,
      firm: "Custom",
      name: "Custom",
      type: "custom",
      currency: "$",
      sizes: [10000, 25000, 50000],
      profitSplitPct: 80,
      createdAt: now,
      updatedAt: now,
      phases: [
        {
          id: "phase1",
          label: "Phase 1",
          kind: "evaluation",
          rules: { profitTargetPct: 10, maxLossPct: 10, maxDailyLossPct: 5, minTradingDays: 3, minDaysMode: "trading", maxLossType: "static" },
        },
      ],
    });
  }
  // two_phase
  return normalizeTemplate({
    id,
    firm: "Custom",
    name: "2‑Step",
    type: "two_phase",
    currency: "$",
    sizes: [10000, 25000, 50000],
    profitSplitPct: 80,
    createdAt: now,
    updatedAt: now,
    phases: [
      {
        id: "phase1",
        label: "Phase 1",
        kind: "evaluation",
        rules: { profitTargetPct: 10, maxLossPct: 10, maxDailyLossPct: 5, minTradingDays: 3, minDaysMode: "trading", maxLossType: "static" },
      },
      {
        id: "phase2",
        label: "Phase 2",
        kind: "evaluation",
        rules: { profitTargetPct: 5, maxLossPct: 10, maxDailyLossPct: 5, minTradingDays: 3, minDaysMode: "trading", maxLossType: "static" },
      },
      {
        id: "funded",
        label: "Funded",
        kind: "funded",
        rules: { profitTargetPct: null, maxLossPct: 10, maxDailyLossPct: 5, minTradingDays: 0, minDaysMode: "trading", maxLossType: "static" },
        profitSplitPct: 80,
      },
    ],
  });
}

// Helper to get firm logo/color
export function getFirmBranding(firmName) {
  const branding = {
    "FTMO": { color: "#1a56db", accent: "#3b82f6", logoSrc: ftmoLogo },
    "Funding Pips": { color: "#059669", accent: "#10b981", logoSrc: fundingPipsLogo },
    "Funding Pips Pro": { color: "#059669", accent: "#10b981", logoSrc: fundingPipsLogo },
    "The 5%ers": { color: "#7c3aed", accent: "#8b5cf6", logoSrc: the5ersLogo },
    "FundedNext": { color: "#f59e0b", accent: "#fbbf24", logoSrc: null },
    "E8 Funding": { color: "#dc2626", accent: "#ef4444", logoSrc: null },
    "True Forex Funds": { color: "#0891b2", accent: "#06b6d4", logoSrc: null },
    "Alpha Capital": { color: "#4f46e5", accent: "#6366f1", logoSrc: null },
    "Goat Funded": { color: "#84cc16", accent: "#a3e635", logoSrc: null },
    "BlueBerry": { color: "#2563eb", accent: "#3b82f6", logoSrc: null },
    "Topstep": { color: "#059669", accent: "#10b981", logoSrc: null },
  };
  return branding[firmName] || { color: "#6366f1", accent: "#818cf8", logoSrc: null };
}
