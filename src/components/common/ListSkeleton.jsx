import React from "react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { SkeletonCard } from "@/components/ui/Skeleton.jsx";

/**
 * Full-page placeholder for list screens shown while the finance store is
 * still loading. Prevents the empty-state flash ("No wallets") that appeared
 * for a frame before the server data arrived, because the collections default
 * to [] before `loaded` flips true.
 */
export default function ListSkeleton({ title, count = 4 }) {
  return (
    <div className="page-enter space-y-4">
      {title && <PageHeader title={title} />}
      <div className="grid sm:grid-cols-2 gap-3">
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
