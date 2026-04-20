import { Suspense } from "react";
import { ProposalWizard } from "@/components/ProposalWizard";

export default function NewProposalPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Suspense fallback={null}>
        <ProposalWizard embedded />
      </Suspense>
    </div>
  );
}
