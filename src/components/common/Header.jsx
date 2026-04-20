import React from "react";
import { motion } from "framer-motion";
import { fadeUp } from "@/components/common/motion";

export default function Header({ title, subtitle, right }) {
  return (
    <motion.div
      {...fadeUp(false)}
      className="relative z-10 overflow-visible mb-1"
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between overflow-visible">
        <div>
          <h1 className="text-lg font-display font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p> : null}
        </div>
        {right ? <div className="flex flex-col gap-2 md:flex-row md:items-center overflow-visible">{right}</div> : null}
      </div>
      <div className="mt-3 h-px bg-gradient-to-r from-accent/25 via-border/20 to-transparent" />
    </motion.div>
  );
}
