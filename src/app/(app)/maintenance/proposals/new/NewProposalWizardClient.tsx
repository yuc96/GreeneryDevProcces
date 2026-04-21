"use client";

import dynamic from "next/dynamic";

/**
 * Client-only chunk load: avoids RSC preloading a very large wizard bundle
 * (reduces intermittent ChunkLoadError in dev after HMR / stale .next).
 */
const ProposalWizard = dynamic(
  () =>
    import("@/components/ProposalWizard").then((m) => ({
      default: m.ProposalWizard,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-gray-500 dark:text-gray-400">
        Loading proposal wizard…
      </div>
    ),
  },
);

export function NewProposalWizardClient() {
  return <ProposalWizard embedded />;
}
