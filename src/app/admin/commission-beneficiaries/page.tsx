import { redirect } from "next/navigation";

/** Catalog UI lives under Admin → Pricing, Commission catalog tab. */
export default function AdminCommissionBeneficiariesPage() {
  redirect("/admin/pricing?view=commissions");
}
