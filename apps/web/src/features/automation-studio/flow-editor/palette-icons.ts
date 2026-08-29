import { Blocks, Braces, Calculator, CircleDot, Clock, Database, Dice5, GitBranch, History, ListChecks, Merge, Network, Radio, Repeat, ShieldCheck, Shuffle, Split, Waves, Workflow, Zap } from "lucide-react";
export function automationPaletteIcon(family: string): typeof Blocks {
  switch (family) {
    case "control-flow": return GitBranch;
    case "policy": return ShieldCheck;
    case "routine": return Workflow;
    case "logic": return ListChecks;
    case "math": return Braces;
    case "random": return Radio;
    case "data": return Network;
    case "database": return Network;
    case "timing": return History;
    case "custom": return Blocks;
    default: return Blocks;
  }
}

export function automationNodeIcon(icon: string | undefined, family: string | undefined): typeof Blocks {
  switch (icon) {
    case "calculator": return Calculator;
    case "circle-dot": return CircleDot;
    case "clock-alert":
    case "clock": return Clock;
    case "database": return Database;
    case "dice-5": return Dice5;
    case "git-branch": return GitBranch;
    case "merge": return Merge;
    case "repeat": return Repeat;
    case "shield": return ShieldCheck;
    case "shuffle": return Shuffle;
    case "split": return Split;
    case "waves": return Waves;
    case "workflow": return Workflow;
    case "zap": return Zap;
    default: return automationPaletteIcon(family ?? "custom");
  }
}
