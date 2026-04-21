import { Suspense } from "react";
import { NewProposalWizardClient } from "./NewProposalWizardClient";

export default function NewProposalPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Suspense fallback={null}>
        <NewProposalWizardClient />
      </Suspense>
    </div>
  );
}
